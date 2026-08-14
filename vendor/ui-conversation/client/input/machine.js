/** The object-replacement character backing every chip occurrence in the draft. */
export const PLACEHOLDER = '￼';
/** The machine never writes the queue; the wiring layer overlays the queue store's projection. */
const EMPTY_QUEUE = [];
/** Undo ring depth (bounded self-managed transaction log). */
const LOG_LIMIT = 100;
/** Exhaustiveness backstop for the closed InputEvent / guard unions. */
function unreachable(value) {
    throw new Error(`unreachable input event: ${JSON.stringify(value)}`);
}
/**
 * Strip the claim token off a draft to yield submit args. Leading whitespace
 * (incl. newlines — leading-trigger trim) is tolerated; a bare `/name`
 * missing the token's trailing separator yields empty args. Exactly one
 * separator char is consumed; the remainder — newlines included — stays
 * verbatim (`/goal x\ny` → `x\ny`).
 */
function argsAfter(draft, token) {
    const s = draft.trimStart();
    if (s.startsWith(token))
        return s.slice(token.length);
    const base = token.trimEnd();
    if (s.startsWith(base)) {
        const rest = s.slice(base.length);
        return /^\s/.test(rest) ? rest.slice(1) : rest;
    }
    return '';
}
/**
 * Prefix/suffix common-scan recovering the edit range between two drafts
 * (used when the wiring layer cannot supply one from the DOM event).
 */
function diffEdit(prev, next) {
    let p = 0;
    const maxCommon = Math.min(prev.length, next.length);
    while (p < maxCommon && prev[p] === next[p])
        p += 1;
    let s = 0;
    const maxSuffix = maxCommon - p;
    while (s < maxSuffix && prev[prev.length - 1 - s] === next[next.length - 1 - s])
        s += 1;
    return { start: p, end: prev.length - s, insertedLength: next.length - s - p };
}
/**
 * Expand the draft's placeholders into their occurrences' clipboard text
 * (the persistence mirror and clipboard both write this
 * projection — U+FFFC never leaves the machine). Table order is offset
 * order, so one linear walk pairs placeholders with entries.
 * @param state - published input state.
 * @returns the plain-text projection of the draft.
 */
export function projectClipboard(state) {
    const { draft, occurrences } = state;
    if (occurrences.length === 0)
        return draft;
    let out = '';
    let cursor = 0;
    for (const o of occurrences) {
        out += draft.slice(cursor, o.offset) + o.clipboardText;
        cursor = o.offset + 1;
    }
    return out + draft.slice(cursor);
}
/**
 * Pure input machine, one instance per session (per-session isolation is by
 * construction). The machine constructs one AbortController per SubmitAttempt
 * at enter time and aborts it itself on release; the shell never aborts, it
 * only observes attempt.signal on its adjudicate/submit promises. Stale
 * attempts (any adjudicated / adjudication-failed / submit-settled whose seq
 * is not the in-flight one) are dropped: same state, zero effects.
 */
