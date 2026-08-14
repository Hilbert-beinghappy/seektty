import { ConnectionController } from "./connection.js";
import { FixtureApiClient } from "./fixture.js";
import { WebApiClient } from "./web-api-client.js";
import { createWebConnectionRpc } from "./rpc.js";
import { isLoopbackHostname } from "../loopback-hostname.js";
export { RpcId, AbstractApiClient, transportError, } from "./api.js";
/** Required services (none — this is the wire root). */
export const inject = [];
/**
 * Build the shared Client Connection lifecycle over a selected carrier.
 * Browser and in-process surfaces use this same single-owner stream loop,
 * Host-description publication, reconnect lifecycle, and sink isolation.
 * @param options - API and logical-RPC carrier pair.
 * @returns consumer-agnostic Connection handle.
 */
export function createConnectionHandle(options) {
    const { api, rpc, isLoopback = true } = options;
    let started = false;
    let description;
    const descriptionListeners = new Set();
    const publishDescription = (next) => {
        if (Object.is(description, next))
            return;
        description = next;
        for (const listener of [...descriptionListeners]) {
            try {
                listener();
            }
            catch (error) {
                console.error('[client-connection] host-description listener threw:', error);
            }
        }
    };
    return {
        api,
        isLoopback,
        hostDescription: {
            getSnapshot: () => description,
            subscribe: (listener) => {
                descriptionListeners.add(listener);
                return () => { descriptionListeners.delete(listener); };
            },
        },
        rpc,
        start(sinks, config) {
            if (started)
                throw new Error('connection: the stream loop is already owned by another consumer');
            started = true;
            const controller = new ConnectionController(api, {
                ...sinks,
                onConnected: (next) => {
                    publishDescription(next);
                    // A description subscriber may synchronously stop the loop. In that
                    // case publishDescription(undefined) has already retracted this
                    // generation, so do not leak its stale connected notification to
                    // the consumer sink afterward.
                    if (!Object.is(description, next))
                        return;
                    sinks.onConnected?.(next);
                },
                onStateChange: (state) => {
                    if (state === 'reconnecting')
                        publishDescription(undefined);
                    sinks.onStateChange?.(state);
                },
            }, config ?? {});
            controller.start();
            return {
                stop: () => {
                    controller.stop();
                    publishDescription(undefined);
                },
            };
        },
    };
}
/**
 * Client plugin body: pick the api by page mode and provide ctx.connection.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
    const pageLocation = typeof location === 'undefined' ? undefined : location;
    const fixture = pageLocation !== undefined && new URLSearchParams(pageLocation.search).has('fixture');
    const fixtureClient = fixture ? new FixtureApiClient() : undefined;
    const api = fixtureClient ?? new WebApiClient();
    const rpc = fixtureClient?.rpc ?? createWebConnectionRpc();
    const handle = createConnectionHandle({
        api,
        isLoopback: pageLocation === undefined || isLoopbackHostname(pageLocation.hostname),
        rpc,
    });
    ctx.provide('connection', handle);
}
//# sourceMappingURL=index.js.map