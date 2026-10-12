> Historical17770b9/4433deb candidate report. Its old missing/optional table was superseded by the subsequent explicit terminal adapters. Current disposition and candidate gates: [remaining-terminal-acceptance-2026-10-01.md](remaining-terminal-acceptance-2026-10-01.md). The original evidence below is preserved, not promoted to certify new source.

# SeekTTY integration acceptance — 2026-09-30

## Fixed candidate and development boundary

- Worktree: the repository checkout
- Branch: `codex/next-integration-acceptance`; trusted baseline `00dba96f32fc2e02bcd8544c325c4e1bb8a97a67`.
- Packaged source: **`4433deb374dbe7055c913771a9a88db70dc7d075`**. Later acceptance-only documentation/script commits do not change this package. Any subsequent production or generated-lib change requires a new candidate and new package acceptance.
- Immutable tarball: `.artifacts/p1-4433deb/seektty-1.2.6.tgz`
- SHA256: **`16cf416b60244e569673550a3862c3fb79f5917274520c6401f0b2fb210e53ab`**.
- Official target: unmodified `@deepseek-ai/dsh 0.2.0-rc.2`, source `639ed015397290b3745d163aafe02ffee4aa3f84`, verified closure of 278 exact official packages.
- Four existing sessions each own one fixed worktree. E serially owns shared public wiring and integration; D and S02 delivered independent modules; review owns its separate worktree. Unknown A/C changes and the user's original checkout remain untouched. No push, PR, publication, real credentials, personal history, or real model request.

The Library report and CSV were read through supported tools. Their `37fc3d0` snapshot is design/history, not evidence that the current branch works. The original eight CSV columns remain unchanged. Previously reported worker/source-baseline tests are historical evidence and are not substituted for this candidate's gates.

## Actual candidate gates

| Gate | Actual result | Evidence |
| --- | --- | --- |
| Full integration suite, isolated HOME/XDG/DSH_HOME, Node 24.20.0 | **222 files, 2181 passed, 1 existing skipped**; official file-storage loopback and published SubagentRuntime regression enabled | `.artifacts/final-full-4433deb.log` |
| Typecheck | Passed after the complete suite and again against frozen source | full log; `.artifacts/p1-4433deb/candidate-gates.log` |
| Central build and package check | Passed; **37 package entries** | `.artifacts/central-build.log`; candidate gates log |
| Fresh build of immutable Git archive | Passed; recorded tarball identity | `.artifacts/p1-4433deb/build.log`; `candidate.json` |
| Source/generated-lib agreement | **23 lib JS files identical by SHA256** to fresh archive build; tracked outputs committed | `.artifacts/p1-4433deb/source-lib-proof.json` |
| Official stock install → launch → remove → reinstall | Passed under isolated HOME/XDG/DSH_HOME, GVS disabled | candidate gates log; `.artifacts/p1-4433deb/acceptance/stock-SLVWNe/wrapper-report.json` |
| Same candidate, default real PTY, no fixture or globals shim | Composer reached; `/privacy` opened; `/exit` **code 0** | `.artifacts/p1-4433deb/default-privacy-pty.log` and its recorded evidence directory |
| Same candidate, native core real PTY | **26 steps passed**, including stream/cancel/tools/question/approval/subagent/image/files/Markdown/native ZIP/cold resume and exit0 | `.artifacts/p1-4433deb/terminal-pty.log`; `acceptance/terminal-csXijY/wrapper-report.json` |
| Same candidate, management real PTY | **17 steps passed**: Settings/themes/Provider create-discover-edit-route-delete/plugin restarts/Profile creation-copy-switch/persistence | `.artifacts/p1-4433deb/management-pty.log`; `acceptance/management-L1G11Y/wrapper-report.json` |
| Final independent reference-navigation/cancel/package journeys | **Pending independent follow-up**; 190 mixed-file/durable history/breadcrumb checks passed | Parent-coordinated review; do not infer acceptance from source tests |

The stock launch is a non-TTY startup boundary, not interactive acceptance. The explicit node-pty journey supplies the interactive default-boot evidence. GVS=false is the tested lifecycle configuration; the existing upstream GVS=true loader limitation is retained, not counted as successful boot. The one skip is the optional Clarify package-install journey without CLARIFY_SPEC; its planted doctor regression did run. Source-map warnings are visible in the full log, not hidden. The terminal runner initially failed before PTY because the isolated HOME could not resolve Corepack pnpm12.8.1. The acceptance script now consumes the supplied fixed pnpm11.7.0 entry through a local shim, and the full same-package terminal journey was rerun successfully. The failed wrapper report remains at `acceptance/terminal-U05SG8/wrapper-report.json`; it is not counted as a pass.

### Reproduction commands and exit status

