import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** General Settings row for the Composer's busy-state Enter preference. */
import { useState } from 'react';
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './EnterBehaviorRow.module.css';
const OPTIONS = [
    { id: 'queue', label: 'settings.enter.queue' },
    { id: 'steer', label: 'settings.enter.steer' },
];
/**
 * Render the busy-state Enter behavior selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function EnterBehaviorRow({ useBusyEnter, setBusyEnter, t }) {
    const behavior = useBusyEnter(value => value);
    const [open, setOpen] = useState(false);
    const selectedLabel = behavior === 'queue' ? 'settings.enter.queue' : 'settings.enter.steer';
    return (_jsxs("div", { className: css.row, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.title, children: t('settings.enter.title') }), _jsx("div", { className: css.desc, children: t('settings.enter.description') })] }), _jsx(Menu, { open: open, onClose: () => { setOpen(false); }, items: OPTIONS.map(option => ({ id: option.id, label: t(option.label) })), selectedId: behavior, onSelect: (id) => {
                    setOpen(false);
                    setBusyEnter(id);
                }, align: "end", portal: true, anchor: (_jsxs("button", { type: "button", className: css.selector, "aria-haspopup": "menu", "aria-expanded": open, onClick: () => { setOpen(value => !value); }, children: [t(selectedLabel), _jsx(IconChevronDownOutline14, { className: css.chevron })] })) })] }));
}
//# sourceMappingURL=EnterBehaviorRow.js.map