# Long reasoning animation repair (2026-09-13)

Based on PR #206 (`ef4eadb`), preserving its assistant activation and jobs fixes.

## Confirmed defect and repair

A thinking header previously bypassed its entire block layout cache. Although the body component could hit its own cache, selection projection and hard-break wrapping scanned the whole body again, and owner-copy text was reconstructed on every pulse.

Cache the complete block layout and patch only the animated component spans when their text and geometry are unchanged. If an elapsed label changes its text or wraps, rebuild the block using a weakly held, one-width plain-row projection cache. Compute source projections and explicit hard breaks in the same wrap pass. Reuse owner-copy indexing when the source projections are identical. Source edits, presentation changes and width changes still invalidate the appropriate layout. No content is discarded, and pulse animation remains enabled.

The legacy partial key now uses the existing exact structural-token implementation instead of JSON-stringifying accumulated text; no heuristic length/fingerprint equality is introduced.

## Evidence

The unchanged-source regression fails on the pre-fix implementation: ten animated frames rescan 260,000 characters for a 26,000-character reasoning body. The final implementation scans zero body characters on those frames in both ordinary/full and legacy native rendering. Illustrative local timings for ten frames were 16.18/12.89 ms before and 3.17/0.63 ms after; these are isolated samples, not a cross-platform latency benchmark.

Tests additionally cover animated header output, Unicode/whitespace copy across cache hits and resize, same-length source correction, long native-tail worker previews without restarting workers on frozen-source animation frames, and a burst of twenty reasoning updates followed by complete final delivery.

## Scope and remaining diagnosis

Native-tail already sends large mixed/plain content above 32,768 characters to a worker. Its frozen-source animation regression verifies no new worker and no UI-thread plain projection scan. It does not establish that every reported ten-minute hang shares the ordinary rendering defect.

Continuous source changes still require exact snapshot checks and presentation updates; complex worker preparation may revisit full content. This change does not claim constant-cost streaming or elimination of all long-session stalls. If real native-tail hangs remain, capture time-bucketed snapshot/render/event-loop metrics and worker preparation duration against the exact deployed commit. Separate a stalled provider from an unresponsive input/terminal loop. Do not truncate reasoning or relax final-text coverage to improve responsiveness.
