/**
 * Build a stable collision-free key for one Definition-local business identity.
 * @param kind - Definition kind.
 * @param id - Definition-local business identity.
 * @returns engine-owned Context key.
 */
export function conversationContextKey(kind, id) {
    return `${kind.length}:${kind}${id}`;
}
//# sourceMappingURL=conversation.js.map