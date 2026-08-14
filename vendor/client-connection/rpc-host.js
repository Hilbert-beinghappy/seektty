/** Host registry and HTTP adapter for generic Connection RPC channels. */
import { Service } from '@deepseek-ai/cordis';
import { clientRequestSchema, RpcId, } from '@deepseek-ai/dsh-host-apiproxy/api';
import { bridge } from "./http-bridge.js";
import { isTrustedApiRequest } from "./api-request-trust.js";
import { ConnectionRpcRegistry } from "./rpc-registry.js";
import { endpointFromRpcPath } from "./rpc-target.js";
const INVALID_REQUEST_RPC_ID = RpcId('invalid-request');
/** Host Connection service whose channel registrations belong to the caller fiber. */
export class HostConnectionService extends Service {
    trustedHosts;
    registry = new ConnectionRpcRegistry();
    /**
     * Provide the Host half over the active HTTP server.
     * @param ctx - owning Connection plugin context.
     * @param trustedHosts - deployment authorities accepted by trusted-host channels.
     */
    constructor(ctx, trustedHosts) {
        super(ctx, 'connection');
        this.trustedHosts = trustedHosts;
    }
    /** Generic channel registry scoped to the Context reading this service. */
    get rpc() {
        const owner = this.ctx;
        return {
            handle: (channel, handler, options) => this.register(owner, channel, handler, options),
            intercept: (channel, matches, handler, options) => this.registerInterceptor(owner, channel, matches, handler, options),
        };
    }
    /**
     * Compose one shared-channel Fetch handler from its interceptor and fallback.
     * @param channel - shared channel mounted by Connection.
     * @param fallback - handler for endpoints not claimed by the interceptor.
     * @returns Fetch handler that selects exactly one target for each request.
     */
    createSharedFetchHandler(channel, fallback) {
        return {
            fetch: (request) => {
                const endpoint = endpointFromRpcPath(channel, new URL(request.url).pathname);
                const registration = endpoint === undefined ? undefined : this.registry.resolve(channel, endpoint);
                if (endpoint === undefined || registration === undefined) {
                    return fallback.fetch(request);
                }
                if (registration.options.authority === 'loopback' && !isTrustedApiRequest(request, [])) {
                    return Promise.resolve(new Response('forbidden', { status: 403 }));
                }
                return rpcFetchHandler(channel, (target, payload, signal) => this.registry.dispatch(channel, target, payload, signal)).fetch(request);
            },
        };
    }
    register(owner, channel, handler, options) {
        const trustedHosts = options.authority === 'loopback' ? [] : this.trustedHosts;
        return owner.effect(() => {
            const withdraw = this.registry.register(channel, handler, options);
            const fetchHandler = rpcFetchHandler(channel, (endpoint, payload, signal) => this.registry.dispatch(channel, endpoint, payload, signal));
            const route = {
                kind: 'prefix',
                path: channel,
                handler: async (req, res) => {
                    if (!isTrustedApiRequest(req, trustedHosts)) {
                        res.writeHead(403);
                        res.end('forbidden');
                        return;
                    }
                    await bridge(req, res, fetchHandler);
                },
            };
            try {
                const removeRoute = owner.webServer.register(route);
                return () => {
                    withdraw();
                    removeRoute();
                };
            }
            catch (error) {
                withdraw();
                throw error;
            }
        }, `client-connection: ${channel} rpc channel`);
    }
    registerInterceptor(owner, channel, matches, handler, options) {
        return owner.effect(() => this.registry.intercept(channel, matches, handler, options), `client-connection: ${channel} rpc interceptor`);
    }
}
function rpcFetchHandler(channel, handler) {
    return {
        async fetch(request) {
            const endpoint = endpointFromRpcPath(channel, new URL(request.url).pathname);
            if (request.method !== 'POST' || endpoint === undefined) {
                return new Response('not found', { status: 404 });
            }
            const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
            if (mediaType !== 'application/json') {
                return new Response('content type must be application/json', { status: 415 });
            }
            let body;
            try {
                body = await request.json();
            }
            catch {
                return new Response('body is not JSON', { status: 400 });
            }
            const envelope = clientRequestSchema.safeParse(body);
            if (!envelope.success) {
                return invalidEnvelopeResponse(body, envelope.error.issues);
            }
            const message = envelope.data;
            if (message.method !== endpoint) {
                return errorResponse(message.rpcId, {
                    code: 'bad-request',
                    message: `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
                    details: { issues: [] },
                });
            }
            try {
                const result = await handler(endpoint, message.payload, request.signal);
                return fullResponse(message.rpcId, result);
            }
            catch (error) {
                return new Response(`handler failure: ${String(error)}`, { status: 500 });
            }
        },
    };
}
function invalidEnvelopeResponse(body, issues) {
    const rawId = body?.rpcId;
    const rpcId = typeof rawId === 'string' ? RpcId(rawId) : INVALID_REQUEST_RPC_ID;
    return errorResponse(rpcId, {
        code: 'bad-request',
        message: 'invalid client-request message',
        details: { issues },
    });
}
function errorResponse(rpcId, error) {
    return fullResponse(rpcId, { ok: false, error });
}
function fullResponse(rpcId, result) {
    const body = { type: 'server-response', rpcId, result };
    return Response.json(body);
}
//# sourceMappingURL=rpc-host.js.map