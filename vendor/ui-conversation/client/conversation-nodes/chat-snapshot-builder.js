import { isRunningTool } from "../contract/chat-nodes.js";
const EMPTY_KEYS = [];
const EMPTY_TURNS = [];
const EMPTY_LIST = [];
function sameReferences(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
class MutableChatNodeStore {
    byKey = new Map();
    valuesCache = EMPTY_LIST;
    valuesDirty = false;
    get(key) {
        return this.byKey.get(key);
    }
    values() {
        if (this.valuesDirty) {
            this.valuesCache = [...this.byKey.values()];
            this.valuesDirty = false;
        }
        return this.valuesCache;
    }
    replace(nodes) {
        this.byKey.clear();
        for (const node of nodes)
            this.byKey.set(node.key, node);
        this.valuesCache = [...this.byKey.values()];
        this.valuesDirty = false;
    }
    upsert(nodes) {
        let changed = false;
        for (const node of nodes) {
            if (this.byKey.get(node.key) === node)
                continue;
            this.byKey.set(node.key, node);
            changed = true;
        }
        if (changed)
            this.valuesDirty = true;
    }
}
class MutableChatLocationIndex {
    turns = new Map();
    steps = new Map();
    getTurn(turn) {
        return this.turns.get(turn) ?? EMPTY_KEYS;
    }
    getStep(turn, step) {
        return this.steps.get(stepKey(turn, step)) ?? EMPTY_KEYS;
    }
    rebuild(order, store) {
        const turns = new Map();
        const steps = new Map();
        for (const key of order) {
            const location = store.get(key)?.location;
            if (location === undefined)
                continue;
            const coordinates = locationCoordinates(location);
            if (coordinates.turn === undefined)
                continue;
            const turnKeys = turns.get(coordinates.turn) ?? [];
            turnKeys.push(key);
            turns.set(coordinates.turn, turnKeys);
            if (coordinates.step === undefined)
                continue;
            const step = stepKey(coordinates.turn, coordinates.step);
            const stepKeys = steps.get(step) ?? [];
            stepKeys.push(key);
            steps.set(step, stepKeys);
        }
        this.turns = updateIndex(this.turns, turns);
        this.steps = updateIndex(this.steps, steps);
    }
    /** Invalidate aggregate readers when member data changes without moving. */
    touch(nodes) {
        const turns = new Set();
        const steps = new Set();
        for (const node of nodes) {
            const coordinates = locationCoordinates(node.location);
            if (coordinates.turn === undefined || !this.turns.get(coordinates.turn)?.includes(node.key))
                continue;
            turns.add(coordinates.turn);
            if (coordinates.step !== undefined)
                steps.add(stepKey(coordinates.turn, coordinates.step));
        }
        for (const turn of turns) {
            const keys = this.turns.get(turn);
            if (keys === undefined)
                continue;
            this.turns.set(turn, [...keys]);
        }
        for (const step of steps) {
            const keys = this.steps.get(step);
            if (keys === undefined)
                continue;
            this.steps.set(step, [...keys]);
        }
    }
}
function updateIndex(previous, nextMutable) {
    const next = new Map();
    const keys = new Set([...previous.keys(), ...nextMutable.keys()]);
    for (const key of keys) {
        const before = previous.get(key) ?? EMPTY_KEYS;
        const candidate = nextMutable.get(key) ?? EMPTY_KEYS;
        const value = sameReferences(before, candidate) ? before : candidate;
        if (candidate.length > 0)
            next.set(key, value);
    }
    return next;
}
function stepKey(turn, step) {
    return `${turn}:${step}`;
}
function locationCoordinates(location) {
    if (location.kind === 'step')
        return { turn: location.turn.turn, step: location.step.step };
    if (location.kind === 'turn')
        return { turn: location.turn.turn };
    return {};
}
function orderedVisible(nodes) {
    return nodes
        .filter(node => node.visibility === 'visible')
        .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
}
const EMPTY_CONTRIBUTION = {
    anchorSeq: 0,
    nodes: EMPTY_LIST,
    partial: null,
    running: null,
};
function legacyContribution(raw) {
    const node = raw;
    // Content-free settled Assistants remain in the finalized compatibility
    // stream so StatsLine preserves its pre-assembly step counts; hidden running
    // attempts have no final Node to contribute.
    if (raw.visibility !== 'visible' && node.kind !== 'assistant-step')
        return EMPTY_CONTRIBUTION;
    switch (node.kind) {
        case 'user':
        case 'steering':
        case 'context':
        case 'command':
        case 'compaction':
        case 'turn-error':
        case 'turn-max-tokens':
        case 'unknown':
            return { anchorSeq: node.anchorSeq, nodes: [node.data], partial: null, running: null };
        case 'assistant-step': {
            const data = node.data;
            if (data.status === 'running') {
                if (raw.visibility !== 'visible')
                    return EMPTY_CONTRIBUTION;
                return {
                    anchorSeq: node.anchorSeq,
                    nodes: EMPTY_LIST,
                    partial: { turn: data.turn, step: data.step, blocks: data.blocks },
                    running: null,
                };
            }
            return {
                anchorSeq: node.anchorSeq,
                nodes: data.finalNode === undefined ? EMPTY_LIST : [data.finalNode],
                partial: null,
                running: null,
            };
        }
        case 'tool-call': {
            const root = node.data.root;
            return isRunningTool(root)
                ? { anchorSeq: node.anchorSeq, nodes: EMPTY_LIST, partial: null, running: root }
                : { anchorSeq: node.anchorSeq, nodes: [root], partial: null, running: null };
        }
        case 'manual-compaction': {
            const data = node.data;
            return {
                anchorSeq: node.anchorSeq,
                nodes: data.compaction === null ? [data.command] : [data.command, data.compaction],
                partial: null,
                running: null,
            };
        }
        case 'model-retry':
            return {
                anchorSeq: node.anchorSeq,
                nodes: node.data.attempts,
                partial: null,
                running: null,
            };
        case 'turn-tail':
            return EMPTY_CONTRIBUTION;
        default:
            return EMPTY_CONTRIBUTION;
    }
}
function sameContribution(left, right) {
    return left !== undefined
        && left.anchorSeq === right.anchorSeq
        && left.partial?.blocks === right.partial?.blocks
        && left.partial?.turn === right.partial?.turn
        && left.partial?.step === right.partial?.step
        && left.running === right.running
        && sameReferences(left.nodes, right.nodes);
}
/** Incremental compatibility projection for StatsLine and legacy top-level snapshot fields. */
class LegacySliceBuilder {
    contributions = new Map();
    finalizedContributions = new Map();
    runningContributions = new Map();
    partialContributions = new Map();
    finalized = EMPTY_LIST;
    runningCalls = EMPTY_LIST;
    partial = null;
    timeline;
    turnTimings = new Map();
    turnEnds = new Map();
    replace(nodes, timeline) {
        this.contributions.clear();
        this.finalizedContributions.clear();
        this.runningContributions.clear();
        this.partialContributions.clear();
        for (const node of nodes) {
            const contribution = legacyContribution(node);
            this.contributions.set(node.key, contribution);
            this.indexContribution(node.key, contribution);
        }
        this.rebuildFinalized();
        this.rebuildRunning();
        this.rebuildPartial();
        this.updateTimeline(timeline);
        return this.snapshot();
    }
    apply(upserts, timeline) {
        let finalizedChanged = false;
        let runningChanged = false;
        let partialChanged = false;
        for (const node of upserts) {
            const contribution = legacyContribution(node);
            const previous = this.contributions.get(node.key);
            if (sameContribution(previous, contribution))
                continue;
            finalizedChanged ||= finalizedContributionChanged(previous, contribution);
            runningChanged ||= runningContributionChanged(previous, contribution);
            partialChanged ||= partialContributionChanged(previous, contribution);
            this.contributions.set(node.key, contribution);
            this.indexContribution(node.key, contribution);
        }
        if (finalizedChanged)
            this.rebuildFinalized();
        if (runningChanged)
            this.rebuildRunning();
        if (partialChanged)
            this.rebuildPartial();
        this.updateTimeline(timeline);
        return this.snapshot();
    }
    indexContribution(key, contribution) {
        updateContributionIndex(this.finalizedContributions, key, contribution, contribution.nodes.length > 0);
        updateContributionIndex(this.runningContributions, key, contribution, contribution.running !== null);
        updateContributionIndex(this.partialContributions, key, contribution, contribution.partial !== null);
    }
    rebuildFinalized() {
        const finalized = [...this.finalizedContributions.values()]
            .flatMap(value => value.nodes)
            .sort((left, right) => left.seq - right.seq);
        if (!sameReferences(this.finalized, finalized))
            this.finalized = finalized;
    }
    rebuildRunning() {
        const runningCalls = [...this.runningContributions.values()]
            .sort((left, right) => left.anchorSeq - right.anchorSeq)
            .flatMap(value => value.running === null ? [] : [value.running]);
        if (!sameReferences(this.runningCalls, runningCalls))
            this.runningCalls = runningCalls;
    }
    rebuildPartial() {
        const partial = [...this.partialContributions.values()]
            .sort((left, right) => left.anchorSeq - right.anchorSeq)
            .findLast(value => value.partial !== null)?.partial ?? null;
        if (this.partial?.blocks !== partial?.blocks
            || this.partial?.turn !== partial?.turn
            || this.partial?.step !== partial?.step)
            this.partial = partial;
    }
    updateTimeline(timeline) {
        if (this.timeline === timeline)
            return;
        this.timeline = timeline;
        const turnTimings = new Map();
        const turnEnds = new Map();
        for (const turn of timeline.turns.values()) {
            if (turn.start !== undefined) {
                turnTimings.set(turn.turn, {
                    startTime: turn.start.time,
                    ...turn.end === undefined ? {} : { endTime: turn.end.time },
                });
            }
            if (turn.end !== undefined)
                turnEnds.set(turn.turn, turn.end.seq);
        }
        this.turnTimings = turnTimings;
        this.turnEnds = turnEnds;
    }
    snapshot() {
        return {
            nodes: this.finalized,
            turnTimings: this.turnTimings,
            turnEnds: this.turnEnds,
            partial: this.partial,
            runningCalls: this.runningCalls,
        };
    }
}
function updateContributionIndex(index, key, contribution, present) {
    if (present)
        index.set(key, contribution);
    else
        index.delete(key);
}
function finalizedContributionChanged(previous, next) {
    const previousNodes = previous?.nodes ?? EMPTY_LIST;
    return !sameReferences(previousNodes, next.nodes)
        || ((previousNodes.length > 0 || next.nodes.length > 0) && previous?.anchorSeq !== next.anchorSeq);
}
function runningContributionChanged(previous, next) {
    return previous?.running !== next.running
        || ((previous.running !== null || next.running !== null)
            && previous.anchorSeq !== next.anchorSeq);
}
function partialContributionChanged(previous, next) {
    return previous?.partial?.blocks !== next.partial?.blocks
        || previous?.partial?.turn !== next.partial?.turn
        || previous?.partial?.step !== next.partial?.step
        || (((previous?.partial ?? null) !== null || next.partial !== null)
            && previous?.anchorSeq !== next.anchorSeq);
}
/** Incremental keyed Chat builder registered under the `chat` target. */
export class ChatSnapshotBuilder {
    store = new MutableChatNodeStore();
    locations = new MutableChatLocationIndex();
    legacy = new LegacySliceBuilder();
    order = EMPTY_KEYS;
    empty;
    constructor() {
        this.empty = this.snapshot({ turnOrder: EMPTY_TURNS, turns: new Map() });
    }
    replace(input) {
        this.store.replace(input.nodes);
        this.order = orderedVisible(input.nodes).map(node => node.key);
        this.locations.rebuild(this.order, this.store);
        return this.snapshot(input.timeline, this.legacy.replace(input.nodes, input.timeline));
    }
    apply(input) {
        let structural = false;
        const contentOnly = [];
        for (const node of input.upserts) {
            const previous = this.store.get(node.key);
            const nodeStructural = previous === undefined
                || previous.anchorSeq !== node.anchorSeq
                || previous.visibility !== node.visibility
                || locationIdentity(previous.location) !== locationIdentity(node.location);
            structural ||= nodeStructural;
            if (!nodeStructural)
                contentOnly.push(node);
        }
        this.store.upsert(input.upserts);
        if (structural) {
            const next = orderedVisible(this.store.values()).map(node => node.key);
            this.order = sameReferences(this.order, next) ? this.order : next;
            this.locations.rebuild(this.order, this.store);
        }
        this.locations.touch(contentOnly);
        return this.snapshot(input.timeline, this.legacy.apply(input.upserts, input.timeline));
    }
    snapshot(timeline, legacy = this.legacy.replace(EMPTY_LIST, timeline)) {
        return {
            order: this.order,
            nodes: this.store,
            locations: this.locations,
            timeline,
            legacy,
        };
    }
}
function locationIdentity(location) {
    const coordinates = locationCoordinates(location);
    return `${location.kind}:${coordinates.turn ?? ''}:${coordinates.step ?? ''}`;
}
/** Chat target factory contributed to the Runtime view registry. */
export const chatViewDefinition = {
    target: 'chat',
    create: () => new ChatSnapshotBuilder(),
};
/**
 * Register the incremental Chat target builder.
 * @param ctx - owning UI Conversation context.
 */
export function registerChatConversationView(ctx) {
    ctx.conversationViews.register(chatViewDefinition);
}
//# sourceMappingURL=chat-snapshot-builder.js.map