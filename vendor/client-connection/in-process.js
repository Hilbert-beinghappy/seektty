/** Network-free Host/Client carrier for one-process product surfaces. */
import { Service } from '@deepseek-ai/cordis';
import { ConnectionRpcRegistry } from "./rpc-registry.js";
/**
 * Owns an in-process logical RPC registry. The process boundary is already
 * loopback-trusted; authority policies remain part of each registration so a
 * later network carrier cannot silently weaken them.
 */
export class InProcessConnectionService extends Service {
    registry = new ConnectionRpcRegistry();
    /** Client caller paired with this service's registry. */
    clientRpc = {
        call: (channel, endpoint, payload, signal) => this.call(channel, endpoint, payload, signal),
    };
    /**
     * Provide the Host half without a Web server or listening socket.
     * @param ctx - owning Host Cordis context.
     */
    constructor(ctx) {
        super(ctx, 'connection');
    }
    /** Generic channel registry scoped to the Context reading this service. */
    get rpc() {
        const owner = this.ctx;
        return {
            handle: (channel, handler, options) => this.register(owner, channel, handler, options),
            intercept: (channel, matches, handler, options) => this.registerInterceptor(owner, channel, matches, handler, options),
        };
    }
    register(owner, channel, handler, options) {
        return owner.effect(() => this.registry.register(channel, handler, options), `client-connection-in-process: ${channel} rpc channel`);
    }
    registerInterceptor(owner, channel, matches, handler, options) {
        return owner.effect(() => this.registry.intercept(channel, matches, handler, options), `client-connection-in-process: ${channel} rpc interceptor`);
    }
    async call(channel, endpoint, payload, signal) {
        signal?.throwIfAborted();
        const carrierSignal = signal ?? new AbortController().signal;
        try {
            const pending = this.registry.dispatch(channel, endpoint, payload, carrierSignal);
            return signal === undefined ? await pending : await abortable(pending, signal);
        }
        catch (error) {
            if (signal?.aborted === true)
                throw abortReason(signal);
            throw new Error(`transport failure for ${channel}/${endpoint}: handler failure: ${String(error)}`, { cause: error });
        }
    }
}
/** Stable Cordis plugin name. */
export const name = 'client-connection-in-process';
/** Required services (none — this is a network-free transport root). */
export const inject = [];
/**
 * Provide one in-process Connection service.
 * @param ctx - Host Cordis context.
 */
export function apply(ctx) {
    new InProcessConnectionService(ctx);
}
function abortable(pending, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { reject(abortReason(signal)); };
        signal.addEventListener('abort', abort, { once: true });
        pending.then((value) => {
            signal.removeEventListener('abort', abort);
            resolve(value);
        }, (error) => {
            signal.removeEventListener('abort', abort);
            reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
}
function abortReason(signal) {
    return signal.reason instanceof Error
        ? signal.reason
        : new Error('connection request aborted', { cause: signal.reason });
}
//# sourceMappingURL=in-process.js.map