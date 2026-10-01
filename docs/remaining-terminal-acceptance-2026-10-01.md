> Clean release snapshot and new metadata-only package mapping: [release-snapshot-2026-10-01.md](release-snapshot-2026-10-01.md). The original205207c candidate evidence below is preserved by its exact digest.

# Remaining terminal adapters: frozen candidate and evidence

The preserved integration branch is `codex/remaining-terminal-adapters`. The separate release snapshot branch is `codex/seektty-rc2-terminal-release`, parented directly by PR211 head00dba96. The earlier17770b9 candidate and all other worktrees remain preserved. No push, PR or publication occurred.

Source/distribution revision: **205207c** (source fix **b53f7be**). Immutable package: `.artifacts/remaining-205207c/seektty-1.2.6.tgz`, **SHA25616a14965908f3068ce74c999d9a9ad280c3ec09e4bc50643677ce0f1acfd7e51**. Documentation-only commits after205207c do not change this candidate. Consume this exact package rather than repacking when comparing PTY evidence.

| Gate | Actual outcome | Evidence |
| --- | --- | --- |
| Complete integration tests, Node24.20.0, official/optional fixture paths enabled | **241 files; 2369 passed; 1 existing Clarify install skip** | `.artifacts/remaining-205207c/full.log` |
| `tsc --noEmit` | Exit0 | `.artifacts/remaining-205207c/typecheck.log` |
| `tsdown` and fresh immutable Git archive rebuild | Exit0; **23 tracked/generated/packed JS files byte-identical** | `build.log`, `archive-build.log`, `source-lib-proof.json` in candidate directory |
| `scripts/pack-check.mjs` | Exit0; **55 allowlisted entries**, exact manifest/optional compositions | Candidate `pack-check.log` |
| Same tarball original Host install/launch/remove/reinstall | Exit0, **0.2.0-rc.2 / 278 exact native packages**, fresh HOME/XDG/DSH_HOME | `stock.log`, `stock/stock-xgRKju/wrapper-report.json` |
| Same tarball default privacy PTY | No fixture, globals shim, credentials or telemetry override; composer, read-only `/privacy`, **exit0** | `privacy-pty.log`; its recorded temporary report |
| Same tarball Host-files default PTY | No fixture service injection; directory/text → actual write → native watch refresh → four Back pages → **exit0** | `host-files-pty.log`; its recorded temporary report |
| Same tarball core PTY | **26 steps passed**, synthetic loopback model/tool responses only | `terminal.log`, `terminal/terminal-6u1Bc1/wrapper-report.json` |
| Same tarball management PTY | **17 steps passed** including Settings/Provider/Profile/plugin persistence/restarts | `management.log`, `management/management-LKfKPh/wrapper-report.json` |
| Public WAV independent PTY | **Passed independent exact-package public PTY** with unchanged official Loader/SpeechController/Gateway and an inert recognizer | Parent-coordinated review; do not substitute source test totals |

Stock non-TTY launch is an installation/startup boundary, not interactive acceptance. The separate node-pty suites supply interactive evidence. GVS=false remains the tested lifecycle configuration; upstream GVS=true loader limitations are not declared fixed. Every above pass completed after any transient disconnection/failed attempt. Initial full-suite failure was only an untracked newly regenerated management chunk while build/commit were in progress:2368 passed plus1 failure. The regenerated chunk was committed, and the complete suite reran successfully. That failed log remains `/tmp/seektty-e-b53-full.log`. An early local archive-proof helper failed because system Python did not support `tarfile.extractall(filter=...)`; the validated own Git archive was then rebuilt successfully, not counted as a pass before retry.

## Public defects closed in this phase

- F066 queued/in-flight Session extension target fencing (`356c857`): independent actual Loader/TUI/OverlayQueue target removal yields zero callback, no stale success. Permissions remain native.
- Localized approval conceal/control injection (`f0ca414`, upstream worker0dd529a): independent official Auto→Overlay→xterm validates visible tool arguments for localized and legacy reasons, while raw audit remains unchanged.
- Watch cleanup and strict-boundary correction (`04ad001`, independent1f794e99): dispose and bounded iterator return are independently attempted, and failed/unconfirmed cleanup blocks successor. Explicit strictConfined refuses with zero read without atomic provider evidence. **Ordinary authorized Host path-based reads remain best effort; native TOCTOU is not fixed.**
- Produced-file open gate (`c247802`): an existing gate returning undefined means allowed; absent method/explicit unknown mapping still refuse.
- Missing default Host workspaceFiles service (`9f05e79`, buildd5acd0c): main native Bundle row, exact optional native peer/dev pin and startup injection added. Independent fresh stock d5acd0c PTY passed actual directory/text/binary/watch/backstack with no synthetic service mounting. Final same-package default watch repeats the applicable path.
- WAV restricted Context getters (`b53f7be`, build205207c): validated services use `ctx.get`. A real sibling-service Cordis plugin plus consumer declaring only speechController reproduces the old direct getter failure; fixed catalog/transcribe/follow pass. Published descriptor fingerprint, strict parameter/result codecs and Gateway authority are unchanged. Independent exact-package public PTY closed the original restricted-Context counterexample: catalog, explicit preparation,3244-byte WAV, reviewed insertion and one undo; dispatched cancellation with5s late output kept the new draft, with no retry or model request.

