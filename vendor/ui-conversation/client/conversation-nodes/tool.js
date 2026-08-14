import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-client-runtime/projection';
import { CHAT_SYNTHETIC_SEQ_OFFSETS, chatNode } from "./common.js";
const MAX_DEPTH = 256;
const projectedBlocks = new WeakMap();
function jsonArguments(value) {
    return JSON.stringify(value);
}
function rootCall(match) {
    if (match.event.type !== 'tool/call')
        throw new Error('tool-call start requires tool/call');
    return {
        callId: String(match.event.data.callId),
        name: match.event.data.name,
        argsRaw: match.event.data.arguments,
        turn: match.event.data.turn,
        step: match.event.data.step,
        time: match.event.time,
        callView: match.view?.for === 'call' ? match.view.view : null,
        subCalls: [],
    };
}
function rootResult(match, previous) {
    if (match.event.type !== 'tool/result')
        return undefined;
    const result = match.event.data.message.content[0];
    return {
        kind: 'tool-result',
        seq: match.event.seq,
        time: match.event.time,
        callId: String(match.event.data.message.source.callId),
        call: previous === undefined ? null : { name: previous.name, argsRaw: previous.argsRaw },
        callTime: previous?.time ?? null,
        content: result.content,
        isError: result.isError === true,
        ...match.event.data.error === undefined ? {} : { error: match.event.data.error },
        meta: match.event.data.meta,
        callView: previous?.callView ?? null,
        resultView: match.view?.for === 'result' ? match.view.view : null,
        subCalls: [],
    };
}
function childCall(match, data) {
    return {
        callId: data.subCallId,
        name: data.name,
        argsRaw: jsonArguments(data.arguments),
        turn: locationTurn(match),
        step: locationStep(match),
        time: match.event.time,
        callView: null,
        subCalls: [],
    };
}
function childResult(match, data, previous) {
    return {
        kind: 'tool-result',
        seq: match.event.seq,
        time: match.event.time,
        callId: data.subCallId,
        call: { name: data.name, argsRaw: jsonArguments(data.arguments) },
        callTime: previous?.time ?? null,
        content: data.content ?? [],
        isError: data.isError === true,
        callView: null,
        resultView: null,
        subCalls: [],
    };
}
function locationTurn(match) {
    return match.location.kind === 'step' || match.location.kind === 'turn' ? match.location.turn.turn : 0;
}
function locationStep(match) {
    return match.location.kind === 'step' ? match.location.step.step : 0;
}
function acceptsEdge(state, parent, child) {
    if (parent === child || state.parents.has(child))
        return false;
    let cursor = parent;
    let parentDepth = 0;
    const ancestors = new Set();
    while (cursor !== undefined) {
        if (cursor === child || ancestors.has(cursor))
            return false;
        ancestors.add(cursor);
        parentDepth++;
        cursor = state.parents.get(cursor);
    }
    const pending = [{ callId: child, depth: 1 }];
    const descendants = new Set();
    let subtreeDepth = 0;
    for (const candidate of pending) {
        if (descendants.has(candidate.callId))
            return false;
        descendants.add(candidate.callId);
        subtreeDepth = Math.max(subtreeDepth, candidate.depth);
        for (const nested of state.children.get(candidate.callId) ?? []) {
            pending.push({ callId: nested.callId, depth: candidate.depth + 1 });
        }
    }
    return parentDepth + subtreeDepth <= MAX_DEPTH;
}
function updateDispatch(state, match) {
    const event = match.event;
    if (event.type !== 'tool/code-dispatch-start' && event.type !== 'tool/code-dispatch')
        return state;
    const data = event.data;
    const parentCallId = String(data.parentCallId);
    const subCallId = String(data.subCallId);
    const siblings = state.children.get(parentCallId) ?? [];
    const index = siblings.findIndex(candidate => candidate.callId === subCallId);
    if (event.type === 'tool/code-dispatch-start') {
        if (index >= 0 || !acceptsEdge(state, parentCallId, subCallId))
            return state;
        const children = new Map(state.children);
        children.set(parentCallId, [...siblings, childCall(match, data)]);
        const parents = new Map(state.parents);
        parents.set(subCallId, parentCallId);
        return { ...state, children, parents };
    }
    if (index < 0 && !acceptsEdge(state, parentCallId, subCallId))
        return state;
    const previous = index < 0 ? undefined : siblings[index];
    const settled = childResult(match, data, previous);
    const children = new Map(state.children);
    children.set(parentCallId, index < 0
        ? [...siblings, settled]
        : siblings.map((child, at) => at === index ? settled : child));
    const parents = new Map(state.parents);
    if (index < 0)
        parents.set(subCallId, parentCallId);
    return { ...state, children, parents };
}
function projectBlock(block, state, interruptedAt, visited = new Set(), depth = 1) {
    if (visited.has(block.callId) || depth > MAX_DEPTH)
        return { ...block, subCalls: [] };
    const nextVisited = new Set(visited);
    nextVisited.add(block.callId);
    const children = (state.children.get(block.callId) ?? block.subCalls)
        .map(child => projectBlock(child, state, interruptedAt, nextVisited, depth + 1));
    const interruptionSeq = 'kind' in block ? undefined : interruptedAt?.seq;
    const interruptionTime = 'kind' in block ? undefined : interruptedAt?.time;
    const cached = projectedBlocks.get(block);
    if (cached !== undefined
        && cached.interruptionSeq === interruptionSeq
        && cached.interruptionTime === interruptionTime
        && sameReferences(cached.children, children)) {
        return cached.value;
    }
    const projected = 'kind' in block || interruptedAt === undefined
        ? sameReferences(block.subCalls, children) ? block : { ...block, subCalls: children }
        : {
            kind: 'tool-result',
            seq: interruptedAt.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedFollowup,
            time: interruptedAt.time,
            callId: block.callId,
            call: { name: block.name, argsRaw: block.argsRaw },
            callTime: block.time,
            content: [],
            isError: true,
            error: { name: 'Interrupted', code: 'interrupted' },
            callView: block.callView,
            resultView: null,
            subCalls: children,
        };
    projectedBlocks.set(block, { children, interruptionSeq, interruptionTime, value: projected });
    return projected;
}
function sameReferences(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function interruption(context) {
    const location = context.start?.location;
    if (location?.kind === 'step' && location.step.status === 'closed')
        return location.step.end;
    if ((location?.kind === 'step' || location?.kind === 'turn') && location.turn.status === 'closed') {
        return location.turn.end;
    }
    return undefined;
}
function fallbackState(context) {
    const match = context.matches.find(candidate => candidate.event.type === 'tool/result');
    const root = match === undefined ? undefined : rootResult(match);
    if (root === undefined)
        return undefined;
    let state = { root, children: new Map(), parents: new Map() };
    for (const candidate of context.matches)
        state = updateDispatch(state, candidate);
    return state;
}
/** Root Tool lifecycle and nested Code Dispatch Definition. */
export const toolDefinition = {
    kind: 'tool-call',
    target: 'chat',
    match: (event) => {
        if (event.type === 'tool/call')
            return { id: String(event.data.callId), role: 'start' };
        if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
            return { id: String(event.data.message.source.callId), role: 'update' };
        }
        if (event.type === 'tool/code-dispatch-start' || event.type === 'tool/code-dispatch') {
            const rootCallId = event.data.rootCallId;
            return typeof rootCallId === 'string' && rootCallId !== ''
                ? { id: rootCallId, role: 'update' }
                : null;
        }
        return null;
    },
    start: (_context, match) => ({ root: rootCall(match), children: new Map(), parents: new Map() }),
    update: (context, match) => {
        if (match.event.type === 'tool/result') {
            const running = 'kind' in context.state.root ? undefined : context.state.root;
            const result = rootResult(match, running);
            return result === undefined ? context.state : { ...context.state, root: result };
        }
        return updateDispatch(context.state, match);
    },
    buildViewNode: (context) => {
        const state = context.state ?? fallbackState(context);
        if (state === undefined)
            return null;
        const projected = projectBlock(state.root, state, interruption(context));
        const anchor = context.start?.event.seq
            ?? ('kind' in state.root ? state.root.seq : context.matches[0]?.event.seq ?? 0);
        return chatNode(context, 'tool-call', anchor, { root: projected });
    },
};
/**
 * Register the root Tool lifecycle and nested-subcall contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerToolConversationNode(ctx) {
    ctx.conversationEvents.register(toolDefinition);
}
//# sourceMappingURL=tool.js.map