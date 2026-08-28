# Terminal background synchronization / 终端背景同步

## Scope

Terminal padding and leftover pixels outside the character grid use the terminal's own background. Painting more characters cannot reach them. SeekTTY now uses one platform-neutral OSC 11 controller to temporarily match that background to the **interface** theme's `colors.canvas`. Code-theme colors and highlighting are unchanged.

- Start listening for input before issuing one asynchronous `OSC 11 ; ? ST` query. Startup never waits for a reply.
- Require a valid `rgb:r/g/b` reply within 500 ms before changing the background. Each channel may contain 1–4 hex digits; retain the original precision for restoration.
- Use the current theme if it changed while the query was pending. Deduplicate repeated colors; do not poll or write background commands on mouse movement or repaint.
- Restore the captured color synchronously before normal/fatal teardown. Do **not** use OSC 111: resetting the configured profile color can lose a color previously selected by the shell or an enclosing application.
- On POSIX `SIGTSTP`, restore terminal modes and background before suspending. On `SIGCONT`, re-enter, re-query, and redraw. Ctrl+Z remains input undo. Uncatchable termination (`SIGKILL`, forced termination, or a terminal crash) cannot guarantee cleanup.
- Unsupported/expired queries never set or reset a color. Late, malformed, duplicate, and unsolicited OSC replies do not enter editors or overlays. Bracketed paste remains opaque.

The pinned `@mariozechner/pi-tui@0.73.1` patch keeps OSC frames together across reads, supports BEL and ESC-backslash terminators, bounds incomplete buffers, and lets a new escape-prefixed event cancel a truncated frame. The ordinary lone-Escape key timeout is unchanged; after the OSC opener is recognized, the frame no longer expires into text.

## Safe defaults

Automatic synchronization requires the existing truecolor detection. It is disabled with:

- `NO_COLOR`, `TERM=dumb`, or limited-color rendering;
- `TMUX`, `STY`, or a `screen*` / `tmux*` terminal type;
- `SEEKTTY_TERMINAL_BACKGROUND=off` (also accepts `0` or `false`).

Direct SSH is not disabled merely because it is SSH: its terminal must still answer before the deadline. Multiplexers are deliberately excluded because a reply may be cached and changing the outer terminal may affect other panes. No passthrough is forced.

This preserves Settings/Profile ownership, introduces no runtime dependencies, and never edits terminal configuration files or changes opacity/background images. Transparent or image-backed terminals may still look different from an opaque TUI; opt out when preserving that appearance is preferred. OS title bars, borders, and shadows are not part of this fix.

## Verification

Automated coverage is in `tests/terminal-background.test.ts`, `tests/terminal-input-framing.test.ts`, `tests/terminal-session.test.ts`, and `tests/process-guards.test.ts`. It covers capability policy, exact-color restoration, live changes, timeout/late replies, write failures, nested inputs, split replies, malformed/oversized frames, bracketed paste, fatal cleanup, and simulated POSIX suspend/resume signals. Synthetic terminal tests are **not** real GUI-terminal acceptance.

Run the focused checks with:

```sh
pnpm exec vitest run tests/terminal-background.test.ts tests/terminal-input-framing.test.ts tests/terminal-session.test.ts tests/process-guards.test.ts
```

Use an isolated `DSH_HOME` and an unmodified official dsh `0.1.1-rc.2` for packaged installation/boot/removal/reinstallation checks. Compatibility adapters retain the existing declared Host range: `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`.

### Local automated results

- Frozen pnpm `11.7.0` installation: passed; only the pinned pi-tui patch hash changed, not dependency versions.
- `pnpm run check`: 110 test files; **929 passed / 1 conditional skip**, plus typecheck, build, and the 23-entry package allowlist.
- Exact candidate on unmodified official dsh `0.1.1-rc.2`: isolated install, boot, remove, reinstall, second boot, and Host module-identity checks passed.
- Windows ConPTY mouse/context-menu regression: one cycle, 9588 captured characters, exit code 0. This harness sets `NO_COLOR`, so it verifies the unchanged fallback and mouse path, **not** successful background synchronization in a GUI terminal.
- Candidate SHA-256: `127fcdac44c1d39ebafda705f7161857dc62ae12d5ef84c2b456826e54647e0d`. This is a local development package still numbered `1.2.4`, not the published release asset; the public release was not replaced.

The local Windows Terminal installation reports `1.24.11911.0`; its presence is not a manual background/exit acceptance result. Packaged compatibility checks used an isolated `DSH_HOME`; deploying a candidate into an everyday Profile is a separate, user-requested action and does not count as manual acceptance. The feature never edits terminal configuration files.

### Manual matrix — not yet signed off

| Environment | Expected policy | Manual result |
| --- | --- | --- |
| Windows Terminal, VS Code terminal | Probe when truecolor; synchronize only on a valid reply | Pending |
| macOS iTerm2, Kitty, Ghostty | Same shared protocol and capability policy | Pending |
| macOS Terminal.app | Existing limited-color detection leaves background unchanged | Pending fallback check |
| Linux Kitty, Ghostty, GNOME Terminal / Konsole under Wayland or X11 | Probe when truecolor; synchronize only on a valid reply | Pending |
| tmux / screen | No background query or mutation | Pending fallback check |
| Direct SSH | Probe with the same bounded deadline | Pending latency/exit check |

For each accepted terminal, record its version, OS, transparency, and color mode. Check a custom interface theme, light/dark changes, resizing to non-cell-aligned dimensions, nested overlay typing while starting, normal exit, SIGTERM, and (on POSIX) suspend/resume. The shell background after exit must match the color from before launch, including when it differs from the profile's configured default. Repeat with `SEEKTTY_TERMINAL_BACKGROUND=off` and `NO_COLOR`.

Protocol references: [Kitty padding FAQ](https://sw.kovidgoyal.net/kitty/faq/#why-is-there-padding-between-the-text-area-and-the-window-border), [Ghostty OSC reference](https://ghostty.org/docs/vt/reference), [Windows Terminal dynamic-color query support](https://github.com/microsoft/terminal/discussions/17809).

## 中文说明

该修复统一处理字符网格外的终端背景色差，不扩大鼠标架构，也不改代码主题。启动后异步查询原色，500 ms 内收到有效回复才同步界面主题；换主题时更新，退出时恢复原始精度的颜色，而不是重置成终端默认配色。POSIX 暂停前恢复、继续后重新查询；Ctrl+Z 仍用于撤销。

无回复、超时、`NO_COLOR`、低色彩模式和 tmux/screen 安全降级，不强制改色；`SEEKTTY_TERMINAL_BACKGROUND=off` 可关闭。OSC 回复在输入分帧层完整接收，不进入普通输入框或多层搜索弹窗，粘贴内容不被当作回复解析。

自动协议／虚拟终端测试、Windows ConPTY 与真实桌面终端验收分别记录。上表人工结果均未签收，不能宣称三端所有终端均已实测。透明背景、背景图片、操作系统窗口装饰及不可捕获的强制结束也不在“完全无色边、必定恢复”的保证范围内。

本地全量检查为 929 项通过、1 项条件跳过，并通过类型检查、构建、23 项包白名单及官方 dsh 隔离插拔。Windows ConPTY 鼠标回归通过，但该脚本使用 `NO_COLOR`，不能算作背景同步实测。候选包仍使用开发中的 `1.2.4` 版本号，未覆盖已发布版本。打包兼容性检查均使用隔离的 `DSH_HOME`；按用户要求部署到日常 Profile 是另一步操作，不代表人工验收通过。该功能不会修改终端配置文件。
