# SeekTTY 1.3.0

## English

SeekTTY 1.3.0 brings the terminal workspace up to official DeepSeek Harness `0.2.0-rc.2`. It adds access to more of the Host's everyday workflows, makes file and draft handling more reliable, and packages the optional Browser, Computer, Creator, and WAV-input integrations as explicit choices.

### New in this release

- **More native workflows in the terminal.** Browse Session actions, plans and artifacts, MCP resources, Team information, and schedules. Timed questions and continued questions retain their native lifecycle. Account and model information, file receipts and references, and process details use the current Host contracts. [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211), [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- **Workspace files and input extensions.** `/files` can browse Host directories and display text or binary file information. Available Host file watching refreshes the view; backends without watching offer manual refresh. Plugins can register terminal Session actions and `/input-activities`; accepted text goes into the captured draft selection and supports undo. [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- **Optional tools, installed deliberately.** The package includes companion Bundles for Creator, Playwright MCP, Chrome DevTools MCP, Stagehand, Cua MCP, and native Cua. Choose the capabilities and backend you want for each Profile. These companions are not enabled by the main Bundle. [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- **WAV transcription with review before insertion.** With the official experimental voice-input Bundle enabled, `/speech wav` accepts bounded 16 kHz mono PCM16 WAV files. Model preparation and text insertion require confirmation, insertion supports undo, and late results cannot overwrite a newer draft. This entry does not record from the microphone. [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)

### Bug fixes

- Adapted Agent Presets, Config forms, lazy Remote codecs, inbox/job events, permissions, and flat V4 tool results to dsh `0.2.0-rc.2`, so the terminal can load and use the current Host. Error results and Preset metadata keep their intended meaning. [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211), [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- Kept cached history and live-stream sequence domains separate, rejected stale Session/file/reference targets, and preserved reference focus and draft insertion boundaries. [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- Removed control sequences that could conceal approval details, distinguished a native denial from a technical failure, and improved localized approval and experimental-plugin labels. [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- Cleaned up file watchers and exited clipboard/PTY workers, bounded terminal shutdown, and repaired service assembly and restricted Cordis Context access used by files and WAV input. [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211), [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)
- Repaired upgrade checks that were tied to an older Host version. Version bumps now check the official Host dependency pins before writing, and isolated package tests ignore inherited `NODE_PATH`. The intermediate rc.2/rc.3 adaptations are included in the history; the release supports the current exact Host below. [#208](https://github.com/Hilbert-beinghappy/seektty/pull/208), [#210](https://github.com/Hilbert-beinghappy/seektty/pull/210)
- Corrected the historical `1.2.6` publication record. [#209](https://github.com/Hilbert-beinghappy/seektty/pull/209)

### Changes missing from earlier release summaries

The following features and fixes were already shipped in `1.2.6`. They are described here because that release's short API-migration summary did not explain them individually:

- **Agent Tree:** nested children, live status, child-transcript navigation, and restoration of the parent view. Theme imports apply to both interface and code immediately, and the expanded tree no longer shifts mouse targets. [#186](https://github.com/Hilbert-beinghappy/seektty/pull/186), [#188](https://github.com/Hilbert-beinghappy/seektty/pull/188)
- **Context menus and copying:** target-specific menus for Sessions, files, tools, plugins, and other controls; refreshed lists after edits; semantic transcript copying that preserves source indentation and hard newlines while excluding borders, padding, and line numbers. [#191](https://github.com/Hilbert-beinghappy/seektty/pull/191), [#192](https://github.com/Hilbert-beinghappy/seektty/pull/192)
- **Providers and themes:** one Provider manager for onboarding, models, and Settings; schema-based configuration, model discovery where supported, and explicit Session model selection. VS Code, Insiders, and Cursor themes can be discovered locally, or imported and manually updated from HTTPS sources. [#193](https://github.com/Hilbert-beinghappy/seektty/pull/193), [#201](https://github.com/Hilbert-beinghappy/seektty/pull/201)
- **Appearance and scrollback:** independent color rendering, background fill, and terminal-color synchronization; native terminal scrollback; complete mutable assistant/tool tails. The opt-in `SEEKTTY_NATIVE_TAIL=1` path separates committed history from the active tail and uses bounded worker preparation and serial delivery. [#195](https://github.com/Hilbert-beinghappy/seektty/pull/195), [#200](https://github.com/Hilbert-beinghappy/seektty/pull/200), [#202](https://github.com/Hilbert-beinghappy/seektty/pull/202)
- **Long-session and restart fixes:** welcome updates leave completed-history caches intact, streaming reuses stable layout/highlighting work, restarted child streams become visible immediately, and initial background jobs survive subscription ordering. Update discovery follows npm `latest`. [#189](https://github.com/Hilbert-beinghappy/seektty/pull/189), [#198](https://github.com/Hilbert-beinghappy/seektty/pull/198), [#199](https://github.com/Hilbert-beinghappy/seektty/pull/199), [#206](https://github.com/Hilbert-beinghappy/seektty/pull/206)

The [complete PR audit](https://github.com/Hilbert-beinghappy/seektty/blob/v1.3.0/docs/release-v1.3.0-pr-audit.md) also records older omissions: one-level Escape navigation, immediate local palette commands, queue-edit cancellation, Tab without accidental confirmation, preserved attachments, focused help and Settings, clearer status/restart/error messages, history-replay flicker, and README updates. These are historical documentation additions, not newly introduced behavior. It lists all 183 PR records, including the 108 source PRs consolidated into the original `1.0.0` integration.

### Compatibility and installation

- Node.js: `^22.19.0 || >=24`.
- Minimum and tested Host: official `@deepseek-ai/dsh@0.2.0-rc.2`.
- Supported terminal platforms: Windows, macOS, and Linux.
- Harness continues to own Agent, Session, models, Settings, permissions, Profile, plugins, credentials, and persistence. SeekTTY remains its terminal Bundle.

```sh
pnpm add --global --config.enable-global-virtual-store=false @deepseek-ai/dsh@0.2.0-rc.2
dsh plugin --profile tui add --config.enable-global-virtual-store=false seektty@1.3.0
dsh --profile tui
```

For the `deepseek` launcher, install `seektty@1.3.0` globally and set `SEEKTTY_SPEC=seektty@1.3.0`. PowerShell uses `$env:SEEKTTY_SPEC='seektty@1.3.0'`. Upgrade the Host to the exact version above before loading this Bundle; the previous `1.2.6` release was tested on dsh `0.1.5-rc.1`.

The per-command GVS option remains necessary for the tested Cordis loader. Optional integrations still depend on their own model routes, installed applications, and OS permissions. Real ASR, microphone capture, SSH deployment, browser/device actions, and manual GUI clipboard behavior are not certified by the automated release checks. React-only interfaces are not terminal features. [#207](https://github.com/Hilbert-beinghappy/seektty/pull/207) was merged into a separate development branch and is not included in this release; its long-stream stall and hover fix must not be credited here.

Exact package checks, digests, CI, and publication receipts are recorded in the [release verification record](https://github.com/Hilbert-beinghappy/seektty/blob/v1.3.0/docs/release-v1.3.0-verification.md).

## 中文

SeekTTY 1.3.0 将终端工作区适配到官方 DeepSeek Harness `0.2.0-rc.2`，补充更多原生工作流，改善文件浏览和草稿处理，并把 Browser、Computer、Creator 与 WAV 输入整理为可以按需安装的可选功能。

### 本次新增

- **更多原生工作流。** 可以在终端查看 Session 操作、计划与产物、MCP 资源、Team 信息和定时任务；限时问题和继续作答保留 Host 的原生生命周期。账号、模型、文件回执与引用、进程信息也接入了当前 Host 接口。对应 [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211)、[#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- **工作区文件与输入扩展。** `/files` 支持浏览 Host 目录、查看文本或二进制文件信息；Host 提供文件监视时自动刷新，否则可以手动刷新。插件可以注册终端 Session 操作和 `/input-activities`，采用后的文本写入原先捕获的草稿选区，支持撤销。对应 [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- **按需安装工具。** 包内提供 Creator、Playwright MCP、Chrome DevTools MCP、Stagehand、Cua MCP 与原生 Cua 的配套 Bundle，可按 Profile 选择所需功能和后端；主 Bundle 不会默认启用这些功能。对应 [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- **先审阅再插入的 WAV 转写。** 启用官方实验性语音输入 Bundle 后，`/speech wav` 可接收有大小限制的 16 kHz 单声道 PCM16 WAV 文件。准备模型与插入文字都需要确认，插入后可以撤销，迟到结果不会覆盖较新的草稿。这个入口不提供麦克风录音。对应 [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。

### Bug 修复

- 适配 dsh `0.2.0-rc.2` 的 Agent Preset、Config 表单、延迟 Remote codec、收件箱和任务事件、权限及扁平 V4 工具结果，修复当前 Host 下的加载与交互问题，并正确保留错误结果和 Preset 元数据。对应 [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211)、[#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- 分开处理历史缓存与实时流的序号，拒绝过期 Session、文件和引用目标，保留引用焦点与草稿插入边界。对应 [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- 清理可能隐藏审批内容的控制序列，区分原生拒绝与技术失败，补齐审批和实验性插件的本地化说明。对应 [#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- 清理文件监视、剪贴板与退出后的 PTY worker，限制终端退出等待，修复文件及 WAV 流程中的服务装配和受限 Cordis Context 访问。对应 [#211](https://github.com/Hilbert-beinghappy/seektty/pull/211)、[#212](https://github.com/Hilbert-beinghappy/seektty/pull/212)。
- 修复绑定旧 Host 版本的升级检查；版本更新先核对官方依赖，再修改文件。隔离包验收不再受机器级 `NODE_PATH` 干扰。中间的 rc.2／rc.3 适配保留在历史中，当前 Release 使用下方的精确 Host。对应 [#208](https://github.com/Hilbert-beinghappy/seektty/pull/208)、[#210](https://github.com/Hilbert-beinghappy/seektty/pull/210)。
- 修正历史 `1.2.6` 文档中的发布状态。对应 [#209](https://github.com/Hilbert-beinghappy/seektty/pull/209)。

### 补充此前发布说明遗漏的改动

下面这些内容已经包含在 `1.2.6` 中，只是当时较简短的 API 适配说明没有逐项介绍：

- **Agent Tree：** 支持嵌套子代理、实时状态、进入子会话和恢复父会话视图；导入主题后立即应用到界面与代码，展开代理树也不再造成鼠标坐标偏移。对应 [#186](https://github.com/Hilbert-beinghappy/seektty/pull/186)、[#188](https://github.com/Hilbert-beinghappy/seektty/pull/188)。
- **右键菜单与复制：** Session、文件、工具、插件等对象有各自的菜单，编辑后会刷新列表；对话按源文本语义复制，保留代码缩进和真实换行，排除边框、填充与行号。对应 [#191](https://github.com/Hilbert-beinghappy/seektty/pull/191)、[#192](https://github.com/Hilbert-beinghappy/seektty/pull/192)。
- **Provider 与主题：** 首次配置、模型选择和 Settings 共用 Provider 管理流程，支持按 Schema 配置、按能力发现模型，并明确选择当前 Session 的模型；支持发现 VS Code、Insiders、Cursor 本地主题，以及 HTTPS 导入与手动更新。对应 [#193](https://github.com/Hilbert-beinghappy/seektty/pull/193)、[#201](https://github.com/Hilbert-beinghappy/seektty/pull/201)。
- **外观与原生滚动：** 显色、铺底和终端背景同步可以分别调整；原生滚动模式保留完整活动正文与工具尾部。手动开启 `SEEKTTY_NATIVE_TAIL=1` 后，已提交历史与活动尾部分开处理，并使用受限 worker 准备和串行输出。对应 [#195](https://github.com/Hilbert-beinghappy/seektty/pull/195)、[#200](https://github.com/Hilbert-beinghappy/seektty/pull/200)、[#202](https://github.com/Hilbert-beinghappy/seektty/pull/202)。
- **长会话与重启修复：** 欢迎页更新不再清空已完成历史缓存，流式绘制复用稳定的排版和高亮，重启后的子代理正文立即显示，初始后台任务不再因订阅顺序而丢失；自更新通过 npm `latest` 发现版本。对应 [#189](https://github.com/Hilbert-beinghappy/seektty/pull/189)、[#198](https://github.com/Hilbert-beinghappy/seektty/pull/198)、[#199](https://github.com/Hilbert-beinghappy/seektty/pull/199)、[#206](https://github.com/Hilbert-beinghappy/seektty/pull/206)。

[完整 PR 统计](https://github.com/Hilbert-beinghappy/seektty/blob/v1.3.0/docs/release-v1.3.0-pr-audit.md)还补录了更早的 Esc 逐层返回、本地命令直接执行、取消队列编辑、Tab 防误确认、保留附件、帮助和 Settings 整理、状态与错误提示、历史重绘闪烁及 README 改动。这些是历史说明补充，不是本次新增功能。统计覆盖全部 183 条 PR 记录，其中也包括经最初 `1.0.0` 集成 PR 汇总交付的 108 个来源 PR。

### 兼容与安装

- Node.js：`^22.19.0 || >=24`。
- 最低与已测 Host：官方 `@deepseek-ai/dsh@0.2.0-rc.2`。
- 支持 Windows、macOS 与 Linux 终端。
- Agent、Session、模型、Settings、权限、Profile、插件、凭据与持久化状态继续由 Harness 持有，SeekTTY 提供终端 Bundle。

```sh
pnpm add --global --config.enable-global-virtual-store=false @deepseek-ai/dsh@0.2.0-rc.2
dsh plugin --profile tui add --config.enable-global-virtual-store=false seektty@1.3.0
dsh --profile tui
```

使用 `deepseek` 启动器时，全局安装 `seektty@1.3.0`，并设置 `SEEKTTY_SPEC=seektty@1.3.0`；PowerShell 使用 `$env:SEEKTTY_SPEC='seektty@1.3.0'`。加载 Bundle 前先把 Host 升级到上述精确版本；此前的 `1.2.6` 与 dsh `0.1.5-rc.1` 配套验证。

当前 Cordis Loader 仍需要逐命令关闭 GVS。可选功能还依赖各自的模型路由、应用安装与系统权限；自动验收不代表已经完成真实 ASR、麦克风、SSH 部署、浏览器／设备操作或 GUI 剪贴板人工验收。React 专属界面不属于终端功能。[#207](https://github.com/Hilbert-beinghappy/seektty/pull/207) 合入了另一个开发分支，未包含在本次 Release 中，因此不能把它的长流卡顿和 hover 修复记作本次交付。

精确包验证、摘要、CI 与发布回执见[发布验证记录](https://github.com/Hilbert-beinghappy/seektty/blob/v1.3.0/docs/release-v1.3.0-verification.md)。
