/** Browser plugin for durable workflow-run Conversation Nodes. */
import { WorkflowRunPanel } from "./WorkflowRunPanel.js";
import { en, NS, zh } from "./locales.js";
import { workflowRunDefinition } from "./workflow-definition.js";
/** Required services for Definition, keyed renderer, navigation, and copy. */
export const inject = ['conversationEvents', 'slots', 'sessions', 'locale'];
/** Register the workflow Definition, dictionary, and keyed Chat renderer. */
export function apply(ctx) {
    ctx.conversationEvents.register(workflowRunDefinition);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workflow-run: dictionaries');
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'workflow-run',
        locale: NS,
        inject: () => ({
            openSession: (id) => { ctx.sessions.open(id); },
        }),
    }, WorkflowRunPanel));
}
//# sourceMappingURL=index.js.map