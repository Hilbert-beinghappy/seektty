# dsh 0.1.5-rc.1 用户旅程与异常回归报告

本轮从适配提交 `0fb9247` 另设验收 goal。结论是：上一轮检查没有覆盖住全部使用问题；本轮实际找到了通用命令、Provider 管理入口、Profile 创建和 Provider 保存校验四类问题，并补齐修复与回归。以下记录能够证明已执行场景的结果，不能证明所有平台、插件和外部服务组合均无缺陷。

工作目录为 `/Volumes/huawei/项目实战/seektty-issue-203`，分支 `codex/issue-203-dsh-0.1.5-rc.1`。全部模型交互使用本机 loopback 和假 key，运行在全新临时 `DSH_HOME`、临时工作区及未经修改的官方 rc.1 发布包上。原目录、正式 Session 和原 key 未被用于这些测试。主题来源只做公开文件读取。

## 验收方式与候选

“真实用户测试”在这里指逐步操作实际安装的 SeekTTY：输入、菜单、弹窗、保存、切换、重启，再检查屏幕及持久化文件。自动脚本同样驱动真实 PTY、官方 Host 和实际模型 HTTP 协议，不用浅层组件 mock 替代完整路径。另用官方原生接口制造分页、并发和状态边界，并以原生日志核对界面结果。

候选文件使用不同路径避免同版本包缓存污染：qa16 包含命令修复；qa17 加入 Provider 目录修复；qa18 加入 Profile 安装；qa19 加入 Profile 界面组件转换边界修复；**最终 qa20** 修正 Provider 保存回读误报。先前候选的未改动路径保留其验证证据，最终候选重跑全量检查、官方生命周期及原生主要旅程，并复核受影响的管理流程。

最终文件：`.artifacts/seektty-rc1-qa-20.tgz`，SHA256 `41fd3700c304dbeefce220af0508b1a0853434485a05a8188378c1c8ef565646`。精确测试版本只有 `dsh 0.1.5-rc.1`。

## 发现与修复

| ID | 实际问题与复现 | 修复及验证 |
|---|---|---|
| QA-001 | 保留的 Session.command 仍传两个参数，rc.1 `commands.execute` 要求第三个附件参数；`/plan`、`/goal`、`/compact`、`/feedback` 在 RPC 前失败 | 补 `submittedAttachments=[]`；实际官方生成协议测试修复前 4/4 失败、修复后 4/4 通过。真实 PTY 执行 plan 开关、goal、compact，退出后重新读取官方状态：plan=false、三条命令成功、压缩真实应用 |
| QA-002 | `/model` → 管理 Provider 返回错误；rc.1 配置目录不再提供旧界面必填的 active | 按官方契约合并 `listConfigurableProviders` 与 `listProviders`，从实际加载路由生成 active；完整目录解码回归通过。实际新增、发现模型、编辑、选用并推理、切换后删除均核验 |
| QA-003 | Profile 创建显示成功，却不能切换：只有清单，缺少 Bundle 安装；空白 Profile 还丢失本地 SeekTTY 候选来源 | 创建后等待原生安装与 reconcile；沿用当前 Profile 的精确安装来源；复制相对 file/link 引用时固定到源目录；失败保留目录并显示可重试命令。真实新建、复制、重启切换通过；安装失败回归也通过 |
| QA-003a | 对 QA-003 独立复核时发现：复制其他界面 Profile，install/reconcile 会重新启用仍在 dependencies 中的已移除 Bundle | 只在新目标清单中同步移除这些直接依赖；真实本地 pnpm fixture 确认旧 Bundle 未恢复、目标 node_modules 无旧包，源清单字节不变 |
| QA-004 | 首次创建 Provider 已写入且能推理，界面却提示未完整核实；旧校验用 JSON.stringify 对比原始写入与官方 resolved value，后者多出 11 个顶层默认字段及模型默认字段，且对象键顺序变化 | 改为核对官方 raw user 层；对象字段集合和值、数组顺序仍严格，仅忽略对象键插入顺序；保留 Credential 与模型路由核验。新增 11 条回归涵盖默认值、unset 回退、缺失写入、额外字段、数组与实际值差异；qa20 首次创建实际显示 saved and verified |

没有修改官方 Host 文件，也没有在客户端增加另一套 Session、Profile 或请求去重持久化。

## 分组执行结果

这些数字按套件分别统计，场景有重叠，不相加为“独立功能总数”。

