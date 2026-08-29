# Terminal background inheritance / 终端背景继承

## Behavior and scope

The main canvas defaults to `theme`: interface colors with terminal-owned background effects. Older settings without `backgroundMode` use this default too. This changes the previous explicitly painted canvas; choose `explicit` to retain that rendering behavior.

| Harness `seektty-appearance.backgroundMode` | Canvas, panels and base code background | OSC 11 policy |
| --- | --- | --- |
| `theme` (default) | Default background (`SGR 49`) | Synchronize the interface theme's `colors.canvas` when safe |
| `terminal` | Default background (`SGR 49`) | Do not recolor; restore an original captured earlier in this lifetime |
| `explicit` (compatibility) | Explicit canvas, panel and code-theme backgrounds, quantized to the terminal's color depth | Same synchronization policy as before |

`/theme` → **Background mode** and `/settings seektty-appearance` → **Background mode** share one three-choice editor. Changes are persisted through revision-protected Harness Settings before applying; cancellation or failure leaves the current appearance unchanged. Successful changes redraw the full viewport without restarting, moving scroll anchors, clearing selection, or changing hit geometry. Theme previews retain the mode, and theme switching/import/export never writes it.

The canvas and its full-width/full-height blank filling remain in place. Padded modal rows still overwrite the covered cells, so `SGR 49` exposes terminal effects, not underlying transcript characters. Foreground resets restore the selected background semantics. Code blocks retain their layout and syntax foregrounds; only their base background follows the mode. Selection and explicitly authored TextMate token backgrounds remain colored islands. Hover is foreground-only `brand` text with no fill, underline, bold, reverse video or extra marker.

