import { ConversationDefinitionRegistry } from "./definition-registry.js";
/** Runtime registry of per-target Conversation snapshot builders. */
export class ConversationViewRegistry extends ConversationDefinitionRegistry {
    /** @param ctx - owning Client Runtime context. */
    constructor(ctx) {
        super(ctx, 'conversationViews');
    }
    /**
     * Register a uniquely named view builder factory for the caller's lifetime.
     * @param definition - target builder contribution.
     * @returns idempotent disposer.
     */
    register(definition) {
        return this.registerDefinition(definition.target, definition, `conversation view target "${definition.target}" is already registered`, `conversationViews.register(${JSON.stringify(definition.target)})`);
    }
}
//# sourceMappingURL=view-registry.js.map