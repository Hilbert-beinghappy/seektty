/** Platform-neutral Deliverables turn projection registration. */
import { deliverablesDefinition } from "./turn-deliverables.js";
export { producedForClosing } from "./turn-deliverables.js";
/**
 * Register produced-file turn facts without loading the Web renderer.
 * @param ctx - Client Runtime context receiving the shared Definition.
 */
export function registerDeliverablesProjection(ctx) {
    ctx.conversationEvents.register(deliverablesDefinition);
}
//# sourceMappingURL=projection.js.map