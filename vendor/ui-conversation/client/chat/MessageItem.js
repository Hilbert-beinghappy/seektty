import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// MessageItem: simple chat nodes — user and consumed-steering bubbles
// (right-aligned, with clock + copy IconActions; branch lives only under
// assistant answers), pending steering (copy only), context injection,
// compaction marker, retry disclosure, and unknown-surface JSON rows.
import { memo, useEffect, useMemo, useState } from 'react';
import { JsonBlock, MessageText, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment';
import { messageImageLabels } from "../image-labels.js";
import { CompactionItem } from "./CompactionItem.js";
import { ContextInjectionRow } from "./ContextInjectionRow.js";
import { MessageIconActions } from "./MessageIconActions.js";
import css from './MessageItem.module.css';
function contentParts(content) {
    const texts = [];
    const images = [];
    const rest = [];
    for (const block of content) {
        const b = block;
        if (b.type === 'text' && typeof b.text === 'string')
            texts.push(b.text);
        else if (b.type === 'image' && b.attachment !== undefined) {
            images.push({ attachment: b.attachment });
        }
        else
            rest.push(block);
    }
    return { text: texts.join(''), images, rest };
}
function retrySeconds(milliseconds) {
    return Math.max(1, Math.ceil(milliseconds / 1_000));
}
function ModelRetryItem({ node, active, t }) {
    // Anchor the host-scheduled delay to this browser's first render of the
    // retry node. Host event time and Date.now() may belong to different clocks.
    const deadline = useMemo(() => Date.now() + node.delayMs, [node.delayMs, node.seq]);
    const scheduledSeconds = retrySeconds(node.delayMs);
    const maximum = node.mode === 'normal' ? node.maxRetries : '∞';
    const [countdown, setCountdown] = useState(() => ({
        deadline,
        seconds: retrySeconds(deadline - Date.now()),
    }));
    const remainingSeconds = countdown.deadline === deadline
        ? countdown.seconds
        : retrySeconds(deadline - Date.now());
    useEffect(() => {
        if (!active)
            return;
        const updateCountdown = () => {
            const next = retrySeconds(deadline - Date.now());
            setCountdown(current => (current.deadline === deadline && current.seconds === next
                ? current
                : { deadline, seconds: next }));
            return next;
        };
        if (updateCountdown() === 1)
            return;
        const timer = window.setInterval(() => {
            if (updateCountdown() === 1)
                window.clearInterval(timer);
        }, 250);
        return () => { window.clearInterval(timer); };
    }, [active, deadline]);
    const label = active
        ? t('message.retry.active')
        : node.retryState === 'cancelled'
            ? t('message.retry.cancelled')
            : node.retryState === 'started'
                ? t('message.retry.started')
                : t('message.retry.scheduled');
    const seconds = active ? remainingSeconds : scheduledSeconds;
    return (_jsxs("details", { className: css.retryRow, "data-active": active || undefined, children: [_jsx("summary", { className: css.retrySummary, children: _jsx("span", { className: css.retryText, role: "status", children: t('message.retry.status', { label, retry: node.retry, maximum, seconds }) }) }), _jsxs("div", { className: css.retryDetails, children: [_jsxs("div", { children: [_jsx("span", { className: css.retryDetailLabel, children: t('message.retry.delay') }), Math.round(node.delayMs), "ms"] }), _jsxs("div", { children: [_jsx("span", { className: css.retryDetailLabel, children: t('message.retry.failure') }), node.failure.message] })] })] }));
}
/** Persistent, turn-positioned feedback for a terminal failure. */
function TurnErrorItem({ node, t }) {
    return (_jsxs("div", { className: css.turnErrorRow, role: "status", children: [_jsx(StateDot, { state: "error", className: css.turnErrorDot }), _jsxs("div", { className: css.turnErrorCopy, children: [_jsx("span", { className: css.turnErrorTitle, children: t('message.turnError') }), _jsx("span", { className: css.turnErrorMessage, children: node.message })] }), node.code !== undefined && _jsx("code", { className: css.turnErrorCode, children: node.code })] }));
}
/** Persistent, turn-positioned notice for a turn ended at the output-token cap. */
function TurnMaxTokensItem({ t }) {
    return (_jsxs("div", { className: css.turnErrorRow, role: "status", children: [_jsx(StateDot, { state: "warning", className: css.turnErrorDot }), _jsxs("div", { className: css.turnErrorCopy, children: [_jsx("span", { className: css.maxTokensTitle, children: t('message.maxTokens') }), _jsx("span", { className: css.turnErrorMessage, children: t('message.maxTokens.hint') })] })] }));
}
/**
 * Display projection of reference forms in a user bubble (free geometry — no
 * textarea alignment constraint here); everything else stays plain text. The
 * logged model text remains the single truth; this is presentation only.
 * Plain-text `/name` / `@name` word-boundary tokens decorate (the sent text
 * IS the reference — the bubble uses the same plainest token
 * scan as the composer, minus the lexicon: sent tokens were validated at
 * compose time, so shape alone decorates).
 */
function projectUserText(text) {
    const re = /(^|\s)([/@][\w-]+)(?=\s|$)/g;
    const parts = [];
    let cursor = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const tokenStart = m.index + (m[1]?.length ?? 0);
        const label = m[2] ?? '';
        if (tokenStart > cursor)
            parts.push(_jsx(MessageText, { text: text.slice(cursor, tokenStart) }, cursor));
        parts.push(_jsx("span", { className: css.refChip, "data-ref-chip": label.startsWith('@') ? 'subagent' : 'skill', children: label }, tokenStart));
        cursor = tokenStart + label.length;
    }
    if (parts.length === 0)
        return _jsx(MessageText, { text: text });
    if (cursor < text.length)
        parts.push(_jsx(MessageText, { text: text.slice(cursor) }, cursor));
    return _jsx(_Fragment, { children: parts });
}
/** Right-aligned bubble shared by user and steering rows. */
function UserStyleBubble({ content, imageLoader, actions, pending = false, t, }) {
    const { text, images, rest } = contentParts(content);
    const truncated = (total) => t('json.truncated', { total });
    const showBubble = text !== '' || rest.length > 0;
    return (_jsxs("div", { className: css.userRow, "data-pending-steering": pending || undefined, "data-time-hover-root": true, children: [_jsxs("div", { className: css.userStack, children: [_jsx(ImageGallery, { images: images, load: imageLoader, align: "end", labels: messageImageLabels(t) }), showBubble && _jsxs("div", { className: css.bubble, children: [projectUserText(text), rest.map((block, i) => _jsx(JsonBlock, { label: t('message.extraBlock'), payload: block, truncatedLabel: truncated }, i))] })] }), actions?.(text)] }));
}
/**
 * Render one Host-authoritative pending steering item with the same visual
 * language as its eventual durable transcript node.
 * @param props - Pending message content and conversation translator.
 * @returns the pending steering bubble.
 */
