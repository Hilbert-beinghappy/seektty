import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// GenericCommandCard: the default command row — a stripped-down
// GenericToolCard rendering the command name and its settlement text.
// Supplied by the chat view as the keyed commandview slot's render-site
// fallback (an unregistered command name lands here); registrants may compose
// it as a base, feeding the same owner payload through.
import { useState } from 'react';
import { DisclosureRow, IconApiOutline14, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import a11yCss from './accessibility.module.css';
import css from './GenericCommandCard.module.css';
/** Node state → row state semantic (running while unsettled; outcome kind after). */
function stateOf(outcome) {
    if (outcome === null)
        return 'running';
    return outcome.kind === 'error' ? 'error' : 'ok';
}
function leadingFor(state) {
    return state === 'error' ? _jsx(StateDot, { state: "error" }) : _jsx(IconApiOutline14, { size: 14 });
}
export function GenericCommandCard({ node, t, runningSummary }) {
    const [expanded, setExpanded] = useState(false);
    const text = node.outcome?.text;
    const summary = node.outcome === null
        ? runningSummary ?? t('command.running')
        : text ?? (node.outcome.kind === 'error' ? t('command.failed') : t('command.done'));
    // Title is the bare command name: the row already reads `name · outcome`,
    // and the dispatched line's own `/` and arguments only restate what the
    // settlement text says (`permission · preset workspace-write`). A
    // cross-window node whose run page fell out of the window has no name.
    const title = node.name ?? t('command.title');
    const state = stateOf(node.outcome);
    const body = text !== undefined && text.includes('\n') ? text : null;
    const open = expanded && body !== null;
    return (_jsxs("div", { className: css.root, "data-variant": "others", "data-state": state, children: [state === 'running' && _jsx("span", { className: a11yCss.visuallyHidden, children: t('row.running') }), state === 'error' && _jsx("span", { className: a11yCss.visuallyHidden, children: t('row.failed') }), _jsx(DisclosureRow, { rowClassName: css.row, leadingClassName: css.leading, titleClassName: css.title, chevronClassName: css.chevron, icon: leadingFor(state), title: title, open: open, expandable: body !== null, expandOnRowClick: true, keepContentWhenOpen: true, onToggle: () => { setExpanded(value => !value); }, collapsedContent: (_jsxs(_Fragment, { children: [_jsx("span", { className: css.separator, "aria-hidden": true }), _jsx("span", { className: css.summary, "data-error": state === 'error' || undefined, children: summary })] })), children: _jsx("pre", { className: css.body, "data-error": state === 'error' || undefined, children: body }) })] }));
}
//# sourceMappingURL=GenericCommandCard.js.map