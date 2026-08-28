<div align="center">

<img src="assets/seektty-logo.png" alt="SeekTTY logo" width="200">

<h1>SeekTTY</h1>

<p>DeepSeek Harness 的终端工作台。</p>

<p>
  <a href="https://github.com/Hilbert-beinghappy/seektty/releases"><img src="https://img.shields.io/badge/Version-1.2.4-orange" alt="Version 1.2.4"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-5B5BD6" alt="DeepSeek Harness 0.1.1-rc.2">
  <img src="https://img.shields.io/badge/Node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22.19 or newer">
  <a href="https://github.com/Hilbert-beinghappy/seektty/actions"><img src="https://github.com/Hilbert-beinghappy/seektty/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
</p>

<p>
  <a href="#项目概览">项目概览</a>
  ·
  <a href="#快速开始">快速开始</a>
  ·
  <a href="#clarify-与-plan">Clarify 与 Plan</a>
  ·
  <a href="#功能">功能</a>
  ·
  <a href="#兼容与验证">兼容性</a>
</p>

<p><a href="README.md">English</a> · 中文</p>

</div>

---

## 项目概览

进入项目目录运行 `deepseek`，即可在一个终端工作台中使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生的 Agent、Session、模型、权限、Settings、Profile、插件与持久化服务。SeekTTY 只负责终端界面；运行状态始终由 Harness 持有。

模型、Provider、Agent Preset、权限、命令、工具、Settings、Skill、MCP 服务和插件来源均从正在运行的 Harness 动态读取，因此上游或第三方 Bundle 新增的能力不需要硬编码进 SeekTTY。

