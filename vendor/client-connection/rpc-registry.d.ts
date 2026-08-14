/** Transport-independent ownership registry for logical Connection RPC. */
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { ConnectionRpcEndpointMatcher, ConnectionRpcHandler, ConnectionRpcHandlerOptions } from './rpc.ts';
interface ConnectionRpcRegistration {
    readonly handler: ConnectionRpcHandler;
    readonly options: ConnectionRpcHandlerOptions;
}
/**
 * Owns logical channel registrations independently of HTTP or in-process
 * transport. Carrier plugins add lifetime and trust-policy enforcement around
 * these registrations.
 */
export declare class ConnectionRpcRegistry {
    private readonly channels;
    private readonly interceptors;
    /**
     * Claim one dedicated logical channel.
     * @param channel - absolute, non-reserved channel.
     * @param handler - decoded handler.
     * @param options - authority policy enforced by the carrier.
     * @returns synchronous withdrawal function.
     */
    register(channel: string, handler: ConnectionRpcHandler, options: ConnectionRpcHandlerOptions): () => void;
    /**
     * Claim selected endpoints on the shared `/api` channel.
     * @param channel - reserved shared channel.
     * @param matches - endpoint ownership predicate.
     * @param handler - decoded handler.
     * @param options - authority policy enforced by the carrier.
     * @returns synchronous withdrawal function.
     */
    intercept(channel: string, matches: ConnectionRpcEndpointMatcher, handler: ConnectionRpcHandler, options: ConnectionRpcHandlerOptions): () => void;
    /**
     * Resolve one registered endpoint without invoking it.
     * @param channel - logical channel.
     * @param endpoint - channel-relative endpoint.
     * @returns registration selected by channel ownership.
     */
    resolve(channel: string, endpoint: string): ConnectionRpcRegistration | undefined;
    /**
     * Dispatch one endpoint through the current registration.
     * @param channel - logical channel.
     * @param endpoint - channel-relative endpoint.
     * @param payload - handler-owned request payload.
     * @param signal - caller cancellation signal.
     * @returns the existing RPC result envelope.
     */
    dispatch(channel: string, endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
}
export {};
//# sourceMappingURL=rpc-registry.d.ts.map