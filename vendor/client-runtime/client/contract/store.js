/**
 * Snapshot store engine (zustand vanilla + immer + subscribeWithSelector +
 * rafFlush middleware + opt-in persist + dev freeze) plus the declarative
 * shell over it: {@link defineStore} bakes an init/persist/actions literal
 * into a {@link StoreHandle}, the registration-side store seat of slot
 * terminals. Lives in the React-free runtime (the data layer owns its
 * engine; web-react is shell-only React
 * glue): engine products are bare observables — subscribe/getSnapshot/
 * update/set, NO selector hook. Hook synthesis is web-react's (the one
 * uSES bridge, cached per source at the binding site).
 */
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { produce } from 'immer';
/**
 * Shallow equality for selector slices (zustand/shallow semantics; travels
 * with the engine so hook consumers need no zustand dependency).
 * @param a - left value.
 * @param b - right value.
 * @returns whether the values are shallowly equal.
 */
export function shallowEqual(a, b) {
    return shallow(a, b);
}
/** Batches subscriber notification into one flush per animation frame. */
function rafBatch(notify) {
    // Fall back to microtask batching where rAF is absent (node unit tests);
    // both preserve the N-changes=1-notification contract within a tick.
    const schedule = typeof requestAnimationFrame === 'function'
        ? (fn) => { requestAnimationFrame(() => { fn(); }); }
        : (fn) => { queueMicrotask(fn); };
    let scheduled = false;
    return () => {
        if (scheduled)
            return;
        scheduled = true;
        schedule(() => {
            scheduled = false;
            notify();
        });
    };
}
/**
 * Create a snapshot store.
 *
 * Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
 * stores opt into 'raf', where a frame's worth of updates coalesces into one
 * notification. Known raf-mode tradeoff: a component mounting mid-frame reads
 * fresh state while existing subscribers hear it next flush — transient
 * frame-level skew, same nature as the object layer's microtask batching.
 *
 * @param init - initial state.
 * @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
 * @returns the store.
 */
export function createSnapshotStore(init, opts) {
    // Immer enters through produce() in update() below (identical semantics to
    // the immer middleware without its setState-signature mutator generics).
    const withSelector = subscribeWithSelector(() => init);
    const api = createStore()(withSelector);
    if (opts?.persist)
        attachPersistence(api, opts.persist.name);
    let subscribe = (fn) => api.subscribe(fn);
    if (opts?.flush === 'raf') {
        const listeners = new Set();
        const flush = rafBatch(() => { for (const fn of [...listeners])
            fn(); });
        api.subscribe(flush);
        subscribe = (fn) => {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        };
    }
    return {
        getSnapshot: () => api.getState(),
        subscribe: fn => subscribe(fn),
        update: (mutator) => {
            // Immer's produce (not setState's partial-merge path) so scalar and
            // array roots replace correctly; produce also freezes in dev.
            api.setState(produce(api.getState(), (draft) => { mutator(draft); }), true);
        },
        set: (next) => {
            api.setState(devFreeze(next), true);
        },
    };
}
/**
 * Whole-value JSON persistence to localStorage. Hand-rolled instead of the
 * zustand persist middleware: its write path spreads state into an object
 * (`partialize({ ...get() })`), exploding primitive state (a persisted string
 * draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
 * because the corruption happens before serialization. Storage failures
 * (quota, private mode) only disable persistence, never break the store.
 */
function attachPersistence(api, name) {
    // Non-browser runs (node e2e booting the client tree) have no localStorage:
    // persistence silently disables — same contract as a storage failure, minus
    // the per-store console noise a ReferenceError would produce.
    if (typeof localStorage === 'undefined')
        return;
    try {
        const raw = localStorage.getItem(name);
        if (raw !== null) {
            api.setState(devFreeze(JSON.parse(raw)), true);
        }
    }
    catch (error) {
        console.error(`snapshot store '${name}' rehydration failed:`, error);
    }
    api.subscribe((state) => {
        try {
            localStorage.setItem(name, JSON.stringify(state));
        }
        catch (error) {
            console.error(`snapshot store '${name}' persistence failed:`, error);
        }
    });
}
/** Deep-freeze wholesale-set state outside production: set() bypasses immer's freeze. */
function devFreeze(value) {
    if (process.env.NODE_ENV === 'production')
        return value;
    deepFreeze(value);
    return value;
}
function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value))
        return;
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
        deepFreeze(value[key]);
    }
}
/**
 * Declare a store: initial state, optional persistence, and the full write
 * set as pure draft mutators. The returned handle is the registration
 * currency of the store seat — its identity keys instance sharing. Satisfies
 * ui-slots' DefineStore contract (the handle/instance are the engine-extended
 * subtypes).
 *
 * The `A & ActionsDecl<T>` actions position is load-bearing: T resolves from
 * `init` in the first inference round, and the intersection then contextually
 * types each mutator's draft parameter (context-sensitive functions defer),
 * so call sites write `(d, x: X) => { ... }` with no draft annotation. If a
 * future TS version breaks this single-literal inference, the design's
 * documented fallback is currying (`defineStore(init).actions({...})`).
 * @param decl - init lambda (fresh state per instance), optional persist key, actions table.
 * @returns the store handle.
 */
export function defineStore(decl) {
    return {
        spec: decl,
        create(scopeKey) {
            const persistKey = decl.persist === undefined
                ? undefined
                : scopeKey === undefined ? decl.persist : `${decl.persist}.${scopeKey}`;
            const store = createSnapshotStore(decl.init(), persistKey !== undefined ? { persist: { name: persistKey } } : undefined);
            const actions = {};
            for (const key of Object.keys(decl.actions)) {
                const mutate = decl.actions[key];
                actions[key] = (...params) => { store.update((draft) => { mutate(draft, ...params); }); };
            }
            return {
                actions: actions,
                getSnapshot: () => store.getSnapshot(),
                subscribe: fn => store.subscribe(fn),
                store,
                clearPersisted: () => {
                    if (persistKey === undefined || typeof localStorage === 'undefined')
                        return;
                    try {
                        localStorage.removeItem(persistKey);
                    }
                    catch {
                        // Storage failures (private mode, quota teardown races) only skip
                        // cleanup — the same non-fatal contract as attachPersistence.
                    }
                },
            };
        },
    };
}
//# sourceMappingURL=store.js.map