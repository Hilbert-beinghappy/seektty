/** Incremental full-text index for the trajectory ledger. */
import { trajectoryRecordId } from "./trajectory-record.js";
import { trajectoryPreviewText } from "./trajectory-preview.js";
function searchableJson(value) {
    if (value === undefined)
        return '';
    try {
        return JSON.stringify(value);
    }
    catch {
        return '';
    }
}
function sameSources(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function markdownPreview(cell) {
    if (cell.previewMarkdown === undefined)
        return '';
    const preview = trajectoryPreviewText(cell.previewMarkdown);
    if (cell.text === '')
        return preview;
    return preview === '' ? cell.text : `${cell.text} · ${preview}`;
}
function resultPreview(cell) {
    return cell.resultPreviewMarkdown === undefined
        ? cell.result ?? ''
        : trajectoryPreviewText(cell.resultPreviewMarkdown);
}
function recordSources(turn, group, cell) {
    const blocks = [
        ...(cell.sourceBlocks ?? []),
        ...(cell.outputBlocks ?? []),
    ];
    return [
        turn === null ? 'between turns' : `turn ${turn}`,
        group,
        cell.kind,
        cell.kind === 'message' ? 'assistant' : '',
        cell.text,
        cell.previewMarkdown ?? '',
        cell.inputDetail ?? '',
        cell.outputDetail ?? '',
        cell.thinkingDetail ?? '',
        cell.schemaDetail ?? '',
        cell.result ?? '',
        cell.resultPreviewMarkdown ?? '',
        cell.callId ?? '',
        ...blocks.flatMap(block => [
            block.type,
            block.content,
            block.callId ?? '',
            block.toolName ?? '',
            block.imageAlt ?? '',
        ]),
        searchableJson(cell.messageSource),
        searchableJson(cell.promptDetail),
        searchableJson(cell.previousPromptDetail),
    ];
}
/** Session-view-local index that reparses Markdown only when one record's source changes. */
export class TrajectorySearchIndex {
    entries = new Map();
    layouts;
    /**
     * Incrementally synchronize one or more current trajectory layout slices.
     * @param layouts - Finalized and optional streaming layouts from the same view.
     * @returns Whether the indexed layout version changed.
     */
    update(layouts) {
        if (this.layouts === layouts)
            return false;
        this.layouts = layouts;
        const seen = new Set();
        for (const turns of layouts) {
            for (const turn of turns) {
                for (const group of turn.groups) {
                    for (const cell of group.cells) {
                        if (cell.requestOnly === true)
                            continue;
                        const id = trajectoryRecordId(cell);
                        const sources = recordSources(turn.turn, group.title, cell);
                        const previous = this.entries.get(id);
                        const entry = previous !== undefined && sameSources(previous.sources, sources)
                            ? previous
                            : {
                                sources,
                                text: [
                                    ...sources,
                                    markdownPreview(cell),
                                    resultPreview(cell),
                                ].join('\n').toLocaleLowerCase(),
                            };
                        this.entries.set(id, entry);
                        seen.add(id);
                    }
                }
            }
        }
        for (const id of this.entries.keys()) {
            if (!seen.has(id))
                this.entries.delete(id);
        }
        return true;
    }
    /**
     * Match a query against the latest committed index version.
     * @param query - Space-separated case-insensitive search terms.
     * @returns Matching stable record identities, or `null` without a query.
     */
    search(query) {
        const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0)
            return null;
        const matches = new Set();
        for (const [id, entry] of this.entries) {
            if (terms.every(term => entry.text.includes(term)))
                matches.add(id);
        }
        return matches;
    }
}
//# sourceMappingURL=trajectory-search-index.js.map