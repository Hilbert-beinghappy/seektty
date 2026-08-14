import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// TodoPanel: plan strip above the composer (the web counterpart of the TUI
// plan panel). Renders the standing todo/write whole-list snapshot (cleared on
// the next turn/start) — no data of its own, hidden while the list is empty.
// Mounted through the 'conversation.input.dock' slot (QueueDock posture): the
// dock adapter does the selecting, so the panel takes the plain list and stays
// framework-free. Visual: figma 772:51905 / 772:52972 / 772:53419.
import { useId, useState } from 'react';
import { IconChecklistOutline14, IconChevronDownOutline14, IconChevronUpOutline14 } from '@deepseek-ai/dsh-client-ui-primitives';
import { NS } from "../locales.js";
import css from './TodoPanel.module.css';
/** Local exhaustiveness helper — client packages do not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value) {
    throw new Error(`unreachable todo status: ${String(value)}`);
}
/** Status glyphs share the figma 14×14 artboard; the 16×16 `.glyph` cell centers them. */
function CompletedGlyph() {
    return (_jsxs("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", className: css.glyphCompleted, children: [_jsx("circle", { cx: "7", cy: "7", r: "6.4", stroke: "currentColor", strokeWidth: "1.2" }), _jsx("path", { d: "M10.9631 5.71411L7.70154 8.97571C7.48011 9.19714 7.27736 9.40099 7.09229 9.54993C6.89742 9.70669 6.66314 9.85279 6.3634 9.90027C6.2049 9.92534 6.04339 9.92534 5.88489 9.90027C5.58515 9.85279 5.35087 9.70669 5.15601 9.54993C4.97093 9.40099 4.76818 9.19714 4.54675 8.97571L3.03516 7.46411L3.96313 6.53613L5.47473 8.04773C5.7169 8.28989 5.86196 8.43389 5.97888 8.52795C6.08597 8.61409 6.10875 8.60701 6.08997 8.604C6.11259 8.60758 6.13571 8.60758 6.15833 8.604C6.13954 8.60701 6.16232 8.61409 6.26941 8.52795C6.38633 8.43389 6.53139 8.28989 6.77356 8.04773L10.0352 4.78613L10.9631 5.71411Z", fill: "currentColor" })] }));
}
/** In-progress: business-blue ring fading out; CSS spins the svg. */
function ProgressGlyph() {
    const gradientId = useId();
    return (_jsxs("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", className: css.glyphProgress, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: gradientId, x1: "2.5", y1: "12", x2: "10.5", y2: "3.5", gradientUnits: "userSpaceOnUse", children: [_jsx("stop", { stopColor: "currentColor" }), _jsx("stop", { offset: "1", stopColor: "currentColor", stopOpacity: "0" })] }) }), _jsx("circle", { cx: "7", cy: "7", r: "6.4", stroke: `url(#${gradientId})`, strokeWidth: "1.2" })] }));
}
/** Pending: dashed unstarted ring (figma dash 2.4 2.4). */
function PendingGlyph() {
    return (_jsx("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", className: css.glyphPending, children: _jsx("circle", { cx: "7", cy: "7", r: "6.4", stroke: "currentColor", strokeWidth: "1.2", strokeDasharray: "2.4 2.4" }) }));
}
function StatusGlyph({ status }) {
    switch (status) {
        case 'completed': return _jsx(CompletedGlyph, {});
        case 'in_progress': return _jsx(ProgressGlyph, {});
        case 'pending': return _jsx(PendingGlyph, {});
        /* v8 ignore next -- closed TodoItem status union */
        default: return assertNever(status);
    }
}
/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos, t) {
    const done = todos.filter(item => item.status === 'completed').length;
    const active = todos.filter(item => item.status === 'in_progress').length;
    const pending = todos.length - done - active;
    // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
    // separator breathing room needs a literal wide space.
    return [
        ...done > 0 ? [t('todo.progress.done', { done })] : [],
        ...active > 0 ? [t('todo.progress.active', { active })] : [],
        ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
    ].join('\u2002·\u2002');
}
export function TodoPanel({ todos, t }) {
    const [collapsed, setCollapsed] = useState(true);
    if (todos.length === 0)
        return null;
    return (_jsx("section", { className: css.root, "data-testid": "todo-panel", "aria-label": t('todo.title'), children: _jsxs("div", { className: css.body, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": !collapsed, onClick: () => { setCollapsed(v => !v); }, children: [_jsx("span", { className: css.lead, "aria-hidden": true, children: _jsx(IconChecklistOutline14, {}) }), _jsx("span", { className: css.title, children: t('todo.title') }), _jsx("span", { className: css.progress, children: progressLabel(todos, t) }), _jsx("span", { className: css.chevron, "aria-hidden": true, children: collapsed ? _jsx(IconChevronUpOutline14, {}) : _jsx(IconChevronDownOutline14, {}) })] }), !collapsed && (_jsx("ul", { className: css.list, children: todos.map(item => (_jsxs("li", { className: css.item, "data-status": item.status, children: [_jsx("span", { className: css.glyph, "aria-hidden": true, children: _jsx(StatusGlyph, { status: item.status }) }), _jsx("span", { className: css.content, children: item.content })] }, item.content))) }))] }) }));
}
/** Dock adapter: reads the host-computed 'todos' projection (whole list; absent or null renders nothing). */
export function TodoDock({ useProjection, t }) {
    const todos = useProjection('todos');
    return _jsx(TodoPanel, { todos: todos ?? [], t: t });
}
/**
 * The plan strip as a plain registrant plugin (QueueDock posture), following
 * the input-dock declaration across independent activation and reload.
 */
export const todoDockEntry = {
    name: 'conversation-todo-dock',
    inject: ['slots'],
    /**
     * Register the plan strip before the goal and queue entries (order 0).
     * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
     */
    apply(ctx) {
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock));
    },
};
//# sourceMappingURL=TodoPanel.js.map