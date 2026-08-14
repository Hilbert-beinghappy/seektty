/** Browser plugin for durable workflow-run Conversation Nodes. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type WorkflowRunKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Durable workflow-run node copy. */
        workflowRun: WorkflowRunKey;
    }
}
/** Required services for Definition, keyed renderer, navigation, and copy. */
export declare const inject: string[];
/** Register the workflow Definition, dictionary, and keyed Chat renderer. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map