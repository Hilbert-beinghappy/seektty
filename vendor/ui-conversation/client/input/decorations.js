/** Token matcher: a trigger char at line start or after whitespace, then a word-ish name (never crosses \n). */
const TEXT_REF_RE = /(^|\s)([/@])([\w-]+)/g;
/**
 * Scan the draft for plain-text reference tokens against the hot lexicons.
 * Word-boundary discipline: the trigger must sit at the draft
 * start or after whitespace ('x/name' never matches); the name must be an
 * exact lexicon member.
 * @param draft - draft text.
 * @param lexicon - per-trigger name lists (a missing trigger scans nothing).
 * @returns matched ranges in draft order.
 */
export function scanTextRefs(draft, lexicon) {
    if (lexicon.size === 0 || draft === '')
        return [];
    const out = [];
    TEXT_REF_RE.lastIndex = 0;
    let m;
    while ((m = TEXT_REF_RE.exec(draft)) !== null) {
        const trigger = m[2];
        const name = m[3] ?? '';
        if (lexicon.get(trigger)?.includes(name)) {
            const start = m.index + (m[1]?.length ?? 0);
            out.push({ start, end: start + 1 + name.length, trigger });
        }
    }
    return out;
}
/** The empty lexicon (default: zero text-ref decorations, old call sites unchanged). */
const EMPTY_LEXICON = new Map();
/**
 * Derive the mirror-layer decorations from the input state.
 * @param state - published input state.
 * @param lexicon - optional per-trigger reference lexicons (plain-text-reference scan).
 * @returns token range, chip instructions, text-ref ranges, and the ghost hint.
 */
export function deriveDecorations(state, lexicon = EMPTY_LEXICON) {
    const { draft, claim, phase, occurrences } = state;
    const claimActive = (phase === 'claimed' || phase === 'submitting')
        && claim !== undefined && draft.startsWith(claim.token);
    const token = claimActive ? { start: 0, end: claim.token.length } : null;
    const chips = occurrences.map(o => ({
        occurrenceId: o.occurrenceId,
        offset: o.offset,
        label: o.label,
        invalid: o.invalid === true,
    }));
    const hint = claimActive && claim.hint !== undefined && draft.slice(claim.token.length).trim() === ''
        ? claim.hint
        : null;
    return { token, chips, textRefs: scanTextRefs(draft, lexicon), hint };
}
//# sourceMappingURL=decorations.js.map