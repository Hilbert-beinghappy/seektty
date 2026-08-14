import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Composer context-occupancy meter: a ring beside the send button fed by the
 * `contextPressure` projection, with a click-open panel of the heuristic
 * `contextBreakdown` composition (system prompt, tools, conversation).
 * Renders nothing until a provider reports both pressure and a route
 * capacity. */
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { contextOccupancy, formatTokens } from "../chat/StatsLine.js";
import css from './ContextMeter.module.css';
/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = '\u0000';
/** Panel legend rows, in bar-segment order; each color class carries the shared swatch/segment tint. */
const ROWS = [
    { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
    { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
    { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
];
export function ContextMeter({ useProjection, t }) {
    const pressure = useProjection('contextPressure');
    const breakdown = useProjection('contextBreakdown');
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const context = contextOccupancy(pressure);
    const available = context !== null;
    // A model switch can temporarily remove capacity while this component stays
    // mounted. Close the now-unavailable panel instead of preserving stale UI.
    useEffect(() => {
        if (!available && open)
            setOpen(false);
    }, [available, open]);
    // Outside click / Escape close, one document listener while open (Menu's pattern).
    useEffect(() => {
        if (!open || !available)
            return;
        const onPointerDown = (e) => {
            if (e.target instanceof Node && rootRef.current?.contains(e.target) === true)
                return;
            setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [available, open]);
    if (context === null)
        return null;
    const percent = context.percent;
    const reading = `${percent}%`;
    const [headBefore = '', headAfter = ''] = t('context.aria', { percent: READING_SLOT })
        .split(READING_SLOT)
        .map(part => part.trim());
    // The bar's overall length stays the provider-exact percent; the heuristic
    // breakdown only proportions its colored parts. A zero-width part is dropped
    // instead of rendered: `.segment`'s min-width keeps a hairline part visible,
    // which at 0% occupancy would draw a filled bar over an empty context.
    const breakdownTotal = breakdown === undefined
        ? 0
        : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
    const parts = breakdown === undefined || breakdownTotal === 0
        ? [{ key: 'total', color: undefined, width: percent }]
        : ROWS.map(row => ({ key: row.key, color: row.color, width: percent * breakdown[row.key] / breakdownTotal }));
    const segments = parts.filter(part => part.width > 0);
    return (_jsxs("span", { ref: rootRef, className: css.root, children: [_jsx(Tooltip, { label: t('context.aria', { percent: reading }), side: "top", delayMs: 200, disabled: open, children: _jsx("button", { type: "button", className: css.trigger, "aria-label": t('context.aria', { percent: reading }), "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => { setOpen(!open); }, children: _jsxs("svg", { viewBox: "0 0 14 14", width: "14", height: "14", "aria-hidden": true, children: [_jsx("circle", { className: css.track, cx: "7", cy: "7", r: RADIUS }), _jsx("circle", { className: css.fill, cx: "7", cy: "7", r: RADIUS, strokeDasharray: `${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`, transform: "rotate(-90 7 7)" })] }) }) }), open && (_jsxs("div", { className: css.panel, role: "dialog", "aria-label": t('context.used'), children: [_jsxs("div", { className: css.header, children: [_jsx("span", { className: css.headline, children: headBefore }), _jsx("span", { className: css.percent, children: reading }), _jsx("span", { className: css.headline, children: headAfter }), _jsx("span", { className: css.figures, children: `~${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)}` })] }), _jsx("div", { className: css.bar, children: segments.map(segment => (_jsx("div", { className: segment.color === undefined ? css.segment : `${css.segment} ${segment.color}`, style: { width: `${segment.width}%` } }, segment.key))) }), breakdown !== undefined && (_jsx("dl", { className: css.rows, children: ROWS.map(row => (_jsxs("div", { className: css.row, children: [_jsxs("dt", { children: [_jsx("span", { className: `${css.swatch} ${row.color}`, "aria-hidden": true }), t(row.label)] }), _jsx("dd", { children: `~${formatTokens(breakdown[row.key])}` })] }, row.key))) }))] }))] }));
}
//# sourceMappingURL=ContextMeter.js.map