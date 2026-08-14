/** Platform-neutral Workflow Run conversation projection registration. */
import type { Context } from '@deepseek-ai/cordis';
export type { WorkflowRunChatData, WorkflowRunMemberData, WorkflowRunPhaseData, WorkflowRunStatus, } from './workflow-definition.ts';
/**
 * Register durable Workflow Run nodes without loading the Web renderer.
 * @param ctx - Client Runtime context receiving the shared Definition.
 */
export declare function registerWorkflowRunProjection(ctx: Context): void;
//# sourceMappingURL=projection.d.ts.map