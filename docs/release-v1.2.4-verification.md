# SeekTTY 1.2.4 — release verification and checklist

Release record for `v1.2.4`. The [GitHub Release](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.4) is the source of truth for publication time and downloadable artifacts.

- Previous release: `v1.2.3` / `04f2837`.
- Merged code baseline: upstream `main` at `a2e3950`, including mouse/input fixes in PR #154, user-message rules in PR #155, and the existing README update in PR #156.
- Finalization changes only the release documents; package inputs and README files remain identical to that baseline.
- Artifact: `seektty-1.2.4.tgz`, built with pnpm `11.7.0`; SHA-256 recorded below and in the release's `SHA256SUMS` asset.
- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Release notes: [English and Chinese in one document](release-v1.2.4.md).

No credentials, Profile/Session contents, raw terminal logs, personal theme files, or package caches are included in the review evidence.

## Review map

| Area | Primary code and regression coverage |
| --- | --- |
| User-message top and bottom rules | `src/client/horizontal-rule.ts`, `chrome.ts`, `transcript.ts`; transcript and viewport tests cover themes, wrapping, resize, selection, and search |
| Stable list viewport, focus guard, nested hover | `patches/@mariozechner__pi-tui@0.73.1.patch`, `src/client/overlays.ts`, `mouse-activation.ts`, `mouse-controller.ts`, `theme*.ts`; autocomplete, overlay-pointer, and theme tests |
| Escape/SGR framing and undo | The pinned pi-tui patch, `src/client/chrome.ts`, `transcript.ts`; `tests/terminal-input-framing.test.ts`, `tests/input-undo.test.ts` |
| Overlay selection and footer buttons | `src/client/overlay-text.ts`, `overlay-footer.ts`, `overlays.ts`; overlay text-selection and footer tests |
| Independent menu and gesture handoff | `src/client/mouse-context-menu.ts`, `mouse-controller.ts`, `surface.ts`; `tests/context-menu.test.ts`, `tests/mouse-controller.test.ts` |
| Keymap and distribution | `src/client/keymap.ts`, `help.ts`, both READMEs, package contract tests, rebuilt `lib/`, `scripts/mouse-pty-harness.mjs` |

Review the pi-tui patch together with its lockfile hash and generated bundle. It is bundled inside SeekTTY, not applied to the official dsh installation.

## Candidate evidence

The following results were collected on 2026-08-28 for the final 1.2.4 package inputs, including the user-message rules. They do not describe the earlier PR #154 candidate or the locally installed 1.2.3 test build. Release documents are not packaged, so documentation-only finalization does not change this artifact.

| Gate | Result |
| --- | --- |
| Frozen dependency installation | Pass — pnpm `11.7.0`, lockfile unchanged |
| `pnpm run check` | Pass — 109 files; 892 passed / 1 conditional skip; typecheck, build and 23-entry pack allowlist passed |
| Tracked `lib/` and launcher `--version` | Pass — rebuilt bundle matches the merged code; `seektty 1.2.4` |
| `pnpm run perf:tui` | Pass — 12 runs: 1k / 10k / 50k / 100k lines, three repeats, 80 columns × 24 rows |
| Official dsh isolated add / boot / remove / re-add | Pass — exact 1.2.4 tarball on unmodified official dsh `0.1.1-rc.2`, including second boot and package/Host identity checks |
| Windows ConPTY menu gestures and clean exit | Pass — one cycle of the exact 1.2.4 candidate, `contextMenuGestures: true`, 9588 bytes, exit code 0; not GUI-equivalent |
| Package allowlist | Pass — 23 packaged entries; no Profile, Session, `.env`, package caches, or personal themes included |
| GitHub CI | Consult checks for the release tag's commit and its documentation PR; local checks do not substitute for CI |

Release artifact SHA-256 (`seektty-1.2.4.tgz`): `63a0a3d692a0380affe7701c8a37fc79bb0f749ba903df9dc5ecaf83abbc41ba`.

