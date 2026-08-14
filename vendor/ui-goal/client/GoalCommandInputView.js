import { jsx as _jsx } from "react/jsx-runtime";
import { memo } from 'react';
import { MessageText } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './GoalCommandInputView.module.css';
/** Right-aligned `/goal` input bubble without ordinary message actions. */
export const GoalCommandInputView = memo(function GoalCommandInputView({ node, t, }) {
    const data = node.data;
    return (_jsx("div", { className: css.row, "data-command-input": "", role: "group", "aria-label": t('commandInput.aria'), children: _jsx("div", { className: css.stack, children: _jsx("div", { className: css.bubble, children: _jsx(MessageText, { text: data.text }) }) }) }));
});
//# sourceMappingURL=GoalCommandInputView.js.map