/**
 * Provider roster + materialization + current projection. The channel owns
 * every rule a provider contribution must satisfy; owners keep only their
 * per-session bundle storage and the definition of "current".
 */
export class SessionProvideChannel {
    host;
    providers = [];
    maybeInfoCache;
    /** Latest published current bundle (identity comparison dedupes republish). */
    currentSnapshot;
    /** Projection subscribers (plain cell: bundles hold live session sources, so no store freeze may touch them). */
    listeners = new Set();
    /**
     * Atomic current-session provide projection: selection changes and
     * provider-roster changes publish through this one source, so a roster
     * change under a stable current id republishes the bundle instead of
     * stranding mounted entries.
     */
    currentProvideInfo;
    /**
     * @param host - owner-side bundle storage and current-selection resolution.
     */
    constructor(host) {
        this.host = host;
        // The runtime's own contribution comes first: useSession rides the same
        // provide channel every plugin uses (no renderer special case).
        this.providers.push({
            hooks: ['session'],
            resolve: binding => ({ hooks: { session: binding.session } }),
        });
        this.maybeInfoCache = this.materializeMaybeInfo();
        this.currentSnapshot = this.maybeInfoCache;
        this.currentProvideInfo = {
            getSnapshot: () => this.currentSnapshot,
            subscribe: (fn) => {
                this.listeners.add(fn);
                return () => { this.listeners.delete(fn); };
            },
        };
    }
    /** The static no-session projection under the current roster (declared names present, values undefined). */
    get maybeInfo() {
        return this.maybeInfoCache;
    }
    /**
     * Register a per-session standard-props provider (see
     * SessionRuntime.provide for the product contract). Live bundles rebuild
     * immediately; misdeclared providers fail loud here, at the registration
     * edge, and the registration rolls back — the channel never stays on a
     * roster it cannot materialize.
     * @param descriptor - static member roster plus per-session resolver.
     * @returns disposer removing the provider.
     */
    provide(descriptor) {
        this.providers.push(descriptor);
        try {
            this.applyRosterChange();
        }
        catch (error) {
            this.providers.splice(this.providers.indexOf(descriptor), 1);
            // Restore the previous (valid) roster's bundles; cannot rethrow — the
            // pre-push roster materialized successfully before.
            this.applyRosterChange();
            throw error;
        }
        return () => {
            const at = this.providers.indexOf(descriptor);
            if (at >= 0)
                this.providers.splice(at, 1);
            this.applyRosterChange();
        };
    }
    /**
     * Re-derive the current selection's bundle and publish it when it changed.
     * Bundles are identity-stable per (scope, roster) materialization, so an
     * identity compare is exact; synchronous notify — call sites (the owner's
     * list subscription, provide()) already sit behind their own batching or
     * registration edges.
     */
    publishCurrent() {
        const next = this.host.resolveCurrent();
        if (next === this.currentSnapshot)
            return;
        this.currentSnapshot = next;
        for (const fn of [...this.listeners]) {
            try {
                fn();
            }
            catch (error) {
                // Contain subscriber failures: this notify runs inside the list
                // notification, where a throwing render-side subscriber would starve
                // later listeners and abort the projection pass that scheduled it.
                console.error('sessions.currentProvideInfo subscriber failed:', error);
            }
        }
    }
    /**
     * Materialize the standard-props bundle for one session (fails loud on
     * undeclared, missing, and duplicate member names).
     * @param binding - session assembly handle fed to every resolver.
     * @returns the materialized bundle (identity-stable until the next materialization).
     */
    materializeInfo(binding) {
        const hooks = {};
        const props = {};
        for (const descriptor of this.providers) {
            const contribution = descriptor.resolve(binding);
            const contributedHooks = contribution.hooks ?? {};
            const contributedProps = contribution.props ?? {};
            for (const name of Object.keys(contributedHooks)) {
                if (!(descriptor.hooks ?? []).includes(name)) {
                    throw new Error(`sessions.provide: undeclared hook "${name}"`);
                }
            }
            for (const name of Object.keys(contributedProps)) {
                if (!(descriptor.props ?? []).includes(name)) {
                    throw new Error(`sessions.provide: undeclared prop "${name}"`);
                }
            }
            for (const name of descriptor.hooks ?? []) {
                const source = contributedHooks[name];
                if (source === undefined)
                    throw new Error(`sessions.provide: missing hook "${name}"`);
                if (Object.hasOwn(hooks, name))
                    throw new Error(`sessions.provide: duplicate hook "${name}"`);
                hooks[name] = source;
            }
            for (const name of descriptor.props ?? []) {
                if (!Object.hasOwn(contributedProps, name))
                    throw new Error(`sessions.provide: missing prop "${name}"`);
                if (Object.hasOwn(props, name))
                    throw new Error(`sessions.provide: duplicate prop "${name}"`);
                props[name] = contributedProps[name];
            }
        }
        return {
            sessionId: binding.sessionId,
            hooks,
            props,
            // The useProjection seat: key-addressed bare value faces off the
            // session's projection store (open key space — never a static roster member).
            projections: { faceOf: key => binding.session.projections.faceOf(key) },
        };
    }
    /** Rebuild the static projection and the owner's live bundles, then republish the current one. */
    applyRosterChange() {
        this.maybeInfoCache = this.materializeMaybeInfo();
        this.host.rebuildBundles();
        this.publishCurrent();
    }
    /** Build the static no-session kit and reject duplicate declared names. */
    materializeMaybeInfo() {
        const hooks = {};
        const props = {};
        for (const descriptor of this.providers) {
            for (const name of descriptor.hooks ?? []) {
                if (Object.hasOwn(hooks, name))
                    throw new Error(`sessions.provide: duplicate hook "${name}"`);
                hooks[name] = undefined;
            }
            for (const name of descriptor.props ?? []) {
                if (Object.hasOwn(props, name))
                    throw new Error(`sessions.provide: duplicate prop "${name}"`);
                props[name] = undefined;
            }
        }
        return { sessionId: undefined, hooks, props }; // no projections face: every key reads absent without a session
    }
}
//# sourceMappingURL=provide.js.map