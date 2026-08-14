/**
 * GoalBar's injected face. The target 'conversation.input.dock' slot is
 * declared (children table) and typed by ui-conversation; this package only
 * contributes the entry, so no SlotMap merge lives here. The live goal value
 * is NOT part of this face — it arrives through `useProjection('goal')`
 * (the framework standard kit); inject carries only the mutation verbs
 * (callbacks from inject, live state from useProjection).
 */
export {};
//# sourceMappingURL=slots.js.map