/** Platform-neutral Trajectory projection registration. */
import { registerTrajectoryAssistantDefinition } from "./trajectory-assistant-definition.js";
import { registerTrajectoryCompactionDefinitions } from "./trajectory-compaction-definition.js";
import { registerTrajectoryMessageDefinitions } from "./trajectory-message-definitions.js";
import { registerTrajectoryRequestHeaderDefinition } from "./trajectory-request-header-definition.js";
import { registerTrajectoryConversationView } from "./trajectory-snapshot-builder.js";
import { registerTrajectoryToolDefinition } from "./trajectory-tool-definition.js";
/**
 * Register the complete Trajectory target without loading its Web renderer.
 * @param ctx - Client Runtime context receiving the shared Definitions and view.
 */
export function registerTrajectoryProjection(ctx) {
    registerTrajectoryMessageDefinitions(ctx);
    registerTrajectoryRequestHeaderDefinition(ctx);
    registerTrajectoryAssistantDefinition(ctx);
    registerTrajectoryToolDefinition(ctx);
    registerTrajectoryCompactionDefinitions(ctx);
    registerTrajectoryConversationView(ctx);
}
//# sourceMappingURL=projection.js.map