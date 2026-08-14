/**
 * Turn-scoped produced-file Definition and readers. Client-only and
 * model-free: the vocabulary is the mutation tools' own follow-along
 * `locations`, never the closing prose.
 */
import type { ConversationNodeDefinition, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client';
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
interface ProducedPath {
    readonly seq: number;
    readonly path: string;
}
/** Immutable produced-file facts published against one Turn. */
export interface DeliverablesTurnData {
    readonly produced: readonly ProducedPath[];
}
declare module '@deepseek-ai/dsh-client-runtime/client' {
    interface ConversationTurnDataMap {
        /** Successful mutation paths accumulated in this Turn. */
        deliverables: DeliverablesTurnData;
    }
}
interface DeliverablesState extends DeliverablesTurnData {
    readonly turn: number;
    readonly calls: ReadonlyMap<string, ToolResultNode['callView']>;
}
/**
 * Files produced by one Turn data value.
 *
 * The source is the mutation tools' own follow-along `locations`, not the
 * closing prose: a produced file must be listed whether or not the model
 * remembered to name it. A mutation is recognized by render intent, not by
 * tool name — a diff card, or a generic card whose `kind` is `edit` (the shape
 * `str_replace_editor`'s insert presents) — so a new mutation tool joins by
 * declaring what it does. Reads contribute nothing (looking at a file does not
 * produce it), and neither do deletes (there is nothing left to open) or
 * failed calls. Paths keep first-seen order and appear once, so a file written
 * and then edited in the same turn is one entry.
 *
 * The Conversation Location index owns turn membership before this function
 * runs, so paths cannot spill across turns and this derivation does not infer
 * boundaries from neighboring presentation Nodes.
 * @param data - engine-published Deliverables data for one Turn.
 * @param seq - closing Assistant seq; later Tool settlements are excluded.
 * @returns Produced paths in first-seen order; empty when the turn wrote nothing.
 */
export declare function producedForClosing(data: Readonly<DeliverablesTurnData> | undefined, seq?: number): readonly string[];
/**
 * Claim the turn-tail chain only when its closing turn produced files.
 * @param owner - Turn-tail owner currency for the closing assistant.
 * @returns Produced paths as the component's match, or null to decline before mount.
 */
export declare function selectProducedFiles(owner: TurnTailOwnerProps): readonly string[] | null;
/** Turn-local successful mutation accumulator; it publishes no view Node. */
export declare const deliverablesDefinition: ConversationNodeDefinition<DeliverablesState>;
/**
 * Trailing path segment, the part that identifies the file at a glance.
 * @param path - Slash- or backslash-separated path.
 * @returns The final segment, or the whole string when separator-free.
 */
export declare function basename(path: string): string;
/**
 * File-mention vocabulary over one turn's produced paths, for the closing
 * message's prose: an inline-code token opens the file it names. A token
 * resolves by exact path, or by being exactly the basename of exactly one
 * produced path — a basename two paths share stays inert rather than
 * guessing, so a mention link can never open the wrong file or 404.
 * @param paths - The turn's produced paths (tool order, already deduped).
 * @param openFile - The chat view's file opener.
 * @param label - Localizes the accessible open-label for a resolved path.
 * @returns The resolver MarkdownText consumes; the full path rides `title`,
 * the same disambiguator the row's chips carry.
 */
export declare function producedFileMentions(paths: readonly string[], openFile: (path: string) => void, label: (path: string) => string): MarkdownFileMentions;
export {};
//# sourceMappingURL=turn-deliverables.d.ts.map