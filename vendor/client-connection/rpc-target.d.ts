/** Shared validation for logical Connection RPC channels and endpoints. */
/**
 * Assert that a channel can be owned exclusively by one Connection consumer.
 * @param channel - absolute logical channel.
 */
export declare function assertDedicatedRpcChannel(channel: string): void;
/**
 * Assert a complete channel/endpoint target before transport dispatch.
 * @param channel - absolute logical channel.
 * @param endpoint - slash-separated channel-relative method.
 */
export declare function assertConnectionRpcTarget(channel: string, endpoint: string): void;
/**
 * Decode an endpoint from one route pathname.
 * @param channel - absolute logical channel prefix.
 * @param pathname - URL pathname to inspect.
 * @returns validated channel-relative endpoint, when the path belongs to the channel.
 */
export declare function endpointFromRpcPath(channel: string, pathname: string): string | undefined;
//# sourceMappingURL=rpc-target.d.ts.map