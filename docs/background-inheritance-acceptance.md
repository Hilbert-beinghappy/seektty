# Background inheritance acceptance / 背景继承验收

> Historical record: this document describes the original canvas-only implementation. Panel/code inheritance and foreground-only hover are covered by the [current acceptance record](transparent-surfaces-hover-acceptance.md).

Date: 2026-08-29 (Asia/Shanghai). Branch: `codex/background-inheritance`.

Base: `662b753` (the OSC 11 implementation from PR #162). Implementation commits: `8f96856`, `e4273fd`. This is a local development candidate still numbered `1.2.4`; it does not replace the published release. No push, PR creation or release was performed for this feature.

## Automated results

| Layer | Result | What it proves / limitation |
| --- | --- | --- |
| `pnpm run check` | Passed: 113 test files, 962 passed / 1 conditional skip; typecheck and build passed | Includes existing renderer, mouse, clipboard, overlay and input regressions. The Clarify acceptance conditional skip is unrelated to backgrounds. |
| `pack:check` and candidate pack | Passed: 23 allowlisted entries | No new dependency, `workspace:` consumer dependency, credential, personal theme or local Profile included. |
| Official dsh `0.1.1-rc.2` | Passed | Fresh registry installation in a temporary directory; no Host package source changes. Candidate install, full boot to the non-interactive TUI boundary, removal, reinstall, second boot, packed launcher and Host module-identity checks passed in isolated `DSH_HOME` directories. |
| Existing Windows ConPTY mouse harness | Passed: one cycle, 9,587 captured characters, exit 0 | Packaged interactive boot, mouse/context-menu gestures, resize and exit. This harness uses `NO_COLOR`, so it does not test transparency or successful OSC 11 synchronization. |
| Additional local truecolor ConPTY probe | Passed: 61,592 captured characters, exit 0 | Packaged `theme → terminal → explicit → theme` saves, resize at 120×36 / 90×28, and the `/theme` background editor. Explicit RGB output observed. No OSC 11 query was visible to the harness; the application displayed its unavailable-sync notice. This verifies the fallback path, not a GUI compositor or successful query/restoration. |

Environment: Windows, Node `26.1.0`, pnpm `11.7.0`, pinned pi-tui `0.73.1`, node-pty `1.1.0`. Candidate SHA-256:

```text
940866023a4aea18111654338d3c2b54aad87f1c6eb028108d53a125f7a162c0
```

The first local truecolor probe waited for a success toast, which was hidden by the higher-priority unavailable-sync warning. The saved namespace already showed `terminal`; the probe was corrected to assert the persisted field display instead. No product change was needed for that probe failure. The corrected run is the result above. Capture lengths are character counts, not encoded byte counts.

### Coverage by invariant

- `theme-config.test.ts`, `settings-schema-i18n.test.ts`, `appearance-background.test.ts`: legacy/default settings, invalid values, localized schema, revision-protected saves, failed/unexpected saves and theme-file independence.
- `actions-background.test.ts`, `actions-theme.test.ts`: the same three-option editor via both Chinese/English entry points, immediate whole-appearance callback after save, no application on cancel/failure/no-op, theme preview/save/cancel and failed preview persistence.
- `terminal-background.test.ts`, `terminal-session.test.ts`: deferred single query, all modes, pending switch to `terminal`, preserved original precision, duplicate replies, deduplicated writes, timeout/late reply behavior, one unavailable notice per lifetime, disabled synchronization, write failures, teardown and new lifetime.
- `background-inheritance.test.ts`, `theme.test.ts`, `tui-render-stability.test.ts`: SGR 49 versus explicit fill, inner style resets, unchanged code/panel/hover/selection backgrounds, complete row filling, forced repaint, resize, shorter content, overlay removal and unchanged geometry.
- `transcript-viewport.test.ts`: historical viewport, selection, copied text and hit maps survive mode changes, without full-history rendering.
- `terminal-background.test.ts`, `terminal-input-framing.test.ts`: split/malformed/oversized/late OSC isolation from composer, nested search and a real secret-input overlay in all three modes; opaque bracketed paste.
- `process-guards.test.ts`: normal/fatal cleanup and simulated POSIX suspend/resume. A simulated POSIX signal is not a macOS/Linux device test.

## Real-terminal matrix — not signed off

| Environment | Expected behavior | Actual GUI result |
| --- | --- | --- |
| Windows Terminal `1.24.11911.0`, current user transparency settings | Default canvas uses terminal effects; sync only after a valid reply | **Untested**. Installed version verified; desktop terminal automation is unavailable under the agent's UI-safety constraints. The user's opacity value/configuration was not read or changed. |
| macOS iTerm2 or Ghostty | Same mode/state machine; verify effects and exit restoration in the actual emulator | **Untested: no device** |
| Linux Kitty or Ghostty | Same mode/state machine; compositor may affect transparency/blur | **Untested: no device** |
| Non-query-capable terminal | No recoloring; default canvas and one notice in `theme` | Unit tests + ConPTY unavailable-query fallback passed; **GUI untested** |
| `SEEKTTY_TERMINAL_BACKGROUND=off`, low-color / `NO_COLOR` | No recoloring; selected mode unchanged | Unit policy and `NO_COLOR` ConPTY passed; **GUI untested** |
| tmux / screen | No query, mutation or forced passthrough | Unit policy passed; **actual multiplexer untested** |

No three-platform visual-compatibility claim is made. Manual acceptance remains required before treating this as visually verified on all supported platforms.

### Manual checklist

Use a temporary Profile, not the everyday Profile. Record terminal version, OS, color capability, and whether transparency/blur/images were already enabled. Do not change terminal settings during the comparison. No API key or model request is needed to open the settings/theme editors.

1. Observe the shell background before launch. Start the candidate with old/default appearance settings; verify the canvas retains the terminal's effects in `theme`. On a query-capable terminal, check the theme color also reaches grid padding.
2. Open `/settings seektty-appearance` → **Background mode**. Change to `terminal`; verify restoration of the pre-launch color, without a flash of explicit RGB or changed viewport dimensions.
3. Choose `explicit`, then `theme`, several times. Check full repaint, no stale rows/characters, and no session restart. Confirm each choice remains selected when reopening the editor. Check `/theme` → **Background mode** reaches the same editor.
4. Change interface and code themes; preview then cancel a custom theme. Confirm the background mode stays unchanged, and code, panels, hover and selection remain readable with their own colors.
5. With a long test transcript, scroll into history and select text. Switch modes; verify copied selection and history anchor survive. Resize smaller/larger and close nested overlays; check empty areas, scrollbars and pointer targets.
6. During startup and a mode change, type harmless text in chat/search and a disposable API-key field (do not save it). No `]11;rgb:…` or other control-frame fragment may appear. Cancel the field.
7. Exit normally and check the shell color against step 1. Where available, also test a catchable termination and POSIX suspend/resume. Do not use forced termination to assess guaranteed restoration.
8. Relaunch with `SEEKTTY_TERMINAL_BACKGROUND=off`; repeat all three modes. No terminal recoloring should occur. Repeat in a real tmux/screen session and a non-query-capable terminal. `theme` stays default-background and reports unavailable sync once; it must not silently become `explicit`.

### Isolated manual launch

Verify `dsh --version` reports `0.1.1-rc.2` first. From this checkout, build/pack and install the candidate into a temporary `DSH_HOME`. The following commands do not replace the everyday Profile or change terminal settings.

PowerShell:

```powershell
pnpm run build
$backgroundTestRoot = Join-Path $env:TEMP ('seektty-background-manual-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backgroundTestRoot | Out-Null
pnpm pack --pack-destination $backgroundTestRoot
$backgroundPreviousDshHome = $env:DSH_HOME
try {
    $env:DSH_HOME = Join-Path $backgroundTestRoot 'home'
    dsh plugin --profile tui add --config.enable-global-virtual-store=false (Join-Path $backgroundTestRoot 'seektty-1.2.4.tgz')
    if ($LASTEXITCODE -ne 0) { throw 'Candidate installation failed' }
    dsh --profile tui
} finally {
    $env:DSH_HOME = $backgroundPreviousDshHome
}
```

macOS/Linux shell:

```sh
pnpm run build
background_test_dir="$(mktemp -d)"
pnpm pack --pack-destination "$background_test_dir"
DSH_HOME="$background_test_dir/home" dsh plugin --profile tui add --config.enable-global-virtual-store=false "$background_test_dir/seektty-1.2.4.tgz" &&
DSH_HOME="$background_test_dir/home" dsh --profile tui
```

## 中文验收结论

已完成实现与自动化验收：962 项通过、1 项无关条件跳过，类型检查、构建、23 项包白名单，以及全新官方 dsh `0.1.1-rc.2` 下的隔离安装／启动／移除／重装均通过。背景模式使用完整外观应用回调；主题预览仍独立，取消或保存失败不改变背景模式。

ConPTY 分别验证了现有鼠标路径，以及候选包三模式保存／切换、resize、主题入口和正常退出。后者走的是 OSC 11 不可用降级，不能冒充成功改色与透明度视觉验收。第一次补充探测误把成功 toast 当作唯一判据，实际上设置已保存；改为检查保存后的字段显示后通过。

Windows Terminal 实机视觉验收受当前桌面终端自动化限制未执行；macOS/Linux 没有设备；真实 tmux 与其他终端仍待人工验证。上方清单与隔离启动命令用于后续逐项签收，不宣称“三端实测全过”。个人主题、#161 任务书、日常 Profile 和终端配置未修改；本次只做本地提交，不推送、不提 PR、不发布。
