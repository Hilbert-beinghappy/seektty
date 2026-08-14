import { createTrajectoryDurationStore } from "./duration-store.js";
import { en, NS, zh } from "./locales.js";
import { registerTrajectoryAssistantDefinition } from "./trajectory-assistant-definition.js";
import { registerTrajectoryCompactionDefinitions } from "./trajectory-compaction-definition.js";
import { registerTrajectoryMessageDefinitions } from "./trajectory-message-definitions.js";
import { registerTrajectoryRequestHeaderDefinition } from "./trajectory-request-header-definition.js";
import { registerTrajectoryConversationView } from "./trajectory-snapshot-builder.js";
import { registerTrajectoryToolDefinition } from "./trajectory-tool-definition.js";
import { TrajectoryView } from "./TrajectoryView.js";
/** Required services: the conversation slot, registries, ordinary Session paging, and the locale service. */
export const inject = ['slots', 'conversationEvents', 'conversationViews', 'sessions', 'locale'];
/**
 * Client plugin body: register the trajectory view tab. The registration
 * rides the slot service's effect wrapper, so plugin unload removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-trajectory: dictionaries');
    // Registration-time text (the view tab label) reads through the bound
    // translate as a thunk, so it follows the active locale without
    // re-registration.
    const t = ctx.locale.bind(NS);
    const duration = createTrajectoryDurationStore();
    registerTrajectoryMessageDefinitions(ctx);
    registerTrajectoryRequestHeaderDefinition(ctx);
    registerTrajectoryAssistantDefinition(ctx);
    registerTrajectoryToolDefinition(ctx);
    registerTrajectoryCompactionDefinitions(ctx);
    registerTrajectoryConversationView(ctx);
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'trajectory',
        order: 10,
        locale: NS,
        label: () => t('view.trajectory'),
        inject: (sessionId) => {
            const session = ctx.sessions.binding(sessionId)?.session;
            if (session === undefined) {
                throw new Error(`ui-trajectory: session "${sessionId}" is unavailable`);
            }
            return {
                hooks: { duration },
                loadOlder: async () => {
                    const before = session.getSnapshot().views.get('trajectory');
                    await session.loadOlder();
                    return session.getSnapshot().views.get('trajectory') !== before;
                },
                setActualDuration: (value) => { duration.set(value); },
            };
        },
    }, TrajectoryView));
}
//# sourceMappingURL=index.js.map