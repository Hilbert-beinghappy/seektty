# Native history / active tail candidate (#197)

This is an opt-in architecture candidate based on `ced1d6d` (includes #198 and
#199). It is not a declaration that #197 is complete. The existing renderer
remains the package default; `SEEKTTY_NATIVE_TAIL=1` enables the candidate for
native mode. `SEEKTTY_NATIVE_TAIL=0` selects the existing implementation. Full
mode retains the existing renderer in either case. No new Harness setting exists.

## Contracts

- Harness remains the only Session, Agent, settings and persistence owner. The
  new ledger contains only process-local display receipts: replay generation,
  source key, exact token, source range and delivery state. Source offsets are
  UTF-16 string offsets; segment boundaries never split a surrogate pair.
- Completed history leaves ordinary Transcript rendering, Canvas decoration and
  pi row comparison. Only the current viewport is retained by the new writer for
  differential painting. Source reconciliation is measured separately.
- Writes are serialized, including pi protocol/control output. The real stdout
  adapter waits for both its write callback and drain when required. A receipt
  commits only after successful delivery. A failed/partially written transaction
  stops further writes and is never automatically retried.
- Simple complete paragraphs and top-level fenced code lines can commit before
  a turn settles. Code uses the existing Shiki GrammarState cache. Uncertain
  Markdown (nested blocks, references, incomplete inline syntax, CR-containing
  source) remains mutable. This conservative fallback preserves content rather
  than asserting stability that the parser cannot prove.
- Historical source edits append a labeled update. Presentation-only changes do
  not recolor/refold committed history. Explicit `/transcript replay` starts a
  new generation and appends the current authoritative presentation after a
  separator; it never erases prior scrollback.
- Initial backfill starts after input is installed, yields between pages and
  writes at most 256 rendered history rows per transaction. Esc can stop loading
  or idle replay output; skipped history is recorded separately from successful
  commits. New messages still display, and explicit replay retries omitted history.
- Session changes invalidate queued old-generation frames. Resize appends a
  fresh viewport when the previous coordinates cannot safely be reused. Native
  mode round trips retain the owned viewport when dimensions remain compatible.
- Normal exit drains accepted output and emits the remaining display tail before
  restoring protocols. This does not mark a Harness turn as settled. The existing
  fatal process guard still owns emergency restoration and termination.

## Compatibility boundary

The candidate adapter targets the package-patched **pi-tui 0.73.1** and is tested
with **unmodified official dsh 0.1.1-rc.2**. The two private pi hooks are
`__seekttyNativeFrame` (after component/overlay composition, before retained row
diff) and `__seekttyWrite` (serialized stdout dispatch). They do not add private
Harness access. `dsh.bundle.patch`, native `dsh plugin` reconciliation and the
default path's existing dsh compatibility declaration remain intact.

## Reproducible validation

```text
pnpm install --frozen-lockfile
pnpm run check
node scripts/native-tail-pty.mjs
DSH_BIN=<official-cli> SEEKTTY_SPEC=<tgz> pnpm run test:stock
DSH_BIN=<official-cli> DSH_ENTRY=<official-entry> SEEKTTY_SPEC=<tgz> SEEKTTY_NATIVE_TAIL=1 node scripts/foreground-pty-acceptance.mjs
```

On Debian, also run the final command with `SEEKTTY_TEST_TMUX=1`. All package
acceptance scripts create keyless isolated `DSH_HOME` directories. They do not
call a model or reuse user Sessions.

The PTY probe alternates old/new paths five times for 1k/10k/100k history rows,
uses synthetic snapshots, sends input from the parent into a focused component,
and reports external echo, real timer drift, snapshot processing, frame work,
memory and structural counters. Its JSON goes to `.artifacts/native-tail-pty.json`.
The parent polls at 5ms, so the absolute echo values include polling/PTY overhead.
This is not a paid-model or UU end-to-end measurement. Earlier diagnostic runs
using a consuming input listener exercise a different scheduler path and must
not be mixed into the focused-component comparison.

Regression tests check receipts, backpressure/errors, 100k-row exclusion,
screen/scrollback order and duplication, CJK/Emoji, final code lines, pending
suffixes, revisions, Session switches, cancellation, explicit replay and shutdown.
The actual Surface fixture runs both existing modes and the candidate.

### 2026-09-05 focused-component PTY comparison

Each cell is the median of five run-level measurements, in milliseconds. All
six size/platform groups pass the chosen combined >10% and >2ms regression
threshold for external echo p50/p95 and timer drift p50/p95. Large outliers in
individual runs remain in the local JSON; these are synthetic measurements,
not guarantees for arbitrary user Sessions.

| Platform / history rows | Echo p95 old → candidate | Timer drift p95 old → candidate | Frame work p95 old → candidate |
| --- | --- | --- | --- |
| Windows / 1k | 31.665 → 31.617 | 6.388 → 6.312 | 0.529 → 0.495 |
| Windows / 10k | 31.799 → 31.909 | 6.917 → 6.632 | 1.030 → 0.472 |
| Windows / 100k | 45.549 → 33.809 | 17.378 → 11.755 | 5.426 → 0.674 |
| Debian / 1k | 6.341 → 6.310 | 0.845 → 0.829 | 0.589 → 0.456 |
| Debian / 10k | 8.776 → 9.286 | 0.958 → 0.965 | 0.857 → 0.410 |
| Debian / 100k | 49.475 → 28.967 | 19.897 → 3.879 | 9.422 → 0.417 |

Snapshot processing has **not** disappeared: at 100k rows its measured p95
increased from 3.538 to 7.236ms on Windows and 3.792 to 5.117ms on Debian,
including the new exact display-token checks. The ordinary-frame improvement
does not justify claiming the remaining snapshot architecture gate is complete.

## Open gates before a default switch / closing #197

1. **Snapshot cost remains O(history).** Official `Session.subscribe` delivers a
   no-argument invalidation, and `ChatNodeStore` is a live keyed reader even for
   old snapshots. Neither an unchanged order array nor an old snapshot identifies
   every changed node. Exact source checks remain; no hash/length heuristic or
   invented node revision replaces them. `nativeSnapshotBlocksChecked` and
   `fingerprintsComputed` expose this cost separately from ordinary frames.
2. **Complex active Markdown is conservative.** General nested Markdown
   segmentation and bounded full-source highlight-array work are not certified.
   GrammarState reuse does not make all current-code costs constant.
3. **UU/manual acceptance remains required:** orientation changes, keyboard
   open/close, historical review, original-text copying and terminal visual
   behavior. Automated PTYs and virtual terminals do not satisfy this gate.

Local deployment of this candidate is for acceptance and does not authorize a
repository default switch, issue closure, merge, or npm publication. A local
launcher may opt in without changing the package default or Harness settings.

## 中文说明

本实现是 #197 的候选阶段，不代表议题已全部完成。已提交历史退出普通绘制路径；
主题、语法和折叠变化只影响尾部与后续输出，旧内容由 `/transcript replay` 重新输出。
回放不清空终端历史；取消不冒充提交成功；会话日志完整性仍由官方 Harness 校验。

当前仍保留全历史精确快照检查，复杂 Markdown 采取保守分段，UU 人工验收尚未完成。
因此包内默认行为保持原样。本地启动器可单独启用候选供验收，不能据此关闭 #197。
