/** Platform-neutral Workflow Run conversation projection registration. */
import { workflowRunDefinition } from "./workflow-definition.js";
/**
 * Register durable Workflow Run nodes without loading the Web renderer.
 * @param ctx - Client Runtime context receiving the shared Definition.
 */
export function registerWorkflowRunProjection(ctx) {
    ctx.conversationEvents.register(workflowRunDefinition);
}
//# sourceMappingURL=projection.js.map