import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useState } from 'react';
import { IconCheckOutline16, IconChevronDownOutline14, IconChevronUpOutline14, IconCloseOutline16, IconEditOutline16, IconQueueOutline14, IconSendOutline14, IconTrashOutline16, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { NS } from "../locales.js";
import css from './QueueDock.module.css';
/**
 * Queue strip: one item renders directly; multiple items default to a
 * collapsible count header; an empty queue renders nothing.
 */
export function QueueDock({ useSession, updateQueue, notify, t }) {
    const inbox = useSession(s => s.queue);
    const queue = useMemo(() => inbox.filter(row => row.placement === 'queued'), [inbox]);
    const running = useSession(s => s.running);
    const queueMutable = useSession(s => s.subagent === null);
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(null);
    const [collapsed, setCollapsed] = useState(true);
    const listId = useId();
    useEffect(() => {
        if (queue.length === 0 && !collapsed)
            setCollapsed(true);
        if (editing !== null && (!queueMutable || !queue.some(row => row.id === editing.id)))
            setEditing(null);
    }, [collapsed, editing, queue, queueMutable]);
    if (queue.length === 0)
        return null;
    const interactionActive = queueMutable && (editing !== null || busy !== null);
    const expanded = !collapsed || interactionActive;
    const listVisible = queue.length === 1 || expanded;
    const applyAction = async (itemId, action, failure) => {
        setBusy(itemId);
        try {
            await updateQueue(itemId, action);
            return true;
        }
        catch {
            notify('error', failure);
            return false;
        }
        finally {
            setBusy(current => current === itemId ? null : current);
        }
    };
    const saveEdit = async () => {
        if (editing === null || editing.text.trim() === '')
            return;
        if (await applyAction(editing.id, { kind: 'edit', content: [{ type: 'text', text: editing.text }] }, t('queue.editFailed')))
            setEditing(null);
    };
    return (_jsx("div", { className: css.dock, "data-queue-dock": "", children: _jsxs("div", { className: css.panel, children: [queue.length > 1 && (_jsxs("button", { type: "button", className: css.header, "aria-controls": listId, "aria-expanded": expanded, disabled: interactionActive, onClick: () => { setCollapsed(value => !value); }, children: [_jsx("span", { className: css.lead, "aria-hidden": true, children: _jsx(IconQueueOutline14, {}) }), _jsx("span", { className: css.count, children: t('queue.count', { n: queue.length }) }), _jsx("span", { className: css.chevron, "aria-hidden": true, children: expanded ? _jsx(IconChevronDownOutline14, {}) : _jsx(IconChevronUpOutline14, {}) })] })), _jsx("ul", { id: listId, className: css.list, hidden: !listVisible, children: listVisible && queue.map(row => (_jsxs("li", { className: css.row, children: [queue.length === 1 && _jsx("span", { className: css.lead, "aria-hidden": true, children: _jsx(IconQueueOutline14, {}) }), editing?.id === row.id
                                ? (_jsx("input", { autoFocus: true, className: css.editor, "aria-label": t('queue.edit'), value: editing.text, onChange: (event) => { setEditing({ id: row.id, text: event.currentTarget.value }); }, onKeyDown: (event) => {
                                        if (event.key === 'Escape') {
                                            setEditing(null);
                                            return;
                                        }
                                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                            event.preventDefault();
                                            void saveEdit();
                                        }
                                    } }))
                                : _jsx("span", { className: css.preview, children: row.preview }), queueMutable && _jsx("div", { className: css.actions, children: editing?.id === row.id
                                    ? (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('queue.save'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.action, "aria-label": t('queue.save'), disabled: busy !== null || editing.text.trim() === '', onClick: () => { void saveEdit(); }, children: _jsx(IconCheckOutline16, { size: 14 }) }) }), _jsx(Tooltip, { label: t('queue.cancelEdit'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.action, "aria-label": t('queue.cancelEdit'), disabled: busy !== null, onClick: () => { setEditing(null); }, children: _jsx(IconCloseOutline16, { size: 14 }) }) })] }))
                                    : (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('queue.edit'), side: "bottom", delayMs: 500, disabled: row.text === null, children: _jsx("button", { type: "button", className: css.action, "aria-label": t('queue.edit'),
                                                    // Disabled buttons fire no hover events, so the
                                                    // unsupported hint stays a native title.
                                                    title: row.text === null ? t('queue.edit.unsupported') : undefined, disabled: busy !== null || row.text === null, onClick: () => {
                                                        if (row.text !== null)
                                                            setEditing({ id: row.id, text: row.text });
                                                    }, children: _jsx(IconEditOutline16, { size: 14 }) }) }), _jsx(Tooltip, { label: t('queue.remove'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.action, "aria-label": t('queue.remove'), disabled: busy !== null, onClick: () => {
                                                        void applyAction(row.id, { kind: 'remove' }, t('queue.removeFailed'));
                                                    }, children: _jsx(IconTrashOutline16, { size: 14 }) }) }), _jsx(Tooltip, { label: t('queue.steer'), side: "bottom", delayMs: 500, disabled: !running, children: _jsx("button", { type: "button", className: css.action, "aria-label": t('queue.steer'), title: running ? undefined : t('queue.steer.unavailable'), disabled: busy !== null || !running, onClick: () => {
                                                        void applyAction(row.id, { kind: 'steer' }, t('queue.steerFailed'));
                                                    }, children: _jsx(IconSendOutline14, {}) }) })] })) })] }, row.id))) })] }) }));
}
/**
 * The dock entry as a plain registrant plugin. The conversation service is
 * the action contract; the slot declaration has an independent lifecycle boundary.
 */
export const queueDockEntry = {
    name: 'conversation-queue-dock',
    inject: ['slots', 'conversation', 'sessions'],
    /**
     * Register the queue strip as the terminal input-dock entry (order 20).
     * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
     */
    apply(ctx) {
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'queue',
            order: 20,
            locale: NS,
            inject: (sessionId) => {
                const actx = ctx.sessions.scope(sessionId);
                if (actx === undefined)
                    throw new Error(`queue dock: session "${sessionId}" resolved no scope`);
                const conversation = actx.get('conversation');
                if (conversation === undefined)
                    throw new Error('queue dock: conversation service unavailable');
                return {
                    updateQueue: (itemId, action) => conversation.updateQueue(itemId, action),
                    notify: (level, text) => { conversation.input.for(actx).notify(level, text); },
                };
            },
        }, QueueDock));
    },
};
//# sourceMappingURL=QueueDock.js.map