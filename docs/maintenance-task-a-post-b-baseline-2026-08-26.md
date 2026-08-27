# Task A post-Task-B performance baseline — 2026-08-26

This report is the required comparison point after Task B's fixed viewport and before any Task A transcript optimization.

## Fixed inputs

- Repository commit: `60cf8ca9bc640e8d059f6856bf312449b212544c`
- Branch: `codex/transcript-viewport-performance`
- SeekTTY: `1.2.1`
- Official dsh tested baseline: `0.1.1-rc.2`
- `@mariozechner/pi-tui`: `0.73.1` with Task B patch hash `52c25621f3351d2eaef9354a1e8dbb55f052374587088aa7a529de33f72c5a38`
- Runtime: Node `24.19.0`, macOS arm64, Darwin kernel `25.5.0`
- Fixture viewport: 80 columns × 24 transcript rows
- Synthetic data: official-shape snapshots, 100 short Markdown lines per assistant node

Command:

```sh
PATH="<bundled-node-24-bin>:$PATH" pnpm perf:tui
```

The committed harness runs each size/repeat in a separate Vitest process with `--expose-gc`. It measures only explicit `Transcript.update()` and `Transcript.render()` intervals; TypeScript transform, Vitest startup, and process startup are outside the samples. Each scenario warms the component line cache, takes 25 cached-render samples, then takes 10 samples that replace only the tail node before update+render.

## Raw three-run results

Times are milliseconds. Heap/RSS deltas are MiB after an explicit GC while the synthetic snapshot and Transcript caches are still live.

| Run | Lines | Nodes | Initial update | Cached render p50 / p95 / p99 | Tail update + render p50 / p95 / p99 | Heap delta | RSS delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,000 | 10 | 0.833 | 0.574 / 1.358 / 1.688 | 0.595 / 1.120 / 1.120 | 11.286 | 26.125 |
| 1 | 10,000 | 100 | 3.201 | 9.710 / 14.138 / 14.219 | 9.985 / 12.383 / 12.383 | 165.231 | 260.422 |
| 1 | 50,000 | 500 | 17.227 | 60.515 / 85.140 / 97.842 | 63.042 / 82.525 / 82.525 | 610.982 | 1,500.078 |
| 1 | 100,000 | 1,000 | 23.036 | 118.722 / 171.473 / 177.275 | 115.535 / 225.158 / 225.158 | 1,823.111 | 2,115.484 |
| 2 | 1,000 | 10 | 0.900 | 0.543 / 1.288 / 1.696 | 0.615 / 1.179 / 1.179 | 11.301 | 26.359 |
| 2 | 10,000 | 100 | 3.052 | 9.933 / 12.930 / 13.855 | 9.532 / 11.707 / 11.707 | 164.862 | 260.359 |
| 2 | 50,000 | 500 | 17.764 | 55.321 / 70.733 / 104.346 | 56.495 / 73.101 / 73.101 | 307.037 | 1,734.109 |
| 2 | 100,000 | 1,000 | 24.722 | 116.383 / 215.647 / 225.310 | 119.734 / 167.394 / 167.394 | 1,417.581 | 2,127.047 |
| 3 | 1,000 | 10 | 0.835 | 0.489 / 1.219 / 1.776 | 0.644 / 1.174 / 1.174 | 11.298 | 26.453 |
| 3 | 10,000 | 100 | 2.701 | 9.768 / 13.023 / 13.294 | 9.729 / 12.362 / 12.362 | 164.731 | 260.047 |
| 3 | 50,000 | 500 | 17.715 | 55.575 / 68.973 / 107.227 | 53.781 / 66.962 / 66.962 | 608.717 | 1,357.766 |
| 3 | 100,000 | 1,000 | 28.129 | 127.064 / 186.710 / 250.010 | 144.060 / 483.351 / 483.351 | 815.578 | 1,443.266 |

## Median of the three runs

| Lines | Initial update | Cached render p50 / p95 / p99 | Tail update + render p50 / p95 / p99 | Heap delta | RSS delta |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.835 | 0.543 / 1.288 / 1.696 | 0.615 / 1.174 / 1.174 | 11.298 | 26.359 |
| 10,000 | 3.052 | 9.768 / 13.023 / 13.855 | 9.729 / 12.362 / 12.362 | 164.862 | 260.359 |
| 50,000 | 17.715 | 55.575 / 70.733 / 104.346 | 56.495 / 73.101 / 73.101 | 608.717 | 1,500.078 |
| 100,000 | 24.722 | 118.722 / 186.710 / 225.310 | 119.734 / 225.158 / 225.158 | 1,417.581 | 2,115.484 |

Every cached-render sample made zero component render calls. Despite that cache hit, the median p50 grew from 0.543 ms at 1k lines to 118.722 ms at 100k lines (about 219× for 100× history). The remaining cost is therefore outside component rebuilding: the current frame still walks every component, maps escaped lines, rebuilds anchors/search inputs, copies `lastFullLines`, and only then selects 24 visible rows.

The 100k p50 is far above the maintenance target of making editor-only work viewport-bound. Task B correctly bounded the pi-tui root and terminal writes, but it did not remove Transcript's own O(N) frame work; Task A remains necessary.

## Evidence limits

- This is an in-process structural benchmark, not keyboard-to-terminal-write latency and not a Terminal.app/iTerm2 paint measurement.
- Heap/RSS numbers describe a live synthetic 100k snapshot plus renderer caches. They are not retained-heap slopes and do not prove a leak. The 50k/100k spread also shows that allocator and GC behavior remains noisy even with per-scenario process isolation.
- The pre-Task-B `6c03e80f` fixture was temporary and deleted after its recorded run. Its report used the same documented 100-lines-per-node shape but did not preserve machine-readable raw runs or per-scenario process isolation. Its 100k cached-render p50/p95/p99 of 125.071/157.008/192.129 ms is comparable in scale, but no precise percentage claim between the two baselines is made.
- This fixture uses short Markdown text. Tool cards, code, images, partial streaming, concurrent 10/50 snapshot-per-second loads, event-loop delay, backpressure, lifecycle counts, and 60-minute terminal runs remain required after implementation.

## Required final comparison

The final Task A candidate must rerun this exact committed harness on the same host/runtime. In addition to latency improvement, deterministic operation-count tests must prove that editor-only frames visit only viewport blocks and do not perform full-history fingerprint, escape, or pi-tui diff work.
