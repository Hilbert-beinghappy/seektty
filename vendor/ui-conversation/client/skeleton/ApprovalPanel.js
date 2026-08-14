import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ApprovalPanel: the composer-takeover approval prompt (designer draft
// approval.png), registered as a selector-routed entry of the
// conversation-declared composer chain. While an approval question is
// pending, this panel occupies the composer slot in place of the InputBar:
// an amber "Waiting for approval" strip on the card top, the model's
// justification as the headline, the paired command in muted code text, and
// a right-aligned refuse/allow action row. Justification and command are
// unbounded model text, so they scroll inside the card at the shared composer
// cap (`data-approval-scroll`) and the action row stays outside it — the
// buttons must be reachable no matter how long the command is.
// One-shot: the buttons disable
// after a click and the panel leaves (the InputBar returns) on the broadcast
// resolved frame.
import { useMemo, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { PendingApproval } from "../contract/slots.js";
import { rootToolCall } from "../chat/tool-node-reader.js";
import css from './ApprovalPanel.module.css';
/** Extract the shell command from an approval's paired running call (bash-family args carry `command`); undefined hides the line. */
export function commandOf(call) {
    if (call === undefined)
        return undefined;
    try {
        const args = JSON.parse(call.argsRaw);
        return typeof args.command === 'string' ? args.command : undefined;
    }
    catch {
        // Unparseable model args: the panel still renders, just without the command line.
        return undefined;
    }
}
/**
 * Composer takeover boundary: mints the domain face on the carrier's stable
 * identity and remounts the flow per request key, so the one-shot answered
 * latch never leaks to the next pending approval.
 * @param props - the selector-matched pending approval carrier plus the framework standard kit.
 * @returns The approval prompt for this request.
 */
export function ApprovalPanel(props) {
    const approval = useMemo(() => new PendingApproval(props.matched), [props.matched]);
    const command = props.useSession((snapshot) => {
        if (approval.callId === undefined)
            return undefined;
        const root = rootToolCall(snapshot, approval.callId);
        if (root === undefined)
            return undefined;
        return root.callId === approval.callId && !('kind' in root) ? commandOf(root) : undefined;
    });
    return _jsx(ApprovalFlow, { pending: approval, t: props.t, ...command === undefined ? {} : { command } }, approval.key);
}
function ApprovalFlow({ pending, command, t }) {
    // Local one-shot latch: the panel leaves only when the resolved frame
    // lands; until then the buttons must not re-fire. An answer failure
    // (rejected receipt / transport) re-arms them for retry.
    const [answered, setAnswered] = useState(false);
    const answer = (outcome) => {
        setAnswered(true);
        void pending.answer(outcome).catch(() => { setAnswered(false); });
    };
    return (_jsx("div", { className: css.root, "data-approval-key": pending.key, children: _jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.strip, children: [_jsx("span", { className: css.dot }), t('approval.waiting')] }), _jsxs("div", { className: css.body, "data-approval-scroll": "", tabIndex: 0, role: "group", "aria-label": t('approval.detail.aria'), children: [_jsx("div", { className: css.headline, children: pending.reason ?? t('approval.escalation', { toolName: pending.toolName }) }), command !== undefined && _jsx("div", { className: css.command, children: command })] }), _jsxs("div", { className: css.actionRow, children: [_jsx(Button, { variant: "outline", className: css.reject, disabled: answered, onClick: () => { answer('rejected'); }, children: t('approval.reject') }), _jsx(Button, { variant: "primary", disabled: answered, onClick: () => { answer('allowed-once'); }, children: t('approval.allowOnce') })] })] }) }));
}
//# sourceMappingURL=ApprovalPanel.js.map