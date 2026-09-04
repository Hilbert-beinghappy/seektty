# Issue #196：Welcome 局部失效验收

## 范围与基准

- 基准：`01653309943c24ec50cd695547a87ca5aab1988d`（包含 PR #195）。
- 分支：`codex/fix-welcome-invalidation-196`。
- 只修 Welcome facts 的等值通知和局部缓存失效；不改变 full/native 渲染、折叠、主题/语法刷新、Harness Session 或订阅生命周期。
- native 的“已提交历史 + 活动尾部”重构独立讨论于 #197，不作为本修复的前置条件。

## 修复与正式回归

`WelcomeController.setRuntimeFacts()` 按全部字段值比较，等值对象不增加 generation 或通知。异步 Logo/fastfetch 的通知仍保留。

`Transcript.refreshWelcomePresentation()` 按 welcome row 所有权清除 block 的宽度缓存及 component 的行缓存，更新派生布局索引并请求重绘。兼容空 Session 和无 Session 引导页，不依赖 `__empty__` 一个块名；欢迎页隐藏时不动历史、选择、滚动锚点或复制映射。

Surface 的 Welcome 回调只调用该局部入口，不再调用全局 `refreshPresentation()` 或 `tui.invalidate()`。真正的主题/语法失效路径保持原样。

正式测试：

- `tests/welcome-refresh.test.ts`：15 项；覆盖九个 facts 字段、等值/销毁后通知、full/native、无 Session/空 Session、多个宽度、变高/变矮、200 次流式更新、Logo/fastfetch 迟到及切换到非空 Session。
- 固定样本为 4 个已完成历史节点（共 140,000 字符）和 1 个活动节点，200 次追加、每 40 次排版检查。初始化 5 个 Markdown；后续仅创建 200 个活动组件，历史组件身份不变。旧诊断中的同等通知链是 1200 个新组件。所有 200 个 chunk 标记顺序正确且各出现一次，最终 settled 标记不遗漏。
- `tests/surface-welcome.test.ts`：2 项；实际 `startTuiSurface()`、异步 Header Promise 和 full/native 接线，20 次更新不触发全局失效，历史组件不重建，草稿与最终正文保留，客户端/订阅/停止只执行一次。Harness 使用测试替身，语法初始化暂挂以隔离 Welcome 回调。
- Vitest 复用打包时的兼容别名以加载真实 Surface；忽略 `.artifacts` 下保留的旧诊断，避免把“断言旧错误”的实验当成正式回归。

## 2026-09-04 本地验证结果

| 环境/项目 | 结果 |
| --- | --- |
| Windows Node 26.1.0，pnpm 11.7.0 | 类型检查通过；142 个测试文件，1345 项通过、1 项跳过 |
| Debian WSL Node 24.20.0，pnpm 11.7.0 | 独立 Linux 依赖；类型检查通过；142 个测试文件，1345 项通过、1 项跳过 |
| 构建与包检查 | `pnpm run build`、`pnpm run pack:check` 通过；25 个打包条目，无 `workspace:` 依赖 |
| Windows 官方 dsh 0.1.1-rc.2 | 隔离 `DSH_HOME` 安装、启动、移除、重装及模块身份检查通过 |
| WSL 官方 dsh 0.1.1-rc.2 | 同一包的上述生命周期检查通过 |
| 包内交互检查 | Windows ConPTY、Debian PTY、独立 tmux 均通过手动启用、持久化重启及恢复完整模式/主题命令检查 |

额外本地探针将实际 Surface 的 native 输出交给 `@xterm/headless` 6.0.0：检查了普通缓冲区内 417 行 screen/scrollback，历史哨兵保留，4 个历史标记各一次，最终正文与未发送草稿存在。该探针使用合成 Harness 和模拟 Terminal，不是 PTY 流式端到端测试；探针及输出保留在本地 `.artifacts`，不加入普通测试或发布包。

WSL 初次验证的隔离副本缺少 patches/CI/发布文档及 Git 索引，且混入 Windows PATH 后缺失命令返回 EACCES；补齐测试文件、建立隔离索引并使用纯 Linux PATH 后重跑全套通过。PTY 初次把 shell shim 当作 Node 入口，改用 shim 指向的官方 `lib/bin.js` 后通过；未更改官方安装。Vite 的两处 vendored source-map 缺失警告仍存在，但不是测试失败。

## 候选包

- 文件：`seektty-1.2.5-issue196-20260904T0815.tgz`（独立构建标识，非 npm 发布版本）。
- SHA-256：`59e14465c18c50e8db090a749db240c568dfdc1af5d4e6cb61d7334ae9e141bd`。
- Windows/WSL 使用同一文件并核对哈希；无凭据、Session、Profile 或本地诊断数据。
- 不更新正式安装、Profile 或用户会话；仅提交候选 PR 供复核。

## 复跑与限制

普通回归：`pnpm run typecheck`、`pnpm exec vitest run`、`pnpm run build`、`pnpm run pack:check`。

包生命周期：设置 `DSH_BIN` 为官方 CLI、`SEEKTTY_SPEC` 为本地 tgz，运行 `pnpm run test:stock`。交互检查另设 `DSH_ENTRY` 为官方 `lib/bin.js`，运行 `node scripts/foreground-pty-acceptance.mjs`；Linux tmux 另设 `SEEKTTY_TEST_TMUX=1`。这些脚本只使用隔离、无密钥的 Profile。

本轮没有调用付费模型，没有复现或重新测量 Issue 原报告的 macOS 输入延迟。未完成 UU iPad、macOS 真机和真实长会话延迟验收；不能据此宣称所有卡顿已解决。native 全历史遍历和活动长文本重排成本仍属于 #197 后续讨论。
