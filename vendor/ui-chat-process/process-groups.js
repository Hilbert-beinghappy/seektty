// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
// Published compile-time brand helper is a runtime identity.
function brandString(value) {
	return value;
}
import { hasAssistantReplyContent } from "./assistant-content.js";
import { isVisibleChatNode } from "./chat-visibility.js";
import { processActivity } from "./process-activity.js";
//#region lib/types/client/conversation-nodes/process-groups.js
/** Chat-owned segmentation and incremental summaries over materialized Node inputs. */
const INDEPENDENT = new Set([
	"user",
	"steering",
	"turn-trigger",
	"model-retry",
	"turn-error",
	"turn-max-tokens",
	"turn-tail"
]);
function turnOf(node) {
	const location = node.location;
	return location.kind === "turn" || location.kind === "step" ? location.turn.turn : void 0;
}
function reasoning(node) {
	return node.kind === "assistant-step" && node.data.blocks.some((block) => block.kind === "reasoning" && block.text.trim() !== "");
}
function reply(node) {
	return node.kind === "assistant-step" && hasAssistantReplyContent(node.data.blocks);
}
function sameSummary(left, right) {
	return left.running === right.running && left.runningDetail === right.runningDetail && left.preparing === right.preparing && left.counts.length === right.counts.length && left.counts.every((value, index) => value.kind === right.counts[index]?.kind && value.count === right.counts[index].count);
}
function sameMembers(left, right) {
	return left.length === right.length && left.every((value, index) => value.key === right[index]?.key && value.groupPart === right[index].groupPart);
}
function structureChanged(previous, current) {
	if (!isVisibleChatNode(current) && (previous === void 0 || !isVisibleChatNode(previous))) return false;
	return previous === void 0 || previous.kind !== current.kind || turnOf(previous) !== turnOf(current) || isVisibleChatNode(previous) !== isVisibleChatNode(current) || reasoning(previous) !== reasoning(current) || reply(previous) !== reply(current);
}
function readNode(input, key) {
	const node = input.readNode(key);
	if (node === void 0) throw new Error(`Chat grouping input is missing Node ${key}`);
	return node;
}
function questionReplyIds(input, keys) {
	const ids = /* @__PURE__ */ new Set();
	for (const key of keys) {
		const node = readNode(input, key);
		if (node.kind === "question-reply") ids.add(node.id);
	}
	return ids;
}
/** One group's members and cached summary, refreshed together when its content changes. */
var ProcessGroup = class {
	key;
	turn;
	members;
	nodes = [];
	snapshot;
	constructor(key, turn, members) {
		this.key = key;
		this.turn = turn;
		this.members = members;
		this.snapshot = {
			key,
			members,
			data: {
				turn,
				closed: false,
				summary: {
					counts: [],
					running: void 0,
					runningDetail: ""
				}
			}
		};
	}
	refresh(input, closed) {
		const nodes = this.members.map((member) => readNode(input, member.key));
		const unchanged = nodes.length === this.nodes.length && nodes.every((node, index) => node === this.nodes[index]);
		const previous = this.snapshot.data;
		const activity = unchanged && previous.closed === closed ? previous.summary : processActivity(nodes);
		const summary = closed ? {
			counts: activity.counts,
			running: void 0,
			runningDetail: ""
		} : activity;
		this.nodes = nodes;
		if (previous.closed !== closed || !sameSummary(previous.summary, summary)) this.snapshot = {
			key: this.key,
			members: this.members,
			data: {
				turn: this.turn,
				closed,
				summary
			}
		};
	}
};
/** One Turn's grouping result and member lookup; summaries stay with their groups. */
var TurnGroups = class {
	turn;
	groups = /* @__PURE__ */ new Map();
	membership = /* @__PURE__ */ new Map();
	roots = /* @__PURE__ */ new Map();
	constructor(turn) {
		this.turn = turn;
	}
	references(key) {
		return this.roots.get(key) ?? [];
	}
	snapshots() {
		return [...this.groups.values()].map((group) => group.snapshot);
	}
	refresh(input, changed) {
		const dirty = /* @__PURE__ */ new Set();
		for (const node of changed) {
			const group = this.membership.get(node);
			if (group !== void 0) dirty.add(group);
		}
		const ended = input.timeline.turns.get(this.turn)?.status === "closed";
		if (ended) {
			for (const group of this.groups.values()) if (!group.snapshot.data.closed) dirty.add(group.key);
		}
		const upserts = [];
		for (const key of dirty) {
			const group = this.groups.get(key);
			const previous = group.snapshot;
			group.refresh(input, previous.data.closed || ended);
			if (group.snapshot !== previous) upserts.push(group.snapshot);
		}
		return upserts;
	}
	rebuild(input, added) {
		const roots = /* @__PURE__ */ new Map();
		const groups = /* @__PURE__ */ new Map();
		const membership = /* @__PURE__ */ new Map();
		let pending = [];
		const upserts = [];
		const emit = (key, entry) => {
			roots.set(key, [...roots.get(key) ?? [], entry]);
		};
		const flush = (closed) => {
			const first = pending[0];
			if (first === void 0) return;
			const key = this.extendedGroup(pending, added)?.key ?? brandString(JSON.stringify([
				"process",
				first.key,
				first.groupPart ?? null
			]));
			const previous = this.groups.get(key);
			const before = previous?.snapshot;
			const group = previous !== void 0 && sameMembers(previous.members, pending) ? previous : new ProcessGroup(key, this.turn, pending);
			group.refresh(input, closed || input.timeline.turns.get(this.turn)?.status === "closed");
			groups.set(group.key, group);
			emit(first.key, {
				kind: "group",
				key: group.key
			});
			for (const member of pending) membership.set(member.key, group.key);
			if (group.snapshot !== before) upserts.push(group.snapshot);
			pending = [];
		};
		let previous;
		let followed = false;
		const keys = input.readTurn(this.turn);
		const replies = questionReplyIds(input, keys);
		for (const key of keys) {
			const position = readPosition(input, key);
			if (previous !== void 0 && position.previous !== previous) flush(true);
			previous = key;
			followed = position.next !== void 0;
			const node = readNode(input, key);
			if (node.kind === "turn-trigger" && replies.has(node.id)) continue;
			if (INDEPENDENT.has(node.kind)) {
				flush(true);
				emit(key, {
					kind: "node",
					key
				});
			} else if (node.kind === "turn-process") emit(pending[0]?.key ?? key, {
				kind: "node",
				key
			});
			else if (node.kind === "assistant-step") {
				if (reasoning(node)) pending.push({
					kind: "node",
					key,
					groupPart: "reasoning"
				});
				if (reply(node)) {
					flush(true);
					emit(key, {
						kind: "node",
						key,
						groupPart: "response"
					});
				}
			} else pending.push({
				kind: "node",
				key
			});
		}
		flush(followed);
		const removes = [...this.groups.keys()].filter((key) => !groups.has(key));
		this.groups = groups;
		this.membership = membership;
		this.roots = roots;
		return {
			upserts,
			removes
		};
	}
	extendedGroup(members, added) {
		const offset = members.findIndex((member) => !added.has(member.key));
		const first = members[offset];
		if (first === void 0) return void 0;
		const key = this.membership.get(first.key);
		const previous = key === void 0 ? void 0 : this.groups.get(key);
		if (previous === void 0 || offset + previous.members.length > members.length) return void 0;
		for (let index = 0; index < previous.members.length; index++) {
			const before = previous.members[index];
			const after = members[offset + index];
			if (before.key !== after.key || before.groupPart !== after.groupPart) return void 0;
		}
		for (let index = offset + previous.members.length; index < members.length; index++) if (!added.has(members[index].key)) return void 0;
		return previous;
	}
};
function readPosition(input, key) {
	const position = input.readPosition(key);
	if (position === void 0) throw new Error(`Chat grouping order is missing position for Node ${key}`);
	return position;
}
/** Session-local Turn results; ordinary updates never read other Turns' Node contents. */
var ProcessState = class {
	turns = /* @__PURE__ */ new Map();
	order = [];
	pending = null;
	/**
	* Consume one synchronous Builder input without retaining its readers.
	* @param input - projected Node changes, indexed positions, and Turn lifecycle.
	*/
	accept(input) {
		if (input.kind === "replace") {
			const previousKeys = new Set(this.order);
			const added = new Set(input.order.filter((key) => !previousKeys.has(key)));
			const turns = /* @__PURE__ */ new Map();
			for (const key of input.order) {
				const turn = readPosition(input, key).turn;
				if (turn === void 0 || turns.has(turn)) continue;
				const groups = this.turns.get(turn) ?? new TurnGroups(turn);
				groups.rebuild(input, added);
				turns.set(turn, groups);
			}
			this.turns = turns;
			this.order = input.order;
			this.pending = {
				entries: this.rootEntries(input),
				groups: {
					kind: "replace",
					snapshots: [...turns.values()].flatMap((turn) => turn.snapshots())
				}
			};
			return;
		}
		const regroup = new Set(input.changedTurnOrders);
		const added = /* @__PURE__ */ new Set();
		const changed = /* @__PURE__ */ new Map();
		const touch = (turn) => {
			let keys = changed.get(turn);
			if (keys === void 0) {
				keys = /* @__PURE__ */ new Set();
				changed.set(turn, keys);
			}
			return keys;
		};
		for (const change of input.changes) {
			const before = change.previous;
			const after = change.current;
			const turn = turnOf(after);
			if (before === void 0 || !isVisibleChatNode(before)) added.add(after.key);
			if (structureChanged(before, after)) {
				const previousTurn = before === void 0 ? void 0 : turnOf(before);
				if (previousTurn !== void 0) regroup.add(previousTurn);
				if (turn !== void 0) regroup.add(turn);
			}
			if (turn !== void 0) touch(turn).add(after.key);
		}
		for (const turn of input.changedTurns) touch(turn);
		const upserts = [];
		const removes = [];
		for (const turn of regroup) {
			const groups = this.turns.get(turn) ?? new TurnGroups(turn);
			const update = groups.rebuild(input, added);
			upserts.push(...update.upserts);
			removes.push(...update.removes);
			if (input.readTurn(turn).length === 0) this.turns.delete(turn);
			else this.turns.set(turn, groups);
		}
		for (const [turn, keys] of changed) if (!regroup.has(turn)) upserts.push(...this.turns.get(turn)?.refresh(input, keys) ?? []);
		const reordered = input.order !== this.order || regroup.size > 0;
		this.order = input.order;
		const installed = new Set(upserts.map((group) => group.key));
		this.pending = reordered || upserts.length > 0 || removes.length > 0 ? {
			...reordered ? { entries: this.rootEntries(input) } : {},
			groups: {
				kind: "apply",
				upserts,
				removes: removes.filter((key) => !installed.has(key))
			}
		} : null;
	}
	rootEntries(input) {
		const replies = questionReplyIds(input, input.order.filter((key) => readPosition(input, key).turn === void 0));
		return input.order.flatMap((key) => {
			const turn = readPosition(input, key).turn;
			if (turn === void 0) {
				const node = readNode(input, key);
				return node.kind === "turn-trigger" && replies.has(node.id) ? [] : [{
					kind: "node",
					key
				}];
			}
			const groups = this.turns.get(turn);
			if (groups === void 0) throw new Error(`Chat grouping order is missing Turn ${turn}`);
			return groups.references(key);
		});
	}
	/**
	* Read pending output without advancing State.
	* @returns the repeatable update for the last input batch.
	*/
	output() {
		return this.pending;
	}
};
/** Chat's registered business grouping; presentation modes never enter its State. */
const processGroupDefinition = {
	kind: "process-groups",
	target: "chat",
	create: () => new ProcessState(),
	update: (context, input) => {
		context.state.accept(input);
		return context.state;
	},
	buildGroups: (context) => context.state.output()
};

export { ProcessState, processGroupDefinition };
