/**
 * Relative positions in one durable event's seq neighborhood: interrupted
 * Assistant, its follow-up Nodes, then follow-ups to an ordinary final. The
 * max-tokens notice sits between a closing Assistant and the turn-tail so the
 * tail stays the turn's last node and keeps its branch action enabled.
 */
export const CHAT_SYNTHETIC_SEQ_OFFSETS = {
    interruptedAssistant: -0.9,
    interruptedFollowup: -0.8,
    maxTokensNotice: 0.05,
    finalizedFollowup: 0.1,
};
/**
 * Resolve one Context's best currently loaded event Location.
 * @param context - assembled business Context.
 * @returns start or first-match Location, otherwise unresolved.
 */
export function contextLocation(context) {
    return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' };
}
/**
 * Build one final Chat target Node with the engine-owned stable key.
 * @param context - assembled business Context.
 * @param kind - Chat renderer dispatch key.
 * @param anchorSeq - sortable render position.
 * @param data - renderer-owned payload.
 * @param options - optional Location and visibility overrides.
 * @returns final Chat view Node.
 */
export function chatNode(context, kind, anchorSeq, data, options = {}) {
    return {
        key: context.key,
        kind,
        id: context.id,
        target: 'chat',
        anchorSeq,
        location: options.location ?? contextLocation(context),
        visibility: options.visibility ?? 'visible',
        data,
    };
}
/**
 * Read a finite non-negative integer from a structurally narrowed payload.
 * @param value - untrusted payload field.
 * @returns valid coordinate, otherwise undefined.
 */
export function coordinate(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
//# sourceMappingURL=common.js.map