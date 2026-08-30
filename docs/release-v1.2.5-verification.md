# SeekTTY 1.2.5 — Owner review and release checklist

This is the review record for the `1.2.5` release candidate. It is not evidence that `v1.2.5` has been tagged or published.

- Previous published release: `v1.2.4`.
- Candidate branch: `codex/npm-publish-1.2.5`, based on merged PR #182. Its cumulative scope is every merged change after `v1.2.4`, the pnpm 11 layout adapter, and the npm publication contract.
- Candidate artifact: `seektty-1.2.5.tgz`, built with pnpm `11.7.0`.
- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Release notes: [English and Chinese in one document](release-v1.2.5.md).
- Publication status: **not tagged, not released, and not published to npm**.

No credentials, Profile/Session contents, raw terminal logs, personal themes, or generated package-manager caches belong in this review evidence.

## Review map

| Area | Primary implementation and evidence |
| --- | --- |
| Welcome settings and safe Fastfetch provider | `src/client/welcome-settings.ts`, `src/host/fastfetch.ts`, `src/protocol.ts`, Fastfetch/settings tests |
| Sanitized Logo and responsive welcome renderer | `src/compat/terminal-logo.ts`, `src/client/welcome-logo.ts`, `welcome.ts`, packaged whale asset, [welcome acceptance record](fastfetch-welcome-acceptance.md) |
| Transactional editor and Settings navigation | `src/client/welcome-editor.ts`, `src/client/actions.ts`, `settings.ts`, actions/welcome/navigation tests |
| Terminal color lifecycle and background modes | `src/client/terminal-background.ts`, `appearance.ts`, `surface.ts`, terminal/background tests and compatibility records |
| Transparent surfaces, hover, and code background | `src/client/theme.ts`, `overlays.ts`, `syntax-highlighter.ts`, transparent-surface acceptance record |
| Visual TextMate highlighting | `src/client/syntax-theme-rules.ts`, `syntax-highlighter.ts`, theme import/config and syntax tests |
| Transcript reasoning, tool cards, and hit rows | `src/client/transcript.ts`, transcript/tool-card/mouse tests |
| Model, effort, permission, and overlay selection | `src/client/actions.ts`, `capabilities.ts`, `chrome.ts`, permission/model/overlay tests |
| Per-command pnpm policy | `src/pnpm-compat.ts`, `src/bin.ts`, `src/host/profile-plugin-manager.ts`, launcher/plugin tests |
| Exact failure classification and recovery | `src/pnpm-compat.ts`, `src/bin.ts`, `tests/pnpm-compat.test.ts`, `tests/launcher.test.ts` |
| Profile plugin commands and help | `src/client/actions.ts`, `src/client/help.ts`, `src/host/profile-plugin-manager.ts` |
| Real layout lifecycle | `scripts/pnpm11-layout-acceptance.mjs`, `scripts/stock-dsh-cycle.mjs`, `scripts/mouse-pty-harness.mjs` |
| Shared candidate CI | `.github/workflows/ci.yml`, [layout acceptance record](pnpm11-layout-acceptance.md) |
| Package and documentation contract | `tests/package-contract.test.ts`, both READMEs, generated `lib/`, pack allowlist |

## Candidate evidence

The final values below must describe the exact package inputs proposed for Owner review. GitHub-hosted matrix results remain separate from local Windows evidence.

| Gate | Result |
| --- | --- |
| `pnpm run check` | Pass — 123 test files; 1086 passed / 1 conditional skip; typecheck, build, and pack check passed |
| Tracked `lib/` and launcher `--version` | Pass — generated bundle rebuilt; launcher reports `seektty 1.2.5` and tested dsh `0.1.1-rc.2` |
| Package allowlist | Pass — 25 packaged entries, including the sanitized built-in welcome Logo; no Profile, Session, `.env`, cache, or personal theme paths included |
| Welcome/Fastfetch automated coverage | Pass — defaults, three information modes, safe/trusted sources, process limits, cache generations, ANSI sanitization, responsive layouts, draft rollback, navigation, and direct top/bottom row movement |
| Structural TUI performance | Pass — 12 isolated runs at 1k / 10k / 50k / 100k transcript lines, 80 columns × 24 rows |
| Windows GVS=false isolated lifecycle | Pass — official dsh install plus add, boot, remove, re-add, second boot, launcher isolation, and Host identity checks |
| Windows GVS=true compatibility branch | Pass as a diagnostic gate — real paths entered `store/v11/links`; the exact current dsh/Cordis failure and recovery advice were classified. This is not a claim of GVS=true support |
| GitHub CI, Windows/macOS/Linux × Node 22/24 | Pass — all six pnpm 11 layout jobs plus the main check and Windows launcher job succeeded on PR #182 |

