# 任务书 B：SeekTTY —— TUI 基线不动、体验打磨、Clarify 薄壳

> 这是一本 SeekTTY 任务书。现有 TUI 是基线，不是重写对象。本书消费任务书 A 定义的接口，把 A 的接口规范视为**已经定稿**；本书不得定义、增补或改名任何接口字段。

## 1. 一段话使命

保持 SeekTTY 现有轻量而功能完整的 TUI 原封不动；体验优化作为独立轨道继续（减噪、打磨，不加新功能）；在此之外只新增**一个薄壳章节**：当且仅当探测到 Clarify 插件的六方法 Remote 时，提供一个入口，调用插件的 start / answer / accept / refine / cancel / fetch draft 接口，渲染其返回的 question / options / `multiple` / `allowCustom`，展示最终 draft，并把 draft 填入**常规 composer**，由用户用普通 Enter 经既有 `session.prompt` 路径自行发送。五方法旧 Host 必须拒绝，不得静默降级为 cancel+restart。插件缺席时，SeekTTY 行为与今天**逐比特一致**。

## 2. 目标

- 现有 TUI 全部能力原地保留，本特性不触碰第 5 节"不动清单"中的任何组件设计。
- 薄壳只做四件事：探测、调接口、渲染返回、填 composer。
- 无插件 ⇒ 零行为变化：无新命令、无新按钮、无报错、无死入口。
- 体验轨道与薄壳轨道分离：体验工作不作为新能力的载体。

## 3. 非目标

- 不实现推理、路由、用量、限额、取消、进程状态中的任何一项——这些全在插件与 Harness 侧。
- 不发明 SeekTTY 专属协议或字段；接口词汇以任务书 A 为准，一字不改。
- 不把任何现有 TUI 功能迁入插件。
- 不做常驻顾问 chrome：不加全局快捷键、不加常显灰色建议行、不加 Form-1 式占位符、不动 F1、不动空 Enter。
- 不为本特性重设计 overlay / keymap / 状态栏 / `/` 命令目录。
- 不新增任何 SeekTTY 侧持久化（文件、Profile hack、`.env`、Settings 滥用）来存问答或 draft。

## 4. 共享契约（两本任务书逐字一致，不得改写）

插件提供一个绑定当前 Session 与某个 context version 的临时推理进程。

- 模型与 Provider 路由、Profile、上下文读取、用量记录、限额、取消、错误处理全部由 Harness 拥有。插件消费这些 Host 服务；不得持有凭据、不得自行调用 Provider、不得打开隐藏 Session、不得运行常规 Agent 循环。
- 该进程不得创建正式的用户消息或助手消息。
- 该进程不得写入 Session transcript、input queue、pending、Plan、Goal，或 Session 分支 / fork。
- 该进程不得调用工具、MCP、Skills 或子代理。
- Harness（经由插件的接口）返回结构化的 question、options、是否 `multiple`、是否 `allowCustom`，以及最终整理后的 draft 文本。
- 进程启动后，若当前 Session、模型路由或 context version 变化，Harness 必须 cancel 该进程或将结果标记为 stale。以下同样视为 context version 变化：主 Session 出现新的正式消息、compaction、recall / 上下文注入。stale 的 options 不得静默继续。
- 草稿问答仅可作为 Harness 拥有的 TTL 进程状态存在，绝不可成为 SeekTTY 文件，绝不可进入 transcript。进程标识至少包含 `processId`、绑定的 `sessionId`、`contextVersion`（或模型可见上下文的稳定指纹）、`modelRouteId`。
- 最终文本进入正式对话的唯一途径，是用户之后通过常规 Session 提交路径（`session.prompt` 或等价物）自行发送。插件与任何 Surface 都不得自动发送。
- 输出仅为"待发出的用户草稿文本"，不是助手回复，也不是给 Agent 执行的计划。

共享接口词汇（两本书必须使用且不得改名）：

- start / answer / accept / refine / cancel / fetch draft
- `processId`、`sessionId`、`contextVersion`、`modelRouteId`
- question、options、`multiple`、`allowCustom`、最终 draft 文本
- 状态：running / cancelled / stale / complete
- 用量与错误走既有 Harness 通道

## 5. 不动清单（Immobile Inventory）

以下组件对本特性而言**不得重设计、不得为其扩展**。后续体验轨道可以打磨它们，但打磨不得成为夹带新能力的载体：

