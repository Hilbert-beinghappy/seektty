import { contextForm, contextProvenance, isAppendSurfaceEvent, isReplacementSurfaceEvent, } from '@deepseek-ai/dsh-client-runtime/projection';
import { chatNode } from "./common.js";
function isCompactionCheckpoint(event) {
    if (event.type !== 'user/message' || !isReplacementSurfaceEvent(event))
        return false;
    const source = event.data.source;
    return source.kind === 'plugin' && source.plugin === 'compact';
}
/** User, steering, and injected-context message classification Definition. */
export const messageDefinition = {
    kind: 'input-message',
    target: 'chat',
    match: event => event.type === 'user/message'
        && isAppendSurfaceEvent(event)
        && !isCompactionCheckpoint(event)
        ? { id: String(event.data.id), role: 'start' }
        : null,
    start: (_context, match, reader) => {
        if (match.event.type !== 'user/message')
            throw new Error('input-message start requires user/message');
        const event = match.event;
        if (event.data.source.kind !== 'user') {
            return {
                kind: 'context',
                seq: event.seq,
                time: event.time,
                content: event.data.content,
                source: event.data.source,
                provenance: contextProvenance(event.data.source),
                form: contextForm(event.data.source),
            };
        }
        const claimed = reader.previous('inbox-next-step')?.state.claimed.has(String(event.data.id)) === true;
        return claimed
            ? {
                kind: 'steering',
                messageId: event.data.id,
                seq: event.seq,
                time: event.time,
                content: event.data.content,
                source: event.data.source,
            }
            : {
                kind: 'user',
                seq: event.seq,
                time: event.time,
                content: event.data.content,
                source: event.data.source,
            };
    },
    update: context => context.state,
    buildViewNode: (context) => {
        if (context.state === undefined)
            return null;
        return chatNode(context, context.state.kind, context.state.seq, context.state);
    },
};
/**
 * Register the user, steering, and injected-context message contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerMessageConversationNode(ctx) {
    ctx.conversationEvents.register(messageDefinition);
}
//# sourceMappingURL=message.js.map