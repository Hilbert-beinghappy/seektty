// Narrow bridge from the existing native Chat builder to published rc.2 pure process projections.
import { ProcessState } from './process-groups.js';
import { ChatTurnProcessProjector } from './turn-process-presentation.js';
const projected = new WeakSet();
export function nativeProcessSnapshot(chat) {
  return projected.has(chat.workProcess) ? chat.workProcess : undefined;
}
export class NativeProcessSnapshotAdapter {
  groups = new ProcessState();
  turns = new ChatTurnProcessProjector();
  positions = new Map();
  order = undefined;
  nodeInputs = new Map();
  timeline = undefined;
  previous = undefined;
  replace(chat) {
    return this.consume(chat);
  }
  apply(chat, upserts) {
    return this.consume(chat, upserts);
  }
  consume(chat, upserts) {
    const reordered = this.order !== chat.order;
    if (reordered) this.positions.clear();
    for (const [index, key] of reordered ? chat.order.entries() : []) {
      const node = chat.nodes.get(key);
      const location = node?.location;
      this.positions.set(key, { previous: chat.order[index - 1], next: chat.order[index + 1],
        turn: location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined });
    }
    const turnOf = node => node?.location.kind === 'turn' || node?.location.kind === 'step' ? node.location.turn.turn : undefined;
    const changedTurns = new Set();
    const changedTurnOrders = new Set();
    const changes = (upserts ?? []).map(current => {
      const previous = this.nodeInputs.get(current.key);
      const turn = turnOf(current), before = turnOf(previous);
      if (turn !== undefined) changedTurns.add(turn);
      if (before !== undefined) changedTurns.add(before);
      if (previous === undefined || previous.anchorSeq !== current.anchorSeq || before !== turn || previous.visibility !== current.visibility) {
        if (turn !== undefined) changedTurnOrders.add(turn);
        if (before !== undefined) changedTurnOrders.add(before);
      }
      this.nodeInputs.set(current.key, current);
      const position = this.positions.get(current.key);
      if (position !== undefined && position.turn !== turn) this.positions.set(current.key, { ...position, turn });
      return { previous, current };
    });
    for (const [turn, location] of chat.timeline.turns) if (this.timeline?.turns.get(turn) !== location) changedTurns.add(turn);
    const replace = upserts === undefined || this.previous === undefined;
    if (replace) this.nodeInputs = new Map(chat.order.map(key => [key, chat.nodes.get(key)]));
    this.groups.accept({ ...(replace ? { kind: 'replace' } : { kind: 'apply', changes, changedTurns, changedTurnOrders }), order: chat.order, timeline: chat.timeline,
      readNode: key => chat.nodes.get(key), readTurn: turn => chat.locations.getTurn(turn),
      readPosition: key => this.positions.get(key) });
    if (replace) this.turns.replace(chat.order, chat.locations, chat.nodes);
    else this.turns.update(changedTurns, chat.locations, chat.nodes);
    const output = this.groups.output();
    const evidence = new Map(replace ? [] : this.previous?.evidence);
    for (const turn of changedTurns) evidence.delete(turn);
    const evidenceKeys = replace ? chat.order : [...changedTurns].flatMap(turn => chat.locations.getTurn(turn));
    for (const key of evidenceKeys) {
      const node = chat.nodes.get(key);
      const presentation = this.turns.get(node);
      const location = node?.location;
      if (presentation === undefined || location?.kind !== 'turn' && location?.kind !== 'step') continue;
      evidence.set(presentation.turn, { turn: presentation.turn, status: location.turn.status,
        endReason: location.turn.end?.data.reason?.kind, hasInterleavedInput: presentation.hasInterleavedInput,
        hasExternalProcess: presentation.hasExternalProcess, inlineReasoning: presentation.spec.inlineReasoning,
        spec: presentation.spec });
    }
    const groups = new Map(replace ? (output?.groups?.snapshots ?? []).map(group => [group.key, group]) : this.previous?.groups);
    if (!replace) {
      for (const key of output?.groups?.removes ?? []) groups.delete(key);
      for (const group of output?.groups?.upserts ?? []) groups.set(group.key, group);
    }
    const result = { entries: output?.entries ?? this.previous?.entries ?? [], groups, evidence };
    this.previous = result; this.order = chat.order; this.timeline = chat.timeline;
    projected.add(result);
    return result;
  }
}
