import { chatNode } from "./common.js";
function scheduledNode(match) {
    if (match.event.type !== 'llm/retry')
        return undefined;
    return {
        kind: 'model-retry',
        seq: match.event.seq,
        time: match.event.time,
        retryState: 'scheduled',
        ...match.event.data,
    };
}
/** A scheduled attempt is cancelled once either owning boundary closes. */
function isClosed(location) {
    return (location.kind === 'step' && location.step.status === 'closed')
        || ((location.kind === 'step' || location.kind === 'turn') && location.turn.status === 'closed');
}
/** Producer-correlated model retry chain Definition. */
export const retryDefinition = {
    kind: 'model-retry',
    target: 'chat',
    match: (event) => {
        if (event.type === 'llm/retry') {
            const retryId = event.data.retryId;
            if (typeof retryId !== 'string' || retryId === '')
                return null;
            return { id: retryId, role: event.data.retry === 1 ? 'start' : 'update' };
        }
        if (event.type === 'llm/retry-started') {
            const retryId = event.data.retryId;
            return typeof retryId === 'string' && retryId !== '' ? { id: retryId, role: 'update' } : null;
        }
        return null;
    },
    start: (_context, match) => {
        const node = scheduledNode(match);
        if (node === undefined)
            throw new Error('model-retry start requires a valid llm/retry event');
        return { turn: node.turn, step: node.step, attempts: [node] };
    },
    update: (context, match) => {
        if (match.event.type === 'llm/retry') {
            const node = scheduledNode(match);
            return node === undefined ? context.state : { ...context.state, attempts: [...context.state.attempts, node] };
        }
        if (match.event.type !== 'llm/retry-started')
            return context.state;
        const retry = match.event.data.retry;
        return {
            ...context.state,
            attempts: context.state.attempts.map(attempt => attempt.retry === retry ? { ...attempt, retryState: 'started' } : attempt),
        };
    },
    buildViewNode: (context) => {
        if (context.state === undefined || context.state.attempts.length === 0)
            return null;
        const location = context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' };
        const stateAttempts = context.state.attempts;
        const attempts = stateAttempts.map((attempt, index) => index === stateAttempts.length - 1
            && attempt.retryState === 'scheduled'
            && isClosed(location)
            ? { ...attempt, retryState: 'cancelled' }
            : attempt);
        const current = attempts.at(-1);
        if (current === undefined)
            return null;
        const data = { attempts, current };
        return chatNode(context, 'model-retry', attempts[0]?.seq ?? current.seq, data);
    },
};
/**
 * Register the correlated model-retry business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerRetryConversationNode(ctx) {
    ctx.conversationEvents.register(retryDefinition);
}
//# sourceMappingURL=retry.js.map