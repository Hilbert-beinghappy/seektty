import { isAppendSurfaceEvent, toAssistantBlocks } from '@deepseek-ai/dsh-client-runtime/projection';
import { assistantStepReading, deriveTurnMetrics } from "../chat/turn-metrics.js";
import { CHAT_SYNTHETIC_SEQ_OFFSETS, chatNode } from "./common.js";
function tokenCount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function usageBuckets(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const record = value;
    const uncachedInputTokens = tokenCount(record.inputTokens);
    const outputTokens = tokenCount(record.outputTokens);
    const cacheReadTokens = record.cacheReadTokens === undefined ? 0 : tokenCount(record.cacheReadTokens);
    const cacheWriteTokens = record.cacheWriteTokens === undefined ? 0 : tokenCount(record.cacheWriteTokens);
    if (uncachedInputTokens === undefined || outputTokens === undefined
        || cacheReadTokens === undefined || cacheWriteTokens === undefined)
        return undefined;
    return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}
function addUsage(left, right) {
    return {
        uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
        outputTokens: left.outputTokens + right.outputTokens,
        cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
        cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    };
}
function turnPerformance(context, finalized) {
    const steps = new Set();
    const pendingCalls = new Map();
    const usageByStep = new Map();
    let toolMs = 0;
    for (const match of [...context.matches].sort((left, right) => left.event.seq - right.event.seq)) {
        const event = match.event;
        if (event.type === 'step/end')
            steps.add(event.data.step);
        if (event.type === 'tool/call')
            pendingCalls.set(event.data.callId, event.time);
        if (event.type === 'tool/result') {
            const callId = event.data.message.source.callId;
            const startedAt = pendingCalls.get(callId);
            if (startedAt !== undefined) {
                toolMs += Math.max(0, event.time - startedAt);
                pendingCalls.delete(callId);
            }
        }
        const usage = event.type === 'assistant/chunk' && event.data.chunk.type === 'usage'
            ? usageBuckets(event.data.chunk.usage)
            : event.type === 'assistant/message' ? usageBuckets(event.data.usage) : undefined;
        if (usage !== undefined && (event.type === 'assistant/chunk' || event.type === 'assistant/message')) {
            usageByStep.set(event.data.step, usage);
        }
    }
    let llmMs = 0;
    let ttftMs = 0;
    let ttftSteps = 0;
    let decodeMs = 0;
    let decodeTokens = 0;
    for (const candidate of finalized) {
        const node = candidate.finalNode;
        if (node.timing !== undefined && node.timing.stepStartTime !== null) {
            llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
        }
        const reading = assistantStepReading(node);
        if (reading.ttftMs !== null) {
            ttftMs += reading.ttftMs;
            ttftSteps += 1;
        }
        if (reading.decodeMs !== null && reading.outputTokens !== null) {
            decodeMs += reading.decodeMs;
            decodeTokens += reading.outputTokens;
        }
    }
    const usage = [...usageByStep.values()].reduce(addUsage, {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
    });
    return {
        statistics: {
            steps: steps.size,
            llmMs,
            toolMs,
            ttftMs,
            ttftSteps,
            decodeMs,
            decodeTokens,
        },
        ...(usageByStep.size === 0 ? {} : { usage }),
    };
}
function hasTextAssistant(event) {
    return event.type === 'assistant/message'
        && isAppendSurfaceEvent(event)
        && toAssistantBlocks(event.data.message.content)
            .some(block => block.kind === 'text' && block.text.trim() !== '');
}
function chunkHasText(event) {
    if (event.type !== 'assistant/chunk')
        return false;
    const chunk = event.data.chunk;
    if (chunk.type === 'text-delta')
        return chunk.text.trim() !== '';
    return chunk.type === 'block-end'
        && chunk.block.type === 'text'
        && chunk.block.text.trim() !== '';
}
function turnCoordinates(event) {
    if (event.type === 'assistant/message'
        || event.type === 'assistant/chunk'
        || event.type === 'step/end') {
        return { turn: event.data.turn, step: event.data.step };
    }
    if (event.type === 'llm/retry')
        return { turn: event.data.turn, step: event.data.step };
    return undefined;
}
function closingAnchor(context) {
    let anchor = context.matches.find(match => match.event.type === 'turn/end')?.event.seq
        ?? context.start?.event.seq
        ?? context.matches[0]?.event.seq
        ?? 0;
    const steps = new Map();
    for (const match of context.matches) {
        const event = match.event;
        if (event.type === 'turn/end')
            continue;
        const coordinates = turnCoordinates(event);
        if (coordinates?.step === undefined)
            continue;
        const previous = steps.get(coordinates.step) ?? { streamedText: false, finalized: false };
        if (event.type === 'assistant/chunk') {
            steps.set(coordinates.step, {
                ...previous,
                streamedText: previous.streamedText || chunkHasText(event),
            });
            continue;
        }
        if (event.type === 'assistant/message') {
            steps.set(coordinates.step, { streamedText: false, finalized: true });
            if (hasTextAssistant(event)) {
                anchor = event.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.finalizedFollowup;
            }
            continue;
        }
        if (event.type === 'llm/retry') {
            steps.set(coordinates.step, { streamedText: false, finalized: false });
            continue;
        }
        if (event.type === 'step/end' && previous.streamedText && !previous.finalized) {
            anchor = event.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedFollowup;
        }
    }
    return anchor;
}
function turnLocation(context) {
    const location = context.start?.location ?? context.matches[0]?.location;
    return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined;
}
function hasText(data) {
    return data.finalNode !== undefined
        && data.blocks.some(block => block.kind === 'text' && block.text.trim() !== '');
}
function tailData(context) {
    const end = context.state?.end
        ?? context.matches.find(match => match.event.type === 'turn/end');
    if (end?.event.type !== 'turn/end')
        return null;
    const turn = turnLocation(context);
    if (turn === undefined)
        return null;
    const assistants = turn.steps
        .map(step => step.data.get('assistant-step'))
        .filter((candidate) => candidate !== undefined);
    const finalized = assistants
        .filter((candidate) => candidate.finalNode !== undefined)
        .sort((left, right) => left.finalNode.seq - right.finalNode.seq);
    const closing = finalized.findLast(hasText) ?? null;
    let latestTranscriptSeq = finalized.at(-1)?.finalNode.seq;
    for (const match of context.matches) {
        const event = match.event;
        const candidate = event.type === 'tool/call'
            || (event.type === 'tool/result' && isAppendSurfaceEvent(event))
            || (event.type === 'turn/end' && event.data.reason.kind === 'error')
            || event.type === 'llm/retry'
            ? event.seq
            : undefined;
        if (candidate !== undefined && (latestTranscriptSeq === undefined || candidate > latestTranscriptSeq)) {
            latestTranscriptSeq = candidate;
        }
    }
    const metrics = deriveTurnMetrics(finalized.map(candidate => candidate.finalNode)).get(end.event.data.turn);
    const performance = turnPerformance(context, finalized);
    return {
        turn: end.event.data.turn,
        seq: end.event.seq,
        time: end.event.time,
        closing,
        branchUnavailable: closing === null || latestTranscriptSeq !== closing.finalNode.seq,
        ...metrics?.ttftMs === undefined ? {} : { ttftMs: metrics.ttftMs },
        ...metrics?.tokensPerSecond === undefined ? {} : { tokensPerSecond: metrics.tokensPerSecond },
        statistics: performance.statistics,
        ...(performance.usage === undefined ? {} : { usage: performance.usage }),
    };
}
/** Completed-turn footer Definition independent of any Assistant row. */
export const turnTailDefinition = {
    kind: 'turn-tail',
    target: 'chat',
    match: (event) => {
        if (event.type === 'turn/start')
            return { id: String(event.data.turn), role: 'start' };
        if (event.type === 'turn/end')
            return { id: String(event.data.turn), role: 'update' };
        if (event.type === 'tool/call' || event.type === 'tool/result') {
            return { id: String(event.data.turn), role: 'update' };
        }
        const coordinates = turnCoordinates(event);
        if (coordinates !== undefined)
            return { id: String(coordinates.turn), role: 'update' };
        return null;
    },
    start: (_context, match) => {
        if (match.event.type !== 'turn/start')
            throw new Error('turn-tail start requires turn/start');
        return { turn: match.event.data.turn };
    },
    update: (context, match) => match.event.type === 'turn/end'
        ? { ...context.state, end: match }
        : context.state,
    publication: match => match.event.type === 'turn/end' ? 'immediate' : 'none',
    buildLocationData: (context, scope) => {
        if (scope !== 'turn')
            return null;
        const value = tailData(context);
        return value === null ? null : {
            kind: 'turn',
            turn: value.turn,
            key: 'turn-tail',
            value,
        };
    },
    buildViewNode: (context) => {
        const turn = turnLocation(context);
        const data = turn?.data.get('turn-tail');
        return data === undefined ? null : chatNode(context, 'turn-tail', closingAnchor(context), data);
    },
};
/**
 * Register completed-Turn footer data and its Chat node contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerTurnTailConversationNode(ctx) {
    ctx.conversationEvents.register(turnTailDefinition);
}
//# sourceMappingURL=turn-tail.js.map