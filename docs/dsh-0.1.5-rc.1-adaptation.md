# dsh 0.1.5-rc.1 适配设计与验收记录

## 目标与基线

本分支跟踪 Issue #203。2026-09-12 查询 npm：`latest=0.1.5-rc.1`，`next=0.1.5-rc.2`；本轮明确适配前者，不随 next 漂移。

- SeekTTY 基线：远端 main `83b1a034299cbe384e217cc342c94f27587cd45b`，1.2.5。
- 独立工作目录：`seektty-issue-203`；分支 `codex/issue-203-dsh-0.1.5-rc.1`。
- 原 main 已快进到远端；原目录未提交的 AGENTS.md 修改保留。
- 修改前 `pnpm install --frozen-lockfile`、`pnpm run check` 通过：156 个测试文件，1416 passed / 1 skipped，构建和 pack-check 通过。缺失 vendor sourcemap 警告不影响退出码。
- 验证环境：macOS Apple Silicon，Node 24，pnpm 11.7.0。尚不能据此声称 Windows/Linux 运行验收通过。

本文在适配代码修改之前编写。以下区别来自 npm 发布包的实际 package.json、exports、lib/types 和运行时代码，而非根据版本号推断。每项实施结果在完成后更新。

## 证据与复核方法

主证据为 `https://registry.npmjs.org/@deepseek-ai/<package>/<version>` 及其中 dist.tarball。旧包用本仓库 devDependency 的精确版本，新包统一检查 0.1.5-rc.1。已下载并解包 70 个新旧包；额外检查三个 api controller 与 subagent 的新版发布物。GitHub 源码地址本次返回 404，因此不以不可读源码作证据。

本机原始审计材料位于 `/tmp/seektty-203-api-audit/`，不包含密钥；此临时路径不是可分发依赖。下方列出可重新下载的包名、版本与具体接口路径。

## 实际变化及迁移决策

| 边界 | 旧版实际接口 | 新版实际接口 | SeekTTY 所需变更与验证 |
|---|---|---|---|
| API 入口 | dsh-host-apiproxy 的 ApiProxy / InProcessApiClient，mux + host 流 | 该包没有目标版本；api-gateway 提供 invoke、stream、wireStream，domain Remote 分散到 controller | 移除运行期旧 Host 依赖，接入新版原生 Remote；不能把旧包留下只改 tested |
| 会话客户端 | vendored client-runtime SessionRuntime 同时管理会话和 Conversation | client-runtime 没有目标版本；api-session-controller/client 提供 ISessions、SessionFace、control/follow/page | 分离会话生命周期和显示层；测试创建、打开、恢复、搜索、分页、流式文本、取消、队列及 fork |
| 会话流 | 全局 mux 的 session/event、subscribed 等 | session/control 的 baseline/queue/jobs/projection；session/follow 的 snapshot/journal/assistant-stream | 显式处理基线、游标、替换事件、断线和增量文本；不能将无事件误认为空历史 |
| Conversation | client-runtime 内置 chat、views、event registry | ui-conversation/client 的 UiConversation.binding、snapshot、target；独立会话输入/显示服务 | 保留 TUI 已有渲染和交互；用真实会话确认聊天、轨迹及工具卡片 |
| Workspace | WorkspaceRuntime 合并选择与注册操作 | api-workspace-controller/client 提供 WorkspaceController、follow 和纯 Workspace 操作 | 由 TUI 组合“连接工作区”与创建/选择会话；注册、排序、归档继续归官方服务 |
| Connection | api、hostDescription、start(mux/host sinks) | generation、state、rpc、registerGenerationSource、reconnect | 网络无关载体使用官方 domain stream 与 Gateway 具名 Remote；不启动 Web 服务器、不省略取消与释放 |
| Settings | settingsNamespace() 品牌工厂 | 工厂已移除；register/get/mutate 接受经校验的字符串 | 直接调用官方新签名；保留 expectedRevision、冲突错误和秘密字段脱敏 |
| Settings 表单 | client-schema-form@0.1.0-rc.7 的路径/Schema 助手 | client-schema-form 没有目标版本 | 把必要的无状态 schema 表示逻辑放在包内；不能引入旧 Session/Host 依赖 |
| Profile | PROFILE_TEMPLATES[name] 是 bundles 数组 | ProfileTemplate={bundles, patchReload}；initProfile 第三个参数；fallback healing 改为异步 options | 创建模板要传 bundles 和 patchReload；复制时保留官方 manifest；native plugin reconciliation 仍由 dsh 处理 |
| Locale | LocaleId 为 zh/en | LocaleId=string，BuiltInLocaleId=zh/en，支持语言包 | 共享设置允许其他语言；TUI 对未提供翻译的语言按环境回退，不覆盖用户共享偏好 |
| 类型身份 | 混入 host-apiproxy 与 schema-form 的旧 Session graph | 新的 brand、Session、Remote 类型由目标包统一提供 | lockfile 不得残留用于运行的旧 Host 图；不能用 unknown/as 绕过身份错误 |
| 基础依赖 | cordis 4.0.1 / schemastery 3.18.1 | 新官方包要求 cordis ^4.0.2 / schemastery ^3.18.2 | 随目标 Host 对齐最小必要升级，其他产品依赖保持不变 |
| 自动升级 | 缺版本时跳过包但依然修改 tested | 缺包可能是架构拆分 | 先完整检查再写文件；缺包或网络失败明确终止，不能留下一半升级 |

