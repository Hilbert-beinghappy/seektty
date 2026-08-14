/** Platform-neutral Goal conversation projection registration. */
import { goalCommandInputDefinition } from "./goal-command-input.js";
/**
 * Register Goal-owned conversation nodes without loading the Web renderer.
 * @param ctx - Client Runtime context receiving the shared Definition.
 */
export function registerGoalProjection(ctx) {
    ctx.conversationEvents.register(goalCommandInputDefinition);
}
//# sourceMappingURL=projection.js.map