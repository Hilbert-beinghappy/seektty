# SeekTTY

[English](README.md) | 中文

SeekTTY 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 带进终端。进入项目目录运行 `deepseek`，就能在一个键盘优先的工作台里完成提问、代码修改、工具调用、会话管理、模型与权限切换、插件安装、子 Agent 协作和运行诊断。

SeekTTY 以 Profile Bundle 方式接入 Harness，直接使用原生 Agent、Session、模型、权限、Settings、Profile、插件与持久化能力。终端中的每个操作都落在同一套 Harness 状态上，升级时只需要更新兼容基线和适配层。

## DeepSeek 亮色与暗色界面

### 亮色主题

![SeekTTY DeepSeek 亮色首屏](assets/seektty-tui.png)

### 暗色主题

![SeekTTY DeepSeek 暗色首屏](assets/seektty-tui-dark.png)

## 已经接入的 Harness 能力

当前版本覆盖以下能力：

| 能力 | 当前可用操作 |
| --- | --- |
| 对话与运行 | 流式回复、Markdown/GFM、代码块、链接、表格、推理显示切换、工具卡片折叠/展开/隐藏、模型重试、上下文压缩、最大输出与错误状态、Ctrl+C 停止当前轮次 |
| 会话 | 新建、恢复、列表、全文搜索、重命名、Fork、归档、复制最后一条回复、导出当前会话或连同子 Agent 会话及附件一起导出 ZIP |
| 工作区 | 从当前目录启动，添加、选择、重命名、移除注册、调整工作区顺序和工作区内会话顺序；移除注册不会删除目录、文件或会话日志 |
| Agent 模式 | 支持 Standard、Code/PTC、Minimal、Cordis/Create 四种基线模式，并动态显示插件注册的新 Agent Preset；活跃会话切换模式时在同一工作区创建新会话 |
| 模型与 Provider | 动态读取 Provider、模型和模型支持的推理强度，显示当前实际路由，切换当前会话模型，并报告目录、凭证和路由错误 |
| 权限与审批 | 查看和切换只读、工作区、完全访问等 Host 权限；Shift+Tab 快速循环；进入高风险权限前确认；工具调用支持仅本次允许或拒绝 |
| 输入队列与 Steer | Agent 运行时继续排队消息，查看、编辑、删除队列项，将单条或整队消息转为当前轮次引导，并可直接发送 `/steer` |
| 人机交互 | 处理单选、多选、自定义回答、跳过、取消和计划审查；待处理交互失败后可通过 `/pending` 重试 |
| 图片附件 | 通过路径或粘贴加入 PNG、JPEG、GIF、WebP，按 Harness 限制检查数量和大小；终端支持时内联显示，否则显示文件名、尺寸、类型和大小 |
| Plan、Goal、Todo 与压缩 | 使用 Harness 原生 `/plan`、`/goal`、`/compact` 命令，显示计划审查、目标状态、Todo 数量和上下文压缩记录 |
| 工具与产出文件 | 动态工具目录、工具参数与安全边界说明、结构化结果和通用降级卡片；查看本轮生成文件、复制绝对路径，并在确认后交给外部程序打开 |
| 子 Agent | 查看直接子 Agent、运行状态、树结构、Token 和耗时；打开可继续会话或只读会话，并在运行时停止当前子 Agent 轮次 |
| 后台任务与工作流 | 查看 Jobs 的类型、状态、开始/结束时间、耗时和详情；在 Transcript 中显示工作流阶段、成员、结果和失败状态 |
| 统计与轨迹 | 每轮显示步骤数、LLM/工具耗时、首 Token、吞吐率、缓存命中和输入/输出 Token；检查模型请求、运行中工具与结构化 Trajectory |
| Profile | 查看、创建、复制和切换 Profile，诊断终端兼容性；受控重启会恢复工作区、会话、未发送草稿和附件 |
| 设置与凭证 | 枚举当前 Profile 注册的全部 Settings；专用处理默认模型、默认权限、默认 Agent 模式和插件来源，其余字段通过 Schema 通用控件编辑；Secret 只写不回显 |
| 插件与市场 | `/plugin` 插件中心、已安装列表、搜索、详情、安装、删除、更新、Bundle 排序、来源管理和诊断；支持 npm、Git、tarball 与本地路径安装 |
| Skills 与 MCP | 动态列出当前可调用 Skills 并插入原生命令；查看 MCP 工具、实例、设置、加载状态和独立进程/远端服务风险 |
| 反馈 | 记录会话反馈；对 Assistant 回复提交好评、差评和可选说明，也可删除已有消息反馈 |
| 状态与诊断 | 查看 Harness、Node、平台、Profile、工作区、会话、模式、模型、权限、pnpm、插件运行状态及诊断信息 |
| 主题 | DeepSeek 暗色与亮色主题、True Color/256 色/16 色降级、`NO_COLOR` 支持；`/theme` 切换后立即生效并由 Harness Settings 持久化 |

