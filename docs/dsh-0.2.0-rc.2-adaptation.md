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
