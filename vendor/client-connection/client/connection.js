const CONNECTION_DEFAULTS = {
    backoffBaseMs: 500,
    backoffFactor: 2,
    backoffMaxMs: 10_000,
    streamOpenTimeoutMs: 3_000,
};
function sleep(ms, signal) {
    return new Promise((resolve) => {
        const t = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
        function done() {
            clearTimeout(t);
            signal.removeEventListener('abort', done);
            resolve();
        }
    });
}
/**
 * Opens both streams and keeps iterating (pull mode: nothing reads the socket and the tap
 * never fires unless someone for-awaits), reconnecting with exponential backoff on loss.
 * State (generation/attempt) is instance-private, never in the store.
 * The pump body feeds each frame to a sink (sink exceptions must
 * not kill the pump — a broken business layer must not drag down the connection layer).
 */
export class ConnectionController {
    api;
    sinks;
    generation = 0;
    attempt = 0;
    current = null;
    running = false;
    lastState = null;
    config;
    constructor(api, sinks = {}, config = {}) {
        this.api = api;
        this.sinks = sinks;
        this.config = { ...CONNECTION_DEFAULTS, ...config };
    }
    /** Idempotent: begin the connect/pump/reconnect loop. */
    start() {
        if (this.running)
            return;
        this.running = true;
        void this.loop();
    }
    /** Stop the loop and abort the current generation's streams. */
    stop() {
        this.running = false;
        this.current?.abort();
        this.current = null;
    }
    backoffDelay(attempt) {
        const { backoffBaseMs, backoffFactor, backoffMaxMs } = this.config;
        const cap = Math.min(backoffMaxMs, backoffBaseMs * backoffFactor ** Math.max(0, attempt - 1));
        return cap / 2 + Math.random() * (cap / 2);
    }
    /** Read through a method: stop() flips the flag across awaits, so narrowing from the loop condition must not stick. */
    isRunning() {
        return this.running;
    }
    /** Re-read both mutable liveness guards after a potentially reentrant sink. */
    isGenerationActive(controller) {
        return this.isRunning() && !controller.signal.aborted;
    }
    async loop() {
        while (this.running) {
            const gen = ++this.generation;
            const ac = new AbortController();
            this.current = ac;
            /* v8 ignore next -- initializer placeholder: the Promise executor
             * below runs synchronously and replaces it before anyone can call it. */
            let muxOpened = () => { };
            /* v8 ignore next -- same placeholder pattern as muxOpened. */
            let hostOpened = () => { };
            const streamsOpen = Promise.all([
                new Promise((resolve) => { muxOpened = resolve; }),
                new Promise((resolve) => { hostOpened = resolve; }),
            ]);
            const failed = new Promise((resolve) => {
                const settle = () => {
                    if (gen === this.generation && !ac.signal.aborted)
                        ac.abort();
                    resolve();
                };
                void this.pumpStream(this.api.events.mux({}, ac.signal, muxOpened), this.sinks.onMuxEnvelope, settle);
                void this.pumpStream(this.api.events.host({}, ac.signal, hostOpened), this.sinks.onHostEnvelope, settle);
            });
            try {
                // Strict readiness handshake: describe proves unary reachability, onOpen
                // proves each physical stream is established before any frame —
                // only then may onConnected fire, so the resync it triggers cannot outrun the
                // subscribed baseline. The timeout guards against a carrier that never fires onOpen
                // (see ConnectionConfig.streamOpenTimeoutMs).
                const timeout = new AbortController();
                const [description] = await Promise.all([
                    this.api.host.describe({}),
                    Promise.race([streamsOpen, sleep(this.config.streamOpenTimeoutMs, timeout.signal)]),
                ]);
                timeout.abort();
                const descriptionResult = description.result;
                if (!descriptionResult.ok) {
                    throw new Error(`host.describe failed: ${descriptionResult.error.code}: ${descriptionResult.error.message}`);
                }
                if (ac.signal.aborted)
                    throw new Error('generation aborted during readiness handshake');
                this.attempt = 0;
                this.emitState('connected');
                // A state sink may synchronously stop this controller. Do not publish
                // a description for a generation that no longer exists afterward.
                if (this.isGenerationActive(ac)) {
                    this.callSink(() => { this.sinks.onConnected?.(descriptionResult.value); });
                }
            }
            catch {
                // Transport failure: treat as generation failure, fall through to the shared backoff.
                if (!ac.signal.aborted)
                    ac.abort();
            }
            await failed;
            if (!this.isRunning())
                return;
            this.emitState('reconnecting');
            this.attempt += 1;
            console.warn(`[client-connection] connection lost, retry #${this.attempt}`);
            const idle = new AbortController();
            await sleep(this.backoffDelay(this.attempt), idle.signal);
        }
    }
    /** Deduplicated state emission (sink isolation applies). */
    emitState(state) {
        if (this.lastState === state)
            return;
        this.lastState = state;
        this.callSink(() => this.sinks.onStateChange?.(state));
    }
    async pumpStream(stream, sink, onEnd) {
        try {
            for await (const envelope of stream) {
                if (envelope.payload.type === 'stream/error')
                    break;
                if (sink !== undefined)
                    this.callSink(() => { sink(envelope); });
            }
        }
        catch {
            // Stream loss: converge on onEnd, which triggers the shared reconnect.
        }
        onEnd();
    }
    /** Sink exception isolation: a business-layer throw is logged only, never affecting pump or reconnect semantics. */
    callSink(fn) {
        try {
            fn();
        }
        catch (error) {
            console.error('[client-connection] connection sink threw:', error);
        }
    }
}
//# sourceMappingURL=connection.js.map