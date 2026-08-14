import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import { MessageIconActions } from "./MessageIconActions.js";
import { assistantText } from "./turn-assistant.js";
import css from './TurnTailNodeView.module.css';
/** Turn-local actions and feature tail over the Location index, independent of Assistant placement. */
export const TurnTailNodeView = memo(function TurnTailNodeView({ node, openFile, forkAt, renderSlot, renderSlotChain, t, useSession, }) {
    const data = node.data;
    const hasLaterChatNode = useSession(snapshot => snapshot.chat.locations.getTurn(data.turn).at(-1) !== node.key);
    const turn = node.location.kind === 'turn' || node.location.kind === 'step'
        ? node.location.turn
        : undefined;
    if (turn === undefined)
        return null;
    const closing = data.closing;
    const owner = { turn, seq: closing?.finalNode.seq ?? data.seq, openFile };
    const tail = renderSlotChain('conversation.chat.turnTail', owner);
    if (closing === null)
        return tail === null ? null : _jsx("div", { className: css.root, children: tail });
    const runMs = turn.start === undefined || turn.end === undefined
        ? undefined
        : Math.max(0, turn.end.time - turn.start.time);
    // Interruption-frozen partials carry no messageId, so they address no
    // durable message and contribute no per-message actions.
    const messageId = closing.finalNode.messageId;
    const assistantActions = messageId === undefined
        ? null
        : renderSlot('conversation.chat.assistant-actions', { messageId });
    return (_jsxs("div", { className: css.root, "data-turn-tail": data.turn, "data-time-hover-root": true, children: [tail, _jsx(MessageIconActions, { text: assistantText(closing.blocks), time: closing.time, runMs: runMs, ttftMs: data.ttftMs, tokensPerSecond: data.tokensPerSecond, clock: "end", onBranch: () => { forkAt(closing.finalNode.seq); }, branchUnavailable: data.branchUnavailable || hasLaterChatNode, className: css.actions, extraActions: assistantActions, t: t })] }));
});
//# sourceMappingURL=TurnTailNodeView.js.map