# Transparent surfaces and foreground hover acceptance / 透明表面与前景 Hover 验收

Date: 2026-08-29 (Asia/Shanghai). Branch: `codex/transparent-surfaces-hover`. Base: `upstream/main` at `ddbc946`.

This candidate extends the existing background modes without changing their settings schema or OSC 11 lifecycle. In `theme` and `terminal`, canvas, padded modal surfaces and base code backgrounds use `SGR 49`; `explicit` retains the previous RGB fills. Hover uses the interface theme's `brand` foreground only. Selection and explicitly authored TextMate token backgrounds remain colored islands. Code layout and mouse geometry are unchanged.

## Automated results

| Check | Result | Boundary |
| --- | --- | --- |
| `pnpm run check` | Passed: 115 test files; 1,024 passed / 1 unrelated conditional skip; typecheck, build and `pack:check` passed | Includes renderer, nested overlays, context menus, autocomplete, transcript controls, mode switching and syntax rendering. Missing vendor source-map warnings are pre-existing and non-fatal. |
| Packed contents | Passed: 23 allowlisted entries | No new dependency, credential, Profile, personal theme, cache or `workspace:` consumer dependency. |
| Official dsh `0.1.1-rc.2` stock lifecycle | Passed | Candidate add, boot to the non-interactive TUI boundary, remove, re-add, second boot, packed launcher and Host module-identity checks all used isolated temporary `DSH_HOME` directories. |
| Windows ConPTY mouse harness | Passed: 1 cycle, 24,918 captured bytes, exit 0 | Packaged boot, slash navigation, mouse/context-menu input, resize and clean exit. It is not GUI-equivalent and does not verify compositor transparency. |

Candidate SHA-256: `9A8809BA79DA294EDDD953AD1AE5053875A411B5859B499735C6624D3431756F`.

Automated assertions cover:

- `theme`/`terminal` emit `SGR 49` for panel rows and base inline, fenced, tool, file and diff code; `explicit` restores the theme RGB fills.
- Nested resets restore the current surface semantics without changing text width, viewport geometry or hit regions.
- Hover emits a theme foreground only: no background, underline, bold, reverse video or marker; selected and disabled rows keep their existing behavior.
- Shiki cache keys include the code-background policy. Base syntax backgrounds are inherited, syntax foreground/font styles are unchanged, and a distinct explicit token background remains eligible for output.
- Overlay open/close, resize, shorter transcript repaint and mode changes leave no stale application content in synthetic complete frames.

## Real-terminal status

| Environment | Status |
| --- | --- |
| Windows Terminal with the user's transparency/blur settings | **Manual visual sign-off required.** ConPTY passed, but it cannot prove GUI composition, acrylic, background-image continuity or perceived hover contrast. |
| macOS iTerm2 or Ghostty | **Untested: no device.** |
| Linux Kitty or Ghostty | **Untested: no device.** |
| tmux/screen and non-query-capable terminals | Existing unit policy and safe fallback passed; real multiplexer/GUI session remains untested. |

Manual sign-off should compare `theme`, `terminal` and `explicit` on both dark and light terminal backgrounds. Open nested settings/theme overlays, hover options and footer buttons, inspect inline/fenced/tool code, resize, scroll, select text, then exit. Confirm inherited areas keep terminal effects, explicit mode restores the old fills, selection stays stronger than hover, no underline appears, and the shell background is restored.

## 中文结论

自动门禁已通过：115 个测试文件中 1,024 项通过，1 项无关条件跳过；类型检查、构建、23 项包白名单、官方 dsh `0.1.1-rc.2` 的隔离安装／启动／移除／重装，以及一轮 Windows ConPTY 鼠标流程均通过。

`theme`／`terminal` 下，主画布、补齐后的弹窗面板和代码基础背景统一使用 `SGR 49`；`explicit` 保留旧 RGB 填充。hover 只使用主题 `brand` 前景色，不再使用背景、下划线、粗体、反色或额外标记；选中态和显式 token 背景继续填色。代码布局、鼠标命中、设置格式与 OSC 11 生命周期均未改变。

ConPTY 不能代替真实 Windows Terminal 的透明、亚克力或背景图片视觉验收；macOS/Linux 没有设备，因此不宣称三端 GUI 实测通过。个人主题、#161 任务书、日常 Profile 和终端配置均未修改。
