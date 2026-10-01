const CONNECTION_DEFAULTS = {
    backoffBaseMs: 500,
    backoffFactor: 2,
    backoffMaxMs: 10_000,
    streamOpenTimeoutMs: 3_000,
};
function sleep(ms, signal) {
    if (signal.aborted) return Promise.resolve();
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
function waitForReadiness(ready, ms, signal) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', aborted);
            if (error === undefined) resolve(value);
            else reject(error);
        };
        const aborted = () => finish(new Error('connection generation aborted'));
        const timer = setTimeout(() => finish(new Error('connection readiness timed out')), ms);
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) aborted();
        void ready.then(value => finish(undefined, value), error => finish(error));
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
    lifetime = null;
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
        this.attempt = 0;
        this.lastState = null;
        const lifetime = new AbortController();
        this.lifetime = lifetime;
        void this.loop(lifetime);
    }
    /** Stop the loop and abort the current generation's streams. */
    stop() {
        this.running = false;
        this.lifetime?.abort();
        this.lifetime = null;
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
        return this.isRunning() && this.current === controller && !controller.signal.aborted;
    }
    async loop(lifetime) {
        while (this.lifetime === lifetime && !lifetime.signal.aborted) {
            const gen = ++this.generation;
            const ac = new AbortController();
            this.current = ac;
            const abortGeneration = () => ac.abort();
            lifetime.signal.addEventListener('abort', abortGeneration, { once: true });
            /* v8 ignore next -- initializer placeholder: the Promise executor
             * below runs synchronously and replaces it before anyone can call it. */
            let muxOpened = () => { };
            /* v8 ignore next -- same placeholder pattern as muxOpened. */
            let hostOpened = () => { };
            const streamsOpen = Promise.all([
                new Promise((resolve) => { muxOpened = resolve; }),
                new Promise((resolve) => { hostOpened = resolve; }),
            ]);
            let ended;
            const failed = new Promise(resolve => { ended = resolve; });
            const settle = () => {
                if (gen === this.generation && !ac.signal.aborted) ac.abort();
                ended();
            };
            ac.signal.addEventListener('abort', ended, { once: true });
            const opened = resolve => () => {
                if (gen === this.generation && this.isGenerationActive(ac)) resolve();
            };
            try {
                // Strict readiness handshake: describe proves unary reachability, onOpen
                // proves each physical stream is established before any frame —
                // only then may onConnected fire, so the resync it triggers cannot outrun the
                // subscribed baseline. The timeout guards against a carrier that never fires onOpen
                // (see ConnectionConfig.streamOpenTimeoutMs).
                void this.pumpStream(this.api.events.mux({}, ac.signal, opened(muxOpened)), this.sinks.onMuxEnvelope, settle, ac.signal);
                void this.pumpStream(this.api.events.host({}, ac.signal, opened(hostOpened)), this.sinks.onHostEnvelope, settle, ac.signal);
                const [description] = await waitForReadiness(Promise.all([
                    this.api.host.describe({}, ac.signal), streamsOpen,
                ]), this.config.streamOpenTimeoutMs, ac.signal);
                const descriptionResult = description.result;
                if (!descriptionResult.ok) {
                    throw new Error(`host.describe failed: ${descriptionResult.error.code}: ${descriptionResult.error.message}`);
                }
                if (!this.isGenerationActive(ac))
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
            lifetime.signal.removeEventListener('abort', abortGeneration);
            if (this.current === ac) this.current = null;
            if (lifetime.signal.aborted || this.lifetime !== lifetime)
                return;
            this.emitState('reconnecting');
            if (lifetime.signal.aborted || this.lifetime !== lifetime) return;
            this.attempt += 1;
            console.warn(`[client-connection] connection lost, retry #${this.attempt}`);
            await sleep(this.backoffDelay(this.attempt), lifetime.signal);
        }
    }
    /** Deduplicated state emission (sink isolation applies). */
    emitState(state) {
        if (this.lastState === state)
            return;
        this.lastState = state;
        this.callSink(() => this.sinks.onStateChange?.(state));
    }
    async pumpStream(stream, sink, onEnd, signal) {
        try {
            for await (const envelope of stream) {
                if (signal.aborted || envelope.payload.type === 'stream/error')
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