- composer（输入区、草稿、历史）
- 状态栏 / 通知板（busy-status、session-chrome）
- overlay 体系与 keymap
- `/` 命令目录与命令面板（Ctrl+P）
- input queue 与 `/steer`
- 审批 / approval 流与 Shift+Tab 权限循环
- pending 恢复语义
- 受控 restart 语义（工作区、会话、草稿、附件恢复）
- `/plugin` 插件市场 UI
- 主题体系（interface / code 双主题）
- locale / 中英文切换

薄壳允许做的唯一 UI 动作：用**既有** overlay 原语渲染一个新的 overlay 内容（单选 / 多选 / 自定义输入 / 文本展示，均为 TUI 已有的人机交互形态），以及用**既有**的 composer 草稿填充机制放入 draft。不新建交互原语。

## 6. 架构与数据流（薄壳章节）

### 6.1 所有权

| 归属 | 内容 |
| --- | --- |
| 插件（任务书 A） | 进程、接口、TTL 状态、stale / cancel 规则、draft 生成 |
| SeekTTY 薄壳 | 探测 Remote、发起接口调用、渲染 question / options / `multiple` / `allowCustom`、展示状态与 `staleReason`、把 draft 填入 composer |
| SeekTTY 既有路径 | 用户按 Enter 后的 `session.prompt` 提交（`src/client/surface.ts` 现有路径，不改动） |
| 用户 | 决定是否发送、是否修改 draft 后再发送 |

### 6.2 数据流

1. **探测**：启动或插件重载后，经既有 Host RPC 发现机制探测 Clarify Remote 是否存在。不存在 ⇒ 本章节所有代码路径静默不激活。
2. **入口**：仅当 Remote 存在时，在 SeekTTY 本地 `/` 目录构造阶段动态加入一条命令；该条目只属于 TUI 运行时目录，不注册 Host CommandRuntime，因为 Host command 会向 Session 写入 command / run / done 事件。不加全局快捷键。
3. **回合**：入口打开 overlay → 先证明六方法且 `clarify.wire/1` Host（缺 `refine` 或无内层 v1 则拒绝并点名兼容范围）→ 调 start（带当前 `sessionId`，composer 中已有的半成品文字作为 seedText 传入但**不清空 composer**）→ 循环渲染。`ask`（单选与多选）必须同时提供：模型生成的选项选择和/或自定义回答、审阅并采用当前 preview、直接 refine 反馈；后两项在勾选选项 payload **之外**。`await_accept` 提供 accept / refine / cancel。Esc 仍是 Cancel。不添加全局常显灰色建议行。`multiple = false` 使用既有单选原语且恰选一个；`multiple = true` 使用既有多选原语且至少选一个；customText 与 selectedOptionIds 严格异或。refine 走 Host `refine(processId, previewVersion, feedback)`，禁止 cancel+restart 拼 seed。状态 complete 时立即另调 fetch draft；若 fetch 前已 stale，则 stale 胜出且不得读取 draft。
4. **落地**：draft 展示给用户确认后填入常规 composer（覆盖前若 composer 非空需用户确认）。overlay 关闭。**到此为止**——发送与否、何时发送，完全是用户按 Enter 的常规动作。
5. **取消与过期**：用户 Esc / 关闭 overlay ⇒ 调 cancel。接口返回 stale ⇒ overlay 显式展示 `staleReason`，只提供"重新开始"与"放弃"两个动作，绝不静默续用旧 options 或旧 draft。
6. **错误**：先认 `clarify.wire/1` 再认 echo。外壳动作只认内层 `category`：`retryable` 显式 Retry/Cancel 并保留 composer；`configuration` 无 Retry；`conflict` 中 preview CAS 重载当前预览、`PROCESS_BUSY` 只 fetch 不自动重提、已消失进程只提供 Restart 新 `start`；`invalid-request` 停在当前题不 fetch；`protocol` 安全中止。外层 `internal` / `cancelled` / transport 不得重建为业务。失败的 start 已丢弃进程，Retry 再次 start（同一 Session / seed，新 process）。失败的 answer / refine 保留旧状态，Retry 在重验后对同一进程重复原操作。不得自动重试。

### 6.3 明确禁止

- 不 auto-send：任何代码路径不得在薄壳流程中调用 `session.prompt`。
- 不产生第二份 transcript：问答过程不写入会话记录、不写 SeekTTY 文件、不进 Settings。
- 不缓存进程状态跨 restart：restart 后旧 `processId` 一律视为失效，从探测重新开始。

## 7. 缺席行为（Absence）

插件未安装或 Remote 未注册时：

- `/` 目录中不出现该命令；命令面板、帮助、状态栏均无痕迹。
- 无任何错误、警告、日志噪音、死按钮。
- 行为与未实现本章节的 SeekTTY **逐比特一致**，以快照比对验证（见第 10 节）。

