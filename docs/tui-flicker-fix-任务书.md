# 任务书：修复 TUI 闪烁 / 视口跳动 / 深色模式白框

- 分支：`fix/tui-flicker-full-redraw`
- 目标版本：seektty 1.0.x（pi-tui 0.73.1，经 pnpm patch 定制）
- 原则：**不影响观感的前提下消除闪烁**——不改变正常渲染路径的视觉输出，只消除全量重绘带来的可见副作用。

## 1. 问题描述（用户反馈）

1. 使用过程中界面一闪一闪，会"跳到先前的记录然后跳回来"。
2. 输入框区域同样会闪。
3. 深色模式下时不时闪出白框。

## 2. 根因分析

seektty 的 TUI 基于 pi-tui，渲染在主屏幕缓冲区（非备用屏），整个会话历史都是渲染行的一部分，正常时只差分重画变化的行。以下路径会退化为**全量重绘**（`fullRender(true)`）：

| # | 触发条件 | 位置 | 日常触发频率 |
|---|---------|------|------------|
| R1 | 视口上方（已滚入 scrollback）的任何一行发生变化：`firstChanged < prevViewportTop` | `pi-tui dist/tui.js doRender()` | **高**：长回复流式 reflow、工具卡片折叠、图片异步加载 |
| R2 | shiki 语法懒加载就绪后 `tui.requestRender(true)` | `src/client/surface.ts`（2 处） | **高**：对话中出现新语言代码块即触发 |
| R3 | 终端宽/高变化、主题/语言/行为切换 | pi-tui + surface.ts | 低（用户显式操作） |

全量重绘的动作是 `\x1b[2J\x1b[H\x1b[3J`（清屏 + 清 scrollback）后**重写全部历史**：

- 重写整段历史时终端从头滚动 → 症状 1「跳到先前记录再跳回」。
- `2J` 用终端**默认背景色**清屏；虽然整体包在同步输出协议（DEC 2026）里，但 **macOS Terminal.app 等不支持 2026 的终端**会显示清屏中间态 → 症状 3「白框」。
- 输入框在屏幕底部，随每次全量重绘被整体清掉重写 → 症状 2。

## 3. 修复方案

### 3.1 pi-tui 补丁（`patches/@mariozechner__pi-tui@0.73.1.patch`，走 pnpm patch 通道）

**P1 — 视口钳制（消灭 R1）**：`doRender()` 中，当变化首行在视口上方时，不再整屏清空重放；改为从**可见区域内的第一处变化**开始差分重绘，scrollback 保持屏幕上滚出时的原样：

- 若可见区域内没有任何变化（如仅 scrollback 中的代码块被重新高亮），只更新内部账本（`previousLines` 等），不写屏。
- 保留兜底：`newLines.length < height`（内容缩到不足一屏，如切换会话、/clear）时仍走全量重绘，保证视口正确。

**P2 — 无空白帧的全量重绘（缓解 R3 残余场景）**：`fullRender(clear=true)` 不再先 `2J` 整屏清空，改为 `\x1b[H\x1b[3J`（回 home + 清 scrollback）后**逐行 `\x1b[2K` 原地覆盖**，最后 `\x1b[0J` 清掉新内容之外的残留行。任意时刻屏幕上不存在"全空"状态，不支持 2026 的终端也不会闪白。

**观感不变性论证**：P1/P2 均不改变最终稳定帧的内容；P1 仅将"scrollback 也同步重写"降级为"scrollback 冻结为滚出时的样子"（用户当时看到的内容），主题切换等显式操作仍走全量路径保持 scrollback 一致。

### 3.2 seektty 源码（`src/client/surface.ts`）

**S1 — shiki 回调降级（消灭 R2）**：语法懒加载就绪与启动初始化两处回调中 `tui.requestRender(true)` → `tui.requestRender()`。可见区域高亮由差分渲染刷新；scrollback 中保持流式输出当时的展示。主题/语言/行为切换（`applyTheme`/`applyLocale`/`applyBehavior`）**保持强制全量**，保证显式操作后整个回滚区颜色一致。

## 4. 实施步骤与状态

| 步骤 | 内容 | 状态 |
|------|------|------|
| T1 | 创建分支 `fix/tui-flicker-full-redraw` | ✅ 完成 |
| T2 | `pnpm patch` 修改 pi-tui `dist/tui.js`（P1+P2），`patch-commit` 回写补丁与 lockfile | ✅ 完成 |
| T3 | `surface.ts` shiki 两处回调降级（S1） | ✅ 完成 |
| T4 | 新增回归测试 `tests/tui-render-stability.test.ts`（4 例，见 §5） | ✅ 完成，单独运行通过 |
| T5 | 全量验证：`tsc --noEmit` + `vitest run` 全套 + `tsdown` 构建 | ✅ 完成（`package-contract.test.ts` 中 3 例失败为工作区既有未提交改动所致，与本修复无关，详见 §5） |
| T6 | 提交：仅含本任务相关文件（补丁、lockfile、surface.ts、测试、本任务书） | ✅ 完成 |

> 补丁生成注意事项：本工作区位于 exFAT 卷，`pnpm patch` 的编辑目录若留在卷内，macOS 会生成 AppleDouble（`._*`）文件并被 `patch-commit` 卷入补丁。已改用 `--edit-dir /tmp/pi-tui-edit`（系统盘）生成，最终补丁为纯文本、仅含 4 个 dist 文件。后续更新此补丁时务必沿用该做法。

约束：

- 工作区存在与本任务无关的未提交改动（README、actions.ts、dsh-compat.ts、lib/* 等），**一律不纳入本次提交**。
- `lib/` 构建产物不在本分支提交：构建会把无关的未提交源码改动一并打包；仅以构建成功作为验证，产物随发布流程统一生成。
- 遵守仓库规则：不提交凭据/会话数据；保留 `dsh.bundle.patch` 清单语义（本次未触及）。

## 5. 测试与验收标准

回归测试（`tests/tui-render-stability.test.ts`，直接驱动打补丁后的 pi-tui，30 行内容 × 10 行终端）：

1. scrollback 行与可见行同时变化 → 输出**不含** `2J`/`3J`，不重写 scrollback 行，只重绘可见行；全量重绘计数不增加。
2. 仅 scrollback 行变化 → 完全不写屏；后续可见行变化仍正常差分渲染。
3. 强制全量重绘（`requestRender(true)`）→ 输出含 `3J` 与 `0J`、逐行重写，但**不含** `2J`（无空白帧）。
4. 内容缩到不足一屏 → 正确走全量重绘兜底（计数 +1），新内容完整呈现。

验收标准：

- [x] 上述 4 例通过；
- [x] 既有全套 vitest 无回归（`package-contract.test.ts` 的 3 例失败在修复前即存在，由工作区未提交的 `package.json` bin 项与 `lib/startup-trace-*.js` 引起，不属于本任务范围）；
- [x] `tsc --noEmit` 通过；
- [x] `tsdown` 构建成功；
- [ ] 人工验证（用户侧）：流式长回复、含多语言代码块的会话中不再出现整屏闪烁/白框/跳动。

## 6. 风险与回滚

- 风险：scrollback 与最新渲染结果可能不一致（钳制策略的固有代价），仅表现为"往上翻看到的是当时流式输出的样子"；显式主题切换仍会全量重写，保持一致性。
- 风险：pi-tui 升级时补丁需要随版本重做（补丁文件按确切版本 0.73.1 锁定，pnpm 会在版本漂移时报错，不会静默失效）。
- 回滚：revert 本分支提交即可，补丁通道（`patchedDependencies`）与源码改动相互独立、可分别回滚。
