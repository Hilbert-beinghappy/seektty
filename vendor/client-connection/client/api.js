// Central contract re-export point: every contract import inside
// web-runtime goes through this single file.
// Types and runtime protocol helpers/bounds come from the apiproxy api/ layer
// (zero Node deps, browser-safe); AbstractApiClient is the client boundary.
// NEVER import the package root: it drags bootHost/cordis into the browser bundle.
// The ./api and ./client subpath exports are the browser-safe channels.
// transportError lives in the apiproxy api layer (beside RpcResult, its
// subject); re-exported here so connection consumers keep one contract
// entry point.
export { RpcId, SESSION_SEARCH_RESULT_LIMIT, transportError, } from '@deepseek-ai/dsh-host-apiproxy/api';
export { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
/**
 * Unwrap a unary response: RpcResponse<T> -> RpcResult<T> (business code only
 * cares about the result slot).
 * @param response - the unary response.
 * @returns its result slot.
 */
export function resultOf(response) {
    return response.result;
}
//# sourceMappingURL=api.js.map