### 实施约束

Harness 始终拥有 Agent、Session、模型、Settings、权限、Profile、插件与持久化。SeekTTY 仅提供终端显示、交互和精确目标版本的兼容层。不得复制旧 Host 的状态服务实现，不得修改官方安装文件以获得测试通过。

优先使用新版公开的 controller、Remote 和 Conversation 接口。已有 TUI 表示类型或兼容入口可以保留，但必须说明其与新接口的映射并通过运行验证；不把旧服务包伪装成新版本。第三方代码若需随包包含，应记录来源、版本和 MIT 许可。

支持范围需按实际证据收窄：本分支对 0.1.5-rc.1 验证，不自动声称其前所有 RC 都可运行。原有功能回归指功能语义保持，不等同于继续支持已移除 API 的旧 Host。

### 密钥与隔离

沿用用户既有 Credential/环境配置，不新增、更换或显示密钥，不写入源码、文档、测试快照或提交。stock 生命周期使用独立 DSH_HOME；正式 Profile、Session 与 Settings 不作为可写测试夹具。本轮模型行为验收使用 loopback 模拟端点与假测试 key，无外部推理费用。正式使用时保留既有 DSH_HOME 与 Credential/环境设置；切换代码目录不需要复制 key。

## 验证矩阵

| 验证层 | 必须覆盖 | 当前状态 |
|---|---|---|
| 修改前基线 | 类型、全量单测、构建、打包 | 已通过，见上 |
| 接口回归 | Settings 命名空间/冲突/秘密、Profile 模板 reload、Locale 外部语言、升级脚本原子性 | 已通过，最终全量结果见下 |
| TUI 原有功能 | 输入、流式文本、取消、队列/steer、工具审批与提问、历史/恢复/搜索、fork/子代理、模型与 Provider、Settings/Profile/插件、主题导入更新、鼠标/滚动/复制 | 1510 项单测通过；PTY 实测项目见下 |
| 构建分发 | pnpm check、产物同步、消费包无 workspace/旧 Host 图/凭据、独立 worker | 最终候选通过；28 个打包条目，见下 |
| 官方生命周期 | 实际 tgz + 未修改官方 0.1.5-rc.1 + 独立 DSH_HOME：install、boot、remove、reinstall，模块身份 | 最终候选通过；231 个官方 dsh 包均为 rc.1 |
| 交互验收 | 真 PTY 启动，工作区/会话、设置/主题、退出释放；需要模型的行为使用本机模拟端点 | 已实测，具体覆盖与限制见下 |
| 跨平台 | 当前 macOS 本机；Windows/Linux 需各自运行证据 | 未运行远端 CI，不推送 |

## 发布包接口清单

以下“变化”仅指同路径 d.ts 内容是否变化；不将未变化的声明等同于已验证运行兼容。完整类型检查、对应行为测试和实际生命周期共同决定验收。

