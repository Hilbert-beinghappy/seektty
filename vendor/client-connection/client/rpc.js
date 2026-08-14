/** Browser caller for generic Connection unary RPC channels. */
import { RpcId, serverResponseSchema, } from '@deepseek-ai/dsh-host-apiproxy/api';
import { assertConnectionRpcTarget } from "../rpc-target.js";
import { randomUuid } from "./random-uuid.js";
const INTERNAL_BASE = 'http://dsh.internal';
/**
 * Create the browser-backed generic RPC caller.
 * @returns caller that owns request correlation and response-envelope validation.
 */
export function createWebConnectionRpc() {
    return {
        async call(channel, endpoint, payload, signal) {
            assertConnectionRpcTarget(channel, endpoint);
            const rpcId = RpcId(randomUuid());
            const message = {
                type: 'client-request',
                rpcId,
                method: endpoint,
                payload,
            };
            const response = await globalThis.fetch(new URL(`${channel}/${endpoint}`, resolveBase()), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(message),
                ...signal === undefined ? {} : { signal },
            });
            if (!response.ok) {
                throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`);
            }
            const full = serverResponseSchema.parse(await response.json());
            if (full.rpcId !== rpcId) {
                throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`);
            }
            return full.result;
        },
    };
}
function resolveBase() {
    const location = globalThis.location;
    return location?.origin !== undefined && location.origin !== 'null' ? location.origin : INTERNAL_BASE;
}
//# sourceMappingURL=rpc.js.map