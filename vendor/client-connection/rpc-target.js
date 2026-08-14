/** Shared validation for logical Connection RPC channels and endpoints. */
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
 * Assert that a channel can be owned exclusively by one Connection consumer.
 * @param channel - absolute logical channel.
 */
export function assertDedicatedRpcChannel(channel) {
    if (!CHANNEL_PATTERN.test(channel) || channel === '/api') {
        throw new Error(`connection: invalid or reserved RPC channel ${JSON.stringify(channel)}`);
    }
}
/**
 * Assert a complete channel/endpoint target before transport dispatch.
 * @param channel - absolute logical channel.
 * @param endpoint - slash-separated channel-relative method.
 */
export function assertConnectionRpcTarget(channel, endpoint) {
    if (!CHANNEL_PATTERN.test(channel) || !isConnectionRpcEndpoint(endpoint)) {
        throw new Error(`connection: invalid RPC target ${JSON.stringify(`${channel}/${endpoint}`)}`);
    }
}
/**
 * Decode an endpoint from one route pathname.
 * @param channel - absolute logical channel prefix.
 * @param pathname - URL pathname to inspect.
 * @returns validated channel-relative endpoint, when the path belongs to the channel.
 */
export function endpointFromRpcPath(channel, pathname) {
    if (!pathname.startsWith(`${channel}/`))
        return undefined;
    const endpoint = pathname.slice(channel.length + 1);
    return isConnectionRpcEndpoint(endpoint) ? endpoint : undefined;
}
function isConnectionRpcEndpoint(endpoint) {
    return !endpoint.split('/').some(segment => segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment));
}
//# sourceMappingURL=rpc-target.js.map