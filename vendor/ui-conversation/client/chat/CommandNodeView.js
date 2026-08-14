import { jsx as _jsx } from "react/jsx-runtime";
import { memo, useMemo } from 'react';
import { CompactionCommandCard } from "./CompactionCommandCard.js";
import { GenericCommandCard } from "./GenericCommandCard.js";
import css from './ChatView.module.css';
/** Ordinary command lifecycle renderer with command-name keyed specialization. */
export const CommandNodeView = memo(function CommandNodeView({ node, renderSlot, t }) {
    const command = node.data;
    const owner = useMemo(() => ({ node: command }), [command]);
    return (_jsx("div", { className: css.callRow, children: renderSlot('conversation.chat.commandview', owner, {
            entryKey: command.name ?? '',
            fallback: _jsx(GenericCommandCard, { ...owner, t: t }),
        }) }));
});
/** One integrated `/compact` command and compaction transaction renderer. */
export const ManualCompactionNodeView = memo(function ManualCompactionNodeView({ node, t, }) {
    const data = node.data;
    return (_jsx("div", { className: css.callRow, children: _jsx(CompactionCommandCard, { node: data.command, ...data.compaction === null ? {} : { compaction: data.compaction }, t: t }) }));
});
//# sourceMappingURL=CommandNodeView.js.map