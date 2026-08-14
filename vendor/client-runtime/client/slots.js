/**
 * SlotRegistry: the cordis Service layer of the slot system over the pure
 * SlotCore (ui-slots owns registration semantics, the declaration ledger,
 * the load-time validations, and the unload cascade). This layer owns what
 * needs the runtime: the 'slots/changed' event bridge, register and
 * declaration injection through the caller's ctx.effect (fiber unload
 * collects both), the renderer installation contract (install()/renderSlot('root') +
 * the SlotRendererHost face), and the store INSTANCE axis — handle x scope
 * key -> create/cache, dropped with the last holding entry, session instances
 * cleared (with persisted state) on scope death.
 */
/* oxlint-disable typescript/no-redundant-type-constituents --
 * `keyof SlotMap & string` is the declare-merge key pattern: SlotMap only
 * holds this package's 'root' row in this compilation unit, but consumers
 * merge keys in; the rule fires on the narrow-map view, not on real
 * redundancy. */
import { Service } from '@deepseek-ai/cordis';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
/** Instance key for root-scoped store records (session records key by session id, so the literal cannot collide). */
const ROOT_INSTANCE_KEY = 'root';
/** cordis Service layer of the slot system; see the module doc for the split with SlotCore. */
export class SlotRegistry extends Service {
    _core = new SlotCore();
    /** Store-instance axis: handle -> mounted scope, refcount, resolved instances. */
    _stores = new Map();
    _renderer;
    _locale;
    _host;
    /**
     * @param ctx - owning root context.
     */
    constructor(ctx) {
        super(ctx, 'slots');
        this._core.onMutate((key) => { ctx.emit('slots/changed', key); });
    }
    /**
     * Install an effect for each declaration lifetime of a slot. The callback
     * runs synchronously when the declaration already exists; otherwise it runs
     * inside the declaring `register()` call after the declaration is committed.
     * Collapse disposes the effect and a later declaration runs it again.
     * Callback effects are synchronous disposers; iterable effects install
     * transactionally and dispose in reverse order. The controller belongs to
     * the caller's fiber, so plugin unload cancels a pending wait and removes any
     * active contribution.
     *
     * @param key - declared SlotMap key to depend on.
     * @param callback - creates one disposer or an iterable of disposers.
     * @returns idempotent disposer for the wait and active effect.
     * @throws callback setup failures synchronously when the slot is already declared.
     */
    inject(key, callback) {
        const ctx = this.ctx;
        const disposeController = ctx.effect(() => {
            let active;
            let activeEpoch;
            let stopped = false;
            let unsubscribe = () => { };
            const stop = () => {
                if (stopped)
                    return;
                // Failure callers retire the injection permanently: a delayed setup
                // failure never retries on a later declaration.
                stopped = true;
                unsubscribe();
                const dispose = active;
                active = undefined;
                activeEpoch = undefined;
                dispose?.();
            };
            const reconcile = () => {
                if (stopped)
                    return;
                const spec = this._core.specDynamic(key);
                const epoch = this._core.declarationEpoch(key);
                if (active !== undefined && activeEpoch === epoch)
                    return;
                const dispose = active;
                active = undefined;
                activeEpoch = undefined;
                dispose?.();
                if (spec === undefined)
                    return;
                // A declaration lifetime is a nested Cordis effect. This gives
                // generator callbacks the same transactional setup, reverse teardown,
                // diagnostics tree, and idempotence as every other plugin effect.
                const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`);
                active = () => { void disposeEffect(); };
                activeEpoch = epoch;
            };
            const changed = () => {
                try {
                    reconcile();
                }
                catch (error) {
                    if (error?.code === 'INACTIVE_EFFECT') {
                        stop();
                        return;
                    }
                    stop();
                    const failure = error instanceof Error ? error : new Error(String(error));
                    queueMicrotask(() => { throw failure; });
                }
            };
            unsubscribe = this._core.subscribeDeclaration(key, changed);
            try {
                reconcile();
            }
            catch (error) {
                stop();
                throw error;
            }
            return stop;
        }, `slots.inject(${JSON.stringify(key)})`);
        return () => { void disposeController(); };
    }
    /**
     * Install the shell's renderer (web-react's createSlotRenderer product).
     * Boot-once: a second install throws. Runs through the caller's ctx.effect,
     * so shell fiber unload uninstalls the renderer.
     * @param renderer - the outlet machinery implementing SlotRenderer.
     */
    install(renderer) {
        if (this._renderer !== undefined)
            throw new Error('slot renderer already installed (install() is boot-once)');
        this.ctx.effect(() => {
            this._renderer = renderer;
            return () => {
                if (this._renderer === renderer)
                    this._renderer = undefined;
            };
        }, 'slots.install()');
    }
    /**
     * Install the locale face backing the `t` standard seat (the locale
     * plugin's product; same boot-once discipline as the renderer install).
     * Runs through the caller's ctx.effect, so the installing fiber's unload
     * uninstalls the face.
     * @param face - namespace binder + revision observable.
     */
    installLocale(face) {
        if (this._locale !== undefined)
            throw new Error('locale face already installed (installLocale() is boot-once)');
        this.ctx.effect(() => {
            this._locale = face;
            return () => {
                if (this._locale === face)
                    this._locale = undefined;
            };
        }, 'slots.installLocale()');
    }
    /**
     * The single ctx-level render entry: the shell renders 'root'; every other
     * key renders inside components through the props renderSlot face. All
     * three guards are fail-loud boot-order checks, no fallback.
     * @param key - must be 'root' (runtime-enforced for dynamically composed callers).
     * @param owner - owner share for the root entry (the shell supplies {}).
     * @returns the rendered root tree.
     */
    renderSlot(key, owner) {
        // Widened: in this package's own program SlotMap holds only 'root', which
        // would fold the guard to constant-false; the check exists for plain-JS
        // and cross-program callers where K is wider.
        if (key !== 'root') {
            throw new Error(`ctx-level renderSlot only renders 'root' (got "${key}"); child slots render through the component props face`);
        }
        if (this._renderer === undefined) {
            throw new Error("slot renderer not installed — boot must call ctx.slots.install(createSlotRenderer()) before rendering 'root'");
        }
        if (this._core.entries('root').length === 0) {
            throw new Error("'root' has no registration — a layout entry must register into 'root' before the shell renders it");
        }
        return this._renderer.renderRoot(this.hostFace(), owner);
    }
    /**
     * Drop the per-session store instances of a dead session (the sessions
     * service calls this on scope teardown; root-scoped records are untouched).
     * Persisted state goes with the session — a never-rendered dead session can
     * still own keys from an earlier page load, so the instance is materialized
     * transiently just to clear storage (no-op for unpersisted stores).
     * @param sessionId - the torn-down session.
     */
    pruneStoreScope(sessionId) {
        for (const [handle, record] of this._stores) {
            if (record.scope !== 'session')
                continue;
            const instance = record.instances.get(sessionId) ?? handle.create(sessionId);
            instance.clearPersisted();
            record.instances.delete(sessionId);
        }
    }
    /**
     * Snapshot entries for a key (render-erased view; stable reference between mutations).
     * @param key - SlotMap key.
     * @returns registered entries.
     */
    entries(key) {
        return this._core.entries(key);
    }
    /**
     * Shadowing winners per cell for a key: the first live (non-abdicated)
     * entry of each cell in priority order — what outlets render; chain keys
     * pass through unchanged (election consumes every entry). The raw
     * {@link SlotsService.entries} view stays the inspection surface. Fresh
     * array per call, not a uSES getSnapshot source.
     * @param key - SlotMap key.
     * @returns the winning entry per occupied cell.
     */
    entriesOfSlot(key) {
        return this._core.entriesOfSlot(key);
    }
    /**
     * Export the current JSON-safe Slot declaration tree for read-only inspection.
     * @param root - exact live Slot root; omitted returns all roots.
     * @returns selected Slot trees.
     */
    snapshot(root) {
        return this._core.snapshot(root);
    }
    /**
     * Observe entry boundary crashes (every render-time entry failure the
     * boundaries contain, abdicating or not) — the supervision seam for
     * plugins mirroring contribution health. Fires synchronously per report,
     * after the registry mutated for abdicating crashes. Callers own the
     * disposer (wire it through ctx.effect for fiber-lifetime cleanup, as with
     * {@link SlotsService.subscribe}).
     * @param fn - called with the slot key, the crashed entry, the crash
     * cause, and `abdicated`: whether the crash retired the entry from its cell.
     * @returns unsubscribe.
     */
    onEntryError(fn) {
        return this._core.onEntryError(fn);
    }
    /**
     * Look up a declared spec (register-declared or the built-in 'root').
     * @param key - SlotMap key.
     * @returns spec or undefined.
     */
    spec(key) {
        return this._core.spec(key);
    }
    /**
     * Subscribe to a key's registration changes (microtask-batched).
     * @param key - SlotMap key.
     * @param fn - change callback.
     * @returns unsubscribe.
     */
    subscribe(key, fn) {
        return this._core.subscribe(key, fn);
    }
    /**
     * Version counter for uSES pairing.
     * @param key - SlotMap key.
     * @returns current version.
     */
    getVersion(key) {
        return this._core.getVersion(key);
    }
    /** Delegating registration path: factory minting + registrant stamp + core write + instance-axis bookkeeping. */
    _register(options, component) {
        // Exclusive stores pass the factory itself: minted here into a per-entry
        // handle so the stored entry always carries a resolvable handle (the
        // core's shared-handle scope pinning applies to it harmlessly).
        const store = typeof options.store === 'function' ? options.store() : options.store;
        const registrant = options.registrant ?? this.ctx.fiber?.name;
        const erased = {
            ...options,
            ...(store !== undefined ? { store } : {}),
            ...(registrant !== undefined ? { registrant } : {}),
        };
        // Core write first: all load-time validation (undeclared target,
        // duplicate declaration, kind conflicts, cross-scope handle) throws
        // there before this layer commits anything.
        const dispose = this._core.register(erased, component);
        if (store !== undefined) {
            // Register succeeded, so the target's spec is on the ledger.
            const scope = this._core.specDynamic(options.name).scope;
            this._acquire(store, scope);
        }
        let disposed = false;
        return () => {
            if (disposed)
                return;
            disposed = true;
            dispose();
            if (store !== undefined)
                this._release(store);
        };
    }
    /** Build once after both object-layer services mount; per-session provide bundles still resolve lazily. */
    hostFace() {
        if (this._host !== undefined)
            return this._host;
        const sessions = this.ctx.get('sessions');
        if (sessions === undefined) {
            throw new Error("renderSlot('root') before the sessions service mounted — boot order puts runtime apply first");
        }
        const workspaces = this.ctx.get('workspaces');
        if (workspaces === undefined) {
            throw new Error("renderSlot('root') before the workspaces service mounted — boot order puts runtime apply first");
        }
        // `locale` is a live getter: the face installs (and, under HMR, swaps)
        // on the locale plugin's own fiber lifetime, while this host object is
        // built once — a captured value would strand renders on a dead face. The
        // alias is required: `this` inside the getter is the host literal.
        // oxlint-disable-next-line typescript/no-this-alias
        const service = this;
        this._host = {
            subscribe: (key, fn) => this._core.subscribe(key, fn),
            getVersion: key => this._core.getVersion(key),
            entriesOf: key => this._core.entries(key),
            entriesOfSlot: key => this._core.entriesOfSlot(key),
            reportEntryError: (key, entry, error, info) => { this._core.reportEntryError(key, entry, error, info); },
            specOf: key => this._core.specDynamic(key),
            isLive: entry => this._core.isLive(entry),
            storeOf: (entry, scopeKey) => entry.store === undefined ? undefined : this.resolveStore(entry.store, scopeKey),
            sessions: {
                list: sessions.list,
                provideInfo: sessions.currentProvideInfo,
            },
            workspaces: { list: workspaces.list },
            get locale() { return service._locale; },
        };
        return this._host;
    }
    /** Resolve (create or reuse) the store instance for a registered handle under a scope key. */
    resolveStore(handle, sessionId) {
        const record = this._stores.get(handle);
        if (record === undefined)
            throw new Error('store handle is not registered (entry unloaded, or the handle never went through register)');
        const key = record.scope === 'root' ? ROOT_INSTANCE_KEY : sessionId;
        if (key === undefined)
            throw new Error(`${record.scope} store resolution requires a session id`);
        let instance = record.instances.get(key);
        if (instance === undefined) {
            // Session instances get the scope key (the engine suffixes the persist
            // key per session); root instances stay keyless.
            instance = record.scope === 'root' ? handle.create() : handle.create(key);
            record.instances.set(key, instance);
        }
        return instance;
    }
    /** Bind (or re-reference) a handle on the axis; cross-scope conflicts already threw in the core. */
    _acquire(handle, scope) {
        const record = this._stores.get(handle);
        if (record === undefined) {
            this._stores.set(handle, { scope, refs: 1, instances: new Map() });
            return;
        }
        record.refs += 1;
    }
    /** Drop one reference; the last holder's unload drops the record (instances go with it — engine stores need no explicit dispose). */
    _release(handle) {
        const record = this._stores.get(handle);
        /* v8 ignore next -- defensive: release only runs from a disposer whose
         * register acquired the same handle, so the record must exist; kept so a
         * future call site cannot underflow the axis. */
        if (record === undefined)
            return;
        record.refs -= 1;
        if (record.refs === 0)
            this._stores.delete(handle);
    }
}
// register's implementation (prototype assignment pairs with the `declare`
// inside the class — see its JSDoc for why it must live on the prototype).
// Element access reaches the private _register legally and keeps it a
// TS-visible read.
;
SlotRegistry.prototype.register
    = function register(rawOptions, component) {
        // The core's overloads proved the shares; the implementation works on
        // the erased view (same pattern as the core's own implementation arm).
        const options = rawOptions;
        // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
        return this.ctx.effect(() => this['_register'](options, component), 'slots.register()');
    };
//# sourceMappingURL=slots.js.map