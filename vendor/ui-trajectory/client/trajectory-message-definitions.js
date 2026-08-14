import { contextForm, contextProvenance, } from '@deepseek-ai/dsh-client-runtime/projection';
import { trajectoryNode } from "./trajectory-definition-common.js";
function applySplice(previous, splice) {
    const pending = [...(previous?.state.pending ?? [])];
    const claimed = new Set(previous?.state.claimed ?? []);
    const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
    for (const identity of splice.inserted)
        claimed.delete(identity.id);
    if (splice.outcome !== 'canceled') {
        for (const identity of removed)
            claimed.add(identity.id);
    }
    return { pending, claimed };
}
const trajectoryInboxDefinition = {
    kind: 'trajectory-inbox-next-step',
    match: event => event.type === 'agent/inbox/spliced'
        && event.data.target === 'next-step'
        ? { id: String(event.seq), role: 'start' }
        : null,
    start: (_context, match, reader) => {
        if (match.event.type !== 'agent/inbox/spliced') {
            throw new Error('trajectory-inbox-next-step start requires agent/inbox/spliced');
        }
        return applySplice(reader.previous('trajectory-inbox-next-step'), match.event.data);
    },
    update: context => context.state,
    publication: () => 'none',
};
const trajectoryMessageDefinition = {
    kind: 'trajectory-input-message',
    target: 'trajectory',
    match: event => event.type === 'user/message'
        ? { id: String(event.seq), role: 'start' }
        : null,
    start: (_context, match, reader) => {
        if (match.event.type !== 'user/message') {
            throw new Error('trajectory-input-message start requires user/message');
        }
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
        const claimed = reader.previous('trajectory-inbox-next-step')
            ?.state.claimed.has(String(event.data.id)) === true;
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
    buildViewNode: context => context.state === undefined
        ? null
        : trajectoryNode(context, context.state.seq, { kind: 'node', node: context.state }),
};
/* jscpd:ignore-end */
/**
 * Register Trajectory-owned inbox classification and message records.
 *
 * @param ctx - Plugin context receiving the Definitions.
 */
export function registerTrajectoryMessageDefinitions(ctx) {
    ctx.conversationEvents.register(trajectoryInboxDefinition);
    ctx.conversationEvents.register(trajectoryMessageDefinition);
}
//# sourceMappingURL=trajectory-message-definitions.js.map