# dsh 0.2.0-rc.2 adaptation

The official npm `latest` and `next` tags both resolved to `0.2.0-rc.2` on 2026-09-30. This development branch starts from SeekTTY main at `37fc3d0`. The published SeekTTY 1.2.6 package is unchanged; this checkout must be built and installed as a local tarball.

## Native contract changes

The declared minimum and tested Host are both exactly `0.2.0-rc.2`. Earlier Hosts lack the new preset, settings, and tool-result contracts. Development dependencies, optional dsh peers, and the audited internal closure target that version. The stock CLI resolves 278 dsh packages at exactly that version. Cordis and Schemastery peers follow the official CLI ranges (`~4.0.4`, include `~1.0.9`, loader `~1.0.5`, Schemastery `~3.18.4`). The consumer package contains no workspace dependency and supplies no duplicate Host packages.

- Presets now use `dsh-agent-preset-registry` and native profile-patch declarations. Standard, minimal, and PTC declarations follow the official Web bundle. The retired filesystem copy/delete endpoints are unavailable; opening the preset document opens the native profile Settings document.
- PTC execution uses `dsh-ptc-runtime-node`. Cold tool presentation acquires and releases an official preset scope, including cancellation cleanup, instead of keeping a standing scope.
- Settings forms are declared by five terminal plugins with volatile Config schemas. Harness persists them through the active profile patch; SeekTTY does not maintain a separate settings store.
- The jobs controller supplies job baselines independently of session control. The native inbox projection supplies queued and steering messages. Native flat tool-result messages are projected into the existing terminal-card format without modifying durable Host messages.
- Permission selection remains in the native Session projection; choices come from the separate process catalog Remote and refresh on its invalidation event. Permission changes still use the official command and retain confirmation rules.
- Generated Remote codecs now expose lazy schema factories. The retained terminal transport accepts these factories. Native Bundle inspection accepts a patch string or a nonempty array and validates each path.
- Detached workers import only a stateless locale contract; a regression compares its constants to the installed official package.

## Verification

Local verification uses macOS arm64, Node 24.20.0, and pnpm 11.7.0. Model traffic in the native runners uses loopback fixtures with the current Messages protocol. The official CLI and its installed packages are unmodified, and every lifecycle test uses an isolated DSH_HOME.

Candidate: `.artifacts/candidate-020/seektty-1.2.6.tgz`.

SHA-256: `97c6716dc63b727b408a324f87f2d91cc6a4b722d90caef2cde8e849fce0c444`.

| Check | Observed result |
| --- | --- |
| Frozen pnpm install | Passed with the committed lockfile |
| `pnpm run check` | Typecheck, 179 test files, 1551 passed / 1 skipped, production build, and 36-entry pack check passed |
| Official stock Host | CLI and 278 resolved dsh packages verified at exactly `0.2.0-rc.2` |
| Stock lifecycle | Same final candidate installed, booted, removed, and reinstalled; module identity, detached worker, and launcher checks passed |
| Native terminal | 26 steps passed: permission catalog/selection, streaming, cancellation, tool write, question, allow/reject approval, subagent, attachment, native ZIP/Markdown export, and restart/resume |
| Native management | 17 steps passed: locale, welcome cancel/save, themes, Provider discovery/edit/routing, plugin restart/remove, Profile creation/copy/switch, and persisted settings |
| pnpm 11 GVS disabled | Final candidate passed the full official Host lifecycle |
| pnpm 11 GVS enabled | Final candidate reproduced and classified the known upstream loader incompatibility; this is not a successful GVS boot |

The native terminal and management reports both identify this final candidate hash and record clean terminal exits. Final runner processes also exited. Generated logs, npm caches, stock installations, and native reports remain outside the committed package.

## Reproduction and boundaries

Run `pnpm install --frozen-lockfile && pnpm run check`, then `pnpm pack --pack-destination .artifacts`. Install the official Host with `node scripts/install-stock-dsh.mjs`. Pass that installation's DSH_BIN and the candidate SEEKTTY_SPEC to the stock and management runners; the terminal runner also needs DSH_ENTRY, and management needs SEEKTTY_PNPM_ENTRY. Run `pnpm test:pnpm11-layout false .artifacts` and the corresponding `true` gate.

This record covers fresh native profile-patch configuration and controlled profile restarts. It does not verify migration from the retired global settings.yaml file. Initial runs using that legacy file raced Host onboarding; acceptance now configures the native profile patch before boot. Real paid model traffic, manual GUI mouse/clipboard behavior, and optional Clarify/Vision-Exp combinations were not revalidated. Linux, Windows, and Node 22 are covered by the PR CI matrix when it finishes. This change does not publish an npm release.

## 2026-10-13 registry and API audit

SeekTTY main was fast-forwarded to `37fc3d0` before continuing this adaptation. Live npm metadata still places `0.2.0-rc.2` on both `latest` and `next`; `0.2.1-alpha.2` is on the separate `alpha` channel. This adaptation targets the default `latest` channel.

