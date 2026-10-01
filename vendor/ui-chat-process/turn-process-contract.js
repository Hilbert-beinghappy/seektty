// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
const TURN_PROCESS_INDEPENDENT_KINDS = new Set([
	"system-prompt",
	"user",
	"steering",
	"turn-trigger",
	"turn-process",
	"turn-error",
	"turn-max-tokens",
	"turn-tail"
]);
/**
* Compare immutable Turn-process specifications by their published fields.
* @param left - previous specification.
* @param right - next specification.
* @returns whether both values describe the same process presentation.
*/
function sameTurnProcessSpec(left, right) {
	return left.turn === right.turn && left.controlAnchorSeq === right.controlAnchorSeq && left.processStartSeq === right.processStartSeq && left.answerAnchorSeq === right.answerAnchorSeq && left.answerStep === right.answerStep && left.inlineReasoning === right.inlineReasoning && left.messageCount === right.messageCount && left.toolCallCount === right.toolCallCount && left.subagentCount === right.subagentCount;
}
/**
* Recognize the shipped subagent delegation name and its configured variants.
* Control tools use distinct names such as `send_message` and `list_agents`.
* @param name - durable Tool-call name.
* @returns whether the call creates or forks a subagent.
*/
function isSubagentDelegationTool(name) {
	return name === "subagent" || name.startsWith("subagent_");
}

export { TURN_PROCESS_INDEPENDENT_KINDS, sameTurnProcessSpec, isSubagentDelegationTool };
