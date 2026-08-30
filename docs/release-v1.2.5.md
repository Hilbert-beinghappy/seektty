# SeekTTY 1.2.5 — appearance, highlighting, interaction, and pnpm compatibility

> Release candidate for Owner review. This document covers every merged change after `v1.2.4` plus the candidate-only pnpm adapter. It does not authorize or perform a tag, GitHub Release, npm publication, or repository visibility change.

## English

SeekTTY 1.2.5 replaces the old empty-session screen with a configurable Fastfetch-style welcome page, integrates the interface with terminal-owned backgrounds, upgrades code rendering to VS Code-grade visual TextMate highlighting, fixes several transcript and selector interactions, and makes pnpm 11 installation predictable on the tested official DeepSeek Harness.

### Fastfetch-style welcome page and Settings UX

- Empty Sessions show a responsive, non-durable welcome presentation instead of sendable task suggestions. The first API-key transaction keeps priority, and the welcome page disappears as soon as persistent conversation content exists.
- The default is an original-color DeepSeek pixel whale plus current Profile facts such as SeekTTY version, workspace, model, reasoning effort, Agent mode, permission, and theme. It does not invoke Fastfetch by default.
- `custom`, `fastfetch`, and `mixed` information modes support structured custom rows, configurable mixed ordering, a theme palette, and ordered safe Fastfetch modules. Custom rows can be added, edited, deleted, moved one step, or sent directly to the top or bottom without repeatedly leaving their management list.
- `/welcome` and `/settings seektty-welcome` share a transactional editor with live draft preview, revision-protected Save, whole-draft Cancel, `/welcome refresh`, and confirmed `/welcome reset`. List operations remain in the list, leaf edits return one level, Escape moves back exactly one level, and mutations retain a useful focus.
- Logo sources include the packaged large/compact whale, a user-created terminal-text file, no logo, or the logo rendered by an existing local Fastfetch configuration. Original ANSI colors or Fastfetch-compatible `$[1-9]` theme slots are supported; SeekTTY does not generate pixel art or use terminal image protocols.
- Fastfetch is optional and is never installed or downloaded. Safe information collection launches the existing executable directly with no shell, `--config none`, no logo/color, a two-second timeout, and bounded output. Trusted user config requires explicit confirmation because it may run Fastfetch `command` modules.
- Logo and information output are sanitized independently: cursor movement, clearing, OSC/DCS, hyperlinks, clipboard, and image protocols are removed; byte, row, and column limits apply. Collection is cached per process/configuration and stale async generations cannot overwrite newer settings.
- The Settings center is grouped into Appearance, Welcome page, Mouse and scrolling, Input and shortcuts, Models and Agent, Permissions and security, Plugins and extensions, and Language and system. Direct technical namespace access remains available, and Agent-mode copy is localized in English UI.

### Terminal-integrated appearance

- SeekTTY can query the original terminal background through guarded OSC 11 handling, synchronize it with the active interface theme, deduplicate color writes, and restore the captured color on supported cleanup paths. Fragmented, malformed, late, and unsolicited replies are consumed before they can reach editable fields.
- `seektty-appearance.backgroundMode` adds `theme`, `terminal`, and `explicit` modes. `theme` keeps theme color synchronization while the canvas uses the terminal default background; `terminal` leaves terminal color ownership untouched; `explicit` preserves the previous explicit RGB fill behavior.
- In `theme` and `terminal`, the canvas, overlays, panels, context menus, and ordinary code backgrounds share the terminal default `SGR 49` semantic. They still erase and fill their complete regions, so inherited transparency does not expose stale transcript characters.
- Hover no longer uses a mixed background or underline fallback. Eligible controls use the theme's interaction foreground without changing layout or hit geometry; selection remains a distinct explicit background.
- When a known terminal RGB background conflicts with theme text, canvas foreground colors are adapted to at least 4.5:1 contrast. Unknown or unavailable backgrounds use terminal default foreground rather than guessing black or white.
- Theme selection refreshes its authoritative Settings state after save or submenu return, retaining search, selection, and list position. Terminal-specific opacity APIs and terminal configuration files remain untouched.

