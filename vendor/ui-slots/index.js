export * from "./store.js";
export * from "./renderer.js";
/**
 * Resolve a possibly-thunked list label at read time (thunks follow the
 * active locale; owners projecting ledger rows call this instead of reading
 * `options.label` raw).
 * @param label - the stored label.
 * @returns the display string, or undefined when the entry declared none.
 */
export function resolveSlotLabel(label) {
    return typeof label === 'function' ? label() : label;
}
const NO_ENTRIES = Object.freeze([]);
/**
 * Pure slot registry (no cordis; event emission and the renderer installation contract
 * live in the runtime Service wrapper).
 *
 * The 'root' slot is the one a-priori declaration, seeded at construction
 * (single/root, declared by the framework) — the render tree's root hole.
 *
 * Change propagation contract: versions bump and {@link SlotCore.onMutate}
 * fires synchronously per mutation (registry state is consistent when they
 * fire); {@link SlotCore.subscribeDeclaration} fires synchronously for each
 * declaration lifetime boundary; {@link SlotCore.subscribe} notifications
 * batch per microtask, so N same-tick mutations produce one notification per
 * touched key. Entry crash reports ({@link SlotCore.reportEntryError}) ride
 * the same mutation channel when they abdicate, then notify
 * {@link SlotCore.onEntryError} synchronously.
 */
