# Terminal maintenance baseline — 2026-08-26

This report records the unmodified Task A/B baseline before implementation. It is intentionally committed first so later fixed-viewport and transcript-performance measurements have an auditable comparison point.

## Fixed inputs

- Repository commit: `6c03e80f0acb62f05dae9e80606ce54e80beb684`
- SeekTTY: `1.2.1`
- Official dsh dependency baseline: `0.1.1-rc.2`
- `@mariozechner/pi-tui`: `0.73.1`
- Package manager: pnpm `11.7.0`
- Verification runtime: Node `24.19.0`
- Host: macOS arm64, Asia/Shanghai

The default shell runtime was Node `22.17.1`, below this repository's declared `^22.19.0 || >=24` engine. Its install result is not used as verification evidence. All checks and measurements below used the bundled Node `24.19.0` runtime.

## Baseline behavior confirmed by source and tests

- With the composer focused, `Surface` supplies `Number.POSITIVE_INFINITY` as the Transcript viewport.
- `BottomAnchoredLayout.render()` may return more rows than the terminal height; the baseline test explicitly expects 11 logical rows for an 8-row viewport.
- The baseline has no managed `CSI ?1049h/l` lifecycle and no `CSI ?1000h` / `CSI ?1006h` mouse reporting.
- The pi-tui renderer can write tall roots with `CRLF`, and `TUI.stop()` moves to the logical content end and appends a final `CRLF`.
- Synchronous fatal restore only forces cooked mode and shows the cursor.
- `Transcript.render()` iterates every component, escapes every rendered line, and copies the complete line array into `lastFullLines` before selecting a finite viewport.

These observations prove the structural paths described in the maintenance task. They do not substitute for Terminal.app, iTerm2, tmux, or long-duration acceptance.

## Automated baseline verification

Command:

```sh
PATH="<bundled-node-24-bin>:$PATH" pnpm run check
```

Observed pass:

- TypeScript typecheck
- Vitest: 87 files passed; 548 tests passed; 1 test skipped
- Production build
- Package-content check: 23 entries, no planning files, Profiles, credentials, caches, or AppleDouble entries

The package checker removed 230 generated AppleDouble metadata files before inspecting the archive. They were untracked filesystem metadata, not repository content.

## Structural performance baseline

A temporary, uncommitted Vitest fixture constructed official-shape conversation snapshots with 100 lines per assistant node. For each size it measured:

- initial `Transcript.update()`;
- 25 cached `Transcript.render(80)` calls;
- 10 iterations that replace only the final node, then call `update()` and `render(80)`.

`NO_COLOR=1` was used to avoid animation noise. The fixture was removed immediately after the run.

| Transcript lines | Nodes | Initial update (ms) | Cached render p50 / p95 / p99 (ms) | Tail update + render p50 / p95 / p99 (ms) | Observed heap delta (MiB) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 10 | 0.749 | 0.638 / 1.466 / 3.616 | 0.652 / 7.002 / 7.002 | 1.368 |
| 10,000 | 100 | 1.083 | 10.878 / 16.810 / 20.039 | 10.385 / 12.744 / 12.744 | 164.965 |
| 50,000 | 500 | 3.684 | 66.892 / 106.284 / 110.617 | 59.162 / 72.291 / 72.291 | 343.160 |
| 100,000 | 1,000 | 15.056 | 125.071 / 157.008 / 192.129 | 143.962 / 235.112 / 235.112 | 901.012 |

The 100,000-line cached-render p99 exceeds the maintenance target of 25 ms by about 7.7×. This is direct evidence that a cache hit does not bound normal frame work to the viewport.

### Measurement limits

- These are in-process Transcript costs, not end-to-end keyboard-to-echo latency.
- The benchmark did not force garbage collection; heap deltas include reclaimable temporary allocations and must not be called a retained-memory leak.
- It did not measure terminal parser/paint latency, stdout backpressure, event-loop delay, CPU percentage, RSS slope, Terminal.app versus iTerm2 behavior, tmux, image rendering, or a 60-minute session.
- End-to-end PTY and real-terminal measurements remain mandatory after Task B and again after Task A.

## Required comparison points

The same fixture and supported Node runtime must be used for:

1. the fixed-viewport Task B commit before any Task A optimization;
2. the final Task A implementation;
3. release-candidate validation after packaging and isolated official-dsh lifecycle tests.

Results must retain the distinction between structural microbenchmarks, PTY measurements, and manual terminal acceptance.