| 包（均为 @deepseek-ai/ 前缀） | 旧版本 | 新版本 | 声明文件：变更 / 新增 / 移除 |
|---|---|---|---|
| dsh | 0.1.1-rc.2 | 0.1.5-rc.1 | 0 / 0 / 0 |
| dsh-agent-presets | 0.1.1-rc.2 | 0.1.5-rc.1 | 7 / 5 / 0 |
| dsh-api-gateway | 0.1.1-rc.2 | 0.1.5-rc.1 | 3 / 8 / 1 |
| dsh-api-remotes | 0.1.1-rc.2 | 0.1.5-rc.1 | 4 / 0 / 2 |
| dsh-app-boot | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 1 |
| dsh-client-connection | 0.1.1-rc.2 | 0.1.5-rc.1 | 11 / 3 / 3 |
| dsh-client-locale | 0.1.1-rc.2 | 0.1.5-rc.1 | 6 / 0 / 1 |
| dsh-client-schema-form | 0.1.0-rc.7 | 不存在 | 必须迁移 |
| dsh-client-ui-conversation | 0.1.1-rc.2 | 0.1.5-rc.1 | 23 / 28 / 43 |
| dsh-client-ui-deliverables | 0.1.1-rc.2 | 0.1.5-rc.1 | 5 / 6 / 1 |
| dsh-client-ui-goal | 0.1.1-rc.2 | 0.1.5-rc.1 | 6 / 1 / 1 |
| dsh-client-ui-slots | 0.1.1-rc.2 | 0.1.5-rc.1 | 3 / 0 / 1 |
| dsh-client-ui-trajectory | 0.1.1-rc.2 | 0.1.5-rc.1 | 16 / 2 / 1 |
| dsh-client-ui-workflow-run | 0.1.1-rc.2 | 0.1.5-rc.1 | 3 / 0 / 1 |
| dsh-cmdline | 0.1.1-rc.2 | 0.1.5-rc.1 | 1 / 0 / 1 |
| dsh-code-runtime-worker-thread | 0.1.1-rc.2 | 0.1.5-rc.1 | 0 / 0 / 1 |
| dsh-commands | 0.1.1-rc.2 | 0.1.5-rc.1 | 3 / 0 / 0 |
| dsh-cordis-host-runner | 0.1.1-rc.2 | 0.1.5-rc.1 | 4 / 0 / 1 |
| dsh-credentials | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 0 |
| dsh-goal | 0.1.1-rc.2 | 0.1.5-rc.1 | 3 / 0 / 0 |
| dsh-host-apiproxy | 0.1.1-rc.2 | 不存在 | 必须迁移 |
| dsh-host-directory-picker-browse | 0.1.1-rc.2 | 0.1.5-rc.1 | 0 / 0 / 1 |
| dsh-host-plugin-inventory | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 1 |
| dsh-llm | 0.1.1-rc.2 | 0.1.5-rc.1 | 6 / 3 / 1 |
| dsh-message-feedback | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 2 |
| dsh-session | 0.1.1-rc.2 | 0.1.5-rc.1 | 5 / 1 / 2 |
| dsh-session-projection-cache | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 1 |
| dsh-session-stats | 0.1.1-rc.2 | 0.1.5-rc.1 | 1 / 0 / 1 |
| dsh-settings | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 0 |
| dsh-storage | 0.1.1-rc.2 | 0.1.5-rc.1 | 1 / 0 / 1 |
| dsh-storage-domain | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 0 / 0 |
| dsh-storage-json | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 2 / 2 |
| dsh-tools | 0.1.1-rc.2 | 0.1.5-rc.1 | 6 / 1 / 1 |
| dsh-typert-protocol | 0.1.1-rc.2 | 0.1.5-rc.1 | 2 / 1 / 1 |
| dsh-typert-registry | 0.1.1-rc.2 | 0.1.5-rc.1 | 1 / 0 / 1 |
| dsh-workspace | 0.1.1-rc.2 | 0.1.5-rc.1 | 4 / 0 / 0 |

## 实施补充：保留终端表示契约，替换 Host 调用

进一步对比表明，旧 Client Runtime 同时承担大量已经回归验证的终端表示与交互。此次保留其消费的序列化契约和现有终端显示层，增加显式 controller/Remote 适配；不复制 ApiProxyService、旧模型选择缓存或旧 Host 业务实现。`vendor/api-contract/` 仅来自旧官方包的 api/fetch 契约与序列化层，运行时不再安装旧 host-apiproxy。

`native-api-dispatch.ts` 将 session、workspace、Settings、Credentials、模型、Preset、goal、subagent 请求映射为新 Gateway 的原生具名参数。新版模型选择由 session/selectModel 的持久事件维护。流式 baseline、分页游标、assistant-stream 和交互请求仍需分别验证，不能从 unary 通过推断整体完成。

## 运行验证发现与修正（2026-09-12）

