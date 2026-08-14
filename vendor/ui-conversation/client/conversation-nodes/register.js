import { registerAssistantConversationNode } from "./assistant.js";
import { registerChatConversationView } from "./chat-snapshot-builder.js";
import { registerCommandConversationNode } from "./command.js";
import { registerCompactionConversationNode } from "./compaction.js";
import { registerUnknownConversationFallback } from "./fallback.js";
import { registerInboxConversationNodes } from "./inbox.js";
import { registerMessageConversationNode } from "./message.js";
import { registerRetryConversationNode } from "./retry.js";
import { registerToolConversationNode } from "./tool.js";
import { registerTurnErrorConversationNode } from "./turn-error.js";
import { registerTurnMaxTokensConversationNode } from "./turn-max-tokens.js";
import { registerTurnTailConversationNode } from "./turn-tail.js";
/**
 * Register the Chat business Definitions and target builder contributed by this package.
 * @param ctx - owning UI Conversation context.
 */
export function registerConversationNodes(ctx) {
    registerInboxConversationNodes(ctx);
    registerMessageConversationNode(ctx);
    registerAssistantConversationNode(ctx);
    registerToolConversationNode(ctx);
    registerCommandConversationNode(ctx);
    registerCompactionConversationNode(ctx);
    registerRetryConversationNode(ctx);
    registerTurnErrorConversationNode(ctx);
    registerTurnMaxTokensConversationNode(ctx);
    registerTurnTailConversationNode(ctx);
    registerUnknownConversationFallback(ctx);
    registerChatConversationView(ctx);
}
//# sourceMappingURL=register.js.map