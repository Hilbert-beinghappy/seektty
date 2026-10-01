import { assistantDefinition } from "../../../ui-chat-process/assistant.js";
export { assistantDefinition };
/** Native rc.2 Definition; adapt only the earlier vendored registry service address. */
export function registerAssistantConversationNode(ctx) {
    ctx.conversationEvents.register(assistantDefinition);
}