## 8. 体验轨道（与薄壳分离）

后续 SeekTTY 工作的定位是"轻量但完整"：

- **做**：减少 chrome 与噪音、打磨既有交互的顺滑度、修正呈现缺陷（方向参考 `docs/体验优化.md`、`docs/体验优化2.md`，但那些文档不构成本书任务）。
- **不做**：任何属于插件本体的新能力。判据：凡是需要推理、进程状态或新接口的想法，一律先进任务书 A 的接口讨论，SeekTTY 侧最多做一行壳层跟进。
- 本书不为体验轨道排任务；体验任务另行立项，逐项对照第 5 节不动清单确认"打磨而非重设计"。

## 9. 有序任务（小步、每步可验证）

| # | 任务 | 验证方式 |
| --- | --- | --- |
| B1 | 探测与入口：Remote 存在时动态注册 `/` 命令；不存在时零注册 | 有插件环境命令出现；无插件环境用 PTY 快照与基线版本逐帧比对，零差异 |
| B2 | 壳层 overlay：用既有 overlay 原语渲染 question / options / `multiple` / `allowCustom`，以及 ask / await_accept 上的 accept 与 refine，完成循环，展示 running / stale / cancelled / complete 状态 | 对着插件（或 A 书 T3 的桩 Remote）走完单选、多选、自定义输入、ask 采用、refine、多轮问答；stale 时看到 `staleReason` 与“重新开始 / 放弃”；五方法 Host 被拒绝 |
| B3 | draft 落地：complete 后 fetch draft，确认后填入 composer；composer 非空时先确认；不发送 | 断言 composer 内容变化且无 `session.prompt` 调用发生；用户 Enter 后走既有提交路径 |
| B4 | 取消路径：Esc / 关闭 overlay 调 cancel；restart 后不复用旧 `processId` | 断言 cancel 被调用；restart 后入口重新从探测开始 |
| B5 | 固化第 10 节测试为可重跑脚本 | 单命令重跑全绿 |

## 10. 测试计划

1. **有插件**：完整回合——探测、入口、多轮问答、draft 入 composer、用户 Enter 经既有 `session.prompt` 发送成功。
2. **无插件**：PTY 快照与未含本章节的构建逐帧比对，零差异；`/` 目录、帮助、命令面板无新条目。
3. **draft 只进 composer**：全程断言薄壳代码未触发任何提交；draft 出现在 composer 且可编辑。
4. **无新增持久化**：回合前后比对 SeekTTY 可写位置（Profile、Settings 命名空间、本地文件），无新键、无新文件。
5. **无 transcript 污染**：回合前后 Session transcript 逐字节一致（与 A 书测试 2 互为印证）。
6. **stale 呈现**：借助 A 书 T5 的触发手段制造 stale，断言 overlay 显式提示且旧内容不可继续操作。
7. **restart**：回合中途 `/restart`，恢复后无残留 overlay、无旧 `processId` 复用，composer 草稿按既有 restart 语义恢复。

## 11. 验收清单

- [ ] 第 5 节不动清单组件的设计零改动（代码审查逐项确认）。
- [ ] 无插件环境快照比对零差异。
- [ ] 有插件环境完整回合通过，draft 仅经用户 Enter 发送。
- [ ] 薄壳代码中不存在对 `session.prompt` 的调用。
- [ ] 无任何新增 SeekTTY 持久化。
- [ ] 接口字段与状态名与任务书 A 第 6 节逐字一致，无 SeekTTY 私有字段。
- [ ] 全部使用既有 overlay / composer / 错误呈现原语，无新交互原语。

## 12. 风险与阻塞