### VS Code-grade visual highlighting

- Imported VS Code `tokenColors` are now the authoritative TextMate rules instead of being unconditionally mixed with SeekTTY's coarse semantic-role colors.
- Built-in DeepSeek light and dark code themes gain detailed rules for common programming languages, markup, structured data, and Diff scopes. Legacy or palette-only themes receive a compatible fine-grained fallback.
- Function names, parameters, strings, numbers, keywords, types, properties, constants, and punctuation can resolve independently according to each language grammar and the selected theme.
- VS Code selector precedence, foreground colors, explicit special token backgrounds, and portable font styles are preserved. In inherited-background modes, only the ordinary base code background becomes `SGR 49`; `explicit` retains the previous code background design.
- This is visual TextMate highlighting. It does not add an LSP or claim project-aware Semantic Tokens.

### Transcript, tools, and click targeting

- Live and completed Thinking blocks have a clickable header and independent presentation state. Streaming updates do not reopen a block the user manually folded, and Session data remains unchanged.
- Transcript control hit rows now account correctly for synthetic top padding versus real Session blank lines, so the first click targets the visible reasoning control.
- Collapsed tool cards retain only their title. Parameters and results appear only while expanded, including running tools; projection-node keys and tool `callId` values no longer cause stale expanded frames.
- Wide single- and multi-select overlays use their actual available width for descriptions instead of truncating everything at 60 cells. Resize retains search, checked/selected items, viewport offset, and one-row mouse geometry.

### Models, reasoning, and permissions

- Model, reasoning effort, and Agent mode are separate footer hit regions and selection flows. `/model` handles Provider/model routing, while `/effort` directly opens the supported reasoning-strength choices.
- Switching model applies that Provider/model's default effort before any explicit effort adjustment. Unsupported models show a non-blocking explanation rather than opening a misleading selector.
- Permission switching checks the complete native Harness command result instead of treating transport success as state success. The footer subscribes to the authoritative permission projection and refreshes after changes.
- Failed permission changes keep the overlay open with a visible error. Stale menu state, Session changes during confirmation, legacy command signatures, and narrow-window feedback are handled without retrying a possibly executed unknown contract.

### pnpm 11 Global Virtual Store compatibility

- Launcher provisioning, compatible SeekTTY/dsh updates, and TUI plugin mutations pass `--config.enable-global-virtual-store=false` to each package-tree command they own.
- SeekTTY does not change global pnpm configuration, set `NODE_PATH`, copy Host packages, install a second Host graph, or bypass native `dsh plugin` reconciliation.
- When affected packages resolve below `store/v11/links` and the current dsh/Cordis loader emits its known failure, SeekTTY reports that precise condition and bilingual, credential-redacted recovery commands instead of calling it a normal missing dependency.
- The adapter is restricted to the declared dsh range `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`; this candidate is tested against unmodified official `@deepseek-ai/dsh@0.1.1-rc.2` and pnpm `11.7.0`.

### Documentation and compatibility notes

- The shortcut reference now states that Shift+Enter depends on a terminal reporting modified Enter distinctly; Ctrl+Enter remains the portable multiline fallback where it does not.
- No Settings, Profile, Session, theme, or plugin-manifest migration is introduced. No runtime dependency is added.
- Node.js remains `^22.19.0 || >=24`; the tested Host remains official dsh `0.1.1-rc.2`.
- Clarify and Auxiliary Runtime remain optional. This release does not extend their historical joint-acceptance range.
- Windows real-terminal observations, PTY tests, and synthetic renderer tests are recorded separately. macOS/Linux CI does not count as completed desktop-terminal visual acceptance.

### Owner publication boundary

The package is configured for public publication at `https://registry.npmjs.org/`, and launcher provisioning and self-update use exact npm version specs. This document is not evidence that `seektty@1.2.5` has been published. The Owner must review the exact tarball, checksum, packed file list, and CI matrix, then explicitly confirm the first interactive npm publication.