需求还需要澄清时，可选的 [Clarify Host 插件](https://github.com/Hilbert-beinghappy/dsh-plugin-clarify) 会加入引导式 `/clarify` 工作流：逐一提出聚焦问题，每次回答后更新可审阅的 Draft，并把采用后的 Draft 写回输入框。随后可用 Harness 原生 `/plan` 把正式提交的需求整理成实施方案。

## 快速开始

在已测的官方 DeepSeek Harness `0.1.1-rc.2` 上安装 SeekTTY：

```sh
pnpm add --global @deepseek-ai/dsh@0.1.1-rc.2

dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz

dsh --profile tui
```

这些命令通过原生 `dsh plugin` 协调机制安装预构建 Bundle。Clarify 与 Auxiliary Runtime 均为可选插件，不是默认依赖；历史联合验收组合见[兼容性](#兼容与验证)。

带版本号的下载地址仅在对应版本正式发布后可用。发布前请按 [1.2.4 审核与发布清单](docs/release-v1.2.4-verification.md)中的本地 tarball 方式测试。

### 裸 `deepseek` 启动器

安装 `dsh` 后，可全局安装同一个 SeekTTY Release，并把 Profile 协调固定到该 tarball：

```sh
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
deepseek
```

PowerShell 使用相同的包地址：

```powershell
pnpm add --global 'https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz'
$env:SEEKTTY_SPEC='https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz'
deepseek
```

`deepseek` 要求 `dsh` 位于 `PATH`，也可以用 `DSH_BIN` 指向其可执行文件。常用启动形式包括：

```sh
deepseek "检查这个项目"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
deepseek --version
deepseek --update
```

`deepseek --update` 采用 SeekTTY 自更新优先策略：先检查 SeekTTY，再检查 dsh；每轮最多安装一个兼容组件，绝不自动安装未测试的 gap 或未来 Host。`DSH_BIN`、本地安装和 `SEEKTTY_SPEC` 覆盖不会被改写，更新失败也不会阻止启动。设置 `SEEKTTY_UPDATE=check` 可改为会话后提示，设置 `SEEKTTY_UPDATE=0` 可关闭检查。

SeekTTY `1.2.4` 在官方 Harness `0.1.1-rc.2` 上改进鼠标导航与输入编辑，并保留原生终端选择作为备用通道，无需迁移 Settings 或 Session。

### 1.2.4 新增内容

- 列表选中不再强制居中；普通鼠标操作启动即可使用，多层弹窗共享适配主题的悬停反馈与可点击底栏按钮。
- 弹窗文字与非密钥输入框支持选区及剪贴板编辑。Ctrl+Z 可撤销每个输入框内的编辑；键位速查按用途归类。
- 右键菜单独立于页面返回栈。滚轮和左键拖动可关闭菜单并立即继续操作；右键拖动在松手位置打开菜单。
- Esc 后紧接鼠标报告不再把协议残片输入搜索框。危险确认继续要求键盘操作，F3 或 `/mouse` 保留原生选择通道。

完整变更见[发布说明](docs/release-v1.2.4.md)，验证边界见[审核清单](docs/release-v1.2.4-verification.md)。

## 界面预览

| DeepSeek 亮色 | DeepSeek 暗色 |
| --- | --- |
| ![SeekTTY DeepSeek 亮色首屏](assets/seektty-tui.png) | ![SeekTTY DeepSeek 暗色首屏](assets/seektty-tui-dark.png) |

| 亮色界面中的 TypeScript | 暗色界面中的工具、文件读取与 Diff |
| --- | --- |
| ![SeekTTY 亮色 TypeScript 语法高亮](assets/seektty-code-light.png) | ![SeekTTY 暗色工具调用与 Diff 语法高亮](assets/seektty-code-dark.png) |

最新视图使用固定高度的 alternate screen，把输入框和状态栏固定在底部。已发送的用户消息复用输入框的上下细线，与不加边框的模型回复区分。完整鼠标模式用滚轮浏览历史、选择文本，并点击已有控件。把选区拖到 Transcript 边缘并停留会自动跨已加载页面滚动，同时保持同一个逻辑文本锚点；每帧仍只重绘当前可见窗口。F3 或 `/mouse` 可切到原生终端选择且不离开备用屏幕；退出后恢复原主屏幕及其滚动记录。助手代码、Shell 指令、工具参数、文件读取、JSON 和 Diff 共用当前代码主题，普通对话文字仍使用界面主题。

## Clarify 与 Plan

Clarify 与 Plan 位于同一条工作流的前后两段：Clarify 帮助确认**要做什么**，Harness 原生 Plan 提议**如何实现**。

| 组件 | 职责 |
| --- | --- |
| **SeekTTY** | 探测 Clarify Remote，加入 `/clarify`，渲染终端交互，提供当前 Session 与草稿，并把采用后的 Draft 写回输入框。 |
| **dsh-plugin-clarify** | 持有临时澄清进程，通过 `clarify.wire/1` 发布 `start`、`answer`、`accept`、`refine`、`cancel` 和 `fetchDraft`。 |
| **dsh-plugin-auxiliary-runtime** | 通过当前模型路由运行 Clarify 模型调用，并提供限额、取消与独立用量账本。 |

可通过以下方式启动 Clarify：

- 从命令面板选择 `/clarify`，以整个输入区作为 seed；
- 输入 `/clarify some text`，以参数文本作为 seed；
- 在现有草稿末尾单独加入 `/clarify` token 或一行，以前面的文字作为 seed。

Clarify 一次提出一个聚焦问题，把已确认的决定带入后续问题，并在每次回答后刷新 Draft 预览。你可以回答、refine、采用或取消。采用只会把 Draft 写入普通输入框；按 Enter 仍是明确的发送动作。正式提交后，如需实施方案再运行 `/plan`。

问题、选项、预览和 refine 反馈保留在 Host 内存中，默认 15 分钟无交互后失效。主 Session 只会收到你明确发送的 Draft。辅助用量写入官方 `storageDomain` 下的 `auxiliary_runtime`；prompt、回答、模型输出、凭据和文件路径不会进入账本。`/status` 会显示经过校验的 Official、Auxiliary 和派生 Combined 总量，同时保持官方 Agent `tokenUsage` 不变。

已验收 Release 组合与当前候选边界见[兼容与验证](#兼容与验证)。

## 功能

| 范围 | 可用操作 |
| --- | --- |
| 对话 | 流式 Markdown/GFM、语法高亮代码、链接、表格、推理显示、工具卡片模式、重试、上下文压缩、取消与错误状态 |
| Session 与工作区 | 新建、恢复、搜索、重命名、Fork、归档、排序、复制、导出和切换工作区，不删除项目文件或日志 |
| Agent、模型与权限 | 动态 Agent Preset、Provider、模型、推理强度和权限预设，支持按 Session 切换与诊断 |
| 队列与交互 | Agent 运行时继续排队或 steer；编辑队列项；处理单选、多选、自定义、跳过、取消和计划审查 |
| 图片 | 粘贴或附加 PNG、JPEG、GIF、WebP；执行 Host 动态限制；恢复待发送附件；终端支持时内联显示 |
| Plan、Goal、Todo 与压缩 | 原生 `/plan`、`/goal`、`/compact`，包含计划审查、目标状态、Todo 数量和 transcript 记录 |
| 工具与文件 | 工具耗时、参数与结果高亮、带原文件行号的读取、Shell/JSON/Diff、产出文件浏览、路径复制与确认后外部打开 |
| 子 Agent 与后台工作 | 查看或停止直接子 Agent；检查任务、工作流阶段、结果、失败、Token、耗时和结构化轨迹 |
| Profile 与 Settings | 创建、复制、切换和诊断 Profile；通过 Schema 回退、revision 检查和只写 Secret 编辑全部设置命名空间 |
| 插件、Skill 与 MCP | 插件中心、原生 Bundle 协调、动态 Skill 命令、MCP 实例、加载状态、设置与风险信息 |
| 主题与语言 | 界面／代码主题独立切换、配色生成、VS Code 主题导入、对比度检查、`NO_COLOR` 和中英文实时切换 |
| 诊断与反馈 | 运行状态、可执行的 `/doctor` 检查、Session 反馈、助手消息评分与反馈删除 |

SeekTTY 从当前 Harness Profile 动态读取这些目录。暂不支持的可选能力会安全降级，专用终端界面则可以持续演进。

## 首次配置 API Key

| 暗色 | 亮色 |
| --- | --- |
| ![SeekTTY 暗色首次 API Key 引导](assets/seektty-onboarding-dark.png) | ![SeekTTY 亮色首次 API Key 引导](assets/seektty-onboarding-light.png) |

当前 Profile 没有可用模型 Provider，且 DeepSeek 官方 Provider 暴露了可写但缺失的凭据时，SeekTTY 会打开居中的只写输入框。环境凭据、Harness 已存凭据，以及环境认证或无 Key Provider 都会跳过该引导。

输入内容始终显示为掩码，并直接交给 Harness `credentials.set`。SeekTTY 不会读回密钥，也不会把它放入 Settings、日志、截图或 Session 数据。保存时不会发起可能计费的验证请求；认证错误由第一次真实请求通过正常 Provider 路径报告。

按 Escape 可稍后配置，同时继续使用 `/settings`、`/plugin` 等本地界面。待发送文字和附件都会保留，保存成功后自动继续原请求。如果凭据无法检查或写入，SeekTTY 会提示使用 `/settings` 与 `/doctor`，而不是显示无法使用的表单。

## 斜杠命令

在输入框键入 `/` 会打开可搜索菜单，合并 SeekTTY 命令、当前 Agent 的 Host 命令和用户可调用的 Skill。

| 分类 | 命令 |
| --- | --- |
| Session | `/new`、`/resume`、`/sessions`、`/rename`、`/fork`、`/archive`、`/export`、`/export md`、`/copy` |
| 工作环境 | `/workspace`、`/profile` |
| Agent | `/mode`、`/model`、`/permission`、`/plan`、`/goal`、`/compact` |
| 运行交互 | `/queue`、`/steer`、`/attach`、`/attachments`、`/pending` |
| 运行内容 | `/tools`、`/files`、`/jobs`、`/subagents`、`/trajectory` |
| 扩展 | `/plugin`、`/plugins`、`/skills`、`/mcp` |
| 插件工作流 | 兼容的 Clarify Remote 与 Auxiliary Runtime 激活后出现 `/clarify` |
| 配置与诊断 | `/settings`、`/language`、`/theme`、`/status`、`/doctor`、`/feedback`、`/restart` |
| 帮助与退出 | `/help`、`/quit`、`/exit` |

`/plugin`、`/workspace` 和 `/profile` 同时提供交互中心与直接子命令。未知命令不会作为普通消息发送，而会留在命令界面并显示相近建议。

自动补全与弹窗列表保持滚动位置：滚轮只浏览、不改变选中项，点击可见行不会让它居中，方向键仅在选中项越过可见边缘时滚动。悬停只做预览。首次单击选中；之后再次点击同一个仍待激活的选项，不受双击时间限制。按 Enter 或安全地再次点击会补全并且只执行一次斜杠命令；Tab 只补全。文件和路径补全永不自动提交，滚动位置提示行不可点击。

弹窗底部提供单击生效的选择／确认／保存和返回／关闭按钮，悬停样式跟随主题。按钮与键盘共用校验、导航逻辑；危险确认仍只能通过键盘完成。普通鼠标操作启动后即可使用，无需先最小化终端。终端支持焦点上报时，恢复焦点后的 250ms 内会防止误触执行。

完整鼠标模式复制会把文本统一编码一次为 UTF-8。Windows 使用固定的 PowerShell `Set-Clipboard` writer，macOS 在 UTF-8 locale 下运行 `pbcopy`，Wayland 明确声明 `text/plain;charset=utf-8`，X11 明确请求 `UTF8_STRING`；OSC 52 继续服务于终端、SSH 与 tmux 路径。

## 常用操作

F1 → **键位速查** 按用途展示当前绑定，并反映 `/keymap` 自定义。以下为默认键位：

### 输入与编辑

| 输入 | 操作 |
| --- | --- |
| Enter / Shift+Enter | 发送或确认；选中的斜杠候选会补全并只执行一次 / 输入换行 |
| Ctrl+Z（兼容 Ctrl+-） | 撤销当前输入框内的编辑，包括输入、粘贴和选区替换 |
| Ctrl+R | 搜索输入历史 |
| 多行弹窗中的 Enter / Ctrl+Enter | 换行 / 提交 |

各输入框独立保留撤销记录，包括搜索框和遮蔽的密钥输入框。撤销不会撤回已发送消息或回退已保存设置。

### 命令与弹窗

| 输入 | 操作 |
| --- | --- |
| 输入框中的 `/` | 打开命令与 Skill 候选 |
| Up / Down | 移动候选或列表中的选择 |
| 候选显示时按 Tab | 只补全选中的候选而不提交 |
| Escape | 取消候选，或返回／关闭当前弹窗 |
| 多选弹窗中的 Space | 勾选或取消当前项 |
| F1 / Ctrl+P | 打开帮助 / 打开命令面板 |
| F2 / Ctrl+, / Cmd+, | 打开 Settings |

### 对话浏览

| 输入 | 操作 |
| --- | --- |
| Tab | 空输入框进入对话浏览；浏览时返回输入框 |
| Up / Down | 浏览时逐行滚动或移动卡片选择 |
| PgUp / PgDn / Home / End | 在 transcript 中翻页、跳到最早内容或回到最新 |
| Shift+Left / Shift+Right | 跳到上一个或下一个用户轮次 |
| `/`，再按 Enter，然后 n / N | 查找对话、确认查询，再跳到下一个 / 上一个匹配 |
| Escape | 依次退出查找、卡片聚焦，再返回输入区 |
| Ctrl+O / Ctrl+T | 切换工具卡片显示 / 显示或隐藏推理 |

### 会话与运行

| 输入 | 操作 |
| --- | --- |
| Ctrl+S | 打开 Session 恢复 |
| Ctrl+M | 打开模型选择（需扩展键盘协议，否则使用 `/model`） |
| Shift+Tab | 循环权限预设，进入完全访问前确认 |
| Ctrl+C | 停止当前轮次、清空草稿，或二次确认退出 |

### 鼠标与选区

| 输入 | 操作 |
| --- | --- |
| F3 或 `/mouse toggle` | 切换完整鼠标模式与终端原生选择 |
| 鼠标滚轮 / 触控板 | 在 SeekTTY 内部浏览 Transcript，不改变输入框焦点、草稿、选区或光标 |
| Ctrl+Shift+C | 复制当前应用内选区 |
| 非密钥弹窗输入框中的 Ctrl+X | 剪切选区 |
| 可编辑输入框中的 Backspace / Delete | 删除选区 |
| 按住终端选择修饰键并拖动，再复制 | 原生选择：Terminal.app 按住 `Fn`、iTerm2 按住 `Option` 后拖选，再按 `Command+C`；其他终端或 tmux 使用外层终端的选择修饰键 |

完整鼠标模式还提供常驻滚动条、应用内选区、选后复制、悬停反馈，以及卡片、示例、候选、弹窗和模型／模式／权限控件的精确点击。危险确认仍需 Enter。

弹窗中的可见文字支持拖选和复制。搜索框与非密钥输入框还支持通过输入文字、Backspace 或 Delete 替换／删除选区，Ctrl+X 剪切；右键菜单提供复制、剪切、删除选区、粘贴和全选。Ctrl+Shift+C 复制当前弹窗的选区，Ctrl+C 保留中断行为。剪贴板操作不会暴露被遮蔽的密钥。

右键菜单独立浮在当前页面上，不进入页面返回栈。左键点击菜单外或按 Esc 只关闭菜单；右键点击菜单外则针对新目标重新打开。菜单项单击左键即可执行，底层页面保留草稿和选区。

滚动滚轮或按住左键拖动会关闭菜单，并立即在下层页面继续滚动或选中文字；按住右键拖动则在松手位置打开菜单。左键单击菜单外仍只关闭菜单，不会误触底层控件；父弹窗继续拦截输入，不会穿透到会话。

## 主题与语言

SeekTTY 默认使用 DeepSeek 暗色主题。`/theme` 会打开主题中心，也可直接输入：

```text
/theme dark
/theme light
/theme code [auto|dark|light|<主题名>]
/theme use <主题名>
/theme edit [主题名]
/theme palette [主题名]
/theme import [主题名] [本地文件]
/theme delete <主题名>
```

界面主题与代码主题彼此独立。输入 3–16 个 HEX/RGB 颜色即可生成亮色与暗色候选。`/theme import` 会读取本地 VS Code JSON/JSONC，解析相对 `include`，并保留可移植的 TextMate 颜色与样式。所有自定义路径都会先预览，并在保存前标出低对比度。定义保存在带 revision 保护的 `seektty-appearance` Harness Settings 命名空间中。

悬停样式由当前界面主题统一推导，兼容已有自定义主题，不新增必填设置、不修改保存的配色。背景过于接近或终端色彩有限时使用下划线辅助区分；仍遵守 `NO_COLOR`。

在支持的真彩色终端中，SeekTTY 会查询原终端背景色，并临时同步为界面主题背景，实时换主题时也会更新，避免终端边距露出异色；退出时恢复读取到的原色。不支持或查询超时、`NO_COLOR`、低色彩终端以及 tmux/screen 均保留原背景。设置 `SEEKTTY_TERMINAL_BACKGROUND=off` 可关闭此功能。详见[兼容性与验证说明](docs/terminal-background-compatibility.md)；该功能不修改终端配置、代码高亮、透明度或窗口装饰。

使用 `/language` 或直接命令实时切换终端文案：

```text
/language auto
/language zh
/language en
```

显式偏好由官方 locale 插件存入 `locale.preference`，并与 Harness Web 共享。`auto` 会删除覆盖并跟随终端语言环境。切换只改变 SeekTTY 界面和 transcript 呈现，不会改写模型、工具、用户、Provider 或插件生成的内容。

## 插件中心

`/plugin` 打开当前 Profile 的插件中心，`/plugins` 是别名。直接子命令包括 `list`、`search`、`info`、`install`、`remove`、`update`、`reorder`、`source` 和 `doctor`。

- 默认搜索 npm，也可添加 JSON/HTTP Catalog，或使用其他 Bundle 注册的来源；
- 支持 npm 包名、Git URL、tarball、file URL 和本地目录；
- 安装前检查 `dsh.bundle.patch`、包内文件、安装 spec、构建脚本和目标 Profile；
- 变更后可重启，并恢复工作区、Session、草稿和附件；
- 可查看版本、来源、发布者、Bundle 顺序、加载状态和可执行诊断。

TUI `/plugin` 与原生 `dsh plugin` 会协调同一份 Profile 依赖、Bundle 顺序和 pnpm lockfile。

## 迁移与移除

旧版 `deepseek-tui` 全局包只需替换一次：

```sh
pnpm remove --global deepseek-tui
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
deepseek
```

自定义 Profile 会在首次启动时分别迁移。只使用 dsh 原生入口时，可显式替换 Bundle：

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
```

移除 SeekTTY 只影响目标 Profile，不会修改 dsh 本体：

```sh
dsh plugin --profile tui remove seektty
```

## 兼容与验证

当前已测 Host 是官方 `0.1.1-rc.2`；完整兼容边界汇总如下。

| 边界 | 版本 |
| --- | --- |
| Node.js | `^22.19.0 || >=24` |
| 声明的最低 Harness Host | `0.1.0-rc.6` |
| 当前已测 Harness Host | `0.1.1-rc.2` |
| 最近一次联合验收的 Clarify Release 组合 | dsh `0.1.0-rc.8` + SeekTTY `1.2.0` + Auxiliary Runtime `0.1.0` + Clarify `0.2.1` |
| 当前鼠标与输入版本 | SeekTTY `1.2.4` + 官方 dsh `0.1.1-rc.2`；本次发布不扩展可选插件的联合验收范围 |

低于声明最低版本的 Host 会被拒绝；高于已测版本的 Host 可以在提示后启动，但自动更新只会安装明确兼容的范围。发布 Bundle 不会把 Cordis 或身份型 `@deepseek-ai/dsh-*` 包安装进 Profile：optional peer 用来描述 Host 合同，运行时 import 统一从官方 Harness 安装解析。附件兼容适配器只处理精确测试过的旧版图片限制形状，遇到未知形状会直接拒绝适配。

1.2.4 发布检查覆盖：

- typecheck、单元／集成测试、生产构建、打包内容检查和重复 Host 包拒绝；
- 使用同一候选 tarball，在未修改的官方 dsh `0.1.1-rc.2` 上隔离执行 add、boot、remove、re-add；
- Windows ConPTY 的启动、斜杠导航、右键菜单手势交接、resize 与正常退出。注入的 PTY 输入和模拟渲染测试不等价于真实 GUI 终端鼠标或剪贴板测试；
- 十万行结构性 TUI 性能门禁。各平台人工签收状态在[发布清单](docs/release-v1.2.4-verification.md)中单独列明。

此前的 Clarify、附件、Vision-Exp 与 Provider 观察属于历史证据，不代表 1.2.4 对这些可选工作流重新验收。声明的 Host 范围不变；本次 stock 生命周期复测针对 `0.1.1-rc.2`，并非所有旧版 Host。

可复用检查：

```sh
pnpm run check

DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock

DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
SEEKTTY_MOUSE_PTY=1 \
pnpm test:mouse-pty

CLARIFY_SPEC=/path/to/dsh-plugin-clarify.tgz \
pnpm test:clarify-doctor
```

用户包通过对应 GitHub Release 附带的预构建 tarball 分发，目前没有发布到 npm Registry。