- 官方 CLI 的 `^0.1.5-rc.1` 内部依赖可解析到 rc.2。开发工作区和隔离官方安装均固定实际内部闭包到 rc.1；官方包文件未修改。不能只凭 CLI 的 `--version` 判定整套运行版本。
- 新 base 已提供 storage、storage-json、storage-domain、session-projection-cache，重复 insert 会令 Loader 启动失败。终端层已改为复用这些服务。
- 新 Session Controller 需要 `fileUploads`；官方标准 Agent preset 还需要 Host 层的 `tool-subagent/model-selection-settings`。已补齐官方服务，并在纯进程内 Connection 中提供新版 Fetch 路由注册接口。
- `isTokenDelta` 从 llm/message 移到 llm/assistant-stream；新版完整请求记录把流式时间保存到 assistant/message.stream。已修改显示层的导入与时间读取，保留 interrupted 标记。
- 模型目录转换为终端需要的 `current/routable/groups/failures`；prompt 的原生幂等字段是 `requestId`，由终端 RPC id 传入。实际模型菜单和发送操作发现了先前模拟 Gateway 测试未捕获的字段差异。
- 新 queue 只提供 message.id/content，RPC id 在 queue item 顶层，不再保证 role/source。旧完整 Message 校验会导致发送时连接重建；已修改表示契约，真实发送与队列显示复测通过；control 基线早于 subscribed 的情况已有双顺序回归。
- 新 follow 对冷普通会话可触发激活；连接时不能 follow 整个持久会话目录。只跟踪已挂载根会话和用户实际打开的地址，子代理保留 parent/child/mode 地址。
- 新原始 journal 不再附 tool presentation。终端通过当前官方、Agent scope 内注册的纯 presenter 补齐 call/result 卡片；不执行工具来生成卡片。
- 导出已拆分为官方 `dsh-session-log-export`。ZIP 接入其 flush、readSessionLogText 和 streamSessionLogZip，复用官方附件、后代会话和取消机制；Markdown/产物索引直接读取权威 inspect 快照，不再假设 ZIP 内含 conversation.json。
- 审批和提问接入原生 waterfall，只保存未决交互关联。回答必须匹配原会话与问题；取消、重复回答、跨会话回答和选项校验已有回归用例。终端关联 id 不冒充官方审批审计 id。

### 已核实的运行结果

- 官方 rc.1 精确闭包上的候选包完成 install、boot、remove、reinstall；检查了实际进程内 Cordis、SessionStore、ToolRuntime、SessionController 身份和独立 worker。最终 candidate15 也通过同一门禁。
- 真 PTY 完成欢迎页、会话创建、模型目录与切换、设置菜单、会话列表、流式回复、取消、队列显示与保留、退出和历史恢复。取消后保留已接收文字并显示“已停止”。
- 本机模拟模型驱动官方 write 工具创建文件，`/files` 能列出该文件。原生提问工具弹出选择，Blue 答案通过原生工具结果返回模型。
- 原生 ApprovalService 测试工具默认选中“拒绝”；用户在测试终端选择“仅本次允许”后，工具才写入隔离测试标记，结果为 allowed-once。测试工具仅存在于隔离 overlay，不随消费包分发。
- 原生 subagent 完成一轮回复，父会话收到工具结果；终端代理树显示子节点。
- Markdown 导出包含人类消息与助手文字。原始 ZIP 使用 session.v3.jsonl；包括子代理的 ZIP 同时含父日志和 subagents/<id>/session.v3.jsonl，两份日志均可解析且以 turn/end 结束。
- `/attach` 发送一像素 PNG 后清空待发送草稿；ZIP 包含对应 media 文件，日志中的 attachmentId、尺寸和字节数与实际附件对应。归档完整性检查通过。
- 主题 RGB/铺底/同步开关、持久化重启、full/native 模式切换、原生滚动回放与终端状态释放的原有 PTY 脚本两轮通过；鼠标注入脚本在修正权限命令后通过。注入式 PTY 不等同于真实 GUI 鼠标/系统剪贴板验收。
- 100k 行性能门禁通过：1k/10k/50k/100k 四档，各 3 次独立进程测量。输出中的 commit 是基线 HEAD；结果对应本分支当时未提交的适配代码。

### 审查补充的接口差异

