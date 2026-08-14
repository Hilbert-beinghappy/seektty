/**
 * Live Typert Remote dispatch over Cordis Services and registered providers.
 * Transport, request correlation, and response envelopes belong to Connection.
 * @module @deepseek-ai/dsh-api-gateway
 */
import { Service, symbols } from '@deepseek-ai/cordis';
import { remoteMethods, TypertLookupFailure, } from '@deepseek-ai/dsh-typert-protocol';
const NEVER_ABORTED_SIGNAL = new AbortController().signal;
/** Dispatch failure produced outside the invoked business method. */
export class TypertGatewayError extends Error {
    /** Machine-readable failure category. */
    code;
    /** Canonical `<namespace>/<method>` endpoint. */
    endpoint;
    /** Affected wire field when the failure is field-specific. */
    field;
    /**
     * Construct a Gateway failure without embedding boundary values in its message.
     * @param code - stable failure category.
     * @param endpoint - canonical Remote endpoint.
     * @param message - correction-oriented diagnostic without sensitive values.
     * @param options - optional field and contained cause.
     */
    constructor(code, endpoint, message, options = {}) {
        super(`typert gateway: ${endpoint}: ${message}`, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'TypertGatewayError';
        this.code = code;
        this.endpoint = endpoint;
        this.field = options.field;
    }
}
/** Business invocation lost its carrier cancellation race. */
class RemoteInvocationCancelled extends Error {
    /**
     * @param endpoint - canonical Remote endpoint.
     * @param cause - business rejection observed after carrier cancellation.
     */
    constructor(endpoint, cause) {
        super(`Remote invocation "${endpoint}" was aborted`, { cause });
        this.name = 'RemoteInvocationCancelled';
    }
}
/**
 * Resolve strict generated definitions or conservative SRC markers against
 * current Cordis Services and Typert providers.
 * @typert service typertGateway
 */
export class TypertGatewayService extends Service {
    static inject = ['typert'];
    srcClaims;
    /**
     * Register the Gateway against the active Typert registry.
     * @param ctx - owning Host Context with Typert registry access.
     */
    constructor(ctx) {
        super(ctx, 'typertGateway');
        ctx.on('internal/service', () => {
            this.srcClaims = undefined;
        });
        ctx.inject(['connection'], (connectionCtx) => {
            connectionCtx.connection.rpc.intercept('/api', endpoint => this.claimsEndpoint(endpoint), (endpoint, payload, signal) => this.dispatchRpc(endpoint, payload, signal), { authority: 'trusted-host' });
        });
    }
    claimsEndpoint(endpoint) {
        const segments = endpoint.split('/');
        if (segments.length !== 2 || segments[0] === '' || segments[1] === '')
            return false;
        if (this.ctx.typert.local.get(endpoint) !== undefined || this.ctx.typert.local.hasSeen(endpoint))
            return true;
        this.srcClaims ??= this.collectSrcClaims();
        return this.srcClaims.has(endpoint);
    }
    collectSrcClaims() {
        const claims = new Set();
        for (const [serviceKey, definition] of Object.entries(this.ctx.reflect.props)) {
            if (definition.type !== 'service')
                continue;
            const receiver = this.ctx.get(serviceKey);
            if (!isObject(receiver))
                continue;
            const original = originalOf(receiver);
            const binding = Reflect.get(original, 'typertRemote');
            if (!isObject(binding) || typeof Reflect.get(binding, 'namespace') !== 'string')
                continue;
            const namespace = Reflect.get(binding, 'namespace');
            for (const candidate of remoteMethods(original)) {
                claims.add(endpointOf(namespace, candidate.exportName ?? candidate.method));
            }
        }
        return claims;
    }
    /**
     * Invoke one live Remote method through strict generated reflection or SRC markers.
     * @param request - decoded endpoint and exact named wire arguments.
     * @returns the validated business result.
     * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
     */
    async invoke(request) {
        const endpoint = endpointOf(request.namespace, request.method);
        const descriptor = this.resolveDescriptor(request.namespace, request.method, endpoint);
        assertExactArguments(request.args, descriptor, endpoint);
        const receiverContext = await this.resolveReceiverContext(descriptor, request.args, endpoint);
        const receiver = receiverContext.get(descriptor.service);
        if (!isObject(receiver)) {
            throw new TypertGatewayError('service-unavailable', endpoint, `active Service ${JSON.stringify(descriptor.service)} is unavailable`);
        }
        validateBinding(receiver, descriptor.service, descriptor.namespace, endpoint);
        const args = await Promise.all(descriptor.parameters.map(parameter => this.resolveParameter(parameter, request.args, endpoint)));
        if (descriptor.cancellation !== undefined)
            args.push(request.signal ?? NEVER_ABORTED_SIGNAL);
        const implementation = descriptor.implementation ?? descriptor.method;
        const method = Reflect.get(receiver, implementation);
        if (typeof method !== 'function') {
            throw new TypertGatewayError('method-unavailable', endpoint, `active Service ${JSON.stringify(descriptor.service)} has no callable method ${JSON.stringify(implementation)}`);
        }
        let result;
        try {
            result = await Reflect.apply(method, receiver, args);
        }
        catch (error) {
            if (request.signal?.aborted === true)
                throw new RemoteInvocationCancelled(endpoint, error);
            throw error;
        }
        // A weak descriptor declares no return type, so nothing returned is a void
        // result and rides the wire as an absent value field. A strict descriptor
        // keeps its schema: there, undefined has to be a declared result.
        if (result === undefined && descriptor.result.mode !== 'strict')
            return result;
        return decode(descriptor.result, result, 'result-invalid', endpoint, 'result');
    }
    async dispatchRpc(endpoint, payload, signal) {
        return this.invokeRpc(endpoint, payload, signal);
    }
    async invokeRpc(endpoint, payload, signal) {
        try {
            const segments = endpoint.split('/');
            if (segments.length !== 2 || segments[0] === '' || segments[1] === '') {
                throw new Error(`invalid Remote endpoint ${JSON.stringify(endpoint)}`);
            }
            const [namespace, method] = segments;
            if (!isObject(payload)
                || !isPlainObject(payload)
                || Reflect.ownKeys(payload).length !== 1
                || !Object.hasOwn(payload, 'args')
                || !isObject(payload.args)
                || !isPlainObject(payload.args)) {
                throw new Error('Remote payload must contain exactly one plain-object args field');
            }
            const value = await this.invoke({
                namespace,
                method,
                args: payload.args,
                signal,
            });
            // A void or explicitly absent business result carries no `value` field;
            // JSON has no `undefined`, and the envelope's optional slot is the one
            // representation of absence that both args and results already use.
            return { ok: true, value };
        }
        catch (error) {
            return rpcFailure(error);
        }
    }
    resolveDescriptor(namespace, method, endpoint) {
        const strict = this.ctx.typert.local.get(endpoint);
        if (strict !== undefined)
            return strict;
        if (this.ctx.typert.local.hasSeen(endpoint)) {
            throw new TypertGatewayError('definition-unavailable', endpoint, 'its strict definition was withdrawn and SRC fallback is forbidden');
        }
        return this.resolveSrcDescriptor(namespace, method, endpoint);
    }
    resolveSrcDescriptor(namespace, method, endpoint) {
        const candidates = [];
        for (const [serviceKey, definition] of Object.entries(this.ctx.reflect.props)) {
            if (definition.type !== 'service')
                continue;
            const receiver = this.ctx.get(serviceKey);
            if (!isObject(receiver))
                continue;
            const original = originalOf(receiver);
            const value = Reflect.get(original, 'typertRemote');
            if (value === undefined)
                continue;
            const binding = readBinding(value, original, serviceKey, endpoint);
            if (binding.namespace !== namespace)
                continue;
            const marker = remoteMethods(original).find(candidate => (candidate.exportName ?? candidate.method) === method);
            if (marker === undefined)
                continue;
            candidates.push(this.srcDescriptor(binding, marker, method, endpoint));
        }
        if (candidates.length === 0) {
            throw new TypertGatewayError('invocation-unavailable', endpoint, 'no active Remote method exports this endpoint');
        }
        if (candidates.length > 1) {
            throw new TypertGatewayError('ambiguous-endpoint', endpoint, `multiple active Services export this endpoint: ${candidates.map(candidate => candidate.service).sort().join(', ')}`);
        }
        return candidates[0];
    }
    srcDescriptor(binding, marker, method, endpoint) {
        const names = methodParameterNames(binding.service, marker.method, endpoint);
        const signalIndex = names.indexOf('signal');
        if (signalIndex >= 0 && signalIndex !== names.length - 1) {
            throw new TypertGatewayError('signature-invalid', endpoint, 'SRC cancellation parameter signal must be the final parameter', { field: 'signal' });
        }
        const cancellation = signalIndex >= 0
            ? { parameter: 'signal' }
            : undefined;
        const businessNames = cancellation === undefined ? names : names.slice(0, -1);
        const parameters = [];
        const wires = new Set();
        for (const name of businessNames) {
            const matches = this.ctx.typert.lookups.definitions()
                .filter(definition => definition.parameter === name);
            if (matches.length > 1) {
                throw new TypertGatewayError('signature-invalid', endpoint, `parameter ${JSON.stringify(name)} matches multiple lookup providers`, { field: name });
            }
            const match = matches[0];
            const parameter = match === undefined
                ? { name, wire: name, source: 'json', codec: { mode: 'src-json' } }
                : {
                    name,
                    wire: match.wire,
                    source: 'lookup',
                    lookup: match.key,
                    codec: { mode: 'src-json' },
                };
            if (wires.has(parameter.wire)) {
                throw new TypertGatewayError('signature-invalid', endpoint, `multiple parameters use wire field ${JSON.stringify(parameter.wire)}`, { field: parameter.wire });
            }
            wires.add(parameter.wire);
            parameters.push(parameter);
        }
        let receiver = { kind: 'direct' };
        if (marker.invocation.kind === 'context') {
            const provider = this.ctx.typert.contexts.getHost(marker.invocation.context);
            if (provider === undefined) {
                throw new TypertGatewayError('context-unavailable', endpoint, `Context provider ${JSON.stringify(marker.invocation.context)} is unavailable`);
            }
            if (wires.has(provider.wire)) {
                throw new TypertGatewayError('signature-invalid', endpoint, `Context identity conflicts with wire field ${JSON.stringify(provider.wire)}`, { field: provider.wire });
            }
            receiver = {
                kind: 'context',
                context: marker.invocation.context,
                wire: provider.wire,
                codec: { mode: 'src-json' },
            };
        }
        return {
            id: `src:${binding.serviceKey}#${endpoint}`,
            service: binding.serviceKey,
            namespace: binding.namespace,
            method,
            ...(marker.method === method ? {} : { implementation: marker.method }),
            invocation: receiver,
            parameters,
            ...(cancellation === undefined ? {} : { cancellation }),
            result: { mode: 'src-json' },
        };
    }
    async resolveReceiverContext(descriptor, args, endpoint) {
        if (descriptor.invocation.kind === 'direct')
            return this.ctx;
        const invocation = descriptor.invocation;
        const provider = this.ctx.typert.contexts.getHost(invocation.context);
        if (provider === undefined) {
            throw new TypertGatewayError('context-unavailable', endpoint, `Context provider ${JSON.stringify(invocation.context)} is unavailable`);
        }
        if (provider.wire !== invocation.wire
            || (invocation.codec.mode === 'strict' && provider.wireTypeSymbol !== invocation.codec.typeSymbol)) {
            throw new TypertGatewayError('provider-mismatch', endpoint, `Context provider ${JSON.stringify(invocation.context)} does not match its strict definition`, { field: invocation.wire });
        }
        const identity = decode(invocation.codec, args[invocation.wire], 'input-invalid', endpoint, invocation.wire);
        let context;
        try {
            context = await provider.resolve(identity);
        }
        catch (cause) {
            if (cause instanceof TypertLookupFailure)
                throw cause;
            throw new TypertGatewayError('context-failed', endpoint, `Context provider ${JSON.stringify(invocation.context)} failed`, { cause, field: invocation.wire });
        }
        if (context === undefined) {
            throw new TypertGatewayError('context-not-found', endpoint, `Context provider ${JSON.stringify(invocation.context)} did not resolve the requested identity`, { field: invocation.wire });
        }
        return context;
    }
    async resolveParameter(parameter, args, endpoint) {
        // An absent field reached assertExactArguments' allowance, so this parameter
        // takes undefined; a present-but-undefined field is not JSON-safe input and
        // still fails decode. Lookup ids are never omissible, so absence here only
        // ever belongs to a json parameter.
        if (!Object.hasOwn(args, parameter.wire))
            return undefined;
        const value = decode(parameter.codec, args[parameter.wire], 'input-invalid', endpoint, parameter.wire);
        if (parameter.source === 'json')
            return value;
        const key = parameter.lookup;
        /* v8 ignore next -- registry validation rejects strict descriptors without a key, and SRC derivation always supplies one. */
        if (key === undefined) {
            throw new TypertGatewayError('lookup-unavailable', endpoint, `lookup parameter ${JSON.stringify(parameter.name)} has no provider key`, { field: parameter.wire });
        }
        const provider = this.ctx.typert.lookups.get(key);
        if (provider === undefined) {
            throw new TypertGatewayError('lookup-unavailable', endpoint, `lookup provider ${JSON.stringify(key)} is unavailable`, { field: parameter.wire });
        }
        if (provider.wire !== parameter.wire
            || (parameter.codec.mode === 'strict' && provider.wireTypeSymbol !== parameter.codec.typeSymbol)) {
            throw new TypertGatewayError('provider-mismatch', endpoint, `lookup provider ${JSON.stringify(key)} does not match its strict definition`, { field: parameter.wire });
        }
        let resolved;
        try {
            resolved = await provider.resolve(value);
        }
        catch (cause) {
            if (cause instanceof TypertLookupFailure)
                throw cause;
            throw new TypertGatewayError('lookup-failed', endpoint, `lookup provider ${JSON.stringify(key)} failed`, { cause, field: parameter.wire });
        }
        if (resolved === undefined) {
            throw new TypertGatewayError('lookup-not-found', endpoint, `lookup provider ${JSON.stringify(key)} did not resolve the requested identity`, { field: parameter.wire });
        }
        return resolved;
    }
}
function rpcFailure(error) {
    if (error instanceof RemoteInvocationCancelled) {
        return {
            ok: false,
            error: { code: 'cancelled', message: error.message, details: {} },
        };
    }
    if (error instanceof TypertLookupFailure) {
        return { ok: false, error: error.failure };
    }
    return {
        ok: false,
        error: {
            code: 'internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
        },
    };
}
function endpointOf(namespace, method) {
    return `${namespace}/${method}`;
}
function validateBinding(receiver, serviceKey, namespace, endpoint) {
    const original = originalOf(receiver);
    const value = Reflect.get(original, 'typertRemote');
    if (value === undefined) {
        throw new TypertGatewayError('binding-invalid', endpoint, `Service ${JSON.stringify(serviceKey)} has no visible typertRemote binding`);
    }
    return {
        binding: readBinding(value, original, serviceKey, endpoint, namespace),
        original,
    };
}
function readBinding(value, original, serviceKey, endpoint, namespace) {
    if (!isObject(value)
        || Reflect.get(value, 'service') !== original
        || Reflect.get(value, 'serviceKey') !== serviceKey
        || typeof Reflect.get(value, 'namespace') !== 'string'
        || (namespace !== undefined && Reflect.get(value, 'namespace') !== namespace)) {
        throw new TypertGatewayError('binding-invalid', endpoint, `Service ${JSON.stringify(serviceKey)} has an inconsistent typertRemote binding`);
    }
    return value;
}
function originalOf(receiver) {
    const original = Reflect.get(receiver, symbols.original);
    return isObject(original) ? original : receiver;
}
function methodParameterNames(service, method, endpoint) {
    let prototype = Object.getPrototypeOf(service);
    let implementation;
    while (prototype !== null) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        if (descriptor !== undefined) {
            if ('value' in descriptor && typeof descriptor.value === 'function') {
                implementation = descriptor.value;
            }
            break;
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    if (implementation === undefined) {
        throw new TypertGatewayError('method-unavailable', endpoint, `Remote marker has no prototype method ${JSON.stringify(method)}`);
    }
    const source = Function.prototype.toString.call(implementation);
    const open = source.indexOf('(');
    const close = source.indexOf(')', open + 1);
    /* v8 ignore next -- standard public class-method syntax always contains a parenthesized parameter list. */
    if (open < 0 || close < 0)
        return invalidSignature(endpoint, method);
    const body = source.slice(open + 1, close).trim();
    if (body.length === 0)
        return [];
    const parts = body.split(',').map(part => part.trim());
    const names = new Set();
    for (const part of parts) {
        if (!/^[$A-Z_a-z][$\w]*$/u.test(part) || names.has(part))
            return invalidSignature(endpoint, method);
        names.add(part);
    }
    return [...names];
}
function invalidSignature(endpoint, method) {
    throw new TypertGatewayError('signature-invalid', endpoint, `SRC method ${JSON.stringify(method)} must use unique identifier parameters without destructuring, defaults, or rest`);
}
function assertExactArguments(args, descriptor, endpoint) {
    if (!isPlainObject(args)) {
        throw new TypertGatewayError('arguments-invalid', endpoint, 'args must be a plain object');
    }
    const expected = new Set(descriptor.parameters.map(parameter => parameter.wire));
    if (descriptor.invocation.kind === 'context')
        expected.add(descriptor.invocation.wire);
    const actual = Reflect.ownKeys(args);
    const extra = actual.filter(key => typeof key !== 'string' || !expected.has(key));
    // A JSON field may be omitted when the strict descriptor declares absence,
    // and always under SRC: a weak descriptor reads parameter names from the
    // JavaScript signature and cannot see which are optional, so LIB is where an
    // omitted required argument is caught. Lookup ids are never omissible.
    const acceptsMissing = new Set(descriptor.parameters
        .filter(parameter => parameter.source === 'json'
        && (parameter.acceptsUndefined === true || parameter.codec.mode === 'src-json'))
        .map(parameter => parameter.wire));
    const missing = [...expected].filter(key => !Object.hasOwn(args, key) && !acceptsMissing.has(key));
    if (extra.length === 0 && missing.length === 0)
        return;
    const clauses = [];
    if (missing.length > 0)
        clauses.push(`missing ${missing.map(key => JSON.stringify(key)).join(', ')}`);
    if (extra.length > 0)
        clauses.push(`unexpected ${extra.map(key => JSON.stringify(String(key))).join(', ')}`);
    throw new TypertGatewayError('arguments-invalid', endpoint, `args fields do not match the descriptor: ${clauses.join('; ')}`);
}
function decode(codec, value, code, endpoint, field) {
    try {
        if (codec.mode === 'strict') {
            value = codec.schema.parse(value);
            if (value === undefined)
                return value;
        }
        assertJsonValue(value, new Set());
        return value;
    }
    catch (cause) {
        throw new TypertGatewayError(code, endpoint, code === 'input-invalid'
            ? `wire field ${JSON.stringify(field)} failed boundary validation`
            : 'business result failed boundary validation', { cause, field });
    }
}
function assertJsonValue(value, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (Number.isFinite(value))
            return;
        throw new TypeError('non-finite number is not JSON-safe');
    }
    if (!isObject(value))
        throw new TypeError(`${typeof value} is not JSON-safe`);
    if (ancestors.has(value))
        throw new TypeError('cyclic value is not JSON-safe');
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) {
                throw new TypeError('sparse or decorated array is not JSON-safe');
            }
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index))
                    throw new TypeError('sparse array is not JSON-safe');
                assertJsonValue(value[index], ancestors);
            }
            return;
        }
        if (!isPlainObject(value))
            throw new TypeError('non-plain object is not JSON-safe');
        if (Object.getOwnPropertySymbols(value).length > 0)
            throw new TypeError('symbol property is not JSON-safe');
        for (const key of Reflect.ownKeys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            /* v8 ignore next -- ownKeys() just returned this key; only a hostile same-process Proxy can delete it between operations. */
            if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
                throw new TypeError('non-data property is not JSON-safe');
            }
            assertJsonValue(descriptor.value, ancestors);
        }
    }
    finally {
        ancestors.delete(value);
    }
}
function isPlainObject(value) {
    if (Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}
function isObject(value) {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
export default TypertGatewayService;
//# sourceMappingURL=index.js.map