export class InputMachine {
    draft = '';
    draftRev = 0;
    phase = 'plain';
    claim;
    occurrences = [];
    occurrenceSeq = 0;
    seq = 0;
    inflight;
    log = [];
    redoStack = [];
    /** Open single-char typing run: the next contiguous char within the window coalesces. */
    typingRun;
    paste;
    pasteSeq = 0;
    mergeWindowMs;
    now;
    constructor(options = {}) {
        this.mergeWindowMs = options.mergeWindowMs ?? 1000;
        this.now = options.now ?? (() => 0);
    }
    /** Read-only snapshot of the machine state (queue always empty at this tier). */
    get state() {
        const c = this.claim;
        return {
            draft: this.draft,
            imageIds: [],
            draftRev: this.draftRev,
            phase: this.phase,
            ...(c ? { claim: { token: c.token, ...(c.hint !== undefined ? { hint: c.hint } : {}) } } : {}),
            occurrences: this.occurrences,
            ...(this.paste !== undefined ? { paste: this.paste } : {}),
            queue: EMPTY_QUEUE,
        };
    }
    /**
     * Feed one event through the machine.
     * @param ev - Input event; the single write path for all input state.
     * @returns Effects for the shell to execute in order; empty on no-ops, locks, and dropped stale events.
     */
    dispatch(ev) {
        switch (ev.type) {
            case 'draft-changed': return this.onDraftChanged(ev.draft, ev.editRange);
            case 'begin-command': return this.onBeginCommand(ev.claim, ev.span);
            case 'insert-ref': return this.onInsertRef(ev.reference, ev.span);
            case 'consume-token': return this.onConsumeToken(ev.guard);
            case 'set-invalid': return this.onSetInvalid(ev.invalidIds);
            case 'undo': return this.onUndo();
            case 'redo': return this.onRedo();
            case 'paste-begin': return this.onPasteBegin(ev.text, ev.selection, ev.components, ev.generation);
            case 'paste-upgrade': return this.onPasteUpgrade(ev.attemptId, ev.span, ev.reference);
            case 'invalidate-paste': {
                this.paste = undefined;
                return [];
            }
            case 'enter': return this.onEnter(ev.mode);
            case 'adjudicated': return this.onAdjudicated(ev.attempt, ev.outcome);
            case 'adjudication-failed': return this.onAdjudicationFailed(ev.attempt, ev.message);
            case 'submit-settled': return this.onSubmitSettled(ev);
            case 'send-committed': return this.onSendCommitted();
            case 'release': return this.onRelease();
            default: return unreachable(ev);
        }
    }
    // ---- transaction plumbing ----
    /** Adopt a new draft: bump the revision (the span-CAS invalidation point). */
    adopt(draft) {
        this.draft = draft;
        this.draftRev += 1;
    }
    /** Push one undo unit (before-state), trim the ring, and cut the redo chain. */
    pushTxn(selectionBefore) {
        this.log.push({
            draftBefore: this.draft,
            occurrencesBefore: this.occurrences,
            ...(selectionBefore !== undefined ? { selectionBefore } : {}),
        });
        if (this.log.length > LOG_LIMIT)
            this.log.shift();
        this.redoStack = [];
    }
    /**
     * Reconcile the occurrence table with one edit (old-draft coordinates):
     * entries past the range shift by the length delta; entries whose
     * placeholder sits inside the replaced range go away whole (a
     * deletion/replacement intersecting a placeholder acts on the whole chip).
     */
    reconcile(range) {
        const delta = range.insertedLength - (range.end - range.start);
        const kept = [];
        for (const o of this.occurrences) {
            if (o.offset < range.start)
                kept.push(o);
            else if (o.offset >= range.end)
                kept.push(delta === 0 ? o : { ...o, offset: o.offset + delta });
        }
        this.occurrences = kept;
    }
    /** Claimed integrity watch: any mutation that breaks the token prefix releases the claim. */
    watchClaim() {
        if (this.phase === 'claimed' && this.claim !== undefined && !this.draft.startsWith(this.claim.token)) {
            this.phase = 'plain';
            this.claim = undefined;
        }
    }
    /** Mint one occurrence at a draft offset. */
    mint(reference, offset) {
        this.occurrenceSeq += 1;
        return {
            occurrenceId: this.occurrenceSeq,
            source: reference.source,
            ref: reference.ref,
            offset,
            label: reference.label,
            clipboardText: reference.clipboardText,
        };
    }
    /** Splice minted entries into the offset-sorted table. */
    withMinted(minted) {
        if (minted.length === 0)
            return;
        this.occurrences = [...this.occurrences, ...minted].sort((a, b) => a.offset - b.offset);
    }
    // ---- draft transactions ----
    onDraftChanged(draft, editRange) {
        if (draft === this.draft)
            return [];
        const range = editRange ?? diffEdit(this.draft, draft);
        // Single-char typing coalesces into the open run while contiguous and
        // inside the merge window; anything else opens its own transaction.
        const typing = range.start === range.end && range.insertedLength === 1;
        const at = this.now();
        const run = this.typingRun;
        const merges = typing && run !== undefined && run.end === range.start && at - run.at <= this.mergeWindowMs;
        if (!merges)
            this.pushTxn({ start: range.start, end: range.end });
        this.typingRun = typing ? { end: range.start + 1, at } : undefined;
        this.reconcile(range);
        this.adopt(draft);
        this.watchClaim();
        this.paste = undefined;
        return [];
    }
    /** Span CAS: revision equality (content identity follows) plus bounds sanity. */
    casOk(span) {
        return span.draftRev === this.draftRev
            && span.start >= 0 && span.start <= span.end && span.end <= this.draft.length;
    }
    onBeginCommand(claim, span) {
        if (this.phase !== 'plain' && this.phase !== 'claimed')
            return [];
        // Leading-trigger contract: only whitespace may precede the span; the
        // whitespace prefix is dropped so the claimed watch (startsWith) holds.
        if (!this.casOk(span) || this.draft.slice(0, span.start).trim() !== '')
            return [];
        this.pushTxn();
        this.typingRun = undefined;
        this.reconcile({ start: 0, end: span.end, insertedLength: claim.token.length });
        this.adopt(claim.token + this.draft.slice(span.end));
        this.claim = claim;
        this.phase = 'claimed';
        this.paste = undefined;
        return [];
    }
    onInsertRef(reference, span) {
        if (this.phase !== 'plain' && this.phase !== 'claimed')
            return [];
        if (!this.casOk(span))
            return [];
        this.replaceSpanWithChip(reference, span);
        this.paste = undefined;
        return [];
    }
    /**
     * Shared chip-insertion transaction: replace [span) with one placeholder
     * occurrence (insert-ref and paste-upgrade both land here). A separating
     * space follows the chip unless one is already next.
     * @returns the inserted length (placeholder plus optional gap).
     */
    replaceSpanWithChip(reference, span) {
        this.pushTxn();
        this.typingRun = undefined;
        const tail = this.draft.slice(span.end);
        const gap = tail.length === 0 || tail[0] !== ' ' ? ' ' : '';
        const inserted = PLACEHOLDER + gap;
        this.reconcile({ start: span.start, end: span.end, insertedLength: inserted.length });
        this.withMinted([this.mint(reference, span.start)]);
        this.adopt(this.draft.slice(0, span.start) + inserted + tail);
        this.watchClaim();
        return inserted.length;
    }
    /**
     * Guarded token deletion after business success (popup settle / menu-pick
     * execute). No effect signals success: the caller reads the draftRev
     * advance off the published state (same currency as the other bail verbs).
     */
    onConsumeToken(guard) {
        if (this.phase !== 'plain' && this.phase !== 'claimed')
            return [];
        switch (guard.kind) {
            case 'span': {
                const span = guard.span;
                if (!this.casOk(span) || span.start === span.end)
                    return [];
                this.pushTxn();
                this.typingRun = undefined;
                this.reconcile({ start: span.start, end: span.end, insertedLength: 0 });
                this.adopt(this.draft.slice(0, span.start) + this.draft.slice(span.end));
                this.watchClaim();
                this.paste = undefined;
                return [];
            }
            case 'bare-token': {
                if (guard.token === '' || this.draft.trim() !== guard.token)
                    return [];
                this.pushTxn();
                this.typingRun = undefined;
                this.occurrences = [];
                this.adopt('');
                this.watchClaim();
                this.paste = undefined;
                return [];
            }
            default: return unreachable(guard);
        }
    }
    /**
     * Owner-resolution style bits: exactly the listed occurrences render
     * invalid. Not a transaction — the draft, revision, and undo log are
     * untouched (invalidation never deletes or rewrites chips).
     */
    onSetInvalid(invalidIds) {
        const ids = new Set(invalidIds);
        if (!this.occurrences.some(o => (o.invalid === true) !== ids.has(o.occurrenceId)))
            return [];
        this.occurrences = this.occurrences.map((o) => {
            const invalid = ids.has(o.occurrenceId);
            if ((o.invalid === true) === invalid)
                return o;
            const { invalid: _drop, ...rest } = o;
            return invalid ? { ...rest, invalid: true } : rest;
        });
        return [];
    }
    // ---- undo / redo ----
    onUndo() {
        const entry = this.log.pop();
        if (entry === undefined)
            return [];
        this.redoStack.push({ draftBefore: this.draft, occurrencesBefore: this.occurrences });
        this.occurrences = entry.occurrencesBefore;
        this.adopt(entry.draftBefore);
        this.watchClaim();
        this.typingRun = undefined;
        this.paste = undefined;
        return [];
    }
    onRedo() {
        const entry = this.redoStack.pop();
        if (entry === undefined)
            return [];
        // Manual log push: pushTxn would cut the redo chain being walked.
        this.log.push({ draftBefore: this.draft, occurrencesBefore: this.occurrences });
        if (this.log.length > LOG_LIMIT)
            this.log.shift();
        this.occurrences = entry.occurrencesBefore;
        this.adopt(entry.draftBefore);
        this.watchClaim();
        this.typingRun = undefined;
        this.paste = undefined;
        return [];
    }
    // ---- paste plane ----
    /**
     * Paste as one transaction: the text (U+FFFC-sanitized) replaces the
     * selection; hot-snapshot sync matches componentize inside the SAME
     * transaction (one undo returns to pre-paste); a match attempt opens for
     * the async remainder while the phase still accepts reference mutations.
     */
    onPasteBegin(rawText, selection, components = [], generation = 0) {
        const { start, end } = selection;
        if (start < 0 || start > end || end > this.draft.length)
            return [];
        const text = rawText.split(PLACEHOLDER).join('');
        this.pushTxn(selection);
        this.typingRun = undefined;
        // Componentize: replace each matched token range (paste-text coordinates,
        // disjoint by contract) with a placeholder while assembling the insert.
        const sorted = [...components].sort((a, b) => a.start - b.start);
        const minted = [];
        let inserted = '';
        let cursor = 0;
        for (const c of sorted) {
            inserted += text.slice(cursor, c.start);
            minted.push(this.mint(c.reference, start + inserted.length));
            inserted += PLACEHOLDER;
            cursor = c.end;
        }
        inserted += text.slice(cursor);
        this.reconcile({ start, end, insertedLength: inserted.length });
        this.withMinted(minted);
        this.adopt(this.draft.slice(0, start) + inserted + this.draft.slice(end));
        this.watchClaim();
        if (this.phase === 'plain' || this.phase === 'claimed') {
            this.pasteSeq += 1;
            this.paste = {
                attemptId: this.pasteSeq,
                insertedRange: { start, end: start + inserted.length },
                generation,
            };
        }
        else {
            this.paste = undefined;
        }
        return [];
    }
    /**
     * Async match landed: upgrade one pasted token to a chip as an INDEPENDENT
     * transaction (undo #1 → the token text, undo #2 → pre-paste). The attempt
     * stays current — later tokens re-CAS against the advanced draftRev.
     */
    onPasteUpgrade(attemptId, span, reference) {
        const attempt = this.paste;
        if (attempt === undefined || attempt.attemptId !== attemptId)
            return [];
        if (this.phase !== 'plain' && this.phase !== 'claimed')
            return [];
        if (!this.casOk(span) || span.start === span.end)
            return [];
        const insertedLength = this.replaceSpanWithChip(reference, span);
        this.paste = {
            ...attempt,
            insertedRange: { start: attempt.insertedRange.start, end: attempt.insertedRange.end + insertedLength - (span.end - span.start) },
        };
        return [];
    }
    // ---- submit plane ----
    /** Mint the next SubmitAttempt and take the in-flight slot. */
    beginAttempt(mode) {
        const controller = new AbortController();
        this.seq += 1;
        const attempt = { seq: this.seq, signal: controller.signal, draftSnapshot: this.draft, mode };
        this.inflight = { attempt, controller };
        return attempt;
    }
    onEnter(mode) {
        if (this.phase === 'adjudicating' || this.phase === 'submitting')
            return [];
        if (this.phase === 'claimed' && this.claim !== undefined) {
            const attempt = this.beginAttempt(mode);
            this.phase = 'submitting';
            this.paste = undefined;
            return [{ type: 'begin-submit', attempt, claim: this.claim, args: argsAfter(this.draft, this.claim.token) }];
        }
        const trimmed = this.draft.trim();
        if (trimmed === '')
            return [];
        this.paste = undefined;
        if (trimmed.startsWith('/')) {
            const attempt = this.beginAttempt(mode);
            this.phase = 'adjudicating';
            return [{ type: 'adjudicate', attempt, draft: this.draft }];
        }
        return [{ type: 'default-sink', draft: this.draft, mode }];
    }
    onAdjudicated(attempt, outcome) {
        const flight = this.inflight;
        if (this.phase !== 'adjudicating' || flight === undefined || flight.attempt.seq !== attempt.seq)
            return [];
        if (outcome !== undefined && outcome !== 'handled' && 'claim' in outcome) {
            this.claim = outcome.claim;
            this.phase = 'submitting';
            return [{
                    type: 'begin-submit',
                    attempt,
                    claim: outcome.claim,
                    args: argsAfter(attempt.draftSnapshot, outcome.claim.token),
                }];
        }
        // 'handled' (source dealt internally), {insert} (no enter-time span
        // semantics), or a miss: all land plain; only the miss flows to the sink.
        this.inflight = undefined;
        this.phase = 'plain';
        return outcome === undefined
            ? [{ type: 'default-sink', draft: attempt.draftSnapshot, mode: attempt.mode }]
            : [];
    }
    onAdjudicationFailed(attempt, message) {
        if (this.phase !== 'adjudicating' || this.inflight?.attempt.seq !== attempt.seq)
            return [];
        this.inflight = undefined;
        this.phase = 'plain';
        // Draft retained: warmup failure never silently downgrades to a prompt.
        return [{ type: 'notice', level: 'error', text: message }];
    }
    onSubmitSettled(ev) {
        const flight = this.inflight;
        if (this.phase !== 'submitting' || flight === undefined || flight.attempt.seq !== ev.attempt.seq)
            return [];
        this.inflight = undefined;
        if (ev.ok) {
            this.phase = 'plain';
            this.claim = undefined;
            this.occurrences = [];
            this.adopt('');
            // Committed content is gone for good: undo must not resurrect a sent draft.
            this.log = [];
            this.redoStack = [];
            this.typingRun = undefined;
            this.paste = undefined;
            return ev.outcome?.text !== undefined
                ? [{ type: 'notice', level: ev.outcome.kind === 'error' ? 'error' : 'info', text: ev.outcome.text }]
                : [];
        }
        const text = ev.message ?? ev.outcome?.text ?? 'command failed';
        // Drift guard: keep the enter-time draft (same claim) only while the
        // live draft still equals it; user input typed during flight wins.
        // Claimed re-entry additionally requires the watch to hold — an
        // enter-path snapshot may carry leading whitespace the token never had.
        if (this.draft === flight.attempt.draftSnapshot
            && this.claim !== undefined && this.draft.startsWith(this.claim.token)) {
            this.phase = 'claimed';
            return [{ type: 'notice', level: 'error', text }];
        }
        this.phase = 'plain';
        this.claim = undefined;
        return [{ type: 'notice', level: 'error', text }];
    }
    /** Ordinary send accepted: clear as a commit (no undo unit; sent content
     *  must not be resurrectable — same discipline as submit-settled success). */
    onSendCommitted() {
        this.claim = undefined;
        this.occurrences = [];
        this.adopt('');
        this.log = [];
        this.redoStack = [];
        this.typingRun = undefined;
        this.paste = undefined;
        return [];
    }
    onRelease() {
        if (this.inflight !== undefined) {
            this.inflight.controller.abort();
            this.inflight = undefined;
        }
        this.phase = 'plain';
        this.claim = undefined;
        this.typingRun = undefined;
        this.paste = undefined;
        return [];
    }
}
//# sourceMappingURL=machine.js.map