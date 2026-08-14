/** Transport-independent ownership registry for logical Connection RPC. */
import { assertConnectionRpcTarget, assertDedicatedRpcChannel } from "./rpc-target.js";
/**
 * Owns logical channel registrations independently of HTTP or in-process
 * transport. Carrier plugins add lifetime and trust-policy enforcement around
 * these registrations.
 */
export class ConnectionRpcRegistry {
    channels = new Map();
    interceptors = new Map();
    /**
     * Claim one dedicated logical channel.
     * @param channel - absolute, non-reserved channel.
     * @param handler - decoded handler.
     * @param options - authority policy enforced by the carrier.
     * @returns synchronous withdrawal function.
     */
    register(channel, handler, options) {
        assertDedicatedRpcChannel(channel);
        if (this.channels.has(channel)) {
            throw new Error(`connection: RPC channel ${JSON.stringify(channel)} already has a handler`);
        }
        const registration = { handler, options };
        this.channels.set(channel, registration);
        return () => {
            if (this.channels.get(channel) === registration)
                this.channels.delete(channel);
        };
    }
    /**
     * Claim selected endpoints on the shared `/api` channel.
     * @param channel - reserved shared channel.
     * @param matches - endpoint ownership predicate.
     * @param handler - decoded handler.
     * @param options - authority policy enforced by the carrier.
     * @returns synchronous withdrawal function.
     */
    intercept(channel, matches, handler, options) {
        if (channel !== '/api') {
            throw new Error(`connection: invalid shared RPC channel ${JSON.stringify(channel)}`);
        }
        if (this.interceptors.has(channel)) {
            throw new Error(`connection: shared RPC channel ${JSON.stringify(channel)} already has an interceptor`);
        }
        const registration = { matches, handler, options };
        this.interceptors.set(channel, registration);
        return () => {
            if (this.interceptors.get(channel) === registration)
                this.interceptors.delete(channel);
        };
    }
    /**
     * Resolve one registered endpoint without invoking it.
     * @param channel - logical channel.
     * @param endpoint - channel-relative endpoint.
     * @returns registration selected by channel ownership.
     */
    resolve(channel, endpoint) {
        assertConnectionRpcTarget(channel, endpoint);
        if (channel !== '/api')
            return this.channels.get(channel);
        const interceptor = this.interceptors.get(channel);
        return interceptor?.matches(endpoint) === true ? interceptor : undefined;
    }
    /**
     * Dispatch one endpoint through the current registration.
     * @param channel - logical channel.
     * @param endpoint - channel-relative endpoint.
     * @param payload - handler-owned request payload.
     * @param signal - caller cancellation signal.
     * @returns the existing RPC result envelope.
     */
    dispatch(channel, endpoint, payload, signal) {
        const registration = this.resolve(channel, endpoint);
        if (registration === undefined) {
            throw new Error(`connection: no RPC handler for ${JSON.stringify(`${channel}/${endpoint}`)}`);
        }
        return registration.handler(endpoint, payload, signal);
    }
}
//# sourceMappingURL=rpc-registry.js.map