## 中文

SeekTTY 1.2.5 使用可配置的 Fastfetch 风格欢迎页替换旧空会话界面，让界面更完整地融合终端自身背景，把代码渲染升级到 VS Code 视觉级 TextMate 高亮，修复多项对话与选择器交互，并改善已测官方 DeepSeek Harness 下的 pnpm 11 安装可靠性。

### Fastfetch 风格欢迎页与 Settings 体验

- 空 Session 显示响应式、非持久化欢迎页，不再提供可发送的任务候选；首次 API Key 事务继续优先，出现第一条持久会话内容后欢迎页立即隐藏。
- 默认显示原色 DeepSeek 像素鲸鱼，以及 SeekTTY 版本、工作区、模型、推理强度、Agent 模式、权限和主题等当前 Profile 信息；默认不会执行 Fastfetch。
- `custom`、`fastfetch`、`mixed` 三种信息模式支持结构化自定义行、混合顺序、主题色板和可排序的安全 Fastfetch 模块。自定义行可连续新增、编辑、删除、单步移动，或直接移到顶部／底部，不会每操作一次就退出列表。
- `/welcome` 与 `/settings seektty-welcome` 复用事务式编辑器，提供草稿实时预览、带 revision 保护的保存、整份取消、`/welcome refresh` 和确认后的 `/welcome reset`。列表操作留在列表，叶子编辑返回一层，Esc 每次只退一层，变更后保留合理焦点。
- Logo 可选随包大／小鲸鱼、用户自制终端文本文件、隐藏，或复用本机 Fastfetch 配置渲染的 Logo；支持保留原始 ANSI 色或使用 Fastfetch `$[1-9]` 主题槽。SeekTTY 不生成像素画，也不使用终端图片协议。
- Fastfetch 始终可选，SeekTTY 不安装、不下载。安全信息采集直接启动现有程序，不经过 Shell，强制 `--config none`、关闭 Logo／颜色、限制两秒和输出大小；受信任用户配置可能执行 Fastfetch `command` 模块，因此启用前必须明确确认。
- Logo 与信息输出分别清理：移除光标移动、清屏、OSC/DCS、超链接、剪贴板和图像协议，并限制字节、行数与列宽；采集按进程／配置缓存，过期异步结果不能覆盖新设置。
- Settings 中心按外观、欢迎页、鼠标与滚动、输入与快捷键、模型与 Agent、权限与安全、插件与扩展、语言与系统分组；仍支持直接打开技术命名空间，英文界面的 Agent 模式说明也已本地化。

### 终端融合外观

- SeekTTY 可通过受控 OSC 11 流程查询终端原背景、随界面主题同步颜色、去重写入，并在可捕获的清理路径恢复原色。分片、畸形、迟到或未经请求的回复会在进入输入框前被消费。
- `seektty-appearance.backgroundMode` 新增 `theme`、`terminal`、`explicit` 三种模式：`theme` 保留主题改色但画布使用终端默认背景，`terminal` 不接管终端颜色，`explicit` 保留过去的显式 RGB 填充。
- 在 `theme`／`terminal` 下，主画布、overlay、panel、右键菜单与普通代码基础背景共用终端默认 `SGR 49` 语义；各区域仍完整擦除和填充，不会因透明而露出旧 transcript 字符。
- hover 删除混色背景和下划线兜底，合适的控件只使用主题交互前景色，不改变布局与命中；selection 继续保留独立显式背景。
- 已知终端 RGB 背景与主题文字冲突时，主画布前景会适配到至少 4.5:1 对比度；背景未知或查询不可用时使用终端默认前景，不猜测黑白。
- 主题保存或从子菜单返回后会重新读取权威 Settings，同时保留搜索、选中和列表位置；不调用终端专用透明度 API，也不修改终端配置文件。

### VS Code 视觉级高亮

