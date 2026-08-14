import { SlotRegistry } from "./slots.js";
import { SessionRuntime } from "./sessions/service.js";
import { WorkspaceRuntime } from "./workspaces/service.js";
import { ConversationEventRegistry } from "./conversation/event-registry.js";
import { ConversationViewRegistry } from "./conversation/view-registry.js";
export { isAppendSurfaceEvent, isReplacementSurfaceEvent } from '@deepseek-ai/dsh-session/surface';
export { SlotRegistry } from "./slots.js";
export { ConversationEventRegistry } from "./conversation/event-registry.js";
export { ConversationViewRegistry } from "./conversation/view-registry.js";
export { ConversationNodeAssembler } from "./sessions/conversation-assembler.js";
export { ConversationLocationIndex } from "./sessions/conversation-location-index.js";
export { conversationContextKey } from "./contract/conversation.js";
export { SessionCreateError, SessionRuntime, scopeOf, workspaceTitleOf } from "./sessions/service.js";
export { indexSubagentDescendants } from "./sessions/subagent-lineage.js";
// The provide channel is shared with the client test runtime (one
// materialization/projection implementation; no test-side mirror to drift).
export { SessionProvideChannel } from "./sessions/provide.js";
export { createScope } from "./agents/scope.js";
export { DirectoryBrowseError, WorkspaceCreateError, WorkspaceRuntime } from "./workspaces/service.js";
export { resolveWorkspacePath } from "./workspaces/path.js";
// Runtime owns the snapshot store; web-react only binds it to React.
export { createSnapshotStore, defineStore, shallowEqual } from "./contract/store.js";
export { EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, toAssistantBlock, toAssistantBlocks, } from "./sessions/conversation.js";
export { emptyAssistantBlock } from "./sessions/partial.js";
export { isTokenDelta } from "./sessions/assistant-timing.js";
export { contextForm, contextProvenance } from "./sessions/context-provenance.js";
export { displayFailureMessage } from "./sessions/failure-display.js";
export { PendingWait } from "./sessions/pending.js";
/** Required services: the wire handle and Client Typert registry. */
export const inject = ['connection', 'typert', 'remote', 'remote.commands'];
/** Mounts the browser runtime services and connection stream.
 * @param ctx - Client Cordis context.
 * @param config - optional Surface startup policy.
 */
export function apply(ctx, config = {}) {
    ctx.plugin(SlotRegistry);
    const conversation = {
        events: new ConversationEventRegistry(ctx),
        views: new ConversationViewRegistry(ctx),
    };
    const connection = ctx.get('connection');
    // Capture the mounted service while the plugin is active. A final host frame
    // can already be queued when Cordis begins unloading sibling services; a
    // late `ctx.remote` lookup would then throw instead of harmlessly dispatching
    // through the service instance owned by this runtime generation.
    const remote = ctx.remote;
    const sessions = new SessionRuntime(ctx, connection.api, ctx.remote, conversation);
    ctx.typert.contexts.registerClient('agent', {
        identity: candidate => sessions.scopeOf(candidate),
    });
    const workspaces = new WorkspaceRuntime(ctx, connection.api, sessions);
    if (config.initialSelection !== false) {
        ctx.effect(() => workspaces.startInitialSelection(), 'runtime: initial Workspace selection');
    }
    const loop = connection.start({
        onMuxEnvelope: (envelope) => {
            sessions.handleMuxEnvelope(envelope);
        },
        onHostEnvelope: (envelope) => {
            sessions.handleHostEnvelope(envelope);
            workspaces.handleHostEnvelope(envelope);
            // Forwarded-event bridge: the session layer ignores registry frames (no
            // session routing). This plugin owns the frame sink, so it hands the
            // decoded frame straight to the Remote service, which fans it out to
            // `ctx.remote.$on` subscribers; no consumer reads a frame.
            const frame = envelope.payload;
            if (frame.type === 'host/remote-event')
                remote.$dispatch(frame.event, frame.args);
        },
        onConnected: () => {
            sessions.handleConnected();
            workspaces.handleConnected();
            ctx.emit('connection/reset');
        },
        onStateChange: (state) => {
            // Generation death fires before any next-generation frame can arrive
            // (reconnect replays flow from stream open, ahead of onConnected):
            // the only safe moment to drop generation-scoped interaction state.
            if (state === 'reconnecting') {
                sessions.handleDisconnected();
            }
        },
    });
    ctx.effect(() => () => { loop.stop(); }, 'runtime: connection stream loop');
}
//# sourceMappingURL=index.js.map