No dependencies, alpha-percentage probes, terminal-specific opacity APIs, or terminal configuration writes are added. Opacity, blur, background images, and OS window decorations remain terminal/compositor responsibilities. `explicit` describes escape sequences, not a promise of opacity. For example, [Kitty applies opacity to cells matching its default background](https://sw.kovidgoyal.net/kitty/conf/#opt-kitty.background_opacity), while [Ghostty can optionally apply opacity to explicitly colored cells](https://ghostty.org/docs/config/reference#background-opacity-cells). [Windows Terminal owns its profile opacity, acrylic and background-image settings](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/profile-appearance#transparency). SeekTTY does not change these options.

## Color ownership and cleanup

- Start listening for input before the first needed `OSC 11 ; ? ST` query. A startup in `terminal` mode does not query; entering `theme` or `explicit` later may initiate the one query for that active lifetime.
- The query is asynchronous and expires after 500 ms. Only a valid `rgb:r/g/b` reply with 1–4 hex digits per channel authorizes a color change. Preserve original channel precision.
- Switching between synchronizing modes with the same color does not repeat a write. Repaints and mode switches never repeat the query.
- Entering `terminal` restores the captured original immediately if this run changed it, but retains the snapshot for later switches. If a reply arrives while `terminal` is selected, capture it without recoloring. A later synchronizing mode uses the latest requested theme.
- Missing, expired, or disabled synchronization in `theme` mode leaves the default canvas background in place with one non-blocking notice per active lifetime. Do not silently switch to explicit RGB.
- Restore the captured color synchronously before normal/fatal teardown. Do not use OSC 111: it resets the profile color, which may differ from a color previously chosen by the shell. Write failures are handled best-effort, without breaking cleanup.
- POSIX suspend restores the background and protocols. Resume starts a new active lifetime, installs input first, then re-queries if needed. Ctrl+Z remains input undo. Uncatchable termination (`SIGKILL`, forced process termination, or terminal crash) cannot guarantee restoration.

The existing pinned `@mariozechner/pi-tui@0.73.1` input framing is reused unchanged. Malformed, late, duplicate, unsolicited and oversized OSC frames are consumed before chat, search, or secret inputs; bracketed paste remains opaque. A new escape-prefixed event can cancel a truncated frame without changing the ordinary lone-Escape timeout.

## Safe fallback

Color synchronization still requires an interactive managed terminal and the existing truecolor detection. It is disabled by `NO_COLOR`, limited color depth, `TERM=dumb`, `TMUX`, `STY`, a `screen*`/`tmux*` terminal type, or `SEEKTTY_TERMINAL_BACKGROUND=off` (`0` and `false` also work). The environment switch disables recoloring only: `theme`/`terminal` still use the default background for canvas, panels and base code, while `explicit` still uses theme fills where colors are enabled. `NO_COLOR` retains unstyled output. Non-interactive and dumb terminals retain the existing headless guidance.

Direct SSH uses the same bounded query; network latency may cause safe fallback. Multiplexers are excluded because cached replies or outer-window mutations could affect other panes. No passthrough is forced. A successful protocol test cannot prove compositor effects or pixel-perfect padding in every emulator.

## Canvas readability

The saved theme is unchanged. If the captured or applied background differs from its canvas color, RGB foregrounds on the default background are adjusted with the existing contrast calculation to at least 4.5:1. If the background is unknown, canvas foregrounds use `SGR 39`, the terminal's configured foreground. This includes semantic colors embedded in cached Markdown; adapting only the outer text color would be insufficient. No extra query is issued just to discover a terminal-mode background.

Adaptation runs at the canvas rendering boundary, so mode changes or background replies do not recreate transcript nodes, disturb selection, or move scroll anchors. Selection and explicitly authored token backgrounds retain their original colors, as do all application surfaces in `explicit` mode. A matching synchronized theme background keeps the theme palette. Color calculations are cached with a bounded size.

Default foregrounds rely on a readable terminal palette; opacity and images can still affect the actual pixel contrast. The 4.5:1 calculation applies to known opaque RGB colors, not arbitrary wallpaper or compositor output. Unknown/indexed terminal palettes are not guessed, and `NO_COLOR` retains uncolored output. Native macOS/Windows GUI visual acceptance must still be recorded separately from synthetic and PTY checks.

## Verification

See [current acceptance results and manual checklist](transparent-surfaces-hover-acceptance.md). Unit/synthetic frame tests, real PTY/ConPTY tests, official packaged lifecycle checks, and real GUI-terminal acceptance are recorded separately. Missing devices remain **untested**. The earlier [canvas-only acceptance](background-inheritance-acceptance.md) remains as historical evidence for the original implementation.

Focused checks:

```sh
pnpm exec vitest run tests/appearance-background.test.ts tests/actions-background.test.ts tests/background-inheritance.test.ts tests/terminal-background.test.ts tests/theme.test.ts tests/theme-config.test.ts tests/actions-theme.test.ts tests/transcript-viewport.test.ts tests/terminal-input-framing.test.ts tests/terminal-session.test.ts tests/process-guards.test.ts
pnpm run check
```

Packaged checks require an isolated `DSH_HOME` and an unmodified official dsh `0.1.1-rc.2`. The declared compatibility-adapter range is unchanged: `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`. Nothing in this feature changes Harness's ownership of settings, Profiles, Sessions or persistence, or native `dsh plugin` reconciliation.

## 中文说明

默认从“显式 RGB 铺底”改为 `theme`：主画布、弹窗面板和代码基础背景使用终端默认背景（SGR 49），通过原有 OSC 11 同步界面主题颜色，让终端保留其背景效果。旧设置缺少字段时同样默认 `theme`。`terminal` 只跟随终端，不改色；`explicit` 保留旧铺底与原有改色行为，透明与否仍取决于终端。

`/theme` 与 `/settings seektty-appearance` 的“背景模式”共用三选项编辑器，保存成功立即生效，失败／取消不改变状态。模式由 Harness 管理，主题切换、预览及取消、导入和导出均不覆盖它。只切模式不重建会话节点、不改变视口、选区、滚动锚点及鼠标命中。代码排版和语法前景色不变；选区与显式 token 背景继续填色，hover 仅使用 `brand` 前景色，不再使用底色或下划线。

每个活动终端生命周期最多一次 500 ms 异步查询；输入监听就绪、首次需要改色时才发起。切到 `terminal` 会恢复本次运行捕获的原色并保留快照，查询中的回复可记录但不可改色。超时、无效、迟到回复不进入输入框。同步不可用时 `theme` 保留默认背景并提示一次，不自动改成显式铺底。`SEEKTTY_TERMINAL_BACKGROUND=off` 只禁止改色；tmux/screen、低色彩和非交互环境沿用现有限制。

该功能不读取或设置透明度，不调用终端专用透明 API，不修改终端配置，不新增依赖。实际效果由终端与桌面合成器决定；不保证所有彩色区域一样透明，也不保证强杀进程后恢复。实机、PTY、单元与插拔测试分别记录，未测设备不冒充通过。
