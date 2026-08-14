/** Pure projection from trajectory records to measurable virtual ledger rows. */
import { trajectoryRecordId } from "./trajectory-record.js";
const CONTENT_ROW_HEIGHT = 30;
const COLLAPSED_SUMMARY_HEIGHT = 20;
const TERMINAL_BOUNDARY_HEIGHT = 9;
/**
 * Derive the DOM-safe row identity shared by React, the virtualizer, and
 * browser scroll contracts.
 * @param record - Display record whose identity is required.
 * @returns Stable record identity with a suffix for synthetic fold summaries.
 */
export function trajectoryVirtualRecordKey(record) {
    const identity = encodeURIComponent(trajectoryRecordId(record.cell));
    return record.collapsedSummaryKind === undefined
        ? identity
        : `${identity}\u0000summary\u0000${record.collapsedSummaryKind}`;
}
/**
 * Attach separator-only records to the next content row so the virtualizer
 * never owns a zero-height item. A terminal separator retains its CSS-owned
 * lower-marker clearance as a standalone item.
 * @param records - Final search/fold projection in ledger order.
 * @returns Measurable virtual rows with original logical positions retained.
 */
export function groupTrajectoryVirtualRows(records) {
    const rows = [];
    let pending = [];
    for (const [logicalIndex, record] of records.entries()) {
        const entry = { logicalIndex, record };
        if (record.cell.requestOnly === true) {
            pending.push(entry);
            continue;
        }
        const entries = [...pending, entry];
        pending = [];
        rows.push({
            entries,
            height: record.collapsedSummaryKind === undefined
                ? CONTENT_ROW_HEIGHT
                : COLLAPSED_SUMMARY_HEIGHT,
            key: trajectoryVirtualRecordKey(record),
        });
    }
    if (pending.length > 0) {
        rows.push({
            entries: pending,
            height: TERMINAL_BOUNDARY_HEIGHT,
            key: pending.map(candidate => trajectoryVirtualRecordKey(candidate.record)).join('|'),
        });
    }
    return rows;
}
//# sourceMappingURL=trajectory-virtual-rows.js.map