1. 新 `agentPreset` 列表字段来自投影，恢复后不再读旧 summary 字段；投影按 seq 拒绝旧值。新版 Preset copy 接收 id，终端旧 agentPreset 参数已显式转换。
2. commands/execute 的第三参数从 images 改名为 submittedAttachments。权限操作按实际挂载描述识别参数，单次调用，失败不换参数重试。
3. api-remotes 的通用 waterfall 转发会先等待 Gateway 客户端；终端本地 answerer 需提前注册。Runner 显式注入 agents/tools，避免 Cordis 的服务访问检查使提问失败或工具卡片静默降级。
4. Assistant 活跃基线保存压缩记录（text-chunks/reasoning-chunks/tool-call-chunks/raw chunk），不同于实时单块。适配先调用官方 expandAssistantStream 校验并展开，再整体替换显示状态；坏基线保留原状态。回归夹具由官方 AssistantStreamAccumulator 生成。
5. 新错误名称以 namespace/code 表示。已知错误按旧终端分类且校验 details；未知错误保留原生 code 供定位，不生成无法解码的结果。
6. 44 条具名请求映射直接对已安装 rc.1 的生成 Host descriptor 校验。Settings CAS、凭据输入、Profile reload、Locale 回退、升级失败不写文件、流式去重、交互关联和取消另有行为回归。
7. 冷会话与已结束子代理不再有 live Agent 作用域。展示通过官方 sessionQuery 的只读 observation 取得当前 agentPreset 投影，再调用 standingKeyFor；释放 observation，不创建或恢复 Agent。Runner 显式注入 sessionQuery/agentPresets，实际 Cordis 运行作用域已有回归。
8. history 第二次补页失败时保留首次有效窗口；已经取消的 host/mux 流在首次读取时立即拒绝，避免等待一个永远不会到来的 abort 通知。
9. 新 base 的 session-query-sqlite 默认 openAt=never，导致 `/resume <query>` 报搜索禁用。Bundle 对同一官方服务设置 first-search，保留内存索引；实际原生引擎与最终 PTY 搜索都已通过，无新增状态服务或数据库。

### 验收材料与范围

本机调试记录在 `/tmp/seektty-203-*.log` 和隔离 `/tmp/seektty-203-runtime.yhrrti/`。其中只有测试输入和假 key；正式凭据未读取、复制或修改。可复跑命令见本文末尾。

候选 tarball 每次使用不同的不可变路径。同路径同版本 tgz 再次 plugin add 可能沿用原安装结果；重新打包本身不构成重新安装证据。测试应确认安装内容或使用新候选路径。

第一轮适配验收结果（提交 `0fb9247`；后续深入验收见下）：

| 检查 | 观察结果 | 本机证据 |
|---|---|---|
| 最终全量 check | 172 个测试文件通过，1510 passed / 1 skipped；typecheck、build、pack-check 均退出 0，打包 28 个条目 | `/tmp/seektty-203-check-15.log` |
| 最终官方生命周期 | 精确 231 个 dsh 包全为 rc.1；install/boot/remove/reinstall、模块身份与独立 worker 通过 | `/tmp/seektty-203-stock-final-15.log` |
| 最终原生交互 | 25 项通过，16 次本机模拟请求；搜索、生成中切换恢复、取消、工具、提问、审批、子代理、附件、导出、重启恢复均通过；两次 PTY exit 0 | `/tmp/seektty-native-acceptance-15.log` |
| 搜索引擎 | 官方默认配置复现禁用；当前 Bundle patch 后正确命中会话内容 | `/tmp/seektty-203-native-search-check.log` |
| 原有主题/滚动与鼠标 | 主题脚本两轮通过；鼠标 PTY 注入通过，相关显示实现此后未改动 | `/tmp/seektty-203-foreground-10.log`、`/tmp/seektty-203-mouse-11.log` |
| 性能 | 1k/10k/50k/100k，每档 3 次独立进程，门禁通过 | `/tmp/seektty-203-performance.log` |
| pnpm 11 布局 | GVS=false 完整生命周期通过；GVS=true 的已知 Loader 故障分类通过 | `/tmp/seektty-203-gvs-false-rc1.log`、`/tmp/seektty-203-gvs-true-rc1.log` |

第一轮候选为 `.artifacts/seektty-rc1-candidate-15.tgz`，SHA256：`e4f5070ac2992adf150df6429bc0b904a95917c2071a53c4da5e1c08c5a65686`。该候选已被下述 qa20 替代，保留名称用于追溯当时证据。第一轮原生交互报告及逐步屏幕记录在 `/private/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-native-acceptance-6JGPRD/report.json`。

未运行远端 CI，不声明 Windows/Linux、真实 GUI 鼠标/剪贴板或可选插件组合完成实机验收。普通 CLI 与原生插件生命周期中 dsh 可自行调用 pnpm 11.19.0；上表的 pnpm 11 布局专项明确固定为 11.7.0。


## 第二轮用户与异常验收

