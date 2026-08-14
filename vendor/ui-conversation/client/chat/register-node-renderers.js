import { NS } from "../locales.js";
import { AssistantNodeView } from "./AssistantNodeView.js";
import { CommandNodeView, ManualCompactionNodeView } from "./CommandNodeView.js";
import { CompactionNodeView, ContextMessageNodeView, RetryNodeView, TurnErrorNodeView, TurnMaxTokensNodeView, UnknownNodeView, UserMessageNodeView, } from "./MessageItem.js";
import { TurnTailNodeView } from "./TurnTailNodeView.js";
/**
 * Register this package's business renderers behind the keyed Chat Node seat.
 * @param ctx - owning UI Conversation context.
 */
export function registerChatNodeRenderers(ctx) {
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'user', locale: NS }, UserMessageNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'steering', locale: NS }, UserMessageNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'context', locale: NS }, ContextMessageNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'assistant-step', locale: NS }, AssistantNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'command',
        locale: NS,
        children: { 'conversation.chat.commandview': { kind: 'keyed', scope: 'session' } },
    }, CommandNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'manual-compaction', locale: NS }, ManualCompactionNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'compaction', locale: NS }, CompactionNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'model-retry', locale: NS }, RetryNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'turn-error', locale: NS }, TurnErrorNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'turn-max-tokens', locale: NS }, TurnMaxTokensNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'turn-tail',
        locale: NS,
        children: {
            'conversation.chat.turnTail': { kind: 'chain', scope: 'session' },
            'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
        },
    }, TurnTailNodeView));
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'unknown', locale: NS }, UnknownNodeView));
}
//# sourceMappingURL=register-node-renderers.js.map