export function PendingSteeringBubble({ content, loadImage, t }) {
    const imageLoader = loadImage ?? (() => Promise.reject(new Error(t('image.serviceUnavailable'))));
    return (_jsx(UserStyleBubble, { content: content, imageLoader: imageLoader, pending: true, t: t, actions: text => (_jsx(MessageIconActions, { text: text, clock: "start", className: css.actions, t: t })) }));
}
/** User and admitted-steering keyed Chat renderer. */
export const UserMessageNodeView = memo(function UserMessageNodeView({ node, loadImage, t, }) {
    const data = node.data;
    return (_jsx(UserStyleBubble, { content: data.content, imageLoader: loadImage, t: t, actions: text => (_jsx(MessageIconActions, { text: text, time: data.time, clock: "start", className: css.actions, t: t })) }));
});
/** Injected-context keyed Chat renderer. */
export const ContextMessageNodeView = memo(function ContextMessageNodeView({ node, t }) {
    const data = node.data;
    return (_jsx(ContextInjectionRow, { content: data.content, source: data.source, provenance: data.provenance, form: data.form, t: t }));
});
/** Automatic compaction keyed Chat renderer. */
export const CompactionNodeView = memo(function CompactionNodeView({ node, t }) {
    return _jsx(CompactionItem, { node: node.data, t: t });
});
/** Correlated retry-chain keyed Chat renderer. */
export const RetryNodeView = memo(function RetryNodeView({ node, t }) {
    const data = node.data;
    return _jsx(ModelRetryItem, { node: data.current, active: data.current.retryState === 'scheduled', t: t });
});
/** Terminal turn-error keyed Chat renderer. */
export const TurnErrorNodeView = memo(function TurnErrorNodeView({ node, t }) {
    return _jsx(TurnErrorItem, { node: node.data, t: t });
});
/** Max-tokens turn-end notice keyed Chat renderer. */
export const TurnMaxTokensNodeView = memo(function TurnMaxTokensNodeView({ t }) {
    return _jsx(TurnMaxTokensItem, { t: t });
});
/** Explicit unknown-surface keyed Chat renderer. */
export const UnknownNodeView = memo(function UnknownNodeView({ node, t }) {
    const data = node.data;
    return (_jsx("div", { className: css.contextRow, children: _jsx(JsonBlock, { label: t('message.unknownSurface', { type: data.type }), payload: data.data, truncatedLabel: total => t('json.truncated', { total }) }) }));
});
//# sourceMappingURL=MessageItem.js.map