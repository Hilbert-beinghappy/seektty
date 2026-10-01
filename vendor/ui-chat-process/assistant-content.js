// Native published dsh-client-ui-chat 0.2.0-rc.2 pure projection; see provenance.json and LICENSE.
//#region lib/types/client/contract/assistant-content.js
/**
* Test whether Assistant blocks contain a user-facing reply rather than only
* reasoning or Tool-call protocol material.
* @param blocks - Assistant content blocks.
* @returns whether the blocks contain visible reply content.
*/
function hasAssistantReplyContent(blocks) {
	return blocks.some((block) => {
		if (block.kind === "reasoning" || block.kind === "tool-call") return false;
		if (block.kind === "text") return block.text.trim() !== "";
		return true;
	});
}

export { hasAssistantReplyContent };
