function applySplice(previous, splice) {
    const pending = [...(previous?.state.pending ?? [])];
    const claimed = new Set(previous?.state.claimed ?? []);
    const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
    for (const identity of splice.inserted)
        claimed.delete(identity.id);
    if (splice.target === 'next-step' && splice.outcome !== 'canceled') {
        for (const identity of removed)
            claimed.add(identity.id);
    }
    return { pending, claimed };
}
function inboxDefinition(target) {
    const kind = `inbox-${target}`;
    return {
        kind,
        match: event => event.type === 'agent/inbox/spliced'
            && event.data.target === target
            ? { id: String(event.seq), role: 'start' }
            : null,
        start: (_context, match, reader) => {
            if (match.event.type !== 'agent/inbox/spliced')
                throw new Error(`${kind} start requires agent/inbox/spliced`);
            return applySplice(reader.previous(kind), match.event.data);
        },
        update: context => context.state,
        publication: () => 'none',
    };
}
/** Cumulative next-turn inbox splice Definition. */
export const nextTurnInboxDefinition = inboxDefinition('next-turn');
/** Cumulative next-step inbox splice Definition used to classify steering. */
export const nextStepInboxDefinition = inboxDefinition('next-step');
/**
 * Register the two durable Inbox-state contributions.
 * @param ctx - owning UI Conversation context.
 */
export function registerInboxConversationNodes(ctx) {
    ctx.conversationEvents.register(nextTurnInboxDefinition);
    ctx.conversationEvents.register(nextStepInboxDefinition);
}
//# sourceMappingURL=inbox.js.map