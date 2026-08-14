/**
 * Approval domain face over the carrier (the ui-user-questions PendingQuestion
 * pattern): render identity and question material forwarded transparently;
 * answer owns the wire encoding — the ApprovalResponsePayload value shape
 * with the audit correlation the host reconciles — and turns a rejected
 * carrier receipt into a thrown error. Minted per carrier via useMemo.
 */
export class PendingApproval {
    wait;
    /**
     * @param wait - the runtime carrier for one pending approval question.
     */
    constructor(wait) {
        this.wait = wait;
    }
    /** Opaque render identity (React key / one-shot latch remount axis), forwarded from the carrier. */
    get key() {
        return this.wait.key;
    }
    /** The tool the question is about (headline fallback), forwarded from the carrier payload. */
    get toolName() {
        return this.wait.payload.toolName;
    }
    /** The asker's human-readable WHY (headline when present), forwarded from the carrier payload. */
    get reason() {
        return this.wait.payload.reason;
    }
    /** The paired tool call's id when the ask names one (command-line lookup key), forwarded from the carrier payload. */
    get callId() {
        return this.wait.payload.callId;
    }
    /**
     * Deliver the user's decision; a rejected carrier receipt throws. Panel
     * removal stays frame-driven: the broadcast `approval/resolved` settles the
     * wait and drops it from the pending list.
     * @param outcome - the only two client-answerable outcomes.
     */
    async answer(outcome) {
        const receipt = await this.wait.respond({
            ok: true,
            value: { sessionId: this.wait.sessionId, approvalId: this.wait.payload.approvalId, outcome },
        });
        if (!receipt.accepted) {
            throw new Error(`approval response rejected: ${receipt.reason}`);
        }
    }
}
//# sourceMappingURL=slots.js.map