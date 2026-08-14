import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-client-runtime/projection';
import { chatNode } from "./common.js";
/** Unclaimed append-surface fallback Definition. */
export const unknownFallbackDefinition = {
    kind: 'unknown-surface',
    target: 'chat',
    match: event => isAppendSurfaceEvent(event)
        ? { id: String(event.seq), role: 'start' }
        : null,
    start: (_context, match) => ({
        kind: 'unknown',
        seq: match.event.seq,
        time: match.event.time,
        type: match.event.type,
        data: match.event.data,
    }),
    update: context => context.state,
    buildViewNode: context => context.state === undefined
        ? null
        : chatNode(context, 'unknown', context.state.seq, context.state),
};
/**
 * Register the unmatched append-surface fallback contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerUnknownConversationFallback(ctx) {
    ctx.conversationEvents.registerFallback(unknownFallbackDefinition);
}
//# sourceMappingURL=fallback.js.map