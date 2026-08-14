/** Operation-sequence and recorded-time projections for the trajectory overview. */
import { formatDurationMillis } from "./trajectory-record.js";
/**
 * Format a timeline duration as an integer-millisecond label.
 * @param milliseconds - Non-negative duration in milliseconds.
 * @returns Millisecond label with thousands separators.
 */
export function formatTimelineOffset(milliseconds) {
    return formatDurationMillis(milliseconds);
}
function laneFor(kind) {
    if (kind === 'tool' || kind === 'subtool')
        return 2;
    if (kind === 'message' || kind === 'compacted')
        return 1;
    return 0;
}
function finite(value) {
    return value !== null && value !== undefined && Number.isFinite(value);
}
function cellRange(cell) {
    if (!finite(cell.startedAt))
        return null;
    const durationMs = finite(cell.timeSeconds)
        ? Math.max(0, cell.timeSeconds * 1_000)
        : 0;
    return { start: cell.startedAt, end: cell.startedAt + durationMs };
}
/**
 * Project every visible record into a stable three-lane timeline.
 * @param turns - Unfiltered trajectory layout.
 * @param mode - Independent equal/recorded duration and compressed/complete time projection.
 * @returns Timeline model, or `null` when no record is visible.
 */
export function deriveTrajectoryTimeline(turns, mode = 'sequence') {
    if (mode !== 'sequence') {
        return deriveTimedTimeline(turns, mode === 'duration' || mode === 'actual', mode === 'duration');
    }
    const spans = [];
    const turnBoundaries = [];
    for (const turn of turns) {
        const cells = turn.groups.flatMap(group => group.cells.filter(cell => cell.requestOnly !== true));
        if (cells.length === 0)
            continue;
        if (turn.turn !== null) {
            turnBoundaries.push({
                turn: turn.turn,
                time: spans.length,
            });
        }
        spans.push(...cells.map((cell, offset) => ({
            start: spans.length + offset,
            end: spans.length + offset + 1,
            index: cell.index,
            isError: cell.isError === true,
            kind: cell.kind,
            label: cell.text,
            lane: laneFor(cell.kind),
        })));
    }
    if (spans.length === 0)
        return null;
    return {
        start: 0,
        end: spans.length,
        spans,
        turnBoundaries,
    };
}
function deriveTimedTimeline(turns, actualDuration, compressIdle) {
    const timedTurns = turns.flatMap((turn) => {
        const rawSpans = turn.groups.flatMap(group => group.cells.flatMap((cell) => {
            if (cell.requestOnly === true)
                return [];
            const range = cellRange(cell);
            return range === null
                ? []
                : [{
                        ...range,
                        index: cell.index,
                        isError: cell.isError === true,
                        kind: cell.kind,
                        label: cell.text,
                        lane: laneFor(cell.kind),
                    }];
        }));
        return rawSpans.length === 0 ? [] : [{ turn: turn.turn, rawSpans }];
    });
    const rawSpans = timedTurns.flatMap(turn => turn.rawSpans);
    if (rawSpans.length === 0)
        return null;
    const removedIdleBySpan = new Map();
    let removedIdle = 0;
    let coveredUntil = null;
    for (const span of [...rawSpans].sort((left, right) => left.start - right.start || left.end - right.end)) {
        if (compressIdle && coveredUntil !== null && span.start > coveredUntil) {
            removedIdle += span.start - coveredUntil;
        }
        removedIdleBySpan.set(span, removedIdle);
        coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
    }
    const spans = [];
    const turnBoundaries = [];
    for (const turn of timedTurns) {
        const projected = turn.rawSpans.map((span) => {
            const offset = removedIdleBySpan.get(span) ?? 0;
            return {
                ...span,
                start: span.start - offset,
                end: (actualDuration ? span.end : span.start) - offset,
            };
        });
        spans.push(...projected);
        if (turn.turn !== null) {
            turnBoundaries.push({
                turn: turn.turn,
                time: Math.min(...projected.map(span => span.start)),
            });
        }
    }
    return {
        start: Math.min(...spans.map(span => span.start)),
        end: Math.max(...spans.map(span => span.end)),
        spans,
        turnBoundaries,
    };
}
/**
 * Identify records active at any point inside an inclusive selected interval.
 * @param turns - Unfiltered trajectory layout.
 * @param range - Selected interval in the active projection.
 * @param mode - Independent equal/recorded duration and compressed/complete time projection.
 * @returns Record indexes inside the focus interval.
 */
export function trajectoryTimelineFocusIndexes(turns, range, mode = 'sequence') {
    const model = deriveTrajectoryTimeline(turns, mode);
    return new Set(model?.spans
        .filter(span => span.start <= range.end && span.end >= range.start)
        .map(span => span.index));
}
//# sourceMappingURL=timeline.js.map