The audit compared 132 versioned npm manifest requests for the 66 packages in the union of the old and new development contracts, including the official CLI. Twenty packages changed availability or their exports/entry metadata. Fourteen official source archives for presets, Settings, Session control, LLM messages, Remotes, registry codecs, and permissions were also verified against their registry SHA-512 integrity before inspecting declarations and implementation. Local snapshots and the complete comparison remain under the ignored `.artifacts/dsh-latest-20261013/` directory.

| Contract | Change from 0.1.5-rc.3 | SeekTTY adaptation |
| --- | --- | --- |
| Agent presets | `dsh-agent-presets` is retired; presets are declarations in the native profile patch | Use `dsh-agent-preset-registry`, `selectedDefault`, and disposable `acquireScope()` leases; route document editing to native Settings |
| Settings | Explicit `settings.register()` namespaces are replaced by Loader Config forms | Mount five terminal settings plugins with volatile schemas and keep persistence in Harness |
| Queue and jobs | Session control no longer supplies queue/job baselines | Project queued/steering messages from `inbox` and subscribe to the separate job controller |
| Permissions | Session projection contains selection; available/default choices come from a separate process catalog | Refresh the native Remote catalog on invalidation and preserve the native permission-change command |
| Tool results | Result content and `isError` are flat fields on the tool message | Adapt terminal cards and exports without modifying durable Host messages |
| Remote codecs | Generated contributions provide lazy schema factories | Resolve native factories in the retained terminal transport |
| PTC runtime | `dsh-code-runtime-worker-thread` is retired | Compose `dsh-ptc-runtime-node` and native preset scopes |
| Host peers | CLI now uses Cordis `~4.0.4`, include `~1.0.9`, loader `~1.0.5`, Schemastery `~3.18.4` | Match all four official ranges in peer/development dependencies and the lockfile |

The minimum and tested Host remain exactly `0.2.0-rc.2`. The previous minimum cannot safely expose these new contracts. `node scripts/bump-dsh.mjs --check` confirms `updateAvailable: false` for the default channel.

### Windows validation fixes

The existing PR's Node 22 CI failure was a JavaScript test using native `await using` syntax. Explicit awaited `try/finally` disposal retains the same lifecycle assertions and verifies that the cold preset lease is released twice across the two independent reads.

The terminal runner now verifies the actual official CLI behind its executable shim, so a Windows `.cmd` entry is accepted only when it resolves to the audited Host. Markdown checks wait for the completed-save receipt before reading the file. Management checks wait for the welcome editor to close after its persisted save before sending the next command.

Both native runners release the input socket and output worker left alive by natural ConPTY exit in the pinned `node-pty` `1.1.0`. This acceptance-only cleanup runs after the child exit event and output drain, is idempotent, and rejects an unaudited dependency version or internal shape. It does not signal an already exited process or change the packaged application.

### Windows results

Validation used Windows, pnpm `11.7.0`, Node `22.23.3`, and the same packaged candidate for every lifecycle and PTY journey. An additional full check used the workstation's Node `26.1.0`.

Candidate: `.artifacts/dsh-latest-20261013/candidate/seektty-1.2.6.tgz`.

SHA-256: `e0a6059ba5dd795c1b625675336d2c2296f77c10679fcf92168a1284053208de`.

| Check | Observed result |
| --- | --- |
| Frozen install | Passed without changing the committed lockfile |
| Full check on Node 22 and Node 26 | Each passed typecheck, 179 files / 1551 tests / 1 existing skip, build, and 36-entry pack check |
| Final focused contracts on Node 22 | Five files / 42 tests passed for cold presentation, native rc.2 contracts, multiplexing, permissions, and packaging |
| Official stock Host | Unmodified CLI and 278 installed dsh packages verified at exactly `0.2.0-rc.2` |
| Stock lifecycle on Node 22 | Candidate install, boot, remove, reinstall, official module identity, detached worker, and packed launcher checks passed; command exited 0 |
| pnpm 11 GVS disabled | Full official Host lifecycle passed; command exited 0 |
| pnpm 11 GVS enabled | Known upstream loader incompatibility precisely classified; command exited 0, without claiming a successful GVS boot |
| Native terminal on Node 22 | 26 steps passed, including permissions, streaming/cancellation, tools, questions, approvals, subagents, images, Markdown/ZIP export, and cold resume; both terminal exits and the runner command exited 0 |
| Native management on Node 22 | 17 steps passed, including locale, welcome, themes, Provider discovery/edit/routing, plugin restart/removal, Profile copy/switch, and persisted settings; runner command exited 0 |

Earlier Windows attempts exposed the fixture save/close races and retained ConPTY worker described above. Final terminal and management passes ran in new isolated homes after those fixes and ended without externally terminating their runners. The candidate package bytes were unchanged by these validation-only fixes. All model requests used loopback fixtures; normal credentials, Profiles, and Session history were not modified. This remains an unpublished development adaptation; GitHub CI is tracked separately on PR #211.