The final orchestration used local, disposable helpers to supply only OS launch variables, Node24, fixed pnpm11.7.0 and isolated directories. Every successful command below exited **0**; the pre-shim terminal attempt exited **1** before plugin install and is retained separately.

```text
python3 /tmp/seektty-final-full.py final-full-4433deb.log
python3 /tmp/seektty-central-build.py
python3 /tmp/seektty-p1-build.py                 # ran while HEAD was4433deb
python3 /tmp/seektty-candidate-gates.py .artifacts/p1-4433deb/candidate.json
python3 /tmp/seektty-final-default-pty.py        # same candidate, --privacy
python3 /tmp/seektty-final-pty-suites.py terminal
python3 /tmp/seektty-final-pty-suites.py management
```

Repository-backed runners are `scripts/acceptance-run-isolated.mjs`, `settings-default-pty.mjs`, `native-dsh-acceptance.mjs`, `native-management-acceptance.mjs` and `stock-dsh-cycle.mjs`. The reusable acceptance wrapper receives `--suite`, `--candidate`, `--sha256`, `--dsh-bin`, `--dsh-entry`, `--out` and `--pnpm-entry`; CLI shim and entry must resolve to the same official CLI. The policy runner receives the candidate, official CLI path, exact SHA256 and `--privacy`, with `SEEKTTY_PNPM_ENTRY` pointing at the installed pnpm CLI. Temporary orchestration helpers are supporting local evidence, not published package code.

The consolidated machine-readable record is `.artifacts/p1-4433deb/final-gates.json`. Package digest was checked before/after suites and after acceptance-only documentation edits. Tests/scripts/full-suite status do not override the independent public reference counterexample gate.

### Privacy observation and correction

The default official PTY at `190c601` reached the composer but `/privacy` failed with `cannot get property "configEditor" without inject`. `f83bde4` explicitly declares `configEditor` and `profileContext` dependencies in the runner. A real Cordis plugin-fiber regression covers this dependency declaration; the rebuilt package then passed the actual default PTY journey.

The final read-only policy journey **does not set `DSH_TELEMETRY_DISABLED`**, use a fixture patch, or grant feedback. It observed `session-log-deepseek` **enabled, 8,388,608 bytes**, and OpenTelemetry **explicit feedback only, 4,000,000 bytes**. This is the actual composed policy view, not a statement that no channel can upload. Logs can accompany Provider requests; disabling future logs does not revoke prepared/uploaded requests; re-enabling may send an unaccepted suffix. OTel mode requires Profile configuration/restart, and Desktop analytics is separate. No payload disabled/in-flight/re-enable test or remote feedback upload was performed.

## Source and public-entry delivery

Core adaptation includes native Bundle patch arrays, exact Settings/Provider routing, field-scoped volatility preserving unknown ordinary fields, actual Preset roster decoding, flat Session V4 history/migration/export and tool error bodies, cached/live sequence-domain separation, bounded stream/readiness queues, partially failing directories, bounded native-tail cleanup, clipboard writer termination/fallback, and Fenwick growth. Independent reviews closed their identified defects; review outcomes are tied to the specific source SHA tested.

Public entries now include:

- `/sessions` search and three-state filtering, pin/restore and guarded archive; `/plans`, native `/plan`, `/files`, `/trajectory`, real workspaceChanges Review port, recorded full-content selection/copy.
- `/mcp resources` through actual scoped Host ResourceRuntime/ToolRuntime permissions, optional Team roster/tasks/mailbox, and published Schedule catalog/list/history/update/delete. No invented MCP inventory Remote or Schedule pause method.
- `/model-info`, actual Provider/settings route, `/account` via native service/Gateway and existing HTTP callback origin; omitted model modality/capacity remains unknown, absent capability has an explicit disabled reason.
- `/questions`: exact-live-root, strict official descriptor identity and real Agent projection. A true answer response means queued, not settled. Foreground timed waits use actual callId/remainingMs and ASK_TIMED_OUT; the continued controller completes only when Agent admission settles the question.
- Four process-display modes through actual published process projections and Settings/CAS, retaining legacy default, independent tool-card binding, live/error/aborted/unknown content, disclosure, search reveal/restore and native replay.
- Fetch-title safe URL keyboard/context/pointer actions, awaited copy and guarded opener; Enter retains the ordinary toggle action.
- `/descendants` with actual Host listDescendants, exact direct parent/depth one, stable service/parent identity and generation/address gates. Real hot/cold child opens and parent return closed the original P2 at `5bd6d3b`. Target-ID breadcrumb lookup fixed the follow-up P3 at `190c601`, independently verified with actual hot/cold identities. Full-subtree traversal cost is explicitly retained.
- **Generic file intake is implemented**, not merely image input: `/attach-file` local upload → official receipt, `/file-references` Host discovery → reference selection, `/attachments` details/removal, retained prompt `{type:'file', receiptId}`, mixed image/file and `/steer` dispatch, captured-draft acceptance and per-Session ownership. Source tests exercise actual retained Session/schema/Gateway and official storage. Audio/video are opaque file handles/receipts, not a guarantee of native model modality. Cancelling a dispatched upload may leave Host-owned stored bytes; no revoke endpoint, rollback/deletion claim or blind retry is invented. Independent actual 190 package mixed-send/durable-file checks passed, detailed below. Reference insertion left a modal active; 4433deb now ends navigation before editor focus. A cancelled upload now visibly warns that Host may have saved it. The new package needs these follow-up counterexamples rechecked.

