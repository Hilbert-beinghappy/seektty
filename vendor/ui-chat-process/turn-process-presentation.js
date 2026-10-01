// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
import { isVisibleChatNode } from "./chat-visibility.js";
import { TURN_PROCESS_INDEPENDENT_KINDS } from "./turn-process-contract.js";
//#region lib/types/client/conversation-nodes/turn-process-presentation.js
function nodeTurn(node) {
	const location = node?.location;
	return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0;
}
function samePresentation(left, right) {
	return left === right || left !== void 0 && right !== void 0 && left.spec === right.spec && left.turn === right.turn && left.turnStarted === right.turnStarted && left.turnClosed === right.turnClosed && left.hasExternalProcess === right.hasExternalProcess && left.hasInterleavedInput === right.hasInterleavedInput && left.compactAnswer === right.compactAnswer;
}
function derivePresentation(turn, locations, nodes) {
	const keys = locations.getTurn(turn);
	const control = keys.map((key) => nodes.get(key)).find((node) => node?.kind === "turn-process");
	if (control === void 0) return void 0;
	const spec = control.data;
	const location = control.location;
	if (location.kind !== "turn" && location.kind !== "step") return void 0;
	let openingHumanAnchor;
	for (const key of keys) {
		const node = nodes.get(key);
		if ((node?.kind === "user" || node?.kind === "steering" || node?.kind === "turn-trigger") && (spec.controlAnchorSeq === location.turn.start?.seq || node.anchorSeq < spec.controlAnchorSeq)) openingHumanAnchor = Math.max(openingHumanAnchor ?? node.anchorSeq, node.anchorSeq);
	}
	let hasExternalProcess = false;
	let hasInterleavedInput = false;
	let compactAnswer = true;
	for (const key of keys) {
		const node = nodes.get(key);
		if (node === void 0 || !isVisibleChatNode(node) || node.kind === "turn-process") continue;
		if ((node.kind === "user" || node.kind === "steering" || node.kind === "turn-trigger") && (openingHumanAnchor === void 0 || node.anchorSeq > openingHumanAnchor)) {
			hasInterleavedInput = true;
			if (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq) compactAnswer = false;
		}
		if (TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind) || node.anchorSeq < spec.processStartSeq || spec.answerAnchorSeq !== null && node.anchorSeq >= spec.answerAnchorSeq) continue;
		if (node.kind !== "assistant-step" || spec.answerStep === null || node.data.step !== spec.answerStep) hasExternalProcess = true;
	}
	return {
		turn,
		spec,
		turnStarted: location.turn.start !== void 0,
		turnClosed: location.turn.status === "closed",
		hasExternalProcess,
		hasInterleavedInput,
		compactAnswer
	};
}
/** Mutable projection of cross-Node process layout facts by Turn. */
var ChatTurnProcessProjector = class {
	presentations = /* @__PURE__ */ new Map();
	/**
	* Read the retained process presentation for a Node's Turn.
	* @param node - Current Chat Node.
	* @returns The Turn's process presentation, when present.
	*/
	get(node) {
		const turn = nodeTurn(node);
		return turn === void 0 ? void 0 : this.presentations.get(turn);
	}
	/**
	* Replace every projected Turn.
	* @param order - visible Chat Node order.
	* @param locations - current Chat Location index.
	* @param nodes - current Chat Node store.
	* @returns Turns whose process presentation changed.
	*/
	replace(order, locations, nodes) {
		const turns = /* @__PURE__ */ new Set();
		for (const key of order) {
			const turn = nodeTurn(nodes.get(key));
			if (turn !== void 0) turns.add(turn);
		}
		const changed = /* @__PURE__ */ new Set();
		for (const turn of new Set([...this.presentations.keys(), ...turns])) if (this.set(turn, turns.has(turn) ? derivePresentation(turn, locations, nodes) : void 0)) changed.add(turn);
		return changed;
	}
	/**
	* Recompute selected Turns after incremental Node changes.
	* @param turns - affected Turn numbers.
	* @param locations - current Chat Location index.
	* @param nodes - current Chat Node store.
	* @returns Turns whose process presentation changed.
	*/
	update(turns, locations, nodes) {
		const changed = /* @__PURE__ */ new Set();
		for (const turn of turns) if (this.set(turn, derivePresentation(turn, locations, nodes))) changed.add(turn);
		return changed;
	}
	set(turn, next) {
		if (samePresentation(this.presentations.get(turn), next)) return false;
		if (next === void 0) this.presentations.delete(turn);
		else this.presentations.set(turn, next);
		return true;
	}
};

export { ChatTurnProcessProjector };