export class SlotCore {
    records = new Map();
    mutateListeners = new Set();
    /** Shared-handle scope ledger: handle → the scope it first mounted under + live mount count. */
    handleScopes = new Map();
    // Dirty records, not keys: records are never removed, so holding the
    // reference skips a lookup (and an unreachable missing-record branch) at flush.
    dirty = new Set();
    flushScheduled = false;
    /**
     * Entries retired by an abdicating crash report
     * ({@link SlotCore.reportEntryError}): excluded from
     * {@link SlotCore.entriesOfSlot} projections for the rest of their
     * registration's life, while the registration itself stays on the ledger
     * (disposal authority remains with the registrant).
     */
    abdicated = new WeakSet();
    entryErrorListeners = new Set();
    constructor() {
        // The a-priori root hole. No markDirty: nothing can observe construction.
        const root = this.record('root');
        root.spec = { kind: 'single', scope: 'root' };
        root.declaredBy = '(built-in)';
        root.declarationEpoch = 1;
    }
    /* jscpd:ignore-end */
    register(options, component) {
        const rec = this.records.get(options.name);
        if (!rec?.spec) {
            throw new Error(`slot "${options.name}" is not declared (a parent entry's children table must declare it)`);
        }
        const spec = rec.spec;
        // Kind constraints stay runtime checks for dynamically-composed callers;
        // typed callers already satisfied KindOptions statically. Cell occupancy
        // clashes only at the exact priority: a different priority shadows.
        const priority = options.priority ?? 0;
        const occupantHint = (occupant) => `at priority ${priority}${occupant.registrant !== undefined ? ` (registered by ${occupant.registrant})` : ''} — register at a different priority to shadow it (lowest renders)`;
        switch (spec.kind) {
            case 'single': {
                const occupant = rec.entries.find(e => (e.options.priority ?? 0) === priority);
                if (occupant)
                    throw new Error(`single slot "${options.name}" already has a registration ${occupantHint(occupant)}`);
                break;
            }
            case 'keyed': {
                if (options.key === undefined)
                    throw new Error(`keyed slot "${options.name}" requires options.key`);
                const occupant = rec.entries.find(e => e.options.key === options.key && (e.options.priority ?? 0) === priority);
                if (occupant) {
                    throw new Error(`keyed slot "${options.name}" already has an entry for key "${options.key}" ${occupantHint(occupant)}`);
                }
                break;
            }
            case 'list': {
                if (options.id === undefined)
                    throw new Error(`list slot "${options.name}" requires options.id`);
                const occupant = rec.entries.find(e => e.options.id === options.id && (e.options.priority ?? 0) === priority);
                if (occupant) {
                    throw new Error(`list slot "${options.name}" already has an entry with id "${options.id}" ${occupantHint(occupant)}`);
                }
                break;
            }
            case 'chain':
                if (options.select === undefined)
                    throw new Error(`chain slot "${options.name}" requires options.select`);
                break;
        }
        if (options.children) {
            for (const childKey of Object.keys(options.children)) {
                const childRec = this.records.get(childKey);
                if (childRec?.spec) {
                    throw new Error(`slot "${childKey}" is already declared (by ${childRec.declaredBy ?? 'an unknown entry'})`);
                }
            }
        }
        // Shared handles pin their scope on first mount; factories are exempt
        // (the framework creates per-entry instances, no shared identity exists).
        if (options.store !== undefined && typeof options.store !== 'function') {
            const pinned = this.handleScopes.get(options.store);
            if (pinned && pinned.scope !== spec.scope) {
                throw new Error(`store handle mounted under "${options.name}" (scope "${spec.scope}") is already mounted under scope "${pinned.scope}" — one handle, one scope`);
            }
            if (pinned)
                pinned.count += 1;
            else
                this.handleScopes.set(options.store, { scope: spec.scope, count: 1 });
        }
        const entry = {
            component,
            options: {
                ...(options.key !== undefined ? { key: options.key } : {}),
                ...(options.id !== undefined ? { id: options.id } : {}),
                ...(options.order !== undefined ? { order: options.order } : {}),
                ...(options.label !== undefined ? { label: options.label } : {}),
                ...(options.priority !== undefined ? { priority: options.priority } : {}),
            },
            ...(options.select !== undefined ? { select: options.select } : {}),
            ...(options.inject !== undefined ? { inject: options.inject } : {}),
            ...(options.children !== undefined ? { children: options.children } : {}),
            ...(options.store !== undefined ? { store: options.store } : {}),
            ...(options.locale !== undefined ? { locale: options.locale } : {}),
            ...(options.registrant !== undefined ? { registrant: options.registrant } : {}),
        };
        const next = [...rec.entries, entry];
        // Stable sorts: priority ascending for every kind, ties keep registration
        // sequence — a cell's winner is its first occurrence, chain tries lower
        // priority first. List refines equal priorities by explicit `order` so the
        // raw ledger keeps its display sequence for priority-less compositions.
        next.sort(spec.kind === 'list'
            ? (a, b) => ((a.options.priority ?? 0) - (b.options.priority ?? 0)) || ((a.options.order ?? 0) - (b.options.order ?? 0))
            : (a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0));
        rec.entries = next;
        this.markDirty(options.name, rec);
        if (options.children) {
            const declarations = [];
            for (const [childKey, childSpec] of Object.entries(options.children)) {
                const childRec = this.record(childKey);
                childRec.spec = childSpec;
                childRec.declaredBy = `an entry in "${options.name}"${options.registrant ? ` (${options.registrant})` : ''}`;
                childRec.parent = options.name;
                childRec.declarationEpoch += 1;
                declarations.push([childKey, childRec]);
            }
            // Synchronous listeners may register into or try to redeclare a sibling;
            // publish only after the whole children table owns its declarations.
            for (const [childKey, childRec] of declarations) {
                this.markDirty(childKey, childRec);
            }
            for (const [, childRec] of declarations) {
                this.notifyDeclaration(childRec);
            }
        }
        return () => {
            if (!rec.entries.includes(entry))
                return;
            rec.entries = rec.entries.filter(e => e !== entry);
            this.markDirty(options.name, rec);
            this.releaseEntry(entry);
        };
    }
    /**
     * Whether a previously obtained entry is still registered (the render
     * machinery's stale-authorization probe: a retained renderSlot binding
     * whose entry left the ledger must not render).
     * @param entry - a previously read entry.
     * @returns false once the entry's registration was disposed.
     */
    isLive(entry) {
        for (const rec of this.records.values()) {
            if (rec.entries.includes(entry))
                return true;
        }
        return false;
    }
    /**
     * Snapshot the registered entries for a key. Returns the cached array
     * reference (stable between mutations — safe as a uSES getSnapshot source);
     * empty for keys not (or no longer) declared, so renderers may probe ahead
     * of plugin load order.
     * @param key - slot key (dynamic: the render machinery holds keys as strings).
     * @returns entries in registration (list: order) sequence.
     */
    entries(key) {
        return this.records.get(key)?.entries ?? NO_ENTRIES;
    }
    /**
     * Project a key's entries to its shadowing winners: the first live
     * (non-abdicated) entry of each cell in priority order — single: the slot
     * is one cell; keyed: one cell per `key`; list: one cell per `id` (winners
     * keep ledger sequence; list renderers still refine display by `order`).
     * Chain keys return the raw entries unchanged: election consumes every
     * entry, shadowing does not apply. The raw {@link SlotCore.entries} view
     * stays the inspection surface. Builds a fresh array per call — a render
     * body read, not a uSES getSnapshot source.
     * @param key - slot key (dynamic: the render machinery holds keys as strings).
     * @returns the winning entry per occupied cell (empty while undeclared).
     */
    entriesOfSlot(key) {
        const rec = this.records.get(key);
        if (!rec?.spec)
            return NO_ENTRIES;
        const kind = rec.spec.kind;
        if (kind === 'chain')
            return rec.entries;
        const heads = [];
        const seenCells = new Set();
        for (const entry of rec.entries) {
            if (this.abdicated.has(entry))
                continue;
            // Single-kind entries all share the one undefined cell.
            const cell = kind === 'keyed' ? entry.options.key : kind === 'list' ? entry.options.id : undefined;
            if (seenCells.has(cell))
                continue;
            seenCells.add(cell);
            heads.push(entry);
        }
        return heads;
    }
    /**
     * Look up a slot's declared spec, narrowed by the SlotMap key.
     * @param key - SlotMap key.
     * @returns the spec, or undefined while undeclared.
     */
    spec(key) {
        return this.records.get(key)?.spec;
    }
    /**
     * Dynamic-key escape hatch for spec lookup — renderers resolving keys they
     * only hold as strings (generic dispatch) use this wide form; statically
     * keyed callers use {@link SlotCore.spec}.
     * @param key - candidate slot key.
     * @returns the wide-typed spec, or undefined while undeclared.
     */
    specDynamic(key) {
        return this.records.get(key)?.spec;
    }
    /**
     * Export the current declaration topology without components or executable hooks.
     * @param root - exact Slot key to select; omitted returns every live root.
     * @returns selected live Slot trees, or an empty array when `root` is unavailable.
     */
    snapshot(root) {
        const build = (name, seen) => {
            const record = this.records.get(name);
            if (record?.spec === undefined || seen.has(name))
                return undefined;
            const branch = new Set(seen);
            branch.add(name);
            const active = new Set(this.entriesOfSlot(name));
            const children = [...this.records.entries()]
                .filter(([, candidate]) => candidate.spec !== undefined && candidate.parent === name)
                .flatMap(([child]) => {
                const node = build(child, branch);
                return node === undefined ? [] : [node];
            });
            return {
                name,
                kind: record.spec.kind,
                scope: record.spec.scope,
                ...record.declaredBy === undefined ? {} : { declaredBy: record.declaredBy },
                occupants: record.entries.map(entry => ({
                    ...entry.registrant === undefined ? {} : { registrant: entry.registrant },
                    ...entry.options.key === undefined ? {} : { key: entry.options.key },
                    ...entry.options.id === undefined ? {} : { id: entry.options.id },
                    ...entry.options.order === undefined ? {} : { order: entry.options.order },
                    priority: entry.options.priority ?? 0,
                    active: active.has(entry),
                })),
                children,
            };
        };
        if (root !== undefined) {
            const node = build(root, new Set());
            return node === undefined ? [] : [node];
        }
        return [...this.records.entries()]
            .filter(([, record]) => record.spec !== undefined
            && (record.parent === undefined || this.records.get(record.parent)?.spec === undefined))
            .flatMap(([name]) => {
            const node = build(name, new Set());
            return node === undefined ? [] : [node];
        });
    }
    /**
     * Read the declaration lifetime of a key. Entry additions and removals do
     * not change it; declaration creation and collapse each advance it.
     * @param key - slot key.
     * @returns monotonic epoch (0 before the first declaration).
     */
    declarationEpoch(key) {
        return this.records.get(key)?.declarationEpoch ?? 0;
    }
    /**
     * Subscribe to registration changes for a key (microtask-batched).
     * Subscribing ahead of declaration is allowed; the declaration notifies.
     * @param key - slot key.
     * @param fn - change callback.
     * @returns unsubscribe.
     */
    subscribe(key, fn) {
        const rec = this.record(key);
        rec.listeners.add(fn);
        return () => { rec.listeners.delete(fn); };
    }
    /**
     * Subscribe to declaration lifetime boundaries for a key. Notifications
     * are synchronous so declaration teardown finishes before a subsequent
     * same-tick registration can observe stale resources. Ordinary entry
     * mutations do not notify this surface. A children table commits every
     * sibling declaration before its first notification.
     * @param key - slot key.
     * @param fn - declaration or collapse callback.
     * @returns unsubscribe.
     */
    subscribeDeclaration(key, fn) {
        const rec = this.record(key);
        rec.declarationListeners.add(fn);
        return () => { rec.declarationListeners.delete(fn); };
    }
    /**
     * Monotonic version for a key, bumped synchronously per mutation so a
     * uSES getSnapshot read is never stale when its batched notification lands.
     * @param key - slot key.
     * @returns current version (0 for untouched keys).
     */
    getVersion(key) {
        return this.records.get(key)?.version ?? 0;
    }
    /**
     * Hook every mutation (the runtime Service wrapper bridges this to ctx.emit).
     * Fires synchronously per mutation, unbatched — event semantics need one
     * emission per change.
     * @param fn - called with the mutated key.
     * @returns unsubscribe.
     */
    onMutate(fn) {
        this.mutateListeners.add(fn);
        return () => { this.mutateListeners.delete(fn); };
    }
    /**
     * Renderer crash report from an entry boundary. Always notifies
     * {@link SlotCore.onEntryError} listeners; with `info.abdicate` set (the
     * shadowing kinds — single/keyed/list) it first retires the entry from its
     * cell, one-shot: the record's version bumps through the ordinary mutation
     * channel so outlets re-project onto the cell's next survivor, and a
     * repeat abdicating report no-ops entirely. Chain crashes report with
     * `abdicate: false` — election alternatives resolve at select time, so the
     * entry keeps its cell and only the notification fires. The registration
     * itself stays on the ledger either way — raw {@link SlotCore.entries}
     * still lists the entry and its disposer keeps working.
     * @param key - slot key the entry rendered under.
     * @param entry - the crashed entry.
     * @param error - the crash cause, forwarded to listeners verbatim.
     * @param info - `abdicate`: whether the crash retires the entry from its cell.
     */
    reportEntryError(key, entry, error, info) {
        if (info.abdicate) {
            if (this.abdicated.has(entry))
                return;
            this.abdicated.add(entry);
            const rec = this.records.get(key);
            if (rec !== undefined)
                this.markDirty(key, rec);
        }
        for (const fn of [...this.entryErrorListeners])
            fn(key, entry, error, { abdicated: info.abdicate });
    }
    /**
     * Observe entry boundary crashes (every render-time entry failure the
     * boundaries contain, abdicating or not) — the supervision seam for hosts
     * mirroring contribution health. Fires synchronously per report, after the
     * registry mutated for abdicating crashes (same listener discipline as
     * {@link SlotCore.onMutate}).
     * @param fn - called with the slot key, the crashed entry, the crash
     * cause, and `abdicated`: whether the crash retired the entry from its cell.
     * @returns unsubscribe.
     */
    onEntryError(fn) {
        this.entryErrorListeners.add(fn);
        return () => { this.entryErrorListeners.delete(fn); };
    }
    /**
     * Cascade for a removed entry: release its store mount and collapse every
     * child slot it declared — specs clear, contributions empty (their stale
     * disposers no-op), recursively down the declaration tree. One lifecycle
     * axis: ledger rows, slots, contributions, and store mounts die together.
     */
    releaseEntry(entry) {
        if (entry.store !== undefined && typeof entry.store !== 'function') {
            const pinned = this.handleScopes.get(entry.store);
            if (pinned && --pinned.count === 0)
                this.handleScopes.delete(entry.store);
        }
        if (!entry.children)
            return;
        for (const childKey of Object.keys(entry.children)) {
            const childRec = this.records.get(childKey);
            /* v8 ignore next -- defensive: declaring always creates the record */
            if (!childRec)
                continue;
            const doomed = childRec.entries;
            childRec.spec = undefined;
            childRec.declaredBy = undefined;
            childRec.parent = undefined;
            childRec.declarationEpoch += 1;
            childRec.entries = NO_ENTRIES;
            this.markDirty(childKey, childRec);
            this.notifyDeclaration(childRec);
            for (const dead of doomed)
                this.releaseEntry(dead);
        }
    }
    record(key) {
        let rec = this.records.get(key);
        if (!rec) {
            rec = {
                spec: undefined,
                declaredBy: undefined,
                parent: undefined,
                declarationEpoch: 0,
                entries: NO_ENTRIES,
                version: 0,
                listeners: new Set(),
                declarationListeners: new Set(),
            };
            this.records.set(key, rec);
        }
        return rec;
    }
    markDirty(key, rec) {
        rec.version += 1;
        for (const fn of [...this.mutateListeners])
            fn(key);
        this.dirty.add(rec);
        if (!this.flushScheduled) {
            this.flushScheduled = true;
            queueMicrotask(() => { this.flush(); });
        }
    }
    notifyDeclaration(rec) {
        for (const fn of [...rec.declarationListeners])
            fn();
    }
    flush() {
        // Reset before iterating so a mutation from inside a listener re-schedules.
        this.flushScheduled = false;
        const dirty = [...this.dirty];
        this.dirty.clear();
        for (const rec of dirty) {
            for (const fn of [...rec.listeners])
                fn();
        }
    }
}
//# sourceMappingURL=index.js.map