| 套件 | 已观察结果 | 候选与证据 |
|---|---|---|
| 全量项目检查 | 177 个测试文件、1532 passed / 1 skipped；类型、构建、打包检查均退出 0，打包 28 个条目 | qa20，`/tmp/seektty-qa-final-check-20.log` |
| 官方插件生命周期 | 精确 231 个 dsh 包；install、boot、remove、reinstall、模块身份和独立 worker 通过，退出 0 | qa20，`/tmp/seektty-qa-stock-20.log` |
| 原生主要旅程 | 25 项通过；真实工具、提问、审批、子代理、图片、导出、搜索和重启恢复；两次 PTY 退出 0 | qa20，`/tmp/seektty-qa-native-20.log` |
| 故障注入 | 17 项通过，34 次本机请求，两个 PTY 退出 0 | qa16，`/tmp/seektty-native-faults-16c.log` |
| 原生状态与长历史 | 23 项检查：22 通过，1 个上游请求 ID 并发边界失败（见下） | qa16，`/tmp/seektty-native-state-qa-16-clean.log` |
| 附件与交互边界 | 11 项通过；逐项检查返回值，原生日志 7 条工具结果核验，审批 marker 只写一次 | qa19，`/tmp/seektty-native-interactions-19.log`；另有 7 条持久化定值/归属断言通过 |
| 逐步人工 PTY | 18 项屏幕/产物断言通过；另观察帮助层级、60×18 窄窗口、doctor/status 和正常退出 | qa16，证据目录下 `manual-report.json` |
| 管理操作 | 15 个完整用户旅程及 2 项安装/启动检查全部通过，4 次原生 PTY 启动，退出 0；首次 Provider 保存明确 verified，已轮换的假 key 实际用于推理 | qa20，`/tmp/seektty-management-qa20.log`，57.6 秒 |

### 用户旅程：具体做了什么

| 功能组 | 操作与验收依据 | 状态与边界 |
|---|---|---|
| 启动、帮助、设置导航 | 空白启动欢迎鲸鱼；未发送消息时模型请求数为 0；帮助打开、进入键位页、60×18 resize、逐层 Esc 返回；F2 从多行草稿打开再返回 | PTY 通过；系统字体和真实 GUI 未测 |
| 输入与编辑 | 中文、emoji、组合字符、括号粘贴、多行内字面 `/exit`；18,030 字符/32,430 字节长输入；HTTP 与原生日志逐字相等；Ctrl+Z 撤销整次粘贴；未知命令只提示错误 | 通过；系统剪贴板来源另列未测 |
| 欢迎页与语言 | 新增中文行后取消，保存文件无该行；另新增并保存，屏幕/Settings 有该行；受控重启保留欢迎行与英文界面 | 通过；重排、reset、Fastfetch 边界本轮使用既有行为测试覆盖，未逐项桌面重做 |
| 会话与工作区 | 新建、恢复、搜索；运行中切走再返回；完成/运行中 fork；归档后仍能读历史；工作区删除保留实际文件和 Session；同名并发创建 | 通过 |
| 长历史与分页 | 本机模型实际运行 60 轮，读取 18 页、499 个连续事件；核对顺序与不丢项 | 通过 |
| 队列与 steer | 两项排队、队列编辑/删除、生成中引导；检查每项接收与持久化次数 | 通过 |
| 流式与失败 | 401→AUTH、429→RATE_LIMIT、500→SERVER、坏 SSE→MALFORMED_RESPONSE、断流→TRANSPORT；固定 maxRetries=0，每个失败只发一次；之后继续发送成功；连续取消三轮 | 通过；不宣称真实供应商限流策略已测 |
| plan / goal / compact / feedback | 官方生成 RPC、实际命令生命周期；goal 创建/暂停/修改/过期引用/清除；compact 在有效长上下文实际压缩，最小上下文拒绝也核验 | 通过 |
| 工具、子代理 | read 缺文件、工具 JSON 破损返回 isError；真实写文件；子代理完成、冷历史与产物恢复 | 通过 |
| 提问与审批 | 多选 Alpha+Beta、自定义两行中文、跳过空数组、第二题取消整批后旧答案作废；后台提问返回所属会话；Esc 拒绝；重复 Enter 只批准并执行一次 | 通过 |
| 图片与草稿 | 正常发送/导出、路径不存在、非图片、动态 128 字节和两张上限；清空确认取消保留；切换 root Session 保留；空闲 Ctrl+C 清空；已接收的图片消息取消不重新塞回草稿 | 通过；系统图片剪贴板未测 |
| Provider 与模型 | 新增、发现远端模型列表、编辑显示名、选择路由、loopback 收到正确 model；切回官方模型后删除；普通 flash/pro 切换及重启保留 | 通过；只测试假 key 本机服务 |
| Settings / Profile / 插件 | 设置取消/保存/重启回读；Profile 新建/复制/切换，精确本地候选来源；原生本地插件插拔、清单与重启提示 | qa20 完整重放通过 |
| 主题 | 预览取消、保存、导出；公开 VS Code HTTPS 主题导入、更新；有对比度提示时确认；HTTP 非安全源被拒绝 | qa20 完整重放通过；更新验证重新拉取同一公开源，未操控线上源内容变化；背景 OSC11 与 RGB/鼠标已有协议证据见适配报告 |
| 对话显示 | 中英文 Markdown 表格、TypeScript/Python/diff、思考收起/展开；Home 浏览；查找显示 1/1；native/full 双向切换 | PTY 通过；颜色/鼠标既有专项未因本轮变更失效，桌面体验边界见下 |
| 导出与恢复 | Markdown、ZIP、图片与子代理；解析原生日志核对错误、队列、输入、工具结果；退出后重开恢复并继续发送 | 通过 |
| Skill / MCP / 状态 | Skill 目录真实列出 9 个已发现项目；无 MCP 实例时准确提示；doctor 显示官方 rc.1 与零错误零警告；status 读取原生投影 | 目录/空状态通过；未逐个执行个人 Skill，未连接外部 MCP |

