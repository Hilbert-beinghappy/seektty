/** Thrown when a retained renderSlot binding is invoked after its declaring entry was disposed. */
export class StaleAuthorizationError extends Error {
}
/**
 * Thrown when a renderSlot binding is invoked for a key outside its entry's
 * children declaration (plain-JS backstop; typed callers are narrowed
 * statically).
 */
export class SlotOwnershipError extends Error {
}
//# sourceMappingURL=renderer.js.map