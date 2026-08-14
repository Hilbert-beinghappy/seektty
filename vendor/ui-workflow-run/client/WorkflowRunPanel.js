import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { DisclosureRow, IconChevronRightOutline14, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import { shallowEqual } from '@deepseek-ai/dsh-client-runtime/client';
import css from './WorkflowRunPanel.module.css';
const STATUS_KEYS = {
    running: 'status.running',
    completed: 'status.completed',
    failed: 'status.failed',
    cancelled: 'status.cancelled',
    interrupted: 'status.interrupted',
};
function dotState(status) {
    switch (status) {
        case 'running': return 'ongoing';
        case 'completed': return 'done';
        case 'failed': return 'error';
        case 'cancelled':
        case 'interrupted': return 'warning';
        /* v8 ignore next -- WorkflowRunStatus is closed and every variant is handled above. */
        default: return status;
    }
}
function readablePhase(phase, t) {
    if (phase === null)
        return t('phase.unassigned');
    return phase === '' ? t('phase.empty') : phase;
}
function readableMember(label, t) {
    return label === '' ? t('member.empty') : label;
}
function statusCount(status, count, t) {
    return t(`statusCount.${status}`, { count });
}
function memberCount(count, t) {
    return t(count === 1 ? 'run.members.one' : 'run.members.other', { count });
}
function phaseRequiresExpansion(phase) {
    return phase.members.some(member => member.status !== 'completed');
}
/* v8 ignore next -- DisclosureRow requires the callback but cannot invoke it when expandable is false. */
const forcedOpenToggle = () => { };
function ManualDisclosure(props) {
    const [open, setOpen] = useState(false);
    return (_jsx(DisclosureRow, { ...props, open: open, expandable: true, onToggle: () => { setOpen(value => !value); } }));
}
function StatusDisclosure({ cleanCycleKey, requiresExpansion, ...props }) {
    if (!requiresExpansion)
        return _jsx(ManualDisclosure, { ...props }, cleanCycleKey);
    return _jsx(DisclosureRow, { ...props, open: true, expandable: false, onToggle: forcedOpenToggle });
}
function phaseStatusSummary(members, t) {
    const counts = new Map();
    for (const member of members)
        counts.set(member.status, (counts.get(member.status) ?? 0) + 1);
    const count = (status) => counts.get(status) ?? 0;
    const active = ['running', 'failed', 'cancelled', 'interrupted']
        .filter(status => count(status) > 0);
    if (active.length === 0)
        return statusCount('completed', count('completed'), t);
    const visible = active.includes('interrupted') && count('completed') > 0
        ? ['completed', ...active]
        : active;
    return visible.map(status => statusCount(status, count(status), t)).join(' · ');
}
function navigableMembers(sessions, phases, parentId) {
    const ordinary = new Set(sessions.ids);
    const result = [];
    for (const phase of phases) {
        for (const member of phase.members) {
            const summary = sessions.byId[member.childId];
            if (member.status === 'running'
                && ordinary.has(member.childId)
                && summary?.origin === 'subagent'
                && summary.parentId === parentId
                && summary.running) {
                result.push(member.childId);
            }
        }
    }
    return result;
}
function RunHeader({ children, count, name, requiresExpansion, status, t }) {
    return (_jsx(StatusDisclosure, { icon: _jsx(IconChevronRightOutline14, {}), title: t('run.title', { name }), requiresExpansion: requiresExpansion, expandOnRowClick: true, previewChevron: false, keepContentWhenOpen: true, rowClassName: css.runHeader, leadingClassName: css.runLeading, titleClassName: css.runTitle, collapsedContent: (_jsxs(_Fragment, { children: [_jsx("span", { className: css.separator, "aria-hidden": true }), _jsx("span", { className: css.runSummary, children: memberCount(count, t) }), _jsxs("span", { className: css.statusTail, "data-status": status, children: [_jsx(StateDot, { state: dotState(status) }), _jsx("span", { children: t(STATUS_KEYS[status]) })] })] })), children: children }));
}
function MemberRow({ member, navigable, openSession, t }) {
    const name = readableMember(member.label, t);
    const content = (_jsxs(_Fragment, { children: [_jsx("span", { className: css.dotSlot, children: _jsx(StateDot, { state: dotState(member.status) }) }), _jsx("span", { className: css.memberLabelWrap, "data-member-label-wrap": true, children: _jsx("span", { className: css.memberLabel, "data-member-label": true, children: name }) }), _jsx("span", { className: css.memberStatus, "data-member-status-text": true, children: t(STATUS_KEYS[member.status]) })] }));
    if (!navigable) {
        return _jsx("div", { className: css.memberRow, "data-member-status": member.status, children: content });
    }
    return (_jsx("button", { type: "button", className: css.memberButton, "data-member-status": member.status, "aria-label": t('member.open', { name }), onClick: () => { openSession(member.childId); }, children: content }));
}
function PhaseSection({ phase, navigable, openSession, t }) {
    return (_jsx(StatusDisclosure, { icon: _jsx(IconChevronRightOutline14, {}), title: readablePhase(phase.phase, t), cleanCycleKey: phase.members.length, requiresExpansion: phaseRequiresExpansion(phase), expandOnRowClick: true, previewChevron: false, keepContentWhenOpen: true, className: css.phase, rowClassName: css.phaseHeader, leadingClassName: css.phaseLeading, titleClassName: css.phaseTitle, collapsedContent: (_jsxs(_Fragment, { children: [_jsx("span", { className: css.separator, "aria-hidden": true }), _jsx("span", { className: css.phaseCount, "data-phase-count": true, children: memberCount(phase.members.length, t) }), _jsx("span", { className: css.phaseStatus, "data-phase-status-text": true, children: phaseStatusSummary(phase.members, t) })] })), children: _jsx("div", { className: css.members, children: phase.members.map(member => (_jsx(MemberRow, { member: member, navigable: navigable.includes(member.childId), openSession: openSession, t: t }, member.seq))) }) }));
}
/** Render one durable workflow run with status-driven run and phase disclosure. */
export function WorkflowRunPanel({ node, sessionId, useSessions, openSession, t }) {
    const totalMembers = node.data.phases.reduce((count, phase) => count + phase.members.length, 0);
    const requiresExpansion = node.data.status !== 'completed'
        || node.data.phases.some(phaseRequiresExpansion);
    const navigable = useSessions(sessions => navigableMembers(sessions, node.data.phases, sessionId), shallowEqual);
    return (_jsx("section", { className: css.root, "data-workflow-run": true, "data-run-status": node.data.status, children: _jsx(RunHeader, { count: totalMembers, name: node.data.name, requiresExpansion: requiresExpansion, status: node.data.status, t: t, children: _jsx("div", { className: css.phaseList, children: node.data.phases.length === 0
                    ? _jsx("span", { className: css.empty, children: t('run.empty') })
                    : node.data.phases.map(phase => (_jsx(PhaseSection, { phase: phase, navigable: navigable, openSession: openSession, t: t }, phase.key))) }) }) }));
}
//# sourceMappingURL=WorkflowRunPanel.js.map