/** Shared trajectory record data and formatting contracts. */
/**
 * Resolve the identity that survives prepending older projected records.
 * @param cell - Projected trajectory record.
 * @returns Stable identity from the owning event or tool call, with a fixture fallback.
 */
export function trajectoryRecordId(cell) {
    if (cell.recordId !== undefined)
        return cell.recordId;
    if (cell.callId !== undefined)
        return `${cell.kind}\u0000call\u0000${cell.callId}`;
    if (cell.sourceSeq !== undefined)
        return `${cell.kind}\u0000seq\u0000${cell.sourceSeq}`;
    return `${cell.kind}\u0000index\u0000${cell.index}`;
}
/**
 * Format a duration in milliseconds with thousands separators.
 * @param milliseconds - Duration in milliseconds, or `null` when absent.
 * @returns `—` when unknown, otherwise an integer-millisecond label.
 */
export function formatDurationMillis(milliseconds) {
    if (milliseconds === null || !Number.isFinite(milliseconds))
        return '—';
    const integer = String(Math.round(milliseconds));
    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ms`;
}
/**
 * Format an elapsed duration given in seconds as a millisecond label.
 * @param seconds - Duration seconds, or `null` when absent.
 * @returns `—` when unknown, otherwise an integer-millisecond label.
 */
export function formatElapsedSeconds(seconds) {
    return formatDurationMillis(seconds === null ? null : seconds * 1000);
}
//# sourceMappingURL=trajectory-record.js.map