模型、Provider、Agent Preset、权限、Host 命令、工具、Settings、Skills、MCP 和插件来源都从当前 Harness 运行时读取。上游或第三方 Bundle 注册新能力后，SeekTTY 会将它加入动态目录；需要专用界面的能力也保留 Schema、结构化详情和错误诊断入口。

## 安装并使用裸命令

仓库公开，可直接从 GitHub 安装，无需配置私有仓库访问权限。

```sh
pnpm add --global github:Hilbert-beinghappy/seektty
deepseek
```

`deepseek` 首次运行会通过原生 `dsh plugin` 命令创建默认 `tui` Profile 并安装本 Bundle，以后直接启动同一 Profile。它支持初始任务、工作区、会话恢复和自定义 Profile：

```sh
deepseek "检查这个项目"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
```

也可以只使用 dsh 的原生入口：

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
dsh --profile tui
```

## 斜杠命令

在输入框键入 `/` 会打开可搜索的命令与 Skill 菜单。菜单会合并 SeekTTY 命令、当前 Agent 注册的 Host 命令和用户可调用的 Skills。

| 分类 | 命令 |
| --- | --- |
| 会话 | `/new`、`/resume`、`/sessions`、`/rename`、`/fork`、`/archive`、`/export`、`/copy` |
| 工作环境 | `/workspace`、`/profile` |
| Agent | `/mode`、`/model`、`/permission`、`/plan`、`/goal`、`/compact` |
| 运行交互 | `/queue`、`/steer`、`/attach`、`/attachments`、`/pending` |
| 运行内容 | `/tools`、`/files`、`/jobs`、`/subagents`、`/trajectory` |
| 扩展 | `/plugin`、`/plugins`、`/skills`、`/mcp` |
| 配置与诊断 | `/settings`、`/theme`、`/status`、`/doctor`、`/feedback`、`/restart` |
| 帮助与退出 | `/help`、`/quit`、`/exit` |

`/plugin`、`/workspace` 和 `/profile` 既有完整的交互中心，也支持直接子命令。未知命令会给出相近候选，不会被当成普通消息发给模型。

## 常用键位

| 键位 | 操作 |
| --- | --- |
| `/` | 打开命令与 Skill 候选 |
| Enter / Shift+Enter | 发送或确认 / 输入换行 |
| Tab / Escape | 在输入区与 Transcript 间切换 / 返回输入区或关闭当前弹窗 |
| Shift+Tab | 循环当前权限，进入完全访问前确认 |
| Shift+Left / Shift+Right | 跳到上一个或下一个用户轮次 |
| Ctrl+P | 打开完整命令面板 |
| Ctrl+M | 支持扩展键盘协议时打开模型选择器 |
| Ctrl+S | 打开会话恢复选择器 |
| Ctrl+O / Ctrl+T | 切换工具卡片显示 / 显示或隐藏推理内容 |
| F2 / Ctrl+, / Cmd+, | 打开设置 |
| Ctrl+C | 停止当前轮次、清空草稿，或二次确认退出 |

## 从 deepseek-tui 迁移

旧版全局包只需替换一次；新的 `deepseek` 启动器会通过原生 `dsh plugin` 命令把目标 Profile 中的旧 Bundle 标识替换为 `seektty`：

```sh
pnpm remove --global deepseek-tui
pnpm add --global github:Hilbert-beinghappy/seektty
deepseek
```

自定义 Profile 在首次启动时分别迁移，例如 `deepseek --profile team-tui`。只使用 dsh 原生入口时，可显式执行：

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
```