- 导入的 VS Code `tokenColors` 成为权威 TextMate 规则，不再无条件混入 SeekTTY 的粗粒度语义角色色。
- 内置 DeepSeek 明暗代码主题补齐常见编程语言、标记语言、结构化数据和 Diff 的精细规则；旧主题或仅调色板主题获得兼容的细粒度兜底。
- 函数名、参数、字符串、数字、关键字、类型、属性、常量和标点可根据不同语言 grammar 与当前主题分别配色。
- 保留 VS Code 选择器优先级、前景色、显式特殊 token 背景和可移植字体样式。继承背景模式只把普通代码基础背景改为 `SGR 49`，`explicit` 继续保留原有代码背景设计。
- 这是视觉级 TextMate 高亮，不增加 LSP，也不宣称具备项目上下文的 Semantic Tokens。

### 对话、工具与点击命中

- 实时与已完成的思考块都有可点击标题和独立显示状态；流式更新不会重新展开用户手动收起的内容，也不修改 Session 数据。
- transcript 控件命中会正确区分渲染器合成顶部留白和 Session 真实空行，第一次点击即可命中视觉上的思考控件。
- 工具卡收起后只保留标题，参数与结果仅在展开时显示，运行中工具也一致；投影节点 key 与工具 `callId` 不同不再造成旧展开帧复用。
- 单选／多选宽弹窗按真实可用宽度显示说明，不再固定截到 60 列；resize 时保留搜索、勾选／选中、滚动位置和单行鼠标命中。

### 模型、推理与权限

- 模型、推理强度和 Agent 模式拆成独立底栏命中与选择流程；`/model` 负责 Provider／模型路由，新增 `/effort` 直接选择当前模型支持的推理档位。
- 切换模型先应用该 Provider／模型的默认推理强度，再允许单独调整；不支持可调强度时给出非阻塞说明。
- 权限切换检查完整 Harness 原生命令结果，不再把传输成功误认为状态成功；底栏订阅权威权限投影并在变化后刷新。
- 切换失败会保留弹窗并显示错误；旧菜单状态、确认期间切换 Session、旧命令签名和窄窗口提示均有保护，不会用另一组参数重试可能已经执行的未知合同。

### pnpm 11 Global Virtual Store 兼容

- 启动器首次协调、兼容范围内的 SeekTTY/dsh 更新和 TUI 插件变更，会给自己发起的每次包树命令附加 `--config.enable-global-virtual-store=false`。
- SeekTTY 不修改全局 pnpm 配置、不设置 `NODE_PATH`、不复制 Host 包、不安装第二套 Host 图，也不绕过原生 `dsh plugin` 协调。
- 受影响的包真实解析到 `store/v11/links` 且当前 dsh/Cordis Loader 命中已知错误时，会给出精确的中英文、凭据脱敏恢复命令，不误称为普通缺依赖。
- 适配器严格限制在声明范围 `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`；候选版本针对未修改的官方 `@deepseek-ai/dsh@0.1.1-rc.2` 与 pnpm `11.7.0` 验证。

### 文档与兼容说明

- 键位速查明确说明：只有终端能把带修饰键的 Enter 独立上报时 Shift+Enter 才可用；不支持时继续使用更通用的 Ctrl+Enter 多行输入通道。
- 不引入 Settings、Profile、Session、主题或插件 manifest 迁移，不新增运行时依赖。
- Node.js 仍为 `^22.19.0 || >=24`，当前已测 Host 仍为官方 dsh `0.1.1-rc.2`。
- Clarify 与 Auxiliary Runtime 继续作为可选插件，本次发布不扩展历史联合验收范围。
- Windows 实机观察、PTY 测试和模拟渲染测试分开记录；macOS/Linux CI 不等于已经完成桌面终端视觉人工验收。

### Owner 发布边界

包已配置为公开发布到 `https://registry.npmjs.org/`，启动器首次协调和自更新均使用精确 npm 版本 spec。本文件不代表 `seektty@1.2.5` 已经发布。Owner 必须审核精确 tarball、SHA-256、打包文件清单和 CI 矩阵，再明确确认首次交互式 npm 发布。
