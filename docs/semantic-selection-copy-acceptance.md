# Semantic transcript selection and clipboard fidelity

This change replaces terminal-cell guessing for SeekTTY's application-owned transcript selection with a semantic projection. It does not change native terminal selection, clipboard transports, public settings, or the installed pi-tui version.

## Compatibility boundary

- The bundled patch adds one optional, read-only `Markdown.getSelectionLines()` method to `@mariozechner/pi-tui@0.73.1`, the version used by unmodified official dsh `0.1.1-rc.2`.
- `pi-tui-adapters.ts` reads the method through a validated duck type. If the method is unavailable or returns invalid data, the transcript falls back to trimmed visual-line copying.
- The projection is cached and invalidated with the corresponding Markdown render width. No marker, private escape sequence, or selection metadata is emitted to the terminal.
- SeekTTY still uses native `dsh plugin` reconciliation and does not copy Host packages, mutate a Profile directly, or introduce a `workspace:` dependency.

## Copy contract

- Visual paragraph wraps are rejoined with the exact omitted whitespace; a source hard break remains one `\n`.
- Fenced and tool code preserve source indentation, blank lines, UTF-8, CJK, Emoji, combining characters, and meaningful spaces.
- Code presentation indentation, caption prefixes, line numbers, gutters, quote/UI borders, horizontal rules, scrollbars, renderer padding, and background fill are not copyable cells.
- There is no global `trim()`. A selection can retain leading indentation and meaningful internal or trailing source whitespace.
- Copy-on-select, Ctrl+Shift+C, and the context-menu copy action read the same `Transcript.copySelectionText()` payload. Clipboard backends continue to receive `\n`; platform writers own any target-specific conversion.
- Static overlay text and editable inputs keep their existing source-backed selection behavior. Native mouse mode is unchanged.

## Automated verification

| Check | Result |
| --- | --- |
| Semantic projection unit and transcript viewport tests | Passed: Python source round-trip at 48/96 columns; exact soft/hard joins; decorations; CJK, Emoji and wide-cell mapping; cache invalidation; welcome fallback |
| Full Vitest suite | Passed: 136 files, 1,212 passed / 1 conditional acceptance skip |
| TypeScript typecheck | Passed |
| Build and package contents | Passed: `tsdown` build and `pack:check` (25 allowlisted entries) |
| Mouse PTY harness | Passed: one opt-in PTY cycle with context menus and gesture handoff; explicitly not a GUI equivalent |
| Isolated stock dsh `0.1.1-rc.2` install/boot/remove/reinstall | Passed with the candidate tarball and native plugin reconciliation |

Vendor source-map warnings emitted by Vite are pre-existing and non-fatal. Synthetic tests and ConPTY do not count as real-terminal sign-off.

## Real-terminal acceptance

Windows Terminal remains the manual merge gate. In the user's ordinary Profile, select the Python fixture at narrow and wide terminal sizes and paste it into both VS Code and Notepad. Confirm indentation and blank lines are exact, no right padding or scrollbar is present, reverse and multi-screen selection match forward selection, and copy-on-select/Ctrl+Shift+C/context-menu copy produce the same text. Repeat with dark, light, and transparent backgrounds and verify resize safely keeps or clears an existing selection without copying stale offsets.

macOS and Linux have automated compatibility coverage only in this worktree. Terminal.app/iTerm2 and Kitty/Ghostty results must be recorded as untested until those devices are used; this document does not claim three-platform GUI verification.

## 中文摘要

完整鼠标模式现在复制 transcript 的语义正文，而不是补齐到终端宽度的屏幕行。段落视觉折行恢复源空白，真实换行和代码缩进保留；代码展示缩进、行号、gutter、引用／界面边框、滚动条、背景与 ANSI/OSC 不进入剪贴板。三个应用内复制入口共用同一 payload，原生选择和各平台剪贴板 writer 不变。Windows Terminal 日常 Profile 仍需用户完成真实粘贴验收；没有实机的 macOS/Linux 不宣称通过。