## 127-row disposition and actual boundaries

The CSV keeps **127 unique F-IDs and16 columns**, preserving all eight original source/plan/risk columns. The old unimplemented/blanket optional table in the4433deb report is superseded. There are **29 whole-feature terminal N/A rows** (the original28 plusF114), **21 Host-inherited rows**, **10 existing TUI rows**, and **67 rows requiring individual adaptation/public-entry/optional-contract evidence**. This is a scope classification, not a completion percentage or proof that all127 were individually tested.

| Row | Delivery | Actual remaining boundary |
| --- | --- | --- |
| F066 | Explicit Cordis-loadable terminal Session extensions with exact target/lifetime guards | Official React menu-slot DOM components cannot execute automatically; plugins need explicit terminal registration. |
| F077 | Loadable input activities, opaque selection/caret capture, monotonic draft revision, undo, busy/disposal/generation isolation | React configuration panels/recording components are not rendered automatically. |
| F062 | Default scoped Host file viewer and versioned native changes observation; close/reconnect cleanup | SSH backend publishes watch unsupported: manual refresh. No claim of atomic path confinement. |
| F117 | Host stat/read/readBytes/list/changes and recorded-artifact public paths; synthetic remoteHTTP/official Local tests | No real SSH credentials, shell/PTC connection or deployment tested; no separate SSH client invented. |
| F023 | Experimental Auto risk labels, localized human approval, native denial versus technical failure | No paid reviewer/model call; exact dedicated public PTY evidence remains named separately. |
| F094 | Exact official experimental package-prefix labels in list/detail | Does not certify every experimental plugin/device deployment. |
| F079 | Native-installable opt-in full official Creator composition and `/mode cordis`; Standard/PTC default management stays disabled | Independent real companion install/PTY passed at6f29d05; no actual npm tool installation or paid model operation. |
| F034 | Explicit Playwright-MCP/ChromeDevTools-MCP/Stagehand-native compositions; official runtime permission/scoping fixtures | Real browser targets are untested; Stagehand requires its supported model/key. Inert driver tests are not browser/device acceptance. |
| F118 | Explicit Cua-native/Cua-MCP compositions, official ToolRuntime/inert driver contracts | Real desktop OS permissions, Cua SDK and device actions untested. Cancelling does not roll back completed OS actions. |
| F083 | `/speech wav`: consent, bounded owned WAV snapshot, explicit prepare/transcribe/review, guarded draft insertion | **Real-time microphone capture is not implemented in this WAV-only entry.** Actual ASR/model download/accuracy/CPU and microphone OS permission are untested. Opt-in official voice bundle required. MP3/MP4 receipts are not ASR support. |
| F114 | Whole-feature terminal N/A: browser WebWorker/VFS/config-worker/React preview | Existing auxiliary usage is not this feature's implementation. |

Other concrete untested boundaries remain per row: F071 large-workspace latency/lazy workspace grouping has no PTY performance measurement; F038 policy payload transitions/in-flight/re-enable feedback are not exercised; real stdout backpressure, Windows/Linux/Node22, real account/browser login, native model modality/capacity absent metadata, cold Team membership races and some cross-feature combinations are not certified. Existing hot/cold child, timed/continued question, generic txt/mp3/mp4 receipt, mixed durable V4 prompt, reference/cancel-focus, four-mode content safety and safe URL-copy independent package evidence remains historical by its exact SHA; it is not silently recertified by the final total count.

No known production quality failure is declared closed solely from worker self-report. The final public WAV counterexample was independently closed at the preserved16a149…7e51 candidate. Actual hardware/accounts/model actions require deployment authorization; React-only surfaces and browser-onlyF114 remain explicitly inapplicable rather than hidden missing work.

## Reproduce the fixed package gates

Use Node24, fixed pnpm11.7.0, and the verified original stock CLI entry. The repository's wrappers isolate HOME/XDG/DSH_HOME. Do not let machine Corepack choose a different package manager and do not run `pnpm build` where auto-install would modify shared dependencies.

```text
SEEKTTY_OFFICIAL_NODE_MODULES=<verified stock node_modules> SEEKTTY_OPTIONAL_NODE_MODULES=<SHA512-verified fixture node_modules> node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsdown/dist/run.mjs
npm_execpath=<fixed pnpm11.7.0 CLI> node scripts/pack-check.mjs
node scripts/acceptance-run-isolated.mjs --suite <stock|terminal|management> --candidate <exact tarball> --sha256 <above digest> --dsh-bin <stock entry> --dsh-entry <same stock entry> --out <owned evidence directory> --pnpm-entry <fixed pnpm CLI>
SEEKTTY_PNPM_ENTRY=<fixed pnpm CLI> node scripts/settings-default-pty.mjs <exact tarball> <stock entry> <above digest> --privacy
SEEKTTY_PNPM_ENTRY=<fixed pnpm CLI> node scripts/settings-default-pty.mjs <exact tarball> <stock entry> <above digest> --host-files
```

All reported final commands exited0. No real credentials, personal Session history, microphone, browser launch, desktop input or paid model requests were used. Management's pre-existing theme HTTPS import only fetches the public theme fixture. Source-map warnings are retained in logs. Publication remains parent/user-controlled.
