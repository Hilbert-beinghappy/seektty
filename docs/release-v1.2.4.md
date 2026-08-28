# SeekTTY 1.2.4

## English

SeekTTY 1.2.4 improves conversation readability, mouse navigation, and input editing. It keeps the fixed transcript viewport and native terminal selection fallback, without changing Harness-owned runtime state.

### Conversation readability

- Historical user messages now have thin top and bottom rules matching the input composer, making conversation turns easier to distinguish as responses stream.
- The rules follow the current theme and terminal width, including wrapped and multiline messages. These decorative lines are excluded from in-app copied text and transcript search.

### Mouse navigation

- Ordinary mouse actions work immediately after startup; minimizing and restoring the terminal is no longer required. Actual focus changes retain a 250 ms accidental-activation guard.
- Lists and slash-command candidates no longer recenter on the selected row. The wheel browses independently; arrow keys scroll only when selection crosses a visible edge. First click selects, and a later click on the same armed item activates without a double-click deadline.
- Nested overlays share hover feedback derived from the current theme, including custom themes. Ambiguous or limited-color backgrounds receive an underline cue; `NO_COLOR` is respected.
- Overlay footers provide single-click Select/Confirm/Save and Back/Close buttons using the same validation and navigation as the keyboard. Dangerous confirmations still require keyboard confirmation.

### Selection and context menus

- Visible overlay text supports drag selection. Search fields and non-secret inputs support selection replacement, deletion, and clipboard editing; masked secrets are not exposed through clipboard actions.
- Right-click menus float above the current page without entering its Back stack. Menu items take one left-click. Esc or an outside left-click closes only the menu and preserves the covered page's draft and selection.
- Wheel input dismisses the menu and continues scrolling with the same gesture. Left-drag dismisses it and starts selection from the original press. Parent dialogs continue to capture input, preventing click-through to the transcript.
- Outside right-click reopens the menu for the new target. Right-drag opens it at the release position without selecting text. Focus loss, page changes, and resize cancel stale gestures.

### Input reliability and help

- Escape immediately followed by an SGR mouse report no longer inserts fragments such as `[<35;20;13M` into search fields. Partial mouse reports remain separate from text and bracketed paste.
- Ctrl+Z undoes edits in the focused input, including composer, search, single-line, multiline, and masked-secret fields; Ctrl+- remains available. Undo does not restore sent messages or reverse saved Settings.
- The shortcut reference is grouped by editing, commands, transcript navigation, sessions, and selection, and reflects configured key overrides.

### Compatibility and verification

- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Declared Host range remains `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`; Node.js remains `^22.19.0 || >=24`.
- Windows, macOS, and Linux share the implementation. Automated renderer/adapter tests and Windows ConPTY coverage do not imply manual GUI-terminal or real clipboard acceptance on every platform; see the [verification record](https://github.com/Hilbert-beinghappy/seektty/blob/v1.2.4/docs/release-v1.2.4-verification.md).
- No Settings or Session migration, required theme fields, new runtime dependencies, or default Clarify/Auxiliary Runtime installation. Native `dsh plugin` reconciliation and the `dsh.bundle.patch` contract remain unchanged.
- F3 or `/mouse` still switches to native terminal selection. Distribution remains a prebuilt GitHub Release tarball, not an npm Registry publication.

---

## 中文

SeekTTY 1.2.4 改善对话的视觉观感、鼠标导航和输入编辑，保留固定 Transcript 视口与原生终端选择备用通道，不改变由 Harness 持有的运行状态。

### 对话视觉优化

- 历史用户消息新增与输入框一致的上下细线，让不同轮次的对话在回答持续输出时更易区分，改善阅读观感。
- 细线适配当前主题和终端宽度，兼容自动换行及多行消息；这些装饰线不会混入应用内复制的文本，也不参与对话搜索。

### 鼠标导航

- 普通鼠标操作启动即可使用，不再需要最小化终端再恢复；实际焦点切换后仍保留 250 ms 防误触保护。
- 列表和斜杠候选不再围绕选中项强制居中。滚轮独立浏览，方向键仅在选择越过可见边缘时滚动。首次单击选中，再次单击同一已选中项即可进入，不受双击时间限制。
- 多层弹窗共享由当前主题推导的悬停反馈，兼容自定义主题；颜色难以区分或终端色彩有限时使用下划线辅助，仍遵守 `NO_COLOR`。
- 弹窗底栏提供可单击的选择／确认／保存和返回／关闭按钮，与键盘共用校验与导航逻辑。危险确认仍须使用键盘。

### 选区与右键菜单

- 弹窗可见文字支持拖选；搜索框和非密钥输入框支持替换选区、删除及剪贴板编辑。剪贴板操作不会暴露被遮蔽的密钥。
- 右键菜单独立浮在当前页面上，不进入返回栈。菜单项单击即可执行；Esc 或左键单击菜单外只关闭菜单，保留原页面草稿和选区。
- 滚轮关闭菜单后，同一次手势继续滚动；左键拖动关闭菜单后，从最初按下的位置开始选择。父弹窗继续拦截输入，不会穿透到会话。
- 右键点击菜单外会针对新目标重新打开菜单；右键拖动在松手位置打开，不会选中文字。失焦、换页和调整窗口大小会取消过期手势。

### 输入可靠性与帮助

- Esc 后紧接 SGR 鼠标报告不再把 `[<35;20;13M` 一类残片输入搜索框；不完整鼠标报告继续与文本、括号粘贴隔离。
- Ctrl+Z 可撤销当前输入框内的编辑，覆盖主输入框、搜索、单行、多行及遮蔽密钥字段；保留 Ctrl+-。撤销不会找回已发送消息，也不会回滚已保存 Settings。
- 键位速查按编辑、命令、对话浏览、会话和选择归类，并显示实际改绑后的快捷键。

### 兼容与验证

- 已测 Host：未修改的官方 `@deepseek-ai/dsh@0.1.1-rc.2`。
- 声明的 Host 范围仍为 `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`；Node.js 仍为 `^22.19.0 || >=24`。
- Windows、macOS 和 Linux 共用实现。自动渲染／适配测试和 Windows ConPTY 覆盖不代表所有平台都完成人工 GUI 终端及真实剪贴板验收，详见[验证记录](https://github.com/Hilbert-beinghappy/seektty/blob/v1.2.4/docs/release-v1.2.4-verification.md)。
- 无需迁移 Settings 或 Session，不新增主题必填字段、运行时依赖，也不默认安装 Clarify／Auxiliary Runtime。原生 `dsh plugin` 协调机制和 `dsh.bundle.patch` 合同不变。
- F3 或 `/mouse` 仍可切换到原生终端选择。继续通过 GitHub Release 预构建 tarball 分发，不发布到 npm Registry。
