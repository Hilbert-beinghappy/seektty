/**
 * Build a collision-free phase key preserving absent versus empty identity.
 * @param phase - exact phase string, or null for an omitted field.
 * @returns the stable renderer key for that phase identity.
 */
export function workflowPhaseKey(phase) {
    return phase === null ? 'missing' : `value:${phase.length}:${phase}`;
}
function statusFromStopReason(stopReason) {
    switch (stopReason) {
        case 'completed': return 'completed';
        case 'cancelled': return 'cancelled';
        case 'error': return 'failed';
        /* v8 ignore next -- WorkflowStopReason is closed and every variant is handled above. */
        default: return stopReason;
    }
}
function statusFromOutcome(outcome) {
    switch (outcome) {
        case 'completed': return 'completed';
        case 'cancelled': return 'cancelled';
        case 'failed': return 'failed';
        /* v8 ignore next -- WorkflowAgentOutcome is closed and every variant is handled above. */
        default: return outcome;
    }
}
function locationClosed(location) {
    if (location.kind === 'step') {
        return location.step.status === 'closed' || location.turn.status === 'closed';
    }
    return location.kind === 'turn' && location.turn.status === 'closed';
}
function projectWorkflow(context, location) {
    const state = context.state;
    const interrupted = state.stopReason === undefined
        && locationClosed(location);
    const phases = new Map();
    for (const member of state.members) {
        const phase = member.phase === undefined ? null : member.phase;
        const key = workflowPhaseKey(phase);
        let group = phases.get(key);
        if (group === undefined) {
            group = { phase, members: [] };
            phases.set(key, group);
        }
        group.members.push({
            seq: member.seq,
            label: member.label,
            childId: member.childId,
            status: member.outcome === undefined
                ? interrupted ? 'interrupted' : 'running'
                : statusFromOutcome(member.outcome),
        });
    }
    const projectedPhases = [...phases].map(([key, phase]) => ({
        key,
        phase: phase.phase,
        members: phase.members,
    }));
    return {
        name: state.name,
        status: state.stopReason === undefined
            ? interrupted ? 'interrupted' : 'running'
            : statusFromStopReason(state.stopReason),
        phases: projectedPhases,
    };
}
function updateAgentStart(state, data) {
    const member = {
        seq: data.seq,
        label: data.label,
        ...data.phase === undefined ? {} : { phase: data.phase },
        childId: data.childId,
    };
    return { ...state, members: [...state.members, member] };
}
function updateAgentEnd(state, data) {
    return {
        ...state,
        members: state.members.map(member => member.seq === data.seq
            ? { ...member, outcome: data.outcome }
            : member),
    };
}
/** Durable workflow event family folded into one keyed Chat node. */
export const workflowRunDefinition = {
    kind: 'workflow-run',
    target: 'chat',
    match: (event) => {
        if (event.type === 'tool-workflow/run-start')
            return { id: String(event.data.runId), role: 'start' };
        if (event.type === 'tool-workflow/agent-start'
            || event.type === 'tool-workflow/agent-end'
            || event.type === 'tool-workflow/run-end') {
            return { id: String(event.data.runId), role: 'update' };
        }
        return null;
    },
    start: (_context, match) => {
        if (match.event.type !== 'tool-workflow/run-start') {
            throw new Error('workflow-run start requires tool-workflow/run-start');
        }
        return { name: match.event.data.name, members: [] };
    },
    update: (context, match) => {
        if (match.event.type === 'tool-workflow/agent-start') {
            return updateAgentStart(context.state, match.event.data);
        }
        if (match.event.type === 'tool-workflow/agent-end') {
            return updateAgentEnd(context.state, match.event.data);
        }
        if (match.event.type === 'tool-workflow/run-end') {
            return { ...context.state, stopReason: match.event.data.stopReason };
        }
        return context.state;
    },
    buildViewNode: (context) => {
        if (context.start === undefined)
            return null;
        const data = projectWorkflow(context, context.start.location);
        return {
            key: context.key,
            kind: 'workflow-run',
            id: context.id,
            target: 'chat',
            anchorSeq: context.start.event.seq,
            location: context.start.location,
            visibility: 'visible',
            data,
        };
    },
};
//# sourceMappingURL=workflow-definition.js.map