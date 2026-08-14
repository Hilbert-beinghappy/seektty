import { ProducedFiles } from "./ProducedFiles.js";
import { en, NS, zh } from "./locales.js";
import { deliverablesDefinition, producedFileMentions, selectProducedFiles, } from "./turn-deliverables.js";
export { ProducedFiles } from "./ProducedFiles.js";
export { producedForClosing } from "./turn-deliverables.js";
/** Required services for the tail-slot registration and its dictionaries. */
export const inject = ['slots', 'locale', 'conversationEvents', 'connection'];
/**
 * Client plugin body: register the dictionaries and the turn-tail entry.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const connection = ctx.get('connection');
    ctx.conversationEvents.register(deliverablesDefinition);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deliverables: dictionaries');
    ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        select: selectProducedFiles,
        locale: NS,
        inject: () => ({
            isLoopback: connection.isLoopback,
            hooks: { hostDescription: connection.hostDescription },
        }),
    }, ProducedFiles));
    // The prose side of the same vocabulary: the chat view reaches this face
    // via ctx.get, so its absence — this plugin composed out — is the off state.
    const t = ctx.locale.bind(NS);
    const mentions = {
        forClosing(owner) {
            // Same claim test the turn-tail chain entry runs: no produced files,
            // no vocabulary — the two surfaces agree by construction.
            const paths = selectProducedFiles(owner);
            if (paths === null)
                return undefined;
            return producedFileMentions(paths, owner.openFile, path => t('produced.open', { name: path }));
        },
    };
    ctx.provide('chatFileMentions', mentions);
}
//# sourceMappingURL=index.js.map