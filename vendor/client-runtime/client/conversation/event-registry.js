import { ConversationDefinitionRegistry } from "./definition-registry.js";
/** Runtime registry of independently owned Conversation business Definitions. */
export class ConversationEventRegistry extends ConversationDefinitionRegistry {
    fallback;
    /** @param ctx - owning Client Runtime context. */
    constructor(ctx) {
        super(ctx, 'conversationEvents');
    }
    /**
     * Register a uniquely named business Definition for the caller's lifetime.
     * @param definition - Definition contribution.
     * @returns idempotent disposer.
     */
    register(definition) {
        assertDefinitionTarget(definition);
        return this.registerDefinition(definition.kind, definition, `conversation Definition "${definition.kind}" is already registered`, `conversationEvents.register(${JSON.stringify(definition.kind)})`);
    }
    /**
     * Register the sole fallback used only when no ordinary Definition matches.
     * @param definition - fallback Definition.
     * @returns idempotent disposer.
     */
    registerFallback(definition) {
        assertDefinitionTarget(definition);
        const target = definition.target;
        if (target === undefined)
            throw new Error('conversation fallback Definition must declare a target');
        if (this.fallback !== undefined)
            throw new Error('conversation fallback Definition is already registered');
        const owner = this.ctx;
        const dispose = owner.effect(() => {
            this.fallback = definition;
            this.refresh();
            return () => {
                if (this.fallback !== definition)
                    return;
                this.fallback = undefined;
                this.refresh();
            };
        }, `conversationEvents.registerFallback(${JSON.stringify(definition.kind)})`);
        return () => { void dispose(); };
    }
    /**
     * Return the current unmatched-event fallback.
     * @returns installed fallback, when present.
     */
    fallbackEntry() {
        return this.fallback;
    }
}
function assertDefinitionTarget(definition) {
    if ((definition.target === undefined) !== (definition.buildViewNode === undefined)) {
        throw new Error(`conversation Definition "${definition.kind}" must declare target and buildViewNode together`);
    }
}
//# sourceMappingURL=event-registry.js.map