# Context-aware menu acceptance

Date: 2026-09-01

Branch: `codex/context-aware-menus`

Base: `upstream/main@99fb3c2`
Tested Host: official dsh `0.1.1-rc.2`

## Scope

This candidate replaces the text-only popup with semantic, target-aware context menus while keeping the menu controller independent from the ordinary overlay navigation stack. A right-click does not move a list selection, keyboard focus, transcript viewport, or Agent-tree selection. Existing Harness actions are reused; this change does not add permanent Session deletion, attachment item management, subagent control, link activation, batching, or drag reordering.

Root menus always contain **Copy selected text** and **Close**. Copy is disabled when no application-owned selection exists. Object actions are resolved from the current hit region, revalidated before execution, and may open one submenu level. Hover opens a submenu after 250 ms; click, Enter, or Right opens it immediately; Left or Esc returns to the root. A stale overlay generation, missing target, completed Job, resize, page replacement, or changed capability state invalidates the menu.

Session rename, Fork, ZIP/descendant ZIP/Markdown export, and archive use explicit target-Session APIs. They never switch to the target Session and then switch back. Destructive actions continue through their existing confirmation pages, including existing Enter-only confirmation rules.

## Automated results

| Check | Result | Notes |
| --- | --- | --- |
| `pnpm test` | Passed | 135 files; 1,203 passed; 1 unrelated conditional skip |
| `pnpm run typecheck` | Passed | TypeScript no-emit check |
| `pnpm run build` | Passed | Distribution bundles rebuilt from this worktree |
| `pnpm run pack:check` | Passed | 25 allowlisted package entries; no AppleDouble files |
| Official dsh stock cycle | Passed | Isolated `DSH_HOME`: install, full boot boundary, remove, reinstall, module-identity checks |
| Windows ConPTY mouse harness | Passed | One packaged cycle, 27,957 captured bytes, context menus and gesture handoff enabled, clean exit 0 |

The PTY result verifies protocol framing and application behavior; it is not equivalent to a real GUI terminal or clipboard test. The first PTY invocation selected PowerShell's `dsh.ps1` shim and produced no PTY output. Re-running the same official installation through its `dsh.CMD` shim passed; no product code was changed for that launcher-only retry.

## Manual Windows Terminal gate

Use the ordinary user Profile and verify:

- right-clicking an unselected Session or another list object does not move its arrow or keyboard focus;
- root Copy is disabled without a selection and enabled with one;
- child menus open by 250 ms hover, click, Enter, and Right, flip left at the right edge, and return with Left or Esc;
- Session rename, Fork, each export variant, and archive affect the right-clicked Session only;
- stale rows cannot execute after a refresh, resize, Job completion, or page replacement;
- wheel and left drag dismiss the menu and immediately continue scrolling or selecting; right drag reopens at release;
- Agent-tree, transcript, nested overlay, editable-field, and bottom-status coordinates remain aligned;
- dangerous actions close the menu before opening the existing confirmation page and cannot bypass its keyboard confirmation;
- exit restores terminal mouse and input state.

Follow-up overlay-order coverage verifies that a contextual child page reuses
the navigation stack that owns its target. Rename, confirmation, detail,
selection, progress, Settings, plugin, MCP, and status pages therefore appear
above the originating list and return to it with Esc instead of waiting behind
it in the global FIFO queue.

Dynamic owner pages now re-read authoritative Harness state after both a
context action and an ordinary list action. Session, Workspace, Profile, Theme,
Queue, installed-plugin, Bundle-order, plugin-catalog, and Job pages update in
place while preserving the current search query, stable selected id, and scroll
offset. Tests cover Session rename and archive specifically, including removal
of an archived row without closing and reopening `/sessions`.

macOS and Linux GUI terminals were not available for this implementation run and are not claimed as manually verified.

## 中文摘要

本候选版本把原有文字右键菜单扩展为语义化对象菜单，同时继续与普通弹窗返回栈完全分离。右键不会移动列表箭头、键盘焦点、Transcript 视口或 Agent 树选择；菜单只复用现有 Harness 能力，不新增永久删除会话、附件单项管理、子 Agent 定向控制、链接打开、批量操作或拖拽排序。

根菜单固定包含“复制所选文本”和“关闭”，无选区时复制置灰。对象动作根据当前命中区解析，并在执行前重新校验；一级子菜单支持悬停 250ms、单击、Enter、左右方向键和 Esc。会话重命名、Fork、三种导出与归档都通过显式目标会话接口执行，不会临时切换当前会话。破坏性动作仍进入原有确认页。

自动化结果为 135 个测试文件、1,203 项通过、1 项无关条件跳过；类型检查、构建、25 项包白名单、官方 dsh `0.1.1-rc.2` 隔离安装／启动／移除／重装和一轮 Windows ConPTY 鼠标流程均通过。补充测试确认右键动作产生的输入、确认、详情、选择、进度、设置、插件、MCP 与状态页面会进入目标所在的导航栈，显示在原列表上方，并可用 Esc 返回。Session、工作区、Profile、主题、Queue、插件、Bundle 顺序、插件目录和 Job 等动态列表会在右键或普通操作完成后原位重新读取 Harness 状态，并保留搜索词、稳定选中项和滚动位置；归档的 Session 会立即从旧列表移除。ConPTY 不等价于 Windows Terminal 实机视觉与鼠标验收；macOS/Linux 本轮未实测。
