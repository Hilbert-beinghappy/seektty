// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
//#region lib/types/client/contract/chat-visibility.js
/**
* Exclude system prompts, ordinary Context, and permission commands from visible Chat rows.
* Context containing tool changes retains its notice row.
* @param node - projected Chat node.
* @returns whether the node contributes a visible Chat row.
*/
function isVisibleChatNode(node) {
	return node.visibility === "visible" && node.kind !== "system-prompt" && (node.kind !== "context" || node.data.content.some((block) => block.type === "tool-addition" || block.type === "tool-removal")) && !(node.kind === "command" && node.data.name === "permission");
}

export { isVisibleChatNode };
