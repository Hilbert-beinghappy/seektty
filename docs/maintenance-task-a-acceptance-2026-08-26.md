# Maintenance task A acceptance record — 2026-08-26

Baseline: Task B `60cf8ca9bc640e8d059f6856bf312449b212544c`
Branch: `codex/transcript-viewport-performance`
Candidate: SeekTTY `1.2.1`, official unmodified `@deepseek-ai/dsh@0.1.1-rc.2`, `@mariozechner/pi-tui@0.73.1`
Host: macOS arm64, tmux 3.7c, Node 24.19.0, 80×24 benchmark viewport

## Delivered behavior

- Finite Transcript frames render only the blocks needed by the viewport and retain a block-coordinate anchor while history is prepended, streamed, resized, or searched.
- Width-specific block output is cached; pulse frames and completed image loads invalidate only their owning blocks.
- Full rendered search indexes are cold-path state: they are built only while search is active, synchronously refreshed before search navigation, and preserve the historical block across tail growth, earlier-block growth, and width changes.
- Image completions are fenced by Session generation and disposal. Pulse timers, listeners, subscriptions, and diagnostic hooks are cleaned up by lifecycle tests.
- The opt-in `SEEKTTY_TUI_PERF=1` probe records content-free timing, write/backpressure, event-loop, resource, and lifecycle counters. The disabled path keeps the original terminal and I/O identities.
- Snapshot reconciliation remains correctness-first. The official snapshot exposed no reliable revision token, so `update()` still fingerprints all visible nodes; no new persistence, history truncation, throttling, or dependency was introduced.

## Automated verification

| Check | Status | Observed result |
| --- | --- | --- |
| `pnpm run check` on bundled Node 24.19.0 | Pass | TypeScript; 91 test files; 594 passed / 1 skipped; production build; package check with 23 entries |
| Viewport/search regression suite | Pass | 26 tests, including 1k–100k operation bounds, prepend/tail growth, search refresh, historical resize, earlier-block growth, pulse, image fencing, and 100 Transcript lifecycles |
| Official dsh compatibility cycle | Pass | Isolated stock hosts for the supported rc.6–rc.8 line and rc.2 tested baseline completed add, boot boundary, remove, re-add, and boot boundary checks |
| Final stock `0.1.1-rc.2` package cycle | Pass | Final tarball completed production launcher install, module-identity check, add, full boot boundary, remove, re-add, and full boot boundary in isolated homes |
| Final tmux package smoke | Pass | Final tarball entered the TUI under `TERM=tmux-256color`; first-run dialog was deferred and double Ctrl+C exited the pane with status 0 |
| Real-PTY Surface lifecycle | Pass | 100 complete first-run → defer → double-Ctrl+C cycles exited 0 under official rc.2 |

One initial stock-cycle attempt referenced a package-check tarball that had already been removed and failed with `ENOENT` before installation. A retained tarball was then created and the complete cycle passed. One initial PTY driver sent Ctrl+C before the first-run modal was ready and timed out; the synchronized driver passed one smoke cycle and then 100 cycles.

## Structural performance comparison

The same opt-in harness ran each size in three independent processes with 100 logical lines per assistant node, 25 cached renders, and 10 tail update+render samples. Values below are medians of the three runs.

| Lines | Task B cached p50 / p95 / p99 (ms) | Task A cached p50 / p95 / p99 (ms) | Task B tail p50 / p95 / p99 (ms) | Task A tail p50 / p95 / p99 (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.543 / 1.288 / 1.696 | 0.032 / 0.092 / 0.130 | 0.615 / 1.174 / 1.174 | 0.971 / 8.601 / 8.601 |
| 10,000 | 9.768 / 13.023 / 13.855 | 0.042 / 0.093 / 0.099 | 9.729 / 12.362 / 12.362 | 1.791 / 10.576 / 10.576 |
| 50,000 | 55.575 / 70.733 / 104.346 | 0.016 / 0.063 / 0.063 | 56.495 / 73.101 / 73.101 | 4.336 / 6.122 / 6.122 |
| 100,000 | 118.722 / 186.710 / 225.310 | 0.024 / 0.082 / 0.215 | 119.734 / 225.158 / 225.158 | 9.529 / 40.304 / 40.304 |

Every final cached sample visited at most one block, rendered zero components, escaped zero lines, and copied zero full-history lines. At 100k lines, cached-render p95 fell from 186.710 ms to 0.082 ms (about 99.96%). Tail update remains O(N) because correctness fingerprinting still scans the snapshot; its timings are allocator/GC-sensitive and are not represented as viewport-only work.

These are structural in-process measurements, not terminal paint latency or keyboard-to-write latency. They do not by themselves prove the task's 1.5× end-to-end latency target.

## Opt-in PTY probe

A 42.3-second shared-PTY run used the packed candidate, deferred provider setup, entered and cleared input, consumed 100 alternating SGR wheel reports, and exited through double Ctrl+C.

- 111 input events; 3 snapshots; 25 normal render requests.
- Render p50/p95/p99: 0.612 / 16.593 / 16.593 ms.
- Input-to-write p50/p95/p99: 1.880 / 5.671 / 5.671 ms.
- 12 writes, 5,488 bytes, no stdout backpressure.
- Event-loop delay p99: 21.266 ms; utilization: 0.013276.
- Process listeners: 3 at start and end; subscriptions: 0.
- Active resources were 8 at start and 10 at capture time. This live-process count is recorded without calling it a leak; the 100 full exit cycles provide the stronger lifecycle evidence.

## Adversarial review

Five Grok 4.6 Extra High review rounds were used across the implementation. Accepted findings were reproduced with focused tests before fixes. The final review candidate about search resizing was confirmed by a failing regression and fixed with block-coordinate anchoring; speculative findings that did not survive code-path analysis were not applied. A Fast invocation was stopped and excluded; after the user's instruction, no Fast model was used.

The final review considered viewport anchoring, search index freshness, width changes, empty indexes, Session/disposal races, timer and listener cleanup, normal-frame complexity, output backpressure, official Host module identity, package contents, and rollback.

## Remaining manual release gates

- Terminal.app native `Fn` drag selection and iTerm2 native `Option` selection could not be controlled under the computer-use safety policy.
- A user-operated 60-minute Terminal.app/iTerm2 session, including resize, search, scrolling, image/tool updates, and tmux, remains required. The shared PTY, tmux smoke, and 100 automated PTY cycles are not represented as equivalent to those native UI checks.

No push, pull request, merge, tag, release, publication, credential write, Session migration, or persistence migration was performed.

## Rollback

Revert the Task A commits in reverse order, rebuild `lib/` with `pnpm run build`, and retain Task B `60cf8ca` as the fixed-viewport baseline. The change is presentation-cache and diagnostics state only; no Harness-owned Profile, plugin, Session, model, permission, credential, or persistence schema requires rollback.