## 直接插拔

移除不会修改 dsh 本体，只会让 Bundle 离开目标 Profile：

```sh
dsh plugin --profile tui remove seektty
```

重新安装使用相同命令：

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
```

安装结果直接写入目标 Harness Profile 的依赖、Bundle 顺序和 pnpm lockfile。TUI 的 `/plugin` 与原生 `dsh plugin` 操作同一份 Profile 状态。

## 插件中心

裸 `/plugin` 打开当前 Profile 的插件中心，`/plugins` 是同一入口。直接子命令包括 `list`、`search`、`info`、`install`、`remove`、`update`、`reorder`、`source` 和 `doctor`。

- 默认从 npm Registry 搜索，可增加 JSON/HTTP Catalog，也能读取其他 Harness Bundle 注册的来源；
- 安装输入支持 npm 包名、Git 地址、tarball、file URL 和本地目录；
- 安装前检查 `dsh.bundle.patch`、包内文件、最终安装 spec、构建脚本和目标 Profile；
- 安装、删除、更新和排序完成后可立即重启，重启会恢复当前工作区、会话、草稿和附件；
- 插件详情会显示版本、来源、发布者、Bundle 状态、加载顺序和可执行诊断。

## 模型、设置与主题

`/model` 从 Harness 动态读取 Provider、模型和推理强度，选择完成后立即刷新输入框右下角的实际模型状态。`/mode` 管理 Agent Preset，`/permission` 管理当前会话权限；三者各自独立。

`/settings` 会列出当前 Profile 注册的全部设置命名空间。默认模型、默认权限、默认 Agent 模式和插件来源使用专用选择器；布尔、枚举、数字、文本、JSON、Secret 和 Credential Ref 等其他字段由 Schema 通用界面处理。界面同时显示继承值、用户覆盖、重置操作以及立即生效或重启生效状态，写入时使用 revision 防止覆盖并发修改。Secret 只显示是否已配置，输入时不会回显。

SeekTTY 默认使用 DeepSeek 暗色主题。输入 `/theme` 可打开亮色/暗色选择器，也可直接使用 `/theme dark` 或 `/theme light`。主题立即更新，并通过 Harness Settings 保留到下次启动。

## 已验证范围

- 官方 stock `@deepseek-ai/dsh@0.1.0-rc.6` 隔离安装、配置装配和 PTY 启动。
- `/doctor`：95 个 Harness 插件运行，0 error，0 warning。
- 模型列表、Provider／模型／推理强度切换、请求提交和 Harness 错误透传。
- 暗色与亮色真实 PTY 渲染、`/theme` 即时切换，以及同一 Profile 重启后的主题恢复。
- 原生 remove 后依赖、Bundle 和配置条目全部消失；re-add 后再次启动成功。
- 全新全局安装的裸 `deepseek` 自动创建并启动 `tui` Profile。
- macOS 和 Linux；不支持 Windows。

已使用仅注入测试进程环境的有效 DeepSeek 凭据完成真实在线响应验收：`v4-flash` 精确返回 `DSH_PLUGIN_DEEPSEEK_OK`。凭据未写入 Profile、设置文件、日志或仓库。

可复用的 stock-dsh 插拔检查：

```sh
DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock
```

## 兼容和升级

当前兼容基线是官方 `0.1.0-rc.6`。dsh 发布新版本后，在本仓库更新精确依赖和兼容快照，并完成 add／boot／remove／re-add 契约验证，即可发布新的兼容范围。

源码仓库公开；当前未发布 npm 包或 GitHub Release，请使用上方 GitHub 地址安装。
