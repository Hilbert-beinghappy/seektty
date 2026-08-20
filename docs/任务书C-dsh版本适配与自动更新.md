# 任务书 C：dsh 版本适配与自动版本扫描更新（release/v1.1.0）

## 1. 一段话使命

在 `release/v1.1.0` 分支（工作树 `seektty-release-v1.1.0`）上，把 SeekTTY 从"锁死官方 `@deepseek-ai/dsh@0.1.0-rc.6`"升级为：**已测基线跟进 npm `latest`（当前 0.1.0-rc.7）、向上兼容更新的 dsh 不再阻断启动**，并新增**自动版本扫描与更新机制**——运行时能发现 dsh 官方渠道与 SeekTTY GitHub Releases 的真实最新版本并一键更新，仓库侧由定时 CI 自动检测新 dsh、跑完整验证后开升级 PR。

## 2. 目标

- G1 依赖与基线：全部 34 个 `@deepseek-ai/dsh-*` 依赖精确升到 npm `latest`（0.1.0-rc.7）；`dsh.compatibility` 变为 `minimum: 0.1.0-rc.6, tested: 0.1.0-rc.7`；包版本升 `1.1.0`。
- G2 向上兼容：运行中的 dsh 新于 `tested` 时不再抛错阻断，改为一条建议性提示（stderr），过旧仍然阻断。
- G3 运行时扫描：新模块查询 npm dist-tags（`@deepseek-ai/dsh` 的 `latest`/`next`）与 GitHub `releases/latest`（seektty），网络失败全静默；会话结束后打印更新建议（`SEEKTTY_UPDATE_CHECK=0` 可关）。
- G4 一键更新：`deepseek --update` 把全局 dsh 更新到 npm `latest`（`DSH_BIN` 固定时跳过），并用原生 `dsh plugin add` 把 Profile 里的 SeekTTY 更新到最新 release tag。绝不自动更新，只在用户显式执行时动系统状态。
- G5 仓库自动化：`scripts/bump-dsh.mjs`（--check 探测 / 应用升级）+ 每日定时工作流 `dsh-version-scan.yml`：发现新 dsh → 自动 bump → `pnpm run check` → 隔离 `DSH_HOME` 下对新版 stock dsh 跑插拔合同 → 全绿才开 PR。
- G6 合同验证（AGENTS.md 硬要求）：对 stock dsh **rc.7（新 tested）与 rc.6（minimum）**都在隔离 `DSH_HOME` 下通过 add/boot/remove/re-add 插拔合同。
- G7 文档：两份 README 的基线描述、安装 spec、`--update` 与更新提示说明同步更新。

## 3. 非目标

- 不改 TUI 交互、主题、locale、overlay 等任何界面能力。
- 不做后台守护进程或启动前阻塞式检查：更新提示只在会话结束后打印，不增加启动延迟。
- 不静默自动升级 dsh 或 seektty——一切安装动作只由显式 `deepseek --update` 或 CI PR 触发。
- 不发布 npm 包、不改仓库可见性。
- 不引入 `workspace:` 依赖；不动 `dsh.bundle.patch`（cordis.patch.yml）语义。

## 4. 关键决策（已锁定）

- D1 minimum 保持 rc.6：bundle 依赖 rc.7 客户端库但声明支持 rc.6 host，必须由 G6 的 rc.6 合同实测背书；若 rc.6 host 加载失败，则 minimum 提升为 rc.7 并在 PR 说明。
- D2 "最新版本"的定义：dsh 取 npm `latest` dist-tag（rc.8 目前是 `next`，不自动跟进 `next`）；seektty 取 GitHub `releases/latest` 的 tag。
- D3 版本比较复用现有 `compareDshVersion`（semver + 预发布），不引新依赖。
- D4 兼容判定的单一事实来源是 `package.json` 的 `dsh.compatibility` 与 `src/dsh-compat.ts` 常量，测试用"所有 dsh-* 依赖 == tested"守卫，防止漂移。
- D5 CI 升级 PR 必须包含重建的 `lib/`（现有 CI 有 `git diff --exit-code lib/` 门禁）。

## 5. 有序任务与验证

