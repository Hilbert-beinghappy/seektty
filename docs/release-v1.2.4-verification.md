# SeekTTY 1.2.4 — owner review and release checklist

Status: prepared for review; **not merged, tagged, or published by this work**.

- Base: `v1.2.3` / `04f2837` on upstream `main`.
- Implementation: `81a0b86` (`fix(tui): stabilize overlay input and context-menu gestures`).
- Candidate: `seektty-1.2.4.tgz`, built from this PR with pnpm `11.7.0`.
- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Release notes: [English and Chinese in one document](release-v1.2.4.md).

No credentials, Profile/Session contents, raw terminal logs, personal theme files, or package caches are included in the review evidence.

## Review map

| Area | Primary code and regression coverage |
| --- | --- |
| Stable list viewport, focus guard, nested hover | `patches/@mariozechner__pi-tui@0.73.1.patch`, `src/client/overlays.ts`, `mouse-activation.ts`, `mouse-controller.ts`, `theme*.ts`; autocomplete, overlay-pointer, and theme tests |
| Escape/SGR framing and undo | The pinned pi-tui patch, `src/client/chrome.ts`, `transcript.ts`; `tests/terminal-input-framing.test.ts`, `tests/input-undo.test.ts` |
| Overlay selection and footer buttons | `src/client/overlay-text.ts`, `overlay-footer.ts`, `overlays.ts`; overlay text-selection and footer tests |
| Independent menu and gesture handoff | `src/client/mouse-context-menu.ts`, `mouse-controller.ts`, `surface.ts`; `tests/context-menu.test.ts`, `tests/mouse-controller.test.ts` |
| Keymap and distribution | `src/client/keymap.ts`, `help.ts`, both READMEs, package contract tests, rebuilt `lib/`, `scripts/mouse-pty-harness.mjs` |

Review the pi-tui patch together with its lockfile hash and generated bundle. It is bundled inside SeekTTY, not applied to the official dsh installation.

## Candidate evidence

The following entries must describe the final 1.2.4 tarball, not the earlier locally installed 1.2.3 test build.

| Gate | Result |
| --- | --- |
| Frozen dependency installation | Pass — pnpm `11.7.0`, lockfile unchanged |
| `pnpm run check` | Pass — 109 files; 885 passed / 1 conditional skip; typecheck, build and 23-entry pack allowlist passed |
| Reproducible tracked `lib/` and launcher `--version` | Pass — second build byte-identical; `seektty 1.2.4`; generated renamed chunk included |
| `pnpm run perf:tui` | Pass — 12 runs: 1k / 10k / 50k / 100k lines, three repeats, 80 columns × 24 rows |
| Official dsh isolated add / boot / remove / re-add | Pass — exact 1.2.4 tarball on unmodified official dsh `0.1.1-rc.2`, including second boot and package/Host identity checks |
| Windows ConPTY menu gestures and clean exit | Pass — one cycle of the exact 1.2.4 candidate, `contextMenuGestures: true`, 9588 bytes, exit code 0; not GUI-equivalent |
| Credential-pattern / forbidden-path / pack allowlist checks | Pass — no detected credential patterns or forbidden staged paths; 23 packaged entries; personal themes excluded |
| GitHub CI | Consult the checks on the final PR head; local checks do not substitute for CI |

Local reviewed candidate SHA-256 (`seektty-1.2.4.tgz`): `BC194710C15416188C8DA6D4310DA5489D8A993C09FBFE79DC9D33386E1D04A5`.

Environment: Windows `10.0.22631`, x64, Node.js `v26.1.0`. The package targets Node `22.19`; GitHub CI checks Node `22.x`. These are local pre-publication results; the owner must record the final published artifact's checksum after rebuilding the reviewed merge commit.

The optional Clarify doctor test is conditional. A skipped optional test is not a passed joint-plugin acceptance run. No paid Provider request is needed for the automated mouse checks. Legacy Host versions, optional plugin workflows, real clipboard contents, and 100 repeated PTY lifecycles are not claimed as newly accepted here.

## Test the PR before release

Prerequisites: Node.js `^22.19.0 || >=24`, pnpm `11.7.0`, and official `dsh --version` reporting `0.1.1-rc.2`. Check out this PR, then use a **new terminal** so the isolated environment does not replace your normal `DSH_HOME`.

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

## Publish only after approval

This PR does not add an automatic publishing workflow or change repository visibility. The existing workflow runs Linux checks/stock boot and Windows launcher checks. The following steps are for the owner **after approval**, not actions already performed:

1. Review the final PR head, require successful GitHub CI, and record manual sign-off or explicit acceptance of remaining gaps.
2. Merge the PR. In a clean checkout of the reviewed merge commit, run frozen install, `pnpm run check`, the performance gate, and candidate pack/lifecycle checks again. Confirm `git diff --exit-code -- lib/` and `node lib/bin.js --version` reports `seektty 1.2.4`.
3. Pack `seektty-1.2.4.tgz` into a directory outside the checkout. Record its SHA-256 and verify the archive allowlist. Do not upload local Profile, Session, `.env`, logs, caches, or personal theme files.
4. Create the `v1.2.4` tag at that exact reviewed merge commit. Create a **draft** GitHub Release with the tarball, `SHA256SUMS`, and [this bilingual release document](release-v1.2.4.md) as the notes. Confirm tag, package version, asset name, and checksum match.
5. Publish the draft only with the owner's release approval. Verify the README's versioned download URL and a fresh isolated install from the published asset. There is no npm Registry publication step.

## Rollback

No state migration is introduced. Exit TUI and use native `dsh plugin --profile tui add` with a retained, known-good tarball for the intended Profile. The published predecessor is:

```sh
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.3/seektty-1.2.3.tgz
```

Keep automatic updates off during rollback testing. If the global `deepseek` launcher was upgraded, pin its package and `SEEKTTY_SPEC` to the same chosen tarball. Do not delete `DSH_HOME`, Settings, or Session data. Version 1.2.3 retains its known mouse limitations; native selection is a temporary fallback.

## 中文审核说明

本次仅准备 1.2.4 并提 PR，不代替 owner 合并、打 tag 或正式发布。实现提交为 `81a0b86`，版本、双语 README、同文件中英文 Release 说明及本清单在发布准备提交中整理。

上面的安装命令使用新终端和隔离 `DSH_HOME`，不会覆盖日常 Profile；退出首次 API Key 提示即可测试本地界面。证据表只记录最终 1.2.4 候选包，不把旧 1.2.3 本机测试包、模拟事件或 Windows ConPTY 当作三端 GUI 验收。人工清单仍需 owner 签收，未测环境不能标绿。

审核重点为：启动即用、多层 hover 与底栏按钮、列表不居中、Esc 不混入鼠标协议、弹窗选区与撤销、独立右键菜单、滚轮／拖选交接、右键松手定位，以及危险确认和隐私边界。通过审核和 CI 后，owner 从已合并提交重新构建、验包、打 tag、创建带同一双语说明的草稿 Release，最后决定发布。回滚通过原生插件安装替换旧包，不删除配置或会话。
