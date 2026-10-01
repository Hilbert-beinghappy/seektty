// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
import { toAssistantBlocks } from "../client-runtime/client/sessions/conversation.js";
import { chatNode, CHAT_SYNTHETIC_SEQ_OFFSETS } from "../ui-conversation/client/conversation-nodes/common.js";
import { hasAssistantReplyContent } from "./assistant-content.js";
import { sameTurnProcessSpec, isSubagentDelegationTool } from "./turn-process-contract.js";
//#region lib/types/client/conversation-nodes/turn-process.js
function eventTurn(event) {
	const data = event.data;
	return typeof data.turn === "number" ? data.turn : void 0;
}
function visibleChunk(chunk) {
	if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") return chunk.text.trim() !== "";
	if (chunk.type === "block-start") return chunk.blockType !== "text" && chunk.blockType !== "reasoning" && chunk.blockType !== "tool-call";
	if (chunk.type !== "block-end") return false;
	const block = chunk.block;
	if (block.type === "tool-call") return false;
	if (block.type === "text" || block.type === "reasoning") return block.text.trim() !== "";
	return true;
}
function visibleAssistantEvent(event) {
	if (event.type === "assistant/live-chunk") return visibleChunk(event.data.chunk);
	if (event.type === "assistant/attempt") return false;
	return event.type === "assistant/message" && event.surfaceOp === "append" && toAssistantBlocks(event.data.message.content).some((block) => {
		if (block.kind === "tool-call") return false;
		if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
		return true;
	});
}
function processEvidence(event) {
	if (visibleAssistantEvent(event)) {
		if (event.type !== "assistant/live-chunk" && event.type !== "assistant/message" && event.type !== "assistant/attempt") return void 0;
		return {
			kind: "assistant",
			seq: event.seq,
			step: event.data.step
		};
	}
	if (event.type === "tool/call" || event.type === "tool/result" && event.surfaceOp === "append" || event.type === "llm/retry") return {
		kind: "other",
		seq: event.seq
	};
}
function turnLocation$1(context) {
	const location = context.start?.location ?? context.matches.at(-1)?.location;
	return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
}
function fallbackState(context) {
	const turn = context.matches.map((match) => eventTurn(match.event)).find((candidate) => candidate !== void 0);
	if (turn === void 0) return void 0;
	let state = {
		turn,
		assistantStartByStep: /* @__PURE__ */ new Map(),
		messageCountByStep: /* @__PURE__ */ new Map(),
		messageCount: 0,
		toolCallCount: 0,
		subagentCount: 0
	};
	for (const match of context.matches) state = updateProcessState(state, match.event);
	return state;
}
function isFinalAssistant(data) {
	return data?.finalNode !== void 0;
}
function latestAnswer(turn) {
	const data = turn.steps.at(-1)?.data.get("assistant-step");
	if (!isFinalAssistant(data) || !hasAssistantReplyContent(data.blocks)) return null;
	return data.blocks.some((block) => block.kind === "tool-call") ? null : data;
}
function processSpec(state, turn) {
	const controlAnchorSeq = state.controlAnchorSeq ?? turn.start?.seq;
	if (controlAnchorSeq === void 0) return null;
	const answer = latestAnswer(turn);
	const counts = {
		messageCount: answer === null ? state.messageCount : [...state.messageCountByStep].filter(([step]) => step < answer.step).reduce((total, [, count]) => total + count, 0),
		toolCallCount: state.toolCallCount,
		subagentCount: state.subagentCount
	};
	if (answer === null) return {
		turn: turn.turn,
		controlAnchorSeq,
		processStartSeq: controlAnchorSeq,
		answerAnchorSeq: null,
		answerStep: null,
		inlineReasoning: false,
		...counts
	};
	const inlineReasoning = answer.blocks.some((block) => block.kind === "reasoning" && block.text.trim() !== "");
	const earlierAssistantSeq = Math.min(...[...state.assistantStartByStep].filter(([step]) => step < answer.step).map(([, seq]) => seq));
	const externalProcessSeq = Math.min(state.otherStartSeq ?? Number.POSITIVE_INFINITY, earlierAssistantSeq);
	return {
		turn: turn.turn,
		controlAnchorSeq,
		processStartSeq: turn.start?.seq ?? (Number.isFinite(externalProcessSeq) ? externalProcessSeq : answer.finalNode.seq),
		answerAnchorSeq: answer.finalNode.seq,
		answerStep: answer.step,
		inlineReasoning,
		...counts
	};
}
function updateProcessState(state, event) {
	let current = state;
	if (event.type === "assistant/message" && event.surfaceOp === "append" && hasAssistantReplyContent(toAssistantBlocks(event.data.message.content))) {
		const messageCountByStep = new Map(current.messageCountByStep);
		messageCountByStep.set(event.data.step, (messageCountByStep.get(event.data.step) ?? 0) + 1);
		current = {
			...current,
			messageCountByStep,
			messageCount: current.messageCount + 1
		};
	}
	if (event.type === "tool/call") {
		const subagent = isSubagentDelegationTool(event.data.name);
		current = {
			...current,
			toolCallCount: current.toolCallCount + (subagent ? 0 : 1),
			subagentCount: current.subagentCount + (subagent ? 1 : 0)
		};
	}
	const evidence = processEvidence(event);
	if (evidence === void 0) return current;
	if (evidence.kind === "other") return current.otherStartSeq === void 0 ? {
		...current,
		otherStartSeq: evidence.seq,
		controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq)
	} : current;
	if (current.assistantStartByStep.has(evidence.step)) return current;
	const assistantStartByStep = new Map(current.assistantStartByStep);
	assistantStartByStep.set(evidence.step, evidence.seq);
	return {
		...current,
		assistantStartByStep,
		controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq)
	};
}
/** Turn-scoped process range and answer-boundary Definition. */
const turnProcessDefinition = {
	kind: "turn-process",
	target: "chat",
	match: (event) => {
		if (event.type === "turn/start") return {
			id: String(event.data.turn),
			role: "start"
		};
		const turn = eventTurn(event);
		if (turn === void 0) return null;
		if (event.type === "assistant/live-chunk" || event.type === "assistant/message" || event.type === "tool/call" || event.type === "tool/result" || event.type === "llm/retry" || event.type === "step/start" || event.type === "step/end" || event.type === "turn/end") return {
			id: String(turn),
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "turn/start") throw new Error("turn-process start requires turn/start");
		return {
			turn: match.event.data.turn,
			assistantStartByStep: /* @__PURE__ */ new Map(),
			messageCountByStep: /* @__PURE__ */ new Map(),
			messageCount: 0,
			toolCallCount: 0,
			subagentCount: 0
		};
	},
	update: (context, match) => updateProcessState(context.state, match.event),
	publication: (match) => {
		if (match.event.type === "assistant/live-chunk") {
			const type = match.event.data.chunk.type;
			return type === "usage" || type === "finish" ? "none" : "animation-frame";
		}
		return "immediate";
	},
	buildLocationData: (context, scope, previous) => {
		if (scope !== "turn") return null;
		const state = context.state ?? fallbackState(context);
		if (state === void 0) return null;
		const turn = turnLocation$1(context);
		if (turn === void 0) return null;
		const current = context.current.get("chat");
		const latestStep = turn.steps.at(-1);
		if (previous?.kind === "turn" && previous.key === "turn-process" && current?.kind === "turn-process" && current.data.answerAnchorSeq === null && current.data.controlAnchorSeq === state.controlAnchorSeq && current.data.messageCount === state.messageCount && current.data.toolCallCount === state.toolCallCount && current.data.subagentCount === state.subagentCount && turn.status !== "closed" && latestStep?.status !== "closed") return previous;
		const spec = processSpec(state, turn);
		if (spec === null) return null;
		if (previous?.kind === "turn" && previous.turn === spec.turn && previous.key === "turn-process" && sameTurnProcessSpec(previous.value, spec)) return previous;
		return {
			kind: "turn",
			turn: turn.turn,
			key: "turn-process",
			value: spec
		};
	},
	buildViewNode: (context) => {
		const turn = turnLocation$1(context);
		const data = turn?.data.get("turn-process");
		if (turn === void 0 || data === void 0) return null;
		const current = context.current.get("chat");
		const state = context.state;
		if (current?.kind === "turn-process" && state !== void 0 && current.data.answerAnchorSeq === null && current.data.controlAnchorSeq === state.controlAnchorSeq && current.data.messageCount === state.messageCount && current.data.toolCallCount === state.toolCallCount && current.data.subagentCount === state.subagentCount && turn.status !== "closed" && turn.steps.at(-1)?.status !== "closed" && current.location === (context.start?.location ?? context.matches[0]?.location)) return current;
		return chatNode(context, "turn-process", data.controlAnchorSeq + CHAT_SYNTHETIC_SEQ_OFFSETS.processControl, data);
	}
};
/**
* Register the Turn-scoped process disclosure projection.
* @param ctx - owning UI Conversation context.
*/
function registerTurnProcess(ctx) {
	ctx.uiConversation.events.register(turnProcessDefinition);
}

export { turnProcessDefinition, registerTurnProcess };
