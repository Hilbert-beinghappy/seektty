# Fastfetch-style welcome page acceptance / Fastfetch 风格欢迎页验收

Date: 2026-08-30 (Asia/Shanghai). Branch: `codex/fastfetch-welcome`. Base: `upstream/main` at `0e128f3`.

This candidate replaces the old sendable empty-session suggestions with a non-durable, responsive welcome presentation. The default is a packaged original-color DeepSeek pixel-whale terminal logo plus custom runtime facts; it does not invoke Fastfetch. Optional Fastfetch data remains an adapter around an executable already on `PATH`, never a bundled or downloaded dependency. The first-time API-key transaction remains higher priority and settles before collection is activated.

## Automated results

| Check | Result | Boundary |
| --- | --- | --- |
| `pnpm run check` | Passed: 122 test files; 1,068 passed / 1 unrelated conditional skip; typecheck, build and `pack:check` passed | Includes settings migration and product categories, one-level navigation, Agent Preset localization, renderer/layout, ANSI sanitization, Fastfetch process boundaries, continuous list editing and direct top/bottom moves, draft UI, failure rollback, transcript scrolling/selection, i18n and existing product regressions. Missing vendor source-map warnings are pre-existing and non-fatal. |
| Packed contents | Passed: 24 allowlisted entries | Includes `assets/seektty-welcome-logo.json`; contains no personal themes, Profile/Session data, credential, generated cache, helper script, or consumer `workspace:` dependency. |
| Official dsh `0.1.1-rc.2` stock lifecycle | Passed | Packed launcher, candidate add, boot to the non-interactive TUI boundary, remove, re-add, second boot, and Host module-identity checks used isolated temporary `DSH_HOME` directories. |
| Windows ConPTY harness | Passed: 1 cycle, 23,722 captured bytes, exit 0 | Packaged boot, keyboard/mouse input, resize, context-menu gestures, and clean terminal exit. ConPTY is not GUI-equivalent and does not prove perceived pixel-art layout in Windows Terminal. |
| Local Fastfetch `2.67.1` Logo capture | Passed: 22 rows, maximum 48 columns | Used the ordinary Windows Fastfetch config through the production Host collector with modules forced off; sanitized ANSI output passed the welcome limits. Visual placement still requires the manual Windows Terminal check. |

Automated assertions cover:

- legacy Profiles receive `custom` mode, original-color built-in Logo, default runtime rows, and no Fastfetch invocation;
- `custom`, `fastfetch`, and `mixed` ordering, generation guards, process-local caching, explicit refresh, timeout, cancellation, unavailable executable, non-zero exit, excessive output, and sanitized key/text rows;
- direct argv spawning with no shell, a two-second limit, 256 KiB stdout/stderr bounds, unique separators, and a privacy-conscious `--config none` safe module list;
- explicit confirmation before enabling trusted user config, which may run Fastfetch `command` modules; final output remains sanitized but configuration execution is the user's trust boundary;
- color-only ANSI logos, `$[1-9]` theme slots, `$$`, CRLF, wide Unicode, invalid/missing files, path normalization, 256 KiB / 256-column / 120-row limits, and removal of CSI/OSC/DCS/clipboard/image controls;
- local Fastfetch Logo reuse with modules forced off, original ANSI colors preserved, active terminal controls removed, per-configuration caching, explicit refresh, and built-in fallback;
- large → compact → hidden responsive selection without runtime image scaling, tall-page transcript scrolling, text selection, no button hit regions, resize reflow, and theme recoloring without rerunning Fastfetch;
- `/welcome`, `/welcome refresh`, `/welcome reset`, the shared `/settings seektty-welcome` entry, custom-row and safe-module reorder operations, live draft preview, revision-protected whole-draft save, cancellation, and save-failure rollback.
- the eight stable `/settings` product categories, disabled unavailable categories, direct namespace compatibility, one-level Escape behavior, leaf-editor return, and focus retention after list mutations.

## Compatibility and manual status

| Environment | Status |
| --- | --- |
| Windows Terminal | **Manual visual sign-off required.** Unit, packaged stock-dsh, and ConPTY checks passed; real font metrics, terminal transparency, mouse selection, and visual balance still require the user's ordinary terminal/Profile. |
| macOS iTerm2 or Ghostty | **Untested: no device.** |
| Linux Kitty or Ghostty | **Untested: no device.** |
| Fastfetch absent | Automated safe fallback passed. `mixed` keeps custom content; `fastfetch` shows one concise unavailable row. |
| tmux/SSH | Control-output sanitization and ordinary terminal text use the existing TUI path; real nested-terminal sessions remain untested. |

Manual verification should open an empty Session at wide, medium, narrow, and short sizes; select and scroll welcome text; switch the interface theme; test built-in original/theme colors; load user-created large and compact terminal-text logos; reuse the local Fastfetch Logo and confirm narrow layouts hide it cleanly; compare all three information modes; exercise safe Fastfetch and, only with a trusted file, user-config mode; then send the first persistent message and confirm the welcome page disappears. Also verify API-key onboarding appears first in a Profile that genuinely requires it.

## 中文结论

自动门禁已通过：122 个测试文件中 1,068 项通过，1 项无关条件跳过；类型检查、构建、24 项发布包白名单、官方 dsh `0.1.1-rc.2` 的隔离安装／启动／移除／重装，以及一轮 Windows ConPTY 流程均通过。新增的内置 Logo 资源已进入发布包，个人主题、日常 Profile、Session、凭据和缓存均未纳入。

默认欢迎页只显示随包发布的原色 DeepSeek 像素鲸鱼与运行信息，不执行 Fastfetch。原图固定至 `seek-on-dsh` 的 MIT 授权版本，并离线转换为 40×16 与 24×10 终端半块字符资源。`custom`、`fastfetch`、`mixed` 三种模式、混合顺序、自定义行、Logo 文件、本机 Fastfetch Logo 复用、安全模块、用户配置风险确认、实时预览、整份草稿保存／取消、缓存刷新与默认重置均已实现。欢迎内容不写入 Session；第一条持久会话内容出现后隐藏。大图、紧凑图、隐藏三档按宽度选择，不在运行时缩放图片；Fastfetch Logo 没有紧凑图时在窄窗口隐藏；高度不足时使用 transcript 滚动。

`/settings` 现在固定按外观、欢迎页、鼠标与滚动、输入与快捷键、模型与 Agent、权限与安全、插件与扩展、语言与系统分组；技术命名空间仍可直接打开。列表管理操作留在列表，叶子编辑结束返回上一层，Esc 每次只退一层，草稿只由保存／取消整体退出，新增、删除和移动后保留就近焦点。

Fastfetch 仅调用 `PATH` 中已有程序，不通过 Shell，不安装、不下载。安全模式强制 `--config none`；用户配置可能执行 `command` 模块，因此确认即为信任边界。Logo 和 Fastfetch 输出均经过控制序列清理与尺寸／字节限制。

ConPTY 不能代替真实 Windows Terminal 的字体、透明背景与视觉验收；macOS/Linux 没有设备，因此不宣称三端实机通过。真实终端验收仍需使用用户的日常 Profile 完成。