用户要求进一步从真实使用和测试工程师角度验收后，另设 goal，发现并修复通用命令第三参数、Provider active 目录适配，以及 Profile 创建后未安装的问题；独立复核又补齐复制 Profile 时界面组件被 reconcile 恢复的边界。随后修复 Provider 保存回读误报，按官方 raw user 层精确核对写入，保留凭据和模型路由校验。完整覆盖、故障复现、修复、日志和未测项见[用户旅程与异常回归报告](dsh-0.1.5-rc.1-user-qa.md)。

当前候选为 `.artifacts/seektty-rc1-qa-20.tgz`，SHA256 `41fd3700c304dbeefce220af0508b1a0853434485a05a8188378c1c8ef565646`。全量检查 1532 passed / 1 skipped，类型、构建、28 项打包检查通过；官方安装/启动/卸载/重装和 25 项原生主要旅程在该候选重跑通过；15 个完整管理旅程及 2 项安装/启动检查通过，Provider 首次保存与 Key 轮换均有实际请求证据。上游相同请求 ID 的并发去重空窗保留为已知失败，真实桌面鼠标/剪贴板、其他平台和付费模型不记为通过。

## 在此独立目录运行

本机已准备好官方运行时和最终候选。进入 `/Volumes/huawei/项目实战/seektty-issue-203` 后即可运行：

```sh
PATH="/opt/homebrew/opt/node@24/bin:$PATH" \
DSH_BIN="$PWD/.artifacts/stock-dsh-0.1.5-rc.1/node_modules/.bin/dsh" \
SEEKTTY_SPEC="$PWD/.artifacts/seektty-rc1-qa-20.tgz" \
SEEKTTY_UPDATE=off /opt/homebrew/opt/node@24/bin/node lib/bin.js --profile seektty-rc1
```

保留平时启动时的 DSH_HOME、Credential 与环境变量即可沿用原 key。此命令第一次运行会由官方 dsh 创建 `seektty-rc1` Profile 并安装本地候选。该 Profile 尚未写入用户正式 DSH_HOME；验收全部使用临时隔离 Profile。本分支仍保留 package version 1.2.5，不能用 npm 上已经发布的 seektty@1.2.5 代替本地候选。

在另一台机器重建时，先使用 Node 24 与 `corepack pnpm install --frozen-lockfile`，再执行：

```sh
node scripts/install-stock-dsh.mjs
corepack pnpm run build
corepack pnpm pack --out ".artifacts/seektty-rc1-$(date +%s).tgz"
```

安装脚本只在本目录 `.artifacts/stock-dsh-0.1.5-rc.1` 安装官方发布包，并检查 CLI 与全部 230 个内部 dsh 包均为 rc.1。已有匹配安装只读复用；遇到不匹配或不完整目录，传入另一个新目录即可。它不改全局 dsh 或正常 DSH_HOME。

后续代码变更请生成新的候选路径，再用官方 `dsh plugin --profile seektty-rc1 add <新候选的绝对路径>` 更新，并把 SEEKTTY_SPEC 对应改为新文件；不要覆盖已经验收的 tarball。

## 可复跑验收

以下脚本自行创建隔离 DSH_HOME，不使用正式 Session 或真实 API key。先把 DSH_BIN、DSH_ENTRY 和 SEEKTTY_SPEC 设为已安装的官方运行时和本次候选的绝对路径；性能与全量单测不需要这些环境变量。

```sh
corepack pnpm run check
node scripts/stock-dsh-cycle.mjs
node scripts/native-dsh-acceptance.mjs
node scripts/foreground-pty-acceptance.mjs
node scripts/mouse-pty-harness.mjs
corepack pnpm test:pnpm11-layout false .artifacts
corepack pnpm test:pnpm11-layout true .artifacts
corepack pnpm perf:tui
```

`DSH_ENTRY` 为官方目录下 `node_modules/@deepseek-ai/dsh/lib/bin.js`。CI 使用相同精确版本安装 helper；pnpm 11 布局脚本在自己的临时 global/v11 写入相同 overrides，关闭 GVS 时验证完整原生插件生命周期；启用时当前仍遇到上游 Loader 故障，脚本验证故障分类与启动器给出的单次关闭开关指引。GVS=true 的分类通过不代表成功启动。该固定只影响验收安装，不修改任何官方发布文件。

本轮没有启用可选 clarify-doctor 插件的外部安装夹具，因此其集成用例维持原基线的 1 项跳过；普通单测照常运行。默认交付运行入口使用本目录 npm 安装的官方运行时，避免 pnpm 11 GVS=true 的已知布局故障。
