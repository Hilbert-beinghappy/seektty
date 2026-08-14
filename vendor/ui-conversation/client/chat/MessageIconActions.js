import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
// Shared IconActions chrome for user and assistant messages: copy
// live, optional branch wiring, and an optional date-aware clock.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconBranchOutline16, IconCheckOutline16, IconCopyOutline16, Tooltip, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatLatencySeconds, formatMessageClock, formatRunDuration, formatTokensPerSecond } from "./message-chrome.js";
import { useCalendarDay } from "./use-calendar-day.js";
import css from './MessageIconActions.module.css';
/**
 * Copy / branch (/ clock) IconActions row shared by user and assistant chrome.
 * @param props - Copy text, event time, clock side, branch callback, className.
 * @returns The actions row element.
 */
export function MessageIconActions({ text, time, runMs, ttftMs, tokensPerSecond, clock, onBranch, branchUnavailable = false, className, extraActions, t, }) {
    const day = useCalendarDay();
    const reasonId = useId();
    // Same success chrome as CodeBlock: a short check swap after the write,
    // gated so re-clicks during the window neither re-copy nor stack timers.
    const [copied, setCopied] = useState(false);
    const copyPending = useRef(false);
    const copyTimer = useRef(null);
    const copyEpoch = useRef(0);
    useEffect(() => () => {
        copyEpoch.current += 1;
        copyPending.current = false;
        if (copyTimer.current !== null)
            clearTimeout(copyTimer.current);
    }, []);
    const onCopy = useCallback(() => {
        if (copied || copyPending.current)
            return;
        const epoch = copyEpoch.current;
        copyPending.current = true;
        void writeClipboard(text).then((ok) => {
            if (epoch !== copyEpoch.current)
                return;
            copyPending.current = false;
            if (!ok)
                return;
            setCopied(true);
            copyTimer.current = window.setTimeout(() => {
                copyTimer.current = null;
                setCopied(false);
            }, 1000);
        });
    }, [copied, text]);
    // The dot is decorative and stays hidden, but its margins separate the
    // readings only on screen: without the flanking spaces a reader hears one
    // run-on string ("Ran for 13sTTFT 0.2s12 tok/s") instead of three facts.
    const clockEl = time === undefined ? null : (_jsxs("span", { className: clock === 'start' ? css.timeStart : css.timeEnd, children: [formatMessageClock(time, t, day), runMs !== undefined && (_jsxs(_Fragment, { children: [' ', _jsx("span", { className: css.runTimeDot, "aria-hidden": true, children: "\u00B7" }), ' ', t('message.ranFor', { duration: formatRunDuration(runMs, t) })] })), ttftMs !== undefined && (_jsxs(_Fragment, { children: [' ', _jsx("span", { className: css.runTimeDot, "aria-hidden": true, children: "\u00B7" }), ' ', t('message.ttft', { seconds: formatLatencySeconds(ttftMs) })] })), tokensPerSecond !== undefined && (_jsxs(_Fragment, { children: [' ', _jsx("span", { className: css.runTimeDot, "aria-hidden": true, children: "\u00B7" }), ' ', t('message.tokensPerSecond', { tps: formatTokensPerSecond(tokensPerSecond) })] }))] }));
    return (_jsxs("div", { className: className === undefined ? css.actions : `${css.actions} ${className}`, children: [clock === 'start' ? clockEl : null, _jsx(Tooltip, { label: copied ? t('copied') : t('copy'), side: "bottom", children: _jsx("button", { type: "button", className: css.action, "aria-label": copied ? t('copied') : t('copy'), onClick: onCopy, children: copied ? _jsx(IconCheckOutline16, {}) : _jsx(IconCopyOutline16, {}) }) }), extraActions, onBranch !== undefined && (_jsx(Tooltip, { label: branchUnavailable ? t('message.branchUnavailable') : t('message.branch'), side: "bottom", children: _jsx("button", { type: "button", className: css.action, "aria-label": t('message.branch'), "aria-disabled": branchUnavailable || undefined, "aria-describedby": branchUnavailable ? reasonId : undefined, "data-unavailable": branchUnavailable || undefined, onClick: branchUnavailable ? undefined : onBranch, children: _jsx(IconBranchOutline16, {}) }) })), onBranch !== undefined && branchUnavailable && (_jsx("span", { id: reasonId, className: css.visuallyHidden, children: t('message.branchUnavailable') })), clock === 'end' ? clockEl : null] }));
}
//# sourceMappingURL=MessageIconActions.js.map