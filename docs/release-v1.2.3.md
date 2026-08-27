# SeekTTY 1.2.3

SeekTTY 1.2.3 introduces complete application-owned mouse interaction for the terminal UI while preserving native terminal selection through F3 or `/mouse`.

## Highlights

- Adds a resident transcript scrollbar and keeps wheel events inside the intended viewport instead of injecting them into the composer.
- Preserves in-app selections after mouse release, supports word and line selection, and auto-scrolls selections across loaded transcript pages.
- Adds right-click Copy/Paste and copy-on-select with explicit UTF-8 clipboard handling on Windows, macOS, Wayland, and X11.
- Adds stable hover feedback and target-aware clicks for tool cards, examples, autocomplete, overlays, and visible model, mode, and permission controls.
- Binds autocomplete hit testing to the candidates actually rendered after scrolling. First click selects; Enter or a safe second click executes a slash command once; Tab only completes it.
- Keeps dangerous confirmations keyboard-only and retains native terminal selection as a fallback.

## Compatibility

- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`
- Declared Host range: `>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2`
- Supported platforms: Windows, macOS, and Linux

## Verification

- Type checking, unit/integration tests, production build, packed-content validation, and the 100k-line TUI performance harness
- Isolated install, boot, remove, and reinstall through native `dsh plugin` reconciliation against official dsh
- Opt-in real-PTY mouse smoke coverage for startup, slash-command execution, SGR press/drag/release, wheel input, overlays, resize, and clean exit

---

SeekTTY 1.2.3 为终端界面加入完整的应用内鼠标交互，同时保留通过 F3 或 `/mouse` 切换原生终端选择的备用通道。主要更新包括常驻滚动条、视口内滚轮处理、松开后保留且可跨页自动滚动的文本选区、跨平台 UTF-8 复制粘贴、稳定悬停反馈、精确控件点击，以及与实际渲染列表一致的自动补全命中和 Enter 执行逻辑。
