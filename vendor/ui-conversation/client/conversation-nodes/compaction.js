import { chatNode } from "./common.js";
import { compactSource, compactSummary, updateCompactionState } from "./command.js";
function fallbackState(context) {
    const summary = context.matches.find(match => match.event.type === 'compaction/summary');
    const checkpoint = context.matches.find(match => compactSource(match.event) !== undefined);
    return {
        ...summary === undefined ? {} : { summary },
        ...checkpoint === undefined ? {} : { checkpoint },
    };
}
/** Automatic compaction lifecycle and landed checkpoint Definition. */
export const compactionDefinition = {
    kind: 'compaction',
    target: 'chat',
    match: (event) => {
        const checkpoint = compactSource(event);
        if (checkpoint !== undefined && checkpoint.sourceCommandId === undefined) {
            return { id: checkpoint.compactionId, role: 'update' };
        }
        if (event.type === 'compaction/start'
            || event.type === 'compaction/summary'
            || event.type === 'compaction/end') {
            if (event.data.sourceCommandId !== undefined)
                return null;
            const compactionId = event.data.compactionId;
            if (typeof compactionId !== 'string' || compactionId === '')
                return null;
            return { id: compactionId, role: event.type === 'compaction/start' ? 'start' : 'update' };
        }
        return null;
    },
    start: () => ({}),
    update: (context, match) => updateCompactionState(context.state, match),
    buildViewNode: (context) => {
        const state = context.state ?? fallbackState(context);
        if (state.checkpoint === undefined)
            return null;
        const marker = compactSummary(state.summary, state.checkpoint);
        return chatNode(context, 'compaction', marker.seq, marker);
    },
};
/**
 * Register the automatic-compaction business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerCompactionConversationNode(ctx) {
    ctx.conversationEvents.register(compactionDefinition);
}
//# sourceMappingURL=compaction.js.map