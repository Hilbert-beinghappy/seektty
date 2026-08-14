class MutableLocationDataStore {
    entries = new Map();
    get(key) {
        return this.entries.get(key)?.value;
    }
    remove(owner, key) {
        const current = this.entries.get(key);
        if (current?.owner !== owner)
            return false;
        this.entries.delete(key);
        return true;
    }
    set(owner, key, value) {
        const current = this.entries.get(key);
        if (current !== undefined && current.owner !== owner) {
            throw new Error(`conversation Location data "${key}" is already owned by ${current.owner}`);
        }
        if (current?.value === value)
            return false;
        this.entries.set(key, { owner, value });
        return true;
    }
    replace(entries) {
        let changed = this.entries.size !== entries.size;
        if (!changed) {
            for (const [key, value] of entries) {
                const current = this.entries.get(key);
                if (current?.owner !== value.owner || current.value !== value.value) {
                    changed = true;
                    break;
                }
            }
        }
        if (changed)
            this.entries = new Map(entries);
        return changed;
    }
}
const SESSION_LOCATION = { kind: 'session' };
const UNRESOLVED_LOCATION = { kind: 'unresolved' };
function payloadCoordinates(event) {
    const data = event.data;
    if (data.turn === null)
        return { session: true };
    const turn = Number.isSafeInteger(data.turn) && data.turn >= 0
        ? data.turn
        : undefined;
    const step = Number.isSafeInteger(data.step) && data.step >= 0
        ? data.step
        : undefined;
    return { ...turn === undefined ? {} : { turn }, ...step === undefined ? {} : { step } };
}
function sameReferences(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameStep(left, right) {
    return left !== undefined
        && left.start === right.start && left.end === right.end && left.status === right.status
        && left.data === right.data;
}
function sameTurn(left, right) {
    return left !== undefined
        && left.start === right.start && left.end === right.end && left.status === right.status
        && left.data === right.data && sameReferences(left.steps, right.steps);
}
function sameLocation(left, right) {
    if (left === undefined || right === undefined || left.kind !== right.kind)
        return left === right;
    if (left.kind === 'session' || left.kind === 'unresolved')
        return true;
    if (right.kind === 'session' || right.kind === 'unresolved')
        return false;
    if (left.kind === 'turn' || right.kind === 'turn') {
        return left.kind === 'turn' && right.kind === 'turn' && left.turn === right.turn;
    }
    return left.turn === right.turn && left.step === right.step;
}
/** Session-owned Turn/Step timeline and event-to-Location index. */
export class ConversationLocationIndex {
    coordinates = new Map();
    locations = new Map();
    seqsByTurn = new Map();
    timeline = { turnOrder: [], turns: new Map() };
    turnDataStores = new Map();
    stepDataStores = new Map();
    currentTurn;
    currentStep;
    /**
     * Return the current reference-stable timeline.
     * @returns current timeline snapshot.
     */
    snapshot() {
        return this.timeline;
    }
    /**
     * Replace all Definition-owned Location values while preserving reader identities.
     * @param entries - complete current set of Definition-owned Location values.
     * @returns whether any published Location data changed.
     */
    replaceData(entries) {
        const turns = new Map();
        const steps = new Map();
        for (const { owner, data } of entries) {
            const values = data.kind === 'turn'
                ? turns.get(data.turn) ?? new Map()
                : steps.get(stepDataKey(data.turn, requireStep(data))) ?? new Map();
            const current = values.get(data.key);
            if (current !== undefined && current.owner !== owner) {
                throw new Error(`conversation Location data "${data.key}" is already owned by ${current.owner}`);
            }
            values.set(data.key, { owner, value: data.value });
            if (data.kind === 'turn')
                turns.set(data.turn, values);
            else
                steps.set(stepDataKey(data.turn, requireStep(data)), values);
        }
        let changed = false;
        for (const turn of new Set([...this.turnDataStores.keys(), ...turns.keys()])) {
            changed = this.mutableTurnData(turn).replace(turns.get(turn) ?? new Map()) || changed;
        }
        for (const step of new Set([...this.stepDataStores.keys(), ...steps.keys()])) {
            changed = this.mutableStepData(step).replace(steps.get(step) ?? new Map()) || changed;
        }
        return changed;
    }
    /**
     * Apply changed Context publications without rebuilding Turn/Step membership.
     * @param changes - incremental removals and replacements from published Contexts.
     * @returns whether any published Location data changed.
     */
    applyData(changes) {
        let changed = false;
        for (const change of changes) {
            const previous = change.previous;
            if (previous === null)
                continue;
            changed = this.storeFor(previous).remove(change.owner, previous.key) || changed;
        }
        for (const change of changes) {
            const next = change.next;
            if (next === null)
                continue;
            changed = this.storeFor(next).set(change.owner, next.key, next.value) || changed;
        }
        return changed;
    }
    /**
     * Resolve the latest Location for one event.
     * @param event - event already ingested into this index.
     * @returns current Location, falling back to session when it has no Turn/Step affinity.
     */
    locationOf(event) {
        return this.locations.get(event.seq) ?? SESSION_LOCATION;
    }
    /**
     * Rebuild timeline facts after replace/prepend or a boundary append.
     * @param entries - complete current window in ascending seq order.
     * @returns seqs whose resolved Location changed.
     */
    rebuild(entries) {
        const previousLocations = this.locations;
        const turns = new Map();
        const coordinates = new Map();
        let currentTurn;
        let currentStep;
        const turnDraft = (turn, seq) => {
            let draft = turns.get(turn);
            if (draft === undefined) {
                draft = { turn, firstSeq: seq, steps: new Map() };
                turns.set(turn, draft);
            }
            else {
                draft.firstSeq = Math.min(draft.firstSeq, seq);
            }
            return draft;
        };
        const stepDraft = (turn, step, seq) => {
            const owner = turnDraft(turn, seq);
            let draft = owner.steps.get(step);
            if (draft === undefined) {
                draft = { turn, step, firstSeq: seq };
                owner.steps.set(step, draft);
            }
            else {
                draft.firstSeq = Math.min(draft.firstSeq, seq);
            }
            return draft;
        };
        for (const { event } of entries) {
            const explicit = payloadCoordinates(event);
            if (event.type === 'turn/start') {
                currentTurn = event.data.turn;
                currentStep = undefined;
            }
            if (event.type === 'step/start') {
                currentTurn = event.data.turn;
                currentStep = event.data.step;
            }
            if (explicit.session !== true && explicit.turn !== undefined) {
                if (currentTurn !== explicit.turn)
                    currentStep = undefined;
                currentTurn = explicit.turn;
                if (explicit.step !== undefined)
                    currentStep = explicit.step;
            }
            const turn = explicit.session === true ? undefined : explicit.turn ?? currentTurn;
            const step = explicit.session === true || event.type === 'turn/start' || event.type === 'turn/end'
                ? undefined
                : explicit.step ?? (turn === currentTurn ? currentStep : undefined);
            coordinates.set(event.seq, {
                ...turn === undefined ? {} : { turn },
                ...turn === undefined || step === undefined ? {} : { step },
            });
            if (turn !== undefined)
                turnDraft(turn, event.seq);
            if (turn !== undefined && step !== undefined)
                stepDraft(turn, step, event.seq);
            if (event.type === 'turn/start') {
                turnDraft(event.data.turn, event.seq).start = event;
            }
            else if (event.type === 'turn/end') {
                turnDraft(event.data.turn, event.seq).end = event;
            }
            else if (event.type === 'step/start') {
                stepDraft(event.data.turn, event.data.step, event.seq).start = event;
            }
            else if (event.type === 'step/end') {
                stepDraft(event.data.turn, event.data.step, event.seq).end = event;
            }
            if (event.type === 'step/end' && currentTurn === event.data.turn && currentStep === event.data.step) {
                currentStep = undefined;
            }
            if (event.type === 'turn/end' && currentTurn === event.data.turn) {
                currentTurn = undefined;
                currentStep = undefined;
            }
        }
        const previousTurns = this.timeline.turns;
        const nextTurns = new Map();
        const orderedDrafts = [...turns.values()].sort((left, right) => left.firstSeq - right.firstSeq);
        for (const draft of orderedDrafts) {
            const previousTurn = previousTurns.get(draft.turn);
            const previousSteps = new Map(previousTurn?.steps.map(step => [step.step, step]) ?? []);
            const steps = [...draft.steps.values()]
                .sort((left, right) => left.firstSeq - right.firstSeq)
                .map((candidate) => {
                const value = {
                    turn: candidate.turn,
                    step: candidate.step,
                    start: candidate.start,
                    end: candidate.end,
                    status: candidate.end !== undefined
                        ? 'closed'
                        : candidate.start === undefined ? 'unknown' : 'open',
                    data: this.stepData(candidate.turn, candidate.step),
                };
                const previous = previousSteps.get(candidate.step);
                return sameStep(previous, value) ? previous : value;
            });
            const value = {
                turn: draft.turn,
                start: draft.start,
                end: draft.end,
                status: draft.end !== undefined ? 'closed' : draft.start === undefined ? 'unknown' : 'open',
                steps,
                data: this.turnData(draft.turn),
            };
            nextTurns.set(draft.turn, sameTurn(previousTurn, value) ? previousTurn : value);
        }
        const nextOrder = orderedDrafts.map(draft => draft.turn);
        const turnOrder = this.timeline.turnOrder.length === nextOrder.length
            && this.timeline.turnOrder.every((turn, index) => turn === nextOrder[index])
            ? this.timeline.turnOrder
            : nextOrder;
        let sameMap = previousTurns.size === nextTurns.size;
        if (sameMap) {
            for (const [turn, value] of nextTurns) {
                if (previousTurns.get(turn) !== value) {
                    sameMap = false;
                    break;
                }
            }
        }
        this.timeline = sameMap && turnOrder === this.timeline.turnOrder
            ? this.timeline
            : { turnOrder, turns: nextTurns };
        this.coordinates = coordinates;
        this.locations = new Map();
        this.seqsByTurn = new Map();
        for (const { event } of entries) {
            const coordinates = this.coordinates.get(event.seq);
            if (coordinates?.turn !== undefined)
                this.indexTurnSeq(coordinates.turn, event.seq);
            this.locations.set(event.seq, this.resolve(event.seq));
        }
        this.currentTurn = currentTurn;
        this.currentStep = currentStep;
        const changed = new Set();
        for (const { event } of entries) {
            if (!sameLocation(previousLocations.get(event.seq), this.locations.get(event.seq))) {
                changed.add(event.seq);
            }
        }
        return changed;
    }
    /**
     * Append one Turn/Step boundary while revisiting only the owning Turn.
     * @param event - contiguous tail boundary event.
     * @returns seqs whose immutable Location reference changed.
     */
    appendBoundary(event) {
        if (event.type !== 'turn/start' && event.type !== 'turn/end'
            && event.type !== 'step/start' && event.type !== 'step/end') {
            throw new Error(`conversation Location boundary expected, received ${event.type}`);
        }
        const explicit = payloadCoordinates(event);
        if (event.type === 'turn/start') {
            this.currentTurn = event.data.turn;
            this.currentStep = undefined;
        }
        else if (event.type === 'step/start') {
            this.currentTurn = event.data.turn;
            this.currentStep = event.data.step;
        }
        if (explicit.turn !== undefined) {
            if (this.currentTurn !== explicit.turn)
                this.currentStep = undefined;
            this.currentTurn = explicit.turn;
            if (explicit.step !== undefined)
                this.currentStep = explicit.step;
        }
        const turnNumber = explicit.turn ?? this.currentTurn;
        if (turnNumber === undefined)
            throw new Error(`conversation boundary ${event.type} has no turn`);
        const stepNumber = event.type === 'turn/start' || event.type === 'turn/end'
            ? undefined
            : explicit.step ?? (turnNumber === this.currentTurn ? this.currentStep : undefined);
        this.coordinates.set(event.seq, {
            turn: turnNumber,
            ...stepNumber === undefined ? {} : { step: stepNumber },
        });
        this.indexTurnSeq(turnNumber, event.seq);
        const previousTurn = this.timeline.turns.get(turnNumber);
        let steps = previousTurn?.steps ?? [];
        if (event.type === 'step/start' || event.type === 'step/end') {
            const number = event.data.step;
            const previousStep = steps.find(candidate => candidate.step === number);
            const candidate = {
                turn: turnNumber,
                step: number,
                start: event.type === 'step/start' ? event : previousStep?.start,
                end: event.type === 'step/end' ? event : previousStep?.end,
                status: event.type === 'step/end' || previousStep?.end !== undefined ? 'closed' : 'open',
                data: this.stepData(turnNumber, number),
            };
            const nextStep = sameStep(previousStep, candidate) ? previousStep : candidate;
            const index = steps.findIndex(step => step.step === number);
            steps = index < 0
                ? [...steps, nextStep]
                : steps.map((step, at) => at === index ? nextStep : step);
        }
        const candidate = {
            turn: turnNumber,
            start: event.type === 'turn/start' ? event : previousTurn?.start,
            end: event.type === 'turn/end' ? event : previousTurn?.end,
            status: event.type === 'turn/end' || previousTurn?.end !== undefined
                ? 'closed'
                : event.type === 'turn/start' || previousTurn?.start !== undefined ? 'open' : 'unknown',
            steps,
            data: this.turnData(turnNumber),
        };
        const turn = sameTurn(previousTurn, candidate) ? previousTurn : candidate;
        const turns = new Map(this.timeline.turns);
        turns.set(turnNumber, turn);
        const turnOrder = previousTurn === undefined
            ? [...this.timeline.turnOrder, turnNumber]
            : this.timeline.turnOrder;
        this.timeline = { turnOrder, turns };
        const changed = new Set();
        for (const seq of this.seqsByTurn.get(turnNumber) ?? []) {
            const previous = this.locations.get(seq);
            const next = this.resolve(seq);
            this.locations.set(seq, next);
            if (!sameLocation(previous, next))
                changed.add(seq);
        }
        if (event.type === 'step/end' && this.currentTurn === event.data.turn && this.currentStep === event.data.step) {
            this.currentStep = undefined;
        }
        if (event.type === 'turn/end' && this.currentTurn === event.data.turn) {
            this.currentTurn = undefined;
            this.currentStep = undefined;
        }
        return changed;
    }
    /**
     * Index one non-boundary tail event without rescanning the window.
     * @param event - contiguous appended event.
     */
    appendNonBoundary(event) {
        const explicit = payloadCoordinates(event);
        if (explicit.session === true) {
            this.coordinates.set(event.seq, {});
            this.locations.set(event.seq, SESSION_LOCATION);
            return;
        }
        if (explicit.turn !== undefined) {
            if (this.currentTurn !== explicit.turn)
                this.currentStep = undefined;
            this.currentTurn = explicit.turn;
            if (explicit.step !== undefined)
                this.currentStep = explicit.step;
        }
        const turn = explicit.turn ?? this.currentTurn;
        const step = explicit.step ?? (turn === this.currentTurn ? this.currentStep : undefined);
        this.coordinates.set(event.seq, {
            ...turn === undefined ? {} : { turn },
            ...turn === undefined || step === undefined ? {} : { step },
        });
        if (turn !== undefined)
            this.indexTurnSeq(turn, event.seq);
        this.locations.set(event.seq, this.resolve(event.seq));
    }
    indexTurnSeq(turn, seq) {
        const current = this.seqsByTurn.get(turn) ?? new Set();
        current.add(seq);
        this.seqsByTurn.set(turn, current);
    }
    turnData(turn) {
        return this.mutableTurnData(turn);
    }
    stepData(turn, step) {
        return this.mutableStepData(stepDataKey(turn, step));
    }
    mutableTurnData(turn) {
        const current = this.turnDataStores.get(turn) ?? new MutableLocationDataStore();
        this.turnDataStores.set(turn, current);
        return current;
    }
    mutableStepData(key) {
        const current = this.stepDataStores.get(key) ?? new MutableLocationDataStore();
        this.stepDataStores.set(key, current);
        return current;
    }
    storeFor(data) {
        return data.kind === 'turn'
            ? this.mutableTurnData(data.turn)
            : this.mutableStepData(stepDataKey(data.turn, requireStep(data)));
    }
    resolve(seq) {
        const coordinates = this.coordinates.get(seq);
        if (coordinates?.turn === undefined)
            return SESSION_LOCATION;
        const turn = this.timeline.turns.get(coordinates.turn);
        if (turn === undefined)
            return UNRESOLVED_LOCATION;
        if (coordinates.step === undefined)
            return { kind: 'turn', turn };
        const step = turn.steps.find(candidate => candidate.step === coordinates.step);
        return step === undefined ? { kind: 'turn', turn } : { kind: 'step', turn, step };
    }
}
function stepDataKey(turn, step) {
    return `${turn}:${step}`;
}
function requireStep(data) {
    if (data.kind === 'step' && data.step !== undefined)
        return data.step;
    throw new Error(`conversation Step data "${data.key}" requires a step`);
}
//# sourceMappingURL=conversation-location-index.js.map