- **A 书 T0 与本书的真实关系**：stock dsh rc.6 / rc.7 / rc.8 上 T0(b)（只读上下文修订标识）与 T0(d)（usage / limits / cancel 通道）仍然阻塞，这只挡住 A 书 T4+ 的真实推理接入。T1–T3 已用公开 Typert / Gateway 契约和确定性 T3 桩 Remote 交付；本书 B2–B5 消费的就是这一份公开 Remote，**不得**因为这两道无关的 T0 闸门而停掉全部 B2+。B1 的无插件零差异仍然是硬条件。
- **本地 `/doctor` 不是 stock doctor**：SeekTTY v1.0.2 已有本地 `/doctor`（`managementBridge().plugins.doctor()` → `ProfilePluginManager.doctor()`）。本轨道不得替换它，也不得再造一个伪造的 stock CLI / Host HTTP `/doctor`。跨项目验收是：先独立验证官方 dsh 上 Clarify 的 add/boot/remove/re-add，再在未改动的 SeekTTY 本地 doctor 接收端上要求 Clarify bundle/fiber 零 error、零 warning。`ProfilePluginManager.doctor()` 本身不检查 fiber；常规测试里的 planted 用例只证明接收端，`CLARIFY_SPEC=... pnpm test:clarify-doctor` 才是隔离安装真包后调用未改 doctor。fiber 健康仍需运行中的 Host + `/doctor` 的 `pluginInventory()`，不得假装已自动化。
- **overlay 原语覆盖不足**：若既有单选 / 多选 / 自定义输入原语无法表达某个 question 形态，正确做法是回到任务书 A 讨论 question 形状是否过于复杂，而不是在 SeekTTY 新造原语。
- **探测时序**：插件热装 / 热卸时命令注册需跟随既有插件重载机制；若既有机制不支持热感知，可接受"下次启动生效"，不为此新造监听。动态 `/clarify` 只在 Clarify Remote 接收端被状态无关探测证明存在时出现；目录存在可用旧启发式（精确 `PROCESS_NOT_FOUND`，或包裹错误文案同时含探测 `processId` 与紧密等价 process-not-found 消息）。`SESSION_ID_REQUIRED` / `INVALID_ANSWER` 等无关业务错误不得单独证明探测存在，transport / endpoint 不可用视为缺席。激活必须同时在 `fetchDraft` 与 `refine` 上看到 **外层成功 + 内层 `clarify.wire/1` + `PROCESS_NOT_FOUND`**；旧六方法/无 v1 由 `requireClarifyCompatibleHost` 点名拒绝。新壳遇到旧裸 echo 必须拒绝。外壳动作只认内层 `category`，不得用外层 `internal` 反推业务。
- **契约变更**：任何需要新字段、新状态的诉求，一律先改任务书 A，本书只做一行跟进。绝不允许反向。SeekTTY 只经 `ConnectionHandle.rpc.call('/api', 'clarify/<method>', { args }, signal)` 消费公开 Remote，不得复制或导入 Clarify 内部实现，也不得增加 `workspace:` 依赖。
- **版本与发布**：已发布基线为 `1.1.0`；本轨道目标版本为 `1.2.0`（Unreleased）。不得把 Clarify 壳层锁死在单一 dsh 版本。发布前至少针对官方 dsh rc.6、rc.7、当时 npm `latest` 与不同于 `latest` 的官方 `next` 分别验证“插件缺席零差异”和“插件存在完整回合”，未知未来版本通过能力探测安全降级且不得产生死入口。2026-08-20 的标签快照为 `latest=0.1.0-rc.7`、`next=0.1.0-rc.8`。只有 A 书 T0(a–d) 全部闭合、联合验收通过且获得远程动作授权后，才从合并后的 `main` 创建 annotated `v1.2.0`，GitHub Release 附带 `pnpm pack` tgz、`SHA256SUMS`、精确已测兼容矩阵与安装 / 校验说明。
- **Clarify Host 兼容范围（本轨道已测）**：SeekTTY `1.2.0` 的 Clarify 壳要求 `dsh-plugin-clarify@0.2.0` 的六方法 Host Remote：`start`、`answer`、`accept`、`refine`、`cancel`、`fetchDraft`，且六个方法都返回 `clarify.wire/1` 内层结果联合。已在配对工作树 `dsh-plugin-clarify@0.2.0` 上按该契约实现与单测验证。只含 `start` / `answer` / `accept` / `cancel` / `fetchDraft` 的五方法 Host，以及旧六方法但无内层 v1 的 Host，必须点名拒绝，不得静默降级。这不是官方 npm dsh 版本已对 refine 做现场验证的声明。`0.2.0` 与 SeekTTY `1.2.0` 只在 Release gate 打开后同发。

## 13. 附录：接口边界（两本任务书逐字一致）

- 插件拥有：临时推理进程、接口（Host Remote / API）、TTL 状态、Harness 注入（router / 上下文读取 / usage / limits / cancel）、stale 与 cancel 规则、draft 文本的生成。
- SeekTTY 拥有：现有 TUI 全部能力、后续体验打磨、可选的壳层（仅调用插件接口）。
- Web 拥有：基于同一套接口的自己的壳层。
- 共享：第 4 节契约块与接口词汇。
- 禁止：SeekTTY 定义插件不存在的字段；插件调用 SeekTTY API；任何一方自动提交 draft。

若某任务需要变更契约：先改任务书 A（A 书是契约与接口规范的唯一来源），任务书 B 只做一行跟进。绝不允许反向。
