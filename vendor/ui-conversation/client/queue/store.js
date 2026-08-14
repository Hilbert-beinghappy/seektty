/**
 * Project a session's transient inbox rows as a bare observable (subscribe/getSnapshot).
 * The wiring layer overlays this onto InputState.queue; the runtime
 * QueuedMessage and the input-contract QueuedMessage are structurally
 * identical.
 * @param session - the resident session face.
 * @returns the queue read face (snapshot reference stable while the queue is unchanged).
 */
export function queueReadFaceOf(session) {
    return {
        getSnapshot: () => session.getSnapshot().queue,
        subscribe: fn => session.subscribe(fn),
    };
}
//# sourceMappingURL=store.js.map