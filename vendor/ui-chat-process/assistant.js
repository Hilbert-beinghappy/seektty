// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
import { emptyAssistantBlock, isTokenDelta, toAssistantBlock, toAssistantBlocks } from "../client-runtime/client/index.js";
import { chatNode, CHAT_SYNTHETIC_SEQ_OFFSETS } from "../ui-conversation/client/conversation-nodes/common.js";
//#region lib/types/client/conversation-nodes/assistant.js
function initialState(turn, step) {
	return {
		turn,
		step,
		blocks: [],
		visibleBlocks: 0,
		firstVisibleSeq: void 0,
		firstVisibleTime: void 0,
		firstTokenTime: void 0,
		final: void 0,
		usage: void 0
	};
}
function compactBlocks(blocks) {
	return blocks.filter((block) => block !== void 0);
}
function blockIsVisible(block) {
	if (block === void 0 || block.kind === "tool-call") return false;
	if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
	return true;
}
function countVisibleBlocks(blocks) {
	let count = 0;
	for (const block of blocks) if (blockIsVisible(block)) count++;
	return count;
}
function hasVisibleContent(blocks) {
	return blocks.some(blockIsVisible);
}
function hasInterruptionEvidence(blocks) {
	return blocks.some((block) => {
		if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
		return true;
	});
}
function resetForRetry(state) {
	return {
		...initialState(state.turn, state.step),
		firstTokenTime: state.firstTokenTime
	};
}
function updateChunk(state, chunk, seq, time) {
	const blocks = [...state.blocks];
	let changedIndex = -1;
	let previousVisible = false;
	switch (chunk.type) {
		case "block-start":
			changedIndex = chunk.index;
			previousVisible = blockIsVisible(blocks[chunk.index]);
			blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
			break;
		case "text-delta": {
			const previous = blocks[chunk.index];
			changedIndex = chunk.index;
			previousVisible = blockIsVisible(previous);
			blocks[chunk.index] = {
				kind: "text",
				text: (previous?.kind === "text" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "reasoning-delta": {
			const previous = blocks[chunk.index];
			changedIndex = chunk.index;
			previousVisible = blockIsVisible(previous);
			blocks[chunk.index] = {
				kind: "reasoning",
				text: (previous?.kind === "reasoning" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "tool-call-delta": {
			const previous = blocks[chunk.index];
			changedIndex = chunk.index;
			previousVisible = blockIsVisible(previous);
			const base = previous?.kind === "tool-call" ? previous : {
				kind: "tool-call",
				callId: "",
				name: "",
				argsRaw: ""
			};
			blocks[chunk.index] = {
				kind: "tool-call",
				callId: base.callId || String(chunk.id),
				name: chunk.name ?? base.name,
				argsRaw: base.argsRaw + chunk.argumentsDelta
			};
			break;
		}
		case "block-end":
			changedIndex = chunk.index;
			previousVisible = blockIsVisible(blocks[chunk.index]);
			blocks[chunk.index] = toAssistantBlock(chunk.block);
			break;
		case "usage": return {
			...state,
			usage: chunk.usage
		};
		default: return state;
	}
	const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[changedIndex]));
	const firstToken = isTokenDelta(chunk);
	return {
		...state,
		blocks,
		visibleBlocks,
		...visibleBlocks > 0 && state.firstVisibleSeq === void 0 ? {
			firstVisibleSeq: seq,
			firstVisibleTime: time
		} : {},
		...firstToken && state.firstTokenTime === void 0 ? { firstTokenTime: time } : {}
	};
}
function settleMessage(state, match, event) {
	const blocks = toAssistantBlocks(event.data.message.content);
	return {
		...state,
		blocks,
		visibleBlocks: countVisibleBlocks(blocks),
		final: match,
		usage: event.data.usage
	};
}
function closedBoundary(location) {
	if (location.kind === "step" && location.step.status === "closed" && location.step.end !== void 0) return location.step.end;
	if ((location.kind === "step" || location.kind === "turn") && location.turn.status === "closed" && location.turn.end !== void 0) return location.turn.end;
}
function finalNode(state, context) {
	const final = state.final;
	if (final?.event.type === "assistant/message") {
		const event = final.event;
		return {
			kind: "assistant",
			seq: event.seq,
			messageId: event.data.message.id,
			time: event.time,
			turn: state.turn,
			step: state.step,
			blocks: toAssistantBlocks(event.data.message.content),
			usage: event.data.usage,
			timing: {
				stepStartTime: context.start?.event.time ?? null,
				firstTokenTime: state.firstTokenTime ?? null,
				completedTime: event.time
			},
			...event.data.interrupted === true ? { interrupted: true } : {}
		};
	}
	const location = context.start?.location ?? context.matches.at(-1)?.location;
	const boundary = location === void 0 ? void 0 : closedBoundary(location);
	if (boundary === void 0) return void 0;
	const blocks = compactBlocks(state.blocks);
	if (!hasInterruptionEvidence(blocks)) return void 0;
	return {
		kind: "assistant",
		seq: boundary.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedAssistant,
		time: boundary.time,
		turn: state.turn,
		step: state.step,
		blocks,
		interrupted: true
	};
}
function fallbackState$5(context) {
	let state;
	for (const match of context.matches) {
		if (match.event.type === "assistant/live-chunk") {
			state ??= initialState(match.event.data.turn, match.event.data.step);
			state = updateChunk(state, match.event.data.chunk, match.event.seq, match.event.time);
			continue;
		}
		if (match.event.type === "assistant/message") {
			state ??= initialState(match.event.data.turn, match.event.data.step);
			state = settleMessage(state, match, match.event);
			continue;
		}
		if (match.event.type === "llm/retry" && state !== void 0) state = resetForRetry(state);
	}
	return state;
}
function projectAssistant(context) {
	const state = context.state ?? fallbackState$5(context);
	if (state === void 0) return void 0;
	const settled = finalNode(state, context);
	const blocks = settled?.blocks ?? compactBlocks(state.blocks);
	const visible = settled === void 0 ? state.visibleBlocks > 0 : hasVisibleContent(blocks);
	const status = settled?.interrupted === true ? "interrupted" : settled === void 0 ? "running" : "settled";
	const anchorSeq = (settled?.interrupted === true ? settled.seq : state.firstVisibleSeq ?? settled?.seq) ?? context.matches[0]?.event.seq ?? 0;
	const time = settled?.time ?? state.firstVisibleTime ?? context.matches[0]?.event.time ?? 0;
	return {
		anchorSeq,
		visible,
		settled,
		data: {
			status,
			turn: state.turn,
			step: state.step,
			blocks,
			time,
			...state.usage === void 0 ? {} : { usage: state.usage },
			...settled === void 0 ? {} : { finalNode: settled }
		}
	};
}
function publishedAssistantData(context) {
	const location = context.start?.location ?? context.matches.at(-1)?.location;
	return location?.kind === "step" ? location.step.data.get("assistant-step") : void 0;
}
/** Per-step Assistant lifecycle; materialized keys survive cleared stream content as hidden Nodes. */
const assistantDefinition = {
	kind: "assistant-step",
	target: "chat",
	match: (event) => {
		if (event.type === "step/start") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "start"
		};
		if (event.type === "assistant/live-chunk" || event.type === "assistant/message" && event.surfaceOp === "append") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "update"
		};
		if (event.type === "llm/retry") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "step/start") throw new Error("assistant-step start requires step/start");
		return initialState(match.event.data.turn, match.event.data.step);
	},
	update: (context, match) => {
		if (match.event.type === "assistant/live-chunk") return updateChunk(context.state, match.event.data.chunk, match.event.seq, match.event.time);
		if (match.event.type === "assistant/message") return settleMessage(context.state, match, match.event);
		if (match.event.type === "llm/retry") return resetForRetry(context.state);
		return context.state;
	},
	publication: (match) => {
		if (match.event.type === "step/start") return "none";
		if (match.event.type !== "assistant/live-chunk") return "immediate";
		const type = match.event.data.chunk.type;
		return type === "usage" || type === "finish" ? "none" : "animation-frame";
	},
	buildLocationData: (context, scope) => {
		if (scope !== "step") return null;
		const projected = projectAssistant(context);
		if (projected === void 0) return null;
		return {
			kind: "step",
			turn: projected.data.turn,
			step: projected.data.step,
			key: "assistant-step",
			value: projected.data
		};
	},
	buildViewNode: (context) => {
		const current = context.current.get("chat");
		const state = context.state ?? fallbackState$5(context);
		const data = publishedAssistantData(context);
		if (state === void 0 || data === void 0) return current == null ? null : {
			...current,
			visibility: "hidden"
		};
		const settled = data.finalNode;
		const visible = settled === void 0 ? state.visibleBlocks > 0 : hasVisibleContent(data.blocks);
		if (settled === void 0 && !visible && current == null) return null;
		return chatNode(context, "assistant-step", (settled?.interrupted === true ? settled.seq : state.firstVisibleSeq ?? settled?.seq) ?? context.matches[0]?.event.seq ?? 0, data, { visibility: settled?.interrupted === true || visible ? "visible" : "hidden" });
	}
};
/**
* Register the Assistant lifecycle business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerAssistantConversationNode(ctx) {
	ctx.uiConversation.events.register(assistantDefinition);
}

export { assistantDefinition };
