/** Network-free Host/Client carrier for one-process product surfaces. */
import { Context, Service } from '@deepseek-ai/cordis';
import type { ClientConnectionRpc, HostConnectionHandle, HostConnectionRpc } from './rpc.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host Connection transport and RPC registrations. */
        connection: HostConnectionHandle;
    }
}
/** Host handle exposed by the network-free Connection carrier. */
export interface InProcessConnectionHandle extends HostConnectionHandle {
    /** Client caller paired with this exact Host registry. */
    readonly clientRpc: ClientConnectionRpc;
}
/**
 * Owns an in-process logical RPC registry. The process boundary is already
 * loopback-trusted; authority policies remain part of each registration so a
 * later network carrier cannot silently weaken them.
 */
export declare class InProcessConnectionService extends Service implements InProcessConnectionHandle {
    private readonly registry;
    /** Client caller paired with this service's registry. */
    readonly clientRpc: ClientConnectionRpc;
    /**
     * Provide the Host half without a Web server or listening socket.
     * @param ctx - owning Host Cordis context.
     */
    constructor(ctx: Context);
    /** Generic channel registry scoped to the Context reading this service. */
    get rpc(): HostConnectionRpc;
    private register;
    private registerInterceptor;
    private call;
}
/** Stable Cordis plugin name. */
export declare const name = "client-connection-in-process";
/** Required services (none — this is a network-free transport root). */
export declare const inject: string[];
/**
 * Provide one in-process Connection service.
 * @param ctx - Host Cordis context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=in-process.d.ts.map