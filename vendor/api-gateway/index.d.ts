/**
 * Live Typert Remote dispatch over Cordis Services and registered providers.
 * Transport, request correlation, and response envelopes belong to Connection.
 * @module @deepseek-ai/dsh-api-gateway
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { InvokeRemoteRequest, TypertGateway, TypertGatewayErrorCode } from './types.ts';
export type { InvokeRemoteRequest, TypertGateway, TypertGatewayErrorCode, } from './types.ts';
interface GatewayErrorOptions {
    readonly cause?: unknown;
    readonly field?: string;
}
/** Dispatch failure produced outside the invoked business method. */
export declare class TypertGatewayError extends Error {
    /** Machine-readable failure category. */
    readonly code: TypertGatewayErrorCode;
    /** Canonical `<namespace>/<method>` endpoint. */
    readonly endpoint: string;
    /** Affected wire field when the failure is field-specific. */
    readonly field: string | undefined;
    /**
     * Construct a Gateway failure without embedding boundary values in its message.
     * @param code - stable failure category.
     * @param endpoint - canonical Remote endpoint.
     * @param message - correction-oriented diagnostic without sensitive values.
     * @param options - optional field and contained cause.
     */
    constructor(code: TypertGatewayErrorCode, endpoint: string, message: string, options?: GatewayErrorOptions);
}
/**
 * Resolve strict generated definitions or conservative SRC markers against
 * current Cordis Services and Typert providers.
 * @typert service typertGateway
 */
export declare class TypertGatewayService extends Service implements TypertGateway {
    static inject: string[];
    private srcClaims;
    /**
     * Register the Gateway against the active Typert registry.
     * @param ctx - owning Host Context with Typert registry access.
     */
    constructor(ctx: Context);
    private claimsEndpoint;
    private collectSrcClaims;
    /**
     * Invoke one live Remote method through strict generated reflection or SRC markers.
     * @param request - decoded endpoint and exact named wire arguments.
     * @returns the validated business result.
     * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
     */
    invoke(request: InvokeRemoteRequest): Promise<unknown>;
    private dispatchRpc;
    private invokeRpc;
    private resolveDescriptor;
    private resolveSrcDescriptor;
    private srcDescriptor;
    private resolveReceiverContext;
    private resolveParameter;
}
export default TypertGatewayService;
//# sourceMappingURL=index.d.ts.map