Record the final candidate SHA-256 in the draft GitHub Release and external `SHA256SUMS` after building from the approved merge commit. It is intentionally not embedded here because this document is part of the tarball being hashed.

Local evidence was collected on Windows `10.0.22631`, x64, Node.js `v26.1.0`, pnpm `11.7.0`, against the unmodified official dsh `0.1.1-rc.2`. The package targets Node `^22.19.0 || >=24`; the PR matrix separately covers Node 22 and 24.

Local process gates do not substitute for manual GUI-terminal, clipboard, network Provider, or optional-plugin acceptance. CI runners are not evidence of macOS/Linux desktop terminal interaction.

## Reproduce the candidate in isolation

Use a new terminal and a disposable directory. Do not point `DSH_HOME` at a normal Profile.

### Windows PowerShell

```powershell
pnpm install --frozen-lockfile
pnpm run check
$reviewRoot = Join-Path $env:TEMP ('seektty-125-review-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reviewRoot | Out-Null
pnpm pack --pack-destination $reviewRoot
$env:DSH_HOME = Join-Path $reviewRoot 'dsh-home'
$env:SEEKTTY_UPDATE = 'off'
$env:SEEKTTY_SPEC = Join-Path $reviewRoot 'seektty-1.2.5.tgz'
dsh plugin --profile tui add --config.enable-global-virtual-store=false $env:SEEKTTY_SPEC
dsh --profile tui
```

### macOS / Linux

```sh
pnpm install --frozen-lockfile
pnpm run check
review_root="$(mktemp -d "${TMPDIR:-/tmp}/seektty-125-review.XXXXXX")"
pnpm pack --pack-destination "$review_root"
export DSH_HOME="$review_root/dsh-home"
export SEEKTTY_UPDATE=off
export SEEKTTY_SPEC="$review_root/seektty-1.2.5.tgz"
dsh plugin --profile tui add --config.enable-global-virtual-store=false "$SEEKTTY_SPEC"
dsh --profile tui
```

Press Esc at first-run credential setup for local-only testing. Use no real credentials in disposable fields.

The dedicated layout gate installs its own official dsh and candidate under isolated pnpm and dsh directories:

```sh
pnpm test:pnpm11-layout false /path/to/candidate-directory
pnpm test:pnpm11-layout true /path/to/candidate-directory
```

`false` must complete the stock lifecycle. `true` must either complete after an upstream fix or prove the real GVS layout and classify the exact current dsh/Cordis loader failure. A known, correctly diagnosed upstream failure is not the same as GVS=true support.

## Owner sign-off

