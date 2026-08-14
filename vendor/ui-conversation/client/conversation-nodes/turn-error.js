import { displayFailureMessage } from '@deepseek-ai/dsh-client-runtime/projection';
import { chatNode } from "./common.js";
function lastStep(context) {
    const location = context.start?.location ?? context.matches[0]?.location;
    if (location?.kind !== 'turn' && location?.kind !== 'step')
        return 0;
    return location.turn.steps.at(-1)?.step ?? 0;
}
function retryTurn(event) {
    return event.type === 'llm/retry' || event.type === 'llm/retry-started'
        ? event.data.turn
        : undefined;
}
function failureFrom(match) {
    if (match.event.type !== 'turn/end' || match.event.data.reason.kind !== 'error')
        return undefined;
    const failure = match.event.data.reason.error;
    return {
        seq: match.event.seq,
        time: match.event.time,
        message: displayFailureMessage(failure),
        code: failure.code,
    };
}
function fallbackState(context) {
    const end = context.matches.find(match => failureFrom(match) !== undefined);
    if (end?.event.type !== 'turn/end')
        return undefined;
    const failure = failureFrom(end);
    if (failure === undefined)
        return undefined;
    const turn = end.event.data.turn;
    return {
        turn,
        hidden: context.matches.some(match => retryTurn(match.event) === turn),
        failure,
    };
}
/** Terminal turn failure Definition, suppressed when the turn owns a retry chain. */
export const turnErrorDefinition = {
    kind: 'turn-error',
    target: 'chat',
    match: (event) => {
        if (event.type === 'turn/start')
            return { id: String(event.data.turn), role: 'start' };
        if (event.type === 'turn/end' && event.data.reason.kind === 'error') {
            return { id: String(event.data.turn), role: 'update' };
        }
        const turn = retryTurn(event);
        return turn === undefined ? null : { id: String(turn), role: 'update' };
    },
    start: (_context, match) => {
        if (match.event.type !== 'turn/start')
            throw new Error('turn-error start requires turn/start');
        return { turn: match.event.data.turn, hidden: false };
    },
    update: (context, match) => {
        const failure = failureFrom(match);
        if (failure !== undefined)
            return { ...context.state, failure };
        return retryTurn(match.event) === context.state.turn
            ? { ...context.state, hidden: true }
            : context.state;
    },
    buildViewNode: (context) => {
        const state = context.state ?? fallbackState(context);
        if (state?.failure === undefined)
            return null;
        const failure = state.failure;
        const node = {
            kind: 'turn-error',
            seq: failure.seq,
            time: failure.time,
            turn: state.turn,
            step: lastStep(context),
            message: failure.message,
            ...failure.code === undefined ? {} : { code: failure.code },
        };
        if (!state.hidden)
            return chatNode(context, 'turn-error', node.seq, node);
        const current = context.current.get('chat');
        return current === undefined || current === null
            ? null
            : chatNode(context, 'turn-error', node.seq, node, { visibility: 'hidden' });
    },
};
/**
 * Register the terminal Turn-error business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerTurnErrorConversationNode(ctx) {
    ctx.conversationEvents.register(turnErrorDefinition);
}
//# sourceMappingURL=turn-error.js.map