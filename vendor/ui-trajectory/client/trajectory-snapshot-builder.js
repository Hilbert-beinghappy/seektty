const EMPTY_LIST = [];
/** Stable empty target used until a Session has assembled Trajectory records. */
export const EMPTY_TRAJECTORY_SNAPSHOT = {
    eventNodes: EMPTY_LIST,
    eventLocations: new Map(),
    requests: EMPTY_LIST,
    callSchemas: new Map(),
    partial: null,
    runningCalls: EMPTY_LIST,
};
function stepKey(turn, step) {
    return `${turn}\u0000${step}`;
}
function headerStepKey(header) {
    const location = header.location;
    return location.kind === 'step'
        ? stepKey(location.turn.turn, location.step.step)
        : undefined;
}
function headerFor(request, headersByStep, previous) {
    return headersByStep.get(stepKey(request.turn, request.step))
        ?? (previous !== undefined && previous.seq < request.startSeq ? previous : undefined);
}
function applyHeader(request, header, includeChange) {
    return header === undefined
        ? request
        : {
            ...request,
            prompt: header.prompt,
            requestConfig: header.prompt.config,
            ...(includeChange && header.change !== undefined ? { promptChange: header.change } : {}),
        };
}
function withRequestConfig(node, prompt) {
    return prompt === undefined ? node : { ...node, requestConfig: prompt.config };
}
function captureSchemas(block, toolsByName, output) {
    const name = 'kind' in block ? block.call?.name : block.name;
    const schema = name === undefined ? undefined : toolsByName.get(name);
    if (schema !== undefined)
        output.set(block.callId, schema);
    for (const child of block.subCalls)
        captureSchemas(child, toolsByName, output);
}
function indexTools(tools) {
    return new Map(tools.map(tool => [tool.name, tool]));
}
function interruptCompactions(requests, boundaries) {
    let nextRequest = 0;
    const runningCompactions = [];
    for (const boundary of boundaries) {
        while (nextRequest < requests.length) {
            const request = requests[nextRequest];
            if (request === undefined || request.startSeq >= boundary.seq)
                break;
            if (request.purpose === 'compaction' && request.status === 'running') {
                runningCompactions.push(nextRequest);
            }
            nextRequest++;
        }
        let index = runningCompactions.pop();
        while (index !== undefined && requests[index]?.status !== 'running') {
            index = runningCompactions.pop();
        }
        if (index === undefined)
            continue;
        const request = requests[index];
        if (request?.purpose !== 'compaction')
            continue;
        requests[index] = {
            ...request,
            completedAt: boundary.time,
            status: 'error',
            error: 'Compaction was interrupted before completion.',
        };
    }
}
function applyTurnErrors(requests, endings) {
    const lastAssistantByTurn = new Map();
    for (const [index, request] of requests.entries()) {
        if (request.purpose === 'assistant')
            lastAssistantByTurn.set(request.turn, index);
    }
    for (const ending of endings) {
        if (ending.error === undefined)
            continue;
        const index = lastAssistantByTurn.get(ending.turn);
        if (index === undefined)
            continue;
        const request = requests[index];
        if (request?.purpose !== 'assistant')
            continue;
        requests[index] = {
            ...request,
            completedAt: request.completedAt ?? ending.time,
            status: 'error',
            error: ending.error,
        };
    }
}
/** Simple keyed adapter retaining the old Trajectory snapshot and stage layout. */
export class TrajectorySnapshotBuilder {
    nodes = new Map();
    positions = new Map();
    contributions = [];
    empty = EMPTY_TRAJECTORY_SNAPSHOT;
    replace(input) {
        this.nodes.clear();
        for (const node of input.nodes)
            this.nodes.set(node.key, node);
        this.rebuildContributions();
        return this.snapshot();
    }
    apply(input) {
        let structural = false;
        for (const node of input.upserts) {
            const previous = this.nodes.get(node.key);
            this.nodes.set(node.key, node);
            if (previous === undefined || previous.anchorSeq !== node.anchorSeq) {
                structural = true;
                continue;
            }
            const position = this.positions.get(node.key);
            if (position === undefined)
                structural = true;
            else
                this.contributions[position] = node;
        }
        if (structural)
            this.rebuildContributions();
        return this.snapshot();
    }
    snapshot() {
        const headersByStep = new Map();
        for (const contribution of this.contributions) {
            if (contribution.data.kind !== 'request-header')
                continue;
            const key = headerStepKey(contribution.data.header);
            if (key !== undefined)
                headersByStep.set(key, contribution.data.header);
        }
        const finalized = [];
        const eventLocations = new Map();
        const requests = [];
        const boundaries = [];
        const turnEndings = [];
        const callSchemas = new Map();
        const consumedPromptChanges = new Set();
        let previousHeader;
        let previousTools = new Map();
        let partial = null;
        const runningCalls = [];
        for (const contribution of this.contributions) {
            const data = contribution.data;
            if (data.kind === 'request-header') {
                previousHeader = data.header;
                previousTools = indexTools(data.header.prompt.tools);
                continue;
            }
            if (data.kind === 'node') {
                finalized.push(data.node);
                eventLocations.set(data.node.seq, contribution.location);
                continue;
            }
            if (data.kind === 'assistant') {
                const header = data.request === undefined
                    ? undefined
                    : headerFor(data.request, headersByStep, previousHeader);
                if (data.node !== undefined)
                    finalized.push(withRequestConfig(data.node, header?.prompt));
                if (data.partial !== null)
                    partial = data.partial;
                if (data.request !== undefined) {
                    const includeChange = header?.change !== undefined
                        && !consumedPromptChanges.has(header.seq);
                    requests.push(applyHeader(data.request, header, includeChange));
                    if (includeChange)
                        consumedPromptChanges.add(header.seq);
                }
                continue;
            }
            if (data.kind === 'tool') {
                if ('kind' in data.root)
                    finalized.push(data.root);
                else
                    runningCalls.push(data.root);
                if (previousHeader !== undefined && previousHeader.seq < contribution.anchorSeq) {
                    captureSchemas(data.root, previousTools, callSchemas);
                }
                continue;
            }
            if (data.kind === 'compaction') {
                requests.push(data.request);
                continue;
            }
            if (data.kind === 'session-end') {
                boundaries.push({ seq: data.seq, time: data.time });
                continue;
            }
            turnEndings.push({
                turn: data.turn,
                time: data.time,
                ...(data.error === undefined ? {} : { error: data.error }),
            });
        }
        requests.sort((left, right) => left.startSeq - right.startSeq);
        interruptCompactions(requests, boundaries);
        applyTurnErrors(requests, turnEndings);
        finalized.sort((left, right) => left.seq - right.seq);
        const eventNodes = finalized;
        return {
            eventNodes,
            eventLocations,
            requests,
            callSchemas,
            partial,
            runningCalls,
        };
    }
    rebuildContributions() {
        this.contributions = [...this.nodes.values()]
            .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
        this.positions.clear();
        for (const [index, contribution] of this.contributions.entries()) {
            this.positions.set(contribution.key, index);
        }
    }
}
/** Trajectory target factory preserving the existing stage-oriented view model. */
export const trajectoryViewDefinition = {
    target: 'trajectory',
    create: () => new TrajectorySnapshotBuilder(),
};
/**
 * Register the stage-oriented Trajectory target builder.
 *
 * @param ctx - Plugin context receiving the view Definition.
 */
export function registerTrajectoryConversationView(ctx) {
    ctx.conversationViews.register(trajectoryViewDefinition);
}
//# sourceMappingURL=trajectory-snapshot-builder.js.map