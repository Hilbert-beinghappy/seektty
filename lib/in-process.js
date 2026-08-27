import { Service } from "@deepseek-ai/cordis";

/** Shared validation for logical Connection RPC channels and endpoints. */
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Assert that a channel can be owned exclusively by one Connection consumer.
* @param channel - absolute logical channel.
*/
function assertDedicatedRpcChannel(channel) {
	if (!CHANNEL_PATTERN.test(channel) || channel === "/api") throw new Error(`connection: invalid or reserved RPC channel ${JSON.stringify(channel)}`);
}
/**
* Assert a complete channel/endpoint target before transport dispatch.
* @param channel - absolute logical channel.
* @param endpoint - slash-separated channel-relative method.
*/
function assertConnectionRpcTarget(channel, endpoint) {
	if (!CHANNEL_PATTERN.test(channel) || !isConnectionRpcEndpoint(endpoint)) throw new Error(`connection: invalid RPC target ${JSON.stringify(`${channel}/${endpoint}`)}`);
}
function isConnectionRpcEndpoint(endpoint) {
	return !endpoint.split("/").some((segment) => segment === "" || segment === "." || segment === ".." || !ENDPOINT_SEGMENT_PATTERN.test(segment));
}

/**
* Owns logical channel registrations independently of HTTP or in-process
* transport. Carrier plugins add lifetime and trust-policy enforcement around
* these registrations.
*/
var ConnectionRpcRegistry = class {
	channels = /* @__PURE__ */ new Map();
	interceptors = /* @__PURE__ */ new Map();
	/**
	* Claim one dedicated logical channel.
	* @param channel - absolute, non-reserved channel.
	* @param handler - decoded handler.
	* @param options - authority policy enforced by the carrier.
	* @returns synchronous withdrawal function.
	*/
	register(channel, handler, options) {
		assertDedicatedRpcChannel(channel);
		if (this.channels.has(channel)) throw new Error(`connection: RPC channel ${JSON.stringify(channel)} already has a handler`);
		const registration = {
			handler,
			options
		};
		this.channels.set(channel, registration);
		return () => {
			if (this.channels.get(channel) === registration) this.channels.delete(channel);
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
		if (channel !== "/api") throw new Error(`connection: invalid shared RPC channel ${JSON.stringify(channel)}`);
		if (this.interceptors.has(channel)) throw new Error(`connection: shared RPC channel ${JSON.stringify(channel)} already has an interceptor`);
		const registration = {
			matches,
			handler,
			options
		};
		this.interceptors.set(channel, registration);
		return () => {
			if (this.interceptors.get(channel) === registration) this.interceptors.delete(channel);
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
		if (channel !== "/api") return this.channels.get(channel);
		const interceptor = this.interceptors.get(channel);
		return interceptor?.matches(endpoint) === true ? interceptor : void 0;
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
		if (registration === void 0) throw new Error(`connection: no RPC handler for ${JSON.stringify(`${channel}/${endpoint}`)}`);
		return registration.handler(endpoint, payload, signal);
	}
};

/**
* Owns an in-process logical RPC registry. The process boundary is already
* loopback-trusted; authority policies remain part of each registration so a
* later network carrier cannot silently weaken them.
*/
var InProcessConnectionService = class extends Service {
	registry = new ConnectionRpcRegistry();
	/** Client caller paired with this service's registry. */
	clientRpc = { call: (channel, endpoint, payload, signal) => this.call(channel, endpoint, payload, signal) };
	/**
	* Provide the Host half without a Web server or listening socket.
	* @param ctx - owning Host Cordis context.
	*/
	constructor(ctx) {
		super(ctx, "connection");
	}
	/** Generic channel registry scoped to the Context reading this service. */
	get rpc() {
		const owner = this.ctx;
		return {
			handle: (channel, handler, options) => this.register(owner, channel, handler, options),
			intercept: (channel, matches, handler, options) => this.registerInterceptor(owner, channel, matches, handler, options)
		};
	}
	register(owner, channel, handler, options) {
		return owner.effect(() => this.registry.register(channel, handler, options), `client-connection-in-process: ${channel} rpc channel`);
	}
	registerInterceptor(owner, channel, matches, handler, options) {
		return owner.effect(() => this.registry.intercept(channel, matches, handler, options), `client-connection-in-process: ${channel} rpc interceptor`);
	}
	async call(channel, endpoint, payload, signal) {
		signal?.throwIfAborted();
		try {
			if (signal === void 0) return await this.registry.dispatch(channel, endpoint, payload, new AbortController().signal);
			return await abortInProcessCall((inner) => this.registry.dispatch(channel, endpoint, payload, inner), signal);
		} catch (error) {
			if (signal?.aborted === true) throw abortReason(signal);
			throw new Error(`transport failure for ${channel}/${endpoint}: handler failure: ${String(error)}`, { cause: error });
		}
	}
};
/** Stable Cordis plugin name. */
const name = "client-connection-in-process";
/** Required services (none — this is a network-free transport root). */
const inject = [];
/**
* Provide one in-process Connection service.
* @param ctx - Host Cordis context.
*/
function apply(ctx) {
	new InProcessConnectionService(ctx);
}
/**
* Run one RPC handler under a caller AbortSignal, aborting the handler when
* the wrapper is cancelled instead of only rejecting the outer promise.
* @param run - handler invocation that observes the inner signal.
* @param signal - caller cancellation signal.
*/
function abortInProcessCall(run, signal) {
	const inner = new AbortController();
	return abortable(run(AbortSignal.any([signal, inner.signal])), signal, () => {
		if (!inner.signal.aborted) inner.abort(signal.reason);
	});
}
function abortable(pending, signal, onAbort) {
	return new Promise((resolve, reject) => {
		const abort = () => {
			onAbort?.();
			reject(abortReason(signal));
		};
		if (signal.aborted) {
			abort();
			return;
		}
		signal.addEventListener("abort", abort, { once: true });
		pending.then((value) => {
			signal.removeEventListener("abort", abort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", abort);
			reject(error instanceof Error ? error : new Error(String(error)));
		});
	});
}
function abortReason(signal) {
	return signal.reason instanceof Error ? signal.reason : new Error("connection request aborted", { cause: signal.reason });
}

export { InProcessConnectionService, abortInProcessCall, apply, inject, name };