| # | 任务 | 验证 | 状态 |
| --- | --- | --- | --- |
| T1 | 用 gh 建远端分支 `release/v1.1.0`（基于 main=v1.0.1）并派发工作树 | 分支在 origin 存在；worktree 落在 `../seektty-release-v1.1.0` | 已完成 |
| T2 | `package.json`：版本 1.1.0；dsh-* 全部 rc.7；tested rc.7、minimum rc.6；`pnpm install` 成功 | rc.7 全套包存在并可安装 | 已完成 |
| T3 | rc.7 API 兼容性摸底：typecheck 全绿（改代码前先跑） | `tsc --noEmit` 零错误 | 已完成 |
| T4 | `src/dsh-compat.ts`：常量升级；新增 `dshCompatibilityNotice`；`dshCompatibilityError` 删除"新于 tested 即报错"分支；`client-runtime.ts` 打印提示而非 throw | 单测覆盖新旧行为 | 已完成 |
| T5 | 新增 `src/version-scan.ts`：`scanLatestVersions` / `updatePlan` / `updateAdvice` / `tagToVersion`，可注入 fetch，超时 3s，静默降级 | `tests/version-scan.test.ts` | 已完成 |
| T6 | `src/bin.ts`：`--update` 流程（`runUpdate`）+ 会话后提示（`postSessionUpdateNotice`）+ 入口接线 | 单测：更新计划、DSH_BIN 跳过、双渠道不可达报错、提示开关 | 已完成 |
| T7 | 更新合同测试：`package-contract`（tested rc.7 + 全 dsh-* 依赖==tested 守卫）、`dsh-compat`（新于 tested→提示）、`launcher`（1.1.0） | 全量 `pnpm run test` 379 通过 | 已完成 |
| T8 | `scripts/bump-dsh.mjs` + `.github/workflows/dsh-version-scan.yml` | `--check` 输出正确 JSON；workflow 语法与 ci.yml 同构 | 已完成 |
| T9 | stock 插拔合同：`npm install --prefix` 装 rc.7 与 rc.6 两个 stock dsh，`pnpm pack` 出 tgz，各跑一遍 `scripts/stock-dsh-cycle.mjs` | 两轮均输出"stock dsh 插拔契约通过"；rc.6 失败则执行 D1 的降级路径 | 已完成（rc.7 与 rc.6 均通过，minimum 保持 rc.6） |
| T10 | README.md / README.zh.md：安装 spec rc.6→rc.7、Verified scope 与 Compatibility 段落更新、新增 `--update` 与更新提示文档 | 两份文档不再出现作为"当前基线"的 rc.6（minimum 表述除外） | 已完成 |
| T11 | `pnpm run check`（typecheck+test+build+pack dry-run）全绿；`lib/` 重建同步 | check 退出码 0；`git status` 中 lib/ 与源码一致提交 | 已完成 |
| T12 | 提交并推送 `release/v1.1.0`；提交信息说明适配范围与验证结果 | push 成功；CI 触发 | 已完成 |

## 6. 验收清单

- [x] rc.7 与 rc.6 两轮 stock 插拔合同都通过（或 minimum 已按 D1 收紧并记录）。
- [x] 全量测试、typecheck、build、pack dry-run 通过。
- [x] `deepseek --version` 显示 1.1.0 与新基线。
- [x] 新于 tested 的 dsh 能启动且仅有一条提示；旧于 minimum 的仍被阻断。
- [x] 断网时启动、退出、`--update` 均不崩溃：扫描静默、`--update` 明确报错。
- [x] `bump-dsh.mjs --check` 输出 `{ tested, target, updateAvailable }` 正确；workflow 守卫（已有分支则跳过）已写入，未在本机跑真实 schedule。
- [x] 两份 README 与实际行为一致。
- [x] 无凭据、无 Session 数据、无 `.env` 入库。

## 7. 风险与回退

- R1 rc.6 host 加载 rc.7 客户端库失败 → 按 D1 收紧 minimum 到 rc.7（改 package.json、dsh-compat.ts、测试、README），rc.6 用户由 launcher 的"过旧"错误引导升级。
- R2 npm/GitHub 限流或不可达 → 运行时全部静默；CI 定时任务失败仅留记录，次日重试。
- R3 dsh `host.describe` 仍返回占位 `0.0.1` → 提示逻辑已忽略占位值，向上兼容提示只在 host 真实上报版本后生效；不影响阻断逻辑。
- R4 未来 dsh 发破坏性变化 → 定时工作流的 check + stock 合同会失败，不会开 PR，留待人工适配；这正是"自动化但不越过测试"的设计意图。