## Independent PTY evidence and its limits

Historical fixed-package reports remain useful but do not certify the final 4433deb package automatically:

- `60adec9`, tarball `35df45da16d3de553b419d1f0125a3b691cf7b59c5277d0f7a77302c53022822`: no-shim default boot/exit, true scoped timed question answered before deadline, timed timeout → continued → queued → native Agent admission/settled; MCP read/deny/cancel; Team lead; Schedule CAS/refused deletion/unknown deadline without retry; recorded 321-line ToolRuntime preview and middle/full-content copy; model information, image clear, synthetic account refusal, URL copy. The independently reported journeys are summarized here by source revision and package digest; reproduce applicable paths with the repository acceptance scripts.
- `6abb5c6`: actual four-mode Settings writes/unset, custom Ctrl-Y cycle independent of Ctrl-O, same-profile restart persistence, completed/live process grouping, actual tool errors and V4 aborted input, native replay, exit 0. Unknown-extension/interleaved/narrow cases are source-test boundaries, not PTY measurements.
- `5bd6d3b`: original real hot/cold child P2 closed. It exposed the separate breadcrumb P3, subsequently fixed and independently verified in `190c601`.
- `190c601`: breadcrumb hot/cold target identity fixed; real txt/mp3/mp4 storage SHA256 matches, mixed text/image/three-file queue accepted with original request ID and synthetic model reply, durable V4 attachment IDs/names/bytes, failed PNG retains draft, file/directory quoted reference prompts without uploading again. A 1.8s late official save after Escape retained no local draft and had one upload/no retry. The reference-modal P2 and missing cancellation warning prompted the 4433deb follow-up; its independent recheck is pending.
- Actual browser login/open, real model/account search, unknown payment/model capacity, Windows/Linux/Node22 and real stdout backpressure are not certified. Safe fixture opener/refusal tests are not real browser authentication. Large-workspace frame latency is unmeasured.

## 127-row final disposition

`docs/acceptance-127-ledger-2026-09-30.csv` has **127 unique F-IDs and 16 columns**, preserving all original source/plan/risk fields and adding precise implementation/gate/remaining-work evidence. A passed package or total test count does not make every row complete.

The disposition categories are **28 terminal-not-applicable original rows, 21 Host-inherited rows, 10 existing TUI rows, 57 adaptation/public-entry rows with individual evidence boundaries, 7 optional experiment rows without complete dedicated adaptation, 3 explicitly unimplemented contracts, and 1 partial file-watch row**. These categories account for all 127; they are not a completion percentage.

| Actual missing implementation | Disposition |
| --- | --- |
| **F062 automatic file watch** | Explicit refresh and subscription/generation cleanup are present; the viewer says file watch is not enabled. Filesystem auto-refresh/watch is absent, not simply untested. |
| **F066 official session-menu extension → terminal registry** | Not implemented; existing terminal context actions are not equivalent. |
| **F077 Web input extension hooks → terminal adapter** | Not implemented; existing input-trigger support is not equivalent. |
| **F117 remote SSH file adapter** | Not implemented; local upload and Host-owned execution do not prove remote Host file-path support. |

**F023/F034/F079/F083/F094/F114/F118** optional auto-review/Browser Use/Creator/SenseVoice/experiment-label/Webworker-preview/Computer Use capabilities are not installed or enabled by this Bundle. Generic native tool/permission/plugin paths remain available, but dedicated optional UI/provider/device/model behavior is absent or untested per each original row. No automatic installation/default activation or all-127 completion is claimed.

The completed 26-step terminal and 17-step management suites use the final immutable candidate, not the old source-task package. Their successful stock/plugin/Profile/Provider paths do not certify every optional bundle combination.

Other implementation-versus-test distinctions are retained per row: F071 existing lazy tree/list behavior has no large-workspace performance measurement; F072 version diagnostics are `/doctor` and `/status`, not a claim of identical Web Settings layout; real composed archive/Plan/Review and some watcher/device/permission combinations remain untested. F038 actual defaults were observed, but payload policy transitions were not exercised. Host-inherited engine behavior is not independently certified merely because the package installs.

The parent decides whether the explicit missing/optional capabilities require a subsequent scoped phase. This candidate is held for final independent gates and publication instructions; it is not declared a complete implementation of all 127 changes.
