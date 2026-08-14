/**
 * Collect visible prose from one Assistant lifecycle.
 * @param blocks - Assistant content blocks.
 * @returns concatenated text blocks.
 */
export function assistantText(blocks) {
    return blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('');
}
//# sourceMappingURL=turn-assistant.js.map