Environment: Windows `10.0.22631`, x64, Node.js `v26.1.0`. The package targets Node `22.19`; GitHub CI checks Node `22.x`. Compare a freshly downloaded release asset with `SHA256SUMS` before installation.

The optional Clarify doctor test is conditional. A skipped optional test is not a passed joint-plugin acceptance run. No paid Provider request is needed for the automated mouse checks. Legacy Host versions, optional plugin workflows, real clipboard contents, and 100 repeated PTY lifecycles are not claimed as newly accepted here.

## Test the release in isolation

Prerequisites: Node.js `^22.19.0 || >=24`, pnpm `11.7.0`, and official `dsh --version` reporting `0.1.1-rc.2`. Check out `v1.2.4`, then use a **new terminal** so the isolated environment does not replace your normal `DSH_HOME`.

### Windows PowerShell

```powershell
pnpm install --frozen-lockfile
pnpm run check
$reviewRoot = Join-Path $env:TEMP ('seektty-review-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reviewRoot | Out-Null
pnpm pack --pack-destination $reviewRoot
$env:DSH_HOME = Join-Path $reviewRoot 'dsh-home'
$env:SEEKTTY_UPDATE = 'off'
$env:SEEKTTY_SPEC = Join-Path $reviewRoot 'seektty-1.2.4.tgz'
dsh plugin --profile tui add $env:SEEKTTY_SPEC
dsh --profile tui
```

### macOS / Linux

```sh
pnpm install --frozen-lockfile
pnpm run check
review_root="$(mktemp -d "${TMPDIR:-/tmp}/seektty-review.XXXXXX")"
pnpm pack --pack-destination "$review_root"
export DSH_HOME="$review_root/dsh-home"
export SEEKTTY_UPDATE=off
export SEEKTTY_SPEC="$review_root/seektty-1.2.4.tgz"
dsh plugin --profile tui add "$SEEKTTY_SPEC"
dsh --profile tui
```

Press Esc at first-run credential setup for local-only testing. Use harmless text in disposable fields, not real credentials. Close this testing terminal afterward; keep your normal Profile and the previous release tarball intact.

To rerun lifecycle and PTY checks, set `DSH_BIN` to the official dsh executable and keep `SEEKTTY_SPEC` pointing at the candidate. Run `pnpm test:stock`, then set `SEEKTTY_MOUSE_PTY=1` and run `pnpm test:mouse-pty`. Both scripts create their own isolated `DSH_HOME` directories. Run `pnpm run perf:tui` separately.

## Manual owner sign-off

These items are intentionally **unchecked**. Record terminal/OS versions and observed results in the PR; synthetic tests and ConPTY injection are not GUI acceptance.

- [ ] **User-message framing:** verify one pair of thin top/bottom rules matching the composer around historical user messages, including multiline prompts and resized terminals; copying and searching in-app must use message text, not decorative rules.
- [ ] **Startup and nested pages:** without minimizing first, open Settings; first click selects a row, a later click enters it. Confirm hover and Select/Back buttons through at least three page levels. Keep dangerous confirmations keyboard-only.
- [ ] **List scrolling:** in slash candidates and long settings lists, wheel-scroll to the middle, click a visible item, and verify no recentering. Up/Down should scroll only at an edge; Enter and a second click target the visible candidate correctly.
- [ ] **Escape framing:** repeatedly press Esc while moving the mouse over a search field; no protocol fragments appear. Check both hover enabled and disabled.
- [ ] **Selection and editing:** drag-select overlay body text and search/input text; release retains selection. Type, Backspace/Delete, Cut/Paste, and Ctrl+Z operate on the correct field. Test CJK, emoji, multiline input, and a harmless masked placeholder; never copy a real secret.
- [ ] **Menu ownership:** open the menu over a nested page. Outside left-click and Esc dismiss only the menu; inside menu actions take one click. Underlying buttons must not activate on dismissal.
- [ ] **Gesture handoff:** with the menu open, wheel once to scroll immediately; left-drag to select from the original press; right-drag to show the menu only at the release position. Repeat inside and outside its bounds, over the transcript and a parent input/list. Parent modal capture must remain intact.
- [ ] **Long transcript and cancellation:** select across viewport edges and drag the scrollbar. Repeated menu gestures must not introduce whole-history repainting. Refocus, resize, page changes, and native/full mode toggling must not leave stuck selection or stale menu targets.
- [ ] **Themes, shortcuts, and exit:** test dark/light and one existing custom theme, narrow and wide terminals, `NO_COLOR`, grouped live key bindings, Ctrl+Z history isolation, and restoration of normal terminal mouse/keyboard input after exit.
- [ ] **Real clipboard:** manually round-trip harmless `中文🙂 café` and multiline text through the active platform clipboard. Record separately from adapter tests; retain F3/native selection as fallback.