- [ ] **Welcome defaults and persistence:** open a genuinely empty Session and confirm API-key onboarding has priority, the original-color whale and runtime facts appear without invoking Fastfetch, tall content scrolls, and the first persistent message removes the non-durable welcome page.
- [ ] **Welcome editor:** exercise `custom`, `fastfetch`, and `mixed`; continuous custom-row editing; one-step and direct top/bottom movement; Logo source/color choices; safe-module ordering; live preview; one-level Escape; Save/Cancel; refresh/reset; and save-failure rollback.
- [ ] **Fastfetch trust boundary:** verify the missing-executable fallback, safe `--config none` information, local Fastfetch Logo reuse, and the explicit warning before a trusted user config. Use no unreviewed `command` module or secret-bearing output.
- [ ] **Appearance and themes:** test `theme`, `terminal`, and `explicit` on a transparent and opaque Windows Terminal profile; switch themes, resize, open nested overlays/code, and exit. Confirm readable text, no stale cells or control-sequence leakage, and original terminal-color restoration where supported.
- [ ] **Code highlighting:** compare built-in light/dark and at least one imported VS Code theme across representative Python/TypeScript/JSON/Markdown/Diff blocks. Confirm detailed language scopes and preserved explicit token styles/backgrounds.
- [ ] **Interaction regressions:** fold live/completed Thinking, expand and fully collapse tools, click each model/effort/mode region, change permission in both directions including a failure, and resize a wide overlay without losing its search/selection/viewport state.
- [ ] Review the source adapter and exact dsh range; confirm it does not alter global pnpm configuration or Profile ownership.
- [ ] Confirm CI uses one uploaded candidate across all six OS/Node combinations and review every matrix result.
- [ ] Download or locally produce the exact candidate, verify its allowlist and SHA-256, then run an isolated install and boot.
- [ ] Confirm the failure message contains no credential and does not misclassify unrelated loader failures.
- [ ] Decide whether pending macOS/Linux real-terminal checks block publication or should remain explicitly untested.
- [ ] Explicitly authorize tag and GitHub Release creation in a separate action. Merging this PR alone is not publication authorization.
- [ ] Confirm npm identity, verified email, 2FA, public access, rollback, and the exact `seektty@1.2.5` package before the final interactive publish.

## Publication procedure — Owner only, after approval

1. Confirm the merge commit has green required checks and no package-input changes after the reviewed artifact was produced.
2. Rebuild `seektty-1.2.5.tgz`, verify its allowlist and checksum, and store `SHA256SUMS` outside the checkout.
3. Confirm `npm whoami`, the public package name, version, `latest` dist-tag, packed file list, and checksum.
4. Create `v1.2.5` at the exact approved commit and prepare a **draft** GitHub Release using [the bilingual notes](release-v1.2.5.md). Attach the same tarball and checksum file.
5. After a final Owner confirmation, publish that exact tarball interactively with 2FA: `npm publish /absolute/path/seektty-1.2.5.tgz --access public --tag latest --registry=https://registry.npmjs.org/`.
6. Verify Registry metadata and the isolated official-dsh lifecycle from `seektty@1.2.5`, then publish the prepared GitHub Release and compare its downloaded asset SHA-256.

This first npm release intentionally has no automated publishing workflow. Configure npm Trusted Publishing only after the package exists; do not add a long-lived write token.

## Rollback

No state migration is introduced. Close SeekTTY, retain the affected Profile, and reinstall the published predecessor with native reconciliation:

```sh
dsh plugin --profile tui add --config.enable-global-virtual-store=false https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
```

Do not delete `DSH_HOME`, Settings, Sessions, or plugin manifests. If the global launcher is also under review, pin `SEEKTTY_SPEC` to the same known-good tarball and keep automatic updates disabled while testing.

## 中文审核摘要

本文件对应 1.2.5 Release 候选，不代表已经打 tag、创建 GitHub Release 或发布 npm 包。候选范围覆盖 1.2.4 之后全部已合并 PR、完整 Fastfetch 风格欢迎页、Settings 导航整理、终端背景与透明表面、VS Code 视觉级高亮、思考／工具卡／点击命中、权限与选择器修复，以及 pnpm 11 包布局适配；不迁移 Settings、Profile 或 Session。

Owner 需要审核欢迎页与 Fastfetch 信任边界、主题／透明背景、代码高亮、对话与选择器交互、pnpm 适配范围、六组 CI 矩阵、精确候选包、打包白名单和 SHA-256，并在隔离 `DSH_HOME` 下启动验证。GVS=true 当前若命中已知上游 Loader 错误，只能说明诊断正确，不能宣称已经支持该布局。macOS/Linux CI 与真实桌面终端人工验收继续分开记录。

合并准备 PR 不等于执行发布。包已配置为公开 npm 包，启动器与自更新改用精确 npm 版本 spec；Owner 仍需审核精确 tarball、文件清单、SHA-256、CI、npm 身份与回滚方案，并在 `npm publish` 前作最后一次明确确认。首次发布后再配置 Trusted Publishing，不保存长期写 Token。