## 已确认的上游边界与未测项

**上游请求 ID 并发去重空窗仍存在。** 直接对官方 Gateway 紧接着两次提交相同 requestId，第一条消息已离开 inbox 而尚未持久化时，最终出现两条 append（seq 531、538）。等第一次落盘再重复，只有一条。最终状态套件保留失败，不将其改成通过。

这不等于普通输入框重复发送：已用实际客户端回归证明，每个发送意图生成不同 RPC ID，断线恢复只同步历史，不自动重发 prompt。因此记录为未修改的官方 rc.1 直接接口边界；客户端没有另建去重缓存规避它。

明确未完成的外部验收：

- **桌面 GUI**：Computer Use 明确拒绝控制 macOS Terminal。没有绕过限制；真实鼠标、系统剪贴板、字体/emoji 视觉效果不记为通过。PTY 鼠标协议测试和终端视口回放只覆盖对应协议行为。
- **其他平台与服务**：未实机运行 Windows/Linux，未使用真实付费模型、真实供应商 key 或外部 MCP；可选 clarify-doctor 外部夹具未配置，保留 1 项 skip。没有运行远端 CI。
- **pnpm 11 GVS=true**：上一轮已确认官方 Loader 布局故障；故障分类检查通过不代表能够启动。交付入口使用本目录已验证的官方运行时，Profile 安装用单次 GVS=false。
- **显示模拟器**：headless 默认 Unicode 6 的复杂 emoji 宽度可能与现代终端不同。长输入与交互专项使用官方 Unicode graphemes addon 复核；没有把模拟器残留字形记为产品缺陷，也没有据此宣称桌面视觉通过。

测试驱动校准中还出现过 HTTP 分块 UTF-8 解码、短暂 toast 被高优先级提示覆盖、设置弹窗的逐层 Esc 和旧输入光标位置问题。驱动已修正为 Buffer 拼接后解码、观察真实状态和持久化结果；这些没有作为产品缺陷计数。

## 本机证据与复跑

完整报告、屏幕、原始终端流、fake 服务请求、导出产物留在各临时目录。它们是本机验收资料，不包含真实 key，也不提交到仓库。

| 内容 | 证据目录 |
|---|---|
| 最终原生 25 项 | `/private/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-native-acceptance-39qks8` |
| 17 项故障 | `/private/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-native-faults-iyN4Oa` |
| 状态 23 项 | `/private/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-native-state-qa-ECUPWf` |
| 交互 11 项 | `/private/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-native-interactions-ThvzYq` |
| 逐步人工 PTY | `/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-user-qa-JDqm6I`，`actions.jsonl` 保存按键序列，`manual-report.json` 汇总核验 |
| 最终管理 15 个旅程 | `/var/folders/xd/1qtnjp4s4kv_9z6x7bq465kw0000gn/T/seektty-management-acceptance-h6j3yj` |

在独立工作目录设置绝对路径后复跑，每个脚本自行建立隔离环境：

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export DSH_BIN="$PWD/.artifacts/stock-dsh-0.1.5-rc.1/node_modules/.bin/dsh"
export DSH_ENTRY="$PWD/.artifacts/stock-dsh-0.1.5-rc.1/node_modules/@deepseek-ai/dsh/lib/bin.js"
export SEEKTTY_SPEC="$PWD/.artifacts/seektty-rc1-qa-20.tgz"
export SEEKTTY_PNPM_ENTRY="/Users/huangjiawei/.cache/node/corepack/v1/pnpm/11.7.0/bin/pnpm.cjs"
corepack pnpm run check
node scripts/stock-dsh-cycle.mjs
node scripts/native-dsh-acceptance.mjs
node scripts/native-dsh-fault-acceptance.mjs
node scripts/native-state-qa.mjs
node scripts/native-interaction-qa.mjs
node scripts/native-management-acceptance.mjs
```

管理脚本把 HOME 隔离到临时目录，需要显式 `SEEKTTY_PNPM_ENTRY` 指向已安装的 pnpm CLI；上面是本机已验证的路径，另一台机器请使用自己的安装位置，`pnpm exec` 不保证提供该路径。

状态脚本遇到上述上游重复 ID 边界会返回失败，应查看逐项报告。`scripts/native-ui-explorer.mjs` 是手动 JSON 行驱动，不能只凭驱动进程退出码认定用户旅程通过；需要按保存的按键、屏幕及产物核验。该驱动另做了 5 项清理/退出码验证：安装失败、PTY 启动失败、HTTP 错误、无效 action 均退出 1，正常手动关闭退出 0，已启动的 PTY 均完成退出；证据 `/tmp/seektty-explorer-lifecycle-review.json`。可设置 `SEEKTTY_QA_UNICODE_ADDON` 指向已安装的官方 xterm graphemes addon；它只改变测试显示模拟，不改变产品依赖。
