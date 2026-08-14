/** Browser API carrier: HTTP upstream plus one WebSocket per downstream event stream. */
import { AbstractApiClient } from "./api.js";
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema';
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema';
import { HOST_EVENTS_PATH, MUX_EVENTS_PATH } from "../api-path.js";
/** Browser platform subclass: unary/respond use fetch; mux/host use downlink-only WebSockets. */
export class WebApiClient extends AbstractApiClient {
    doFetch(input, init) {
        return globalThis.fetch(input, init);
    }
    openMux(_payload, signal, onOpen) {
        return this.readWebSocket(MUX_EVENTS_PATH, signal, muxFrameSchema, onOpen);
    }
    openHost(_payload, signal, onOpen) {
        return this.readWebSocket(HOST_EVENTS_PATH, signal, hostFrameSchema, onOpen);
    }
    async *readWebSocket(path, signal, frameSchema, onOpen) {
        const url = new URL(path, this.resolveBase());
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(url);
        const inbox = [];
        let wake;
        const enqueue = (item) => {
            inbox.push(item);
            wake?.();
            wake = undefined;
        };
        const handleOpen = () => { onOpen?.(); };
        const handleMessage = (event) => {
            let full;
            let frame;
            try {
                if (typeof event.data !== 'string')
                    throw new Error('binary WebSocket frame');
                full = serverRequestSchema.parse(JSON.parse(event.data));
                frame = frameSchema.parse(full.payload);
            }
            catch (error) {
                console.error(`[client-connection] dropping malformed WebSocket frame on ${path}:`, error);
                return;
            }
            this.onEnvelope(full);
            enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: frame } });
        };
        const handleClose = () => { enqueue({ kind: 'end' }); };
        const handleAbort = () => {
            if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
                socket.close();
        };
        socket.addEventListener('open', handleOpen);
        socket.addEventListener('message', handleMessage);
        socket.addEventListener('close', handleClose, { once: true });
        signal.addEventListener('abort', handleAbort, { once: true });
        if (signal.aborted)
            handleAbort();
        try {
            while (true) {
                while (inbox.length > 0) {
                    const item = inbox.shift();
                    if (item.kind === 'end')
                        return;
                    yield item.envelope;
                }
                await new Promise((resolve) => { wake = resolve; });
            }
        }
        finally {
            signal.removeEventListener('abort', handleAbort);
            socket.removeEventListener('open', handleOpen);
            socket.removeEventListener('message', handleMessage);
            socket.removeEventListener('close', handleClose);
            handleAbort();
        }
    }
}
//# sourceMappingURL=web-api-client.js.map