| Environment | Manual status |
| --- | --- |
| Windows Terminal / VS Code terminal | Pending owner sign-off |
| macOS Terminal.app / iTerm2 | Pending; no local macOS GUI environment used |
| Linux terminal, Wayland / X11 | Pending; Linux CI is not desktop clipboard acceptance |
| tmux / SSH / extended keyboard protocols | Pending environment-specific follow-up |

The owner decides whether remaining platform gaps block publication or require explicitly scoped follow-up. Do not mark unchecked environments as passed.

## Release procedure

The release request authorizes publication. No automatic publishing workflow or repository visibility change is introduced. The existing workflow runs Linux checks/stock boot and Windows launcher checks. Use this sequence for the authorized release:

1. Finalize and merge the bilingual release documents without changing the reviewed code or READMEs. Check GitHub CI and keep untested manual environments explicitly listed above.
2. Verify frozen dependencies, `pnpm run check`, the performance gate, and the exact packaged artifact's lifecycle/PTY checks. Confirm rebuilt `lib/` matches the reviewed code and `node lib/bin.js --version` reports `seektty 1.2.4`.
3. Keep `seektty-1.2.4.tgz` and `SHA256SUMS` outside the checkout. Verify that the tag's package inputs match the verified artifact. Do not upload local Profile, Session, `.env`, logs, caches, or personal theme files.
4. Create `v1.2.4` at the exact release commit and a **draft** GitHub Release with the tarball, `SHA256SUMS`, and [this bilingual release document](release-v1.2.4.md) as the notes. Confirm tag, package version, asset name, and checksum match.
5. Publish the authorized draft. Download the published assets, compare their SHA-256 values, and verify isolated installation from the downloaded package. There is no npm Registry publication step.

## Rollback

No state migration is introduced. Exit TUI and use native `dsh plugin --profile tui add` with a retained, known-good tarball for the intended Profile. The published predecessor is:

```sh
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.3/seektty-1.2.3.tgz
```

Keep automatic updates off during rollback testing. If the global `deepseek` launcher was upgraded, pin its package and `SEEKTTY_SPEC` to the same chosen tarball. Do not delete `DSH_HOME`, Settings, or Session data. Version 1.2.3 retains its known mouse limitations; native selection is a temporary fallback.

## 中文审核说明

本记录对应正式 1.2.4 发布：包内容基于已合并的 `main@a2e3950`，包含 PR #154 的鼠标与输入修复和 PR #155 的历史用户消息上下细线。最后仅完善发布文档，不再修改 README。中英文 Release 说明仍保存在同一文件。

最终包通过 892 项测试（1 项条件跳过）、类型检查、构建、23 项打包白名单、十万行性能检查、官方 dsh 隔离插拔，以及 Windows ConPTY 手势和退出检查。上面的安装命令使用新终端和隔离 `DSH_HOME`，不会覆盖日常 Profile；退出首次 API Key 提示即可测试本地界面。自动测试和 Windows ConPTY 不等于三端 GUI／真实剪贴板验收，未测环境仍明确保留，不标绿。

发布时固定 tag 和包内容，上传安装包及 `SHA256SUMS`，使用同一份双语说明；发布后重新下载、核对校验和并验证隔离安装。发布时间与附件以 GitHub Release 页面为准。回滚通过原生插件安装替换旧包，不删除配置或会话。
