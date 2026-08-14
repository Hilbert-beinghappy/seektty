import { queueReadFaceOf } from "../queue/store.js";
import { SessionInputShell } from "./facade.js";
/** Session-addressed input facade registry (SessionInputResolver face + composer-layer extras). */
export class InputHub {
    rootCtx;
    t;
    shells = new Map();
    /**
     * @param ctx - client root context (services resolved lazily per call — boot order stays free).
     * @param t - conversation-namespace translate thunk (reads the active locale at call time).
     */
    constructor(rootCtx, t) {
        this.rootCtx = rootCtx;
        this.t = t;
    }
    /**
     * Resolve the facade for one session-scope ctx (SessionInputResolver face).
     * @param actx - session-scope context.
     * @returns the resident per-session facade.
     */
    for(actx) {
        const sessions = this.sessions();
        const id = sessions.scopeOf(actx);
        if (id === undefined)
            throw new Error('conversation.input.for requires a session scope');
        return this.shell(id);
    }
    /**
     * Resident shell for one session binding — the provide-channel entry
     * (called during scope materialization, BEFORE the scope record is
     * queryable, hence binding-fed and hence the thunked slash/popup deps).
     * Wires the scoped event listeners + teardown into the session scope.
     * @param binding - session assembly handle.
     * @returns the shell.
     */
    shellFor(binding) {
        const existing = this.shells.get(binding.sessionId);
        if (existing !== undefined)
            return existing;
        const { sessionId: id, session, ctx: actx } = binding;
        const shell = new SessionInputShell({
            actx,
            inputTriggers: () => this.controller(actx),
            popup: () => this.popup(actx),
            queue: queueReadFaceOf(session),
            defaultSink: (text, imageIds, mode) => { this.sink(session, text, imageIds, mode); },
            steerQueue: () => { void this.steerQueue(session, shell); },
        });
        this.shells.set(id, shell);
        // The one teardown axis: listeners, shell, and map entries all ride the
        // scope fiber (nothing here outlives the scope).
        actx.effect(() => {
            const offs = [
                actx.on('slash/input-begin-command', req => shell.beginCommand(req.claim, req.span) ? true : undefined),
                actx.on('slash/input-insert-reference', req => shell.insertReference(req.reference, req.span) ? true : undefined),
                actx.on('slash/input-consume-token', req => shell.consumeToken(req.guard) ? true : undefined),
                actx.on('slash/input-insert-text', req => shell.insertText(req.text, req.span) ? true : undefined),
            ];
            return () => {
                for (const off of offs)
                    off();
                const drafts = shell.snapshot.imageIds;
                shell.dispose();
                this.shells.delete(id);
                const conversation = this.rootCtx.get('conversation');
                for (const imageId of drafts)
                    conversation?.releaseDraftImage(imageId);
            };
        }, 'conversation.input: session shell');
        return shell;
    }
    /**
     * Resident shell by session id (service-face path; the provide channel has
     * normally created it already — this covers direct id-addressed access).
     * @param id - session id.
     * @returns the shell.
     */
    shell(id) {
        const existing = this.shells.get(id);
        if (existing !== undefined)
            return existing;
        const binding = this.sessions().binding(id);
        if (binding === undefined)
            throw new Error(`conversation.input: session "${id}" resolved no binding`);
        return this.shellFor(binding);
    }
    /**
     * The InputBar-exclusive keyboard command face: the shell
     * satisfies it structurally; package-internal — handed through the
     * composer-bar entry's inject, never across a plugin boundary.
     * @param id - session id.
     * @returns the shell as the keyboard face.
     */
    keyboard(id) {
        return this.shell(id);
    }
    /**
     * Resolve the optional slash controller for composer chrome that launches
     * the shared candidate menu without typing a trigger.
     * @param id - session id.
     * @returns the resident controller, or undefined when ui-input-trigger is absent.
     */
    inputTriggers(id) {
        const actx = this.sessions().scope(id);
        return actx === undefined ? undefined : this.controller(actx);
    }
    /**
     * Default sink: optimistic clear + prompt. The session is always a real
     * host entity (materialized when its workspace was picked), so there is
     * exactly one path; a failed first prompt is an ordinary prompt failure
     * (error strip via promptError, draft restored only while untouched).
     */
    sink(session, text, imageIds, mode) {
        if (text === '' && imageIds.length === 0)
            return;
        const shell = this.shells.get(session.sessionId);
        // Commit, not an editable clear: undo must not resurrect sent content.
        shell?.commitSend(imageIds);
        void this.conversation().sendSession(session, text, imageIds, mode).catch(() => {
            if (this.shells.get(session.sessionId) === shell) {
                shell?.restoreImages(imageIds);
                if (shell?.snapshot.draft === '')
                    shell.setDraft(text);
                return;
            }
            const conversation = this.rootCtx.get('conversation');
            for (const id of imageIds)
                conversation?.releaseDraftImage(id);
        });
    }
    /**
     * Steer every still-pending queued message into the running turn, in FIFO
     * order — the same strict-steer operation as the queue dock's per-row
     * button. A turn closing mid-way (`steer-unavailable`) or a row already
     * claimed by the agent (`queue-item-not-found`) converges silently, while a
     * genuine failure surfaces as one composer notice. Repeated triggers
     * (e.g. two rapid empty-draft chords) rely on that `queue-item-not-found`
     * convergence: the snapshot may still list a row the host already steered,
     * and the duplicate strict steer is a silent no-op.
     * @param session - the addressed host session.
     * @param shell - the resident shell (notice outlet).
     */
    async steerQueue(session, shell) {
        const queued = session.getSnapshot().queue.filter(item => item.placement === 'queued');
        if (queued.length === 0)
            return;
        for (const item of queued) {
            const result = await session.updateQueue(item.id, { kind: 'steer' });
            if (result.ok)
                continue;
            if (result.error.code === 'steer-unavailable' || result.error.code === 'queue-item-not-found')
                return;
            shell.notify('error', this.t('queue.steerFailed'));
            return;
        }
    }
    controller(actx) {
        const inputTriggers = this.rootCtx.get('inputTriggers');
        return inputTriggers?.sessionOf(actx);
    }
    popup(actx) {
        const command = this.rootCtx.get('commandUi');
        return command?.popupFor(actx);
    }
    sessions() {
        const sessions = this.rootCtx.get('sessions');
        if (sessions === undefined)
            throw new Error('conversation.input: sessions service unavailable');
        return sessions;
    }
    conversation() {
        const conversation = this.rootCtx.get('conversation');
        if (conversation === undefined)
            throw new Error('conversation.input: conversation service unavailable');
        return conversation;
    }
}
//# sourceMappingURL=hub.js.map