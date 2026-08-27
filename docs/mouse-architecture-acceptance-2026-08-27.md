# Mouse architecture acceptance record — 2026-08-27

Baseline: `main@a05debe447407068a434e85cce679c6dd41dbd0f`
Branch: `codex/complete-mouse-architecture`
Candidate: SeekTTY `1.2.2`, official unmodified `@deepseek-ai/dsh@0.1.1-rc.2`, `@mariozechner/pi-tui@0.73.1`
Host: Windows NT 10.0.22631.0, Windows Terminal `1.24.11911.0`, Node `v26.1.0`
Updated: 2026-08-28

This record contains no credential dumps, Session/Profile contents, raw terminal logs, or user transcript text.

## Automated verification

| Check | Status | Observed result |
| --- | --- | --- |
| `pnpm run typecheck` | Pass | `tsc --noEmit` |
| `pnpm run test` | Pass | 99 files passed; 700 passed / 1 skipped. Windows path parsing, file-URL expectations, and junction portability were corrected instead of classifying failures as noise. |
| `pnpm run build` | Pass | Tracked `lib/` rebuilt (`lib/index.js` 1447.81 kB) |
| `pnpm run pack:check` | Pass | 23 packaged entries; no `workspace:` deps; no credentials |
| `pnpm run perf:tui` | Pass | Existing 100k-line structural TUI budget |
| `pnpm run test:stock` | Pass | Isolated `DSH_HOME`, unmodified official dsh install/boot/remove/reinstall/second boot/`dsh plugin` reconciliation |

## Opt-in PTY mouse harness

Command: set `DSH_BIN`, `SEEKTTY_SPEC` to the exact candidate tarball, and `SEEKTTY_MOUSE_PTY=1`; then run `pnpm test:mouse-pty`.

The harness first installs that tarball into a fresh isolated `DSH_HOME`, verifies the `seektty` bundle in the Profile manifest, and waits for SeekTTY's OSC title before injecting SGR press/drag/release, wheel, overlay, resize, and FocusOut/FocusIn input. On Windows it uses the pinned development-only `node-pty@1.1.0`; POSIX can fall back to `python3` `pty`. One-cycle and three-cycle runs passed with exit code 0 on this host. `SEEKTTY_MOUSE_PTY_CYCLES=100` remains a separate release-lifecycle run and has not yet been claimed. ConPTY may consume DEC mode writes in captured output, so protocol byte symmetry remains covered by unit/integration tests; this PTY result proves candidate installation, interactive boot, injected-input handling, resize, and clean Ctrl+C exit. It is not GUI-equivalent.

## True-terminal matrix

| Environment | Status | Evidence / blocker |
| --- | --- | --- |
| Windows Terminal 1.24.11911.0 | Local merge gate | Host and version confirmed. Automated unit/integration coverage for wheel, thumb drag, track click, drag-select, double/triple click, copy-on-select, and FocusIn first-click guard is in the default test suite. Interactive GUI mouse on this emulator remains the human merge step: this agent did not drive the Windows Terminal UI, so this row is not claimed as a completed GUI session. Clipboard copy must be checked by reading CLIPBOARD contents, not highlight alone. |
| VS Code integrated terminal | Release blocker | Same matrix as Windows Terminal, plus assert full mode does not call an application URL launcher and right-click does not inject into the composer. Not claimed verified in this record. |
| Terminal.app | Release blocker | Wheel, selection, native mode, exit restore. Not claimed verified here. |
| iTerm2 | Release blocker | Wheel, selection, native-mode OSC 8, tmux. Not claimed verified here. |
| GNOME Terminal / Konsole | Release blocker | Wheel, selection, OSC 52/CLIPBOARD. First version does not claim PRIMARY selection writes. |
| Kitty / WezTerm / Ghostty | Release blocker | At least one of these must verify Kitty keyboard coexistence with SGR mouse before release. |
| tmux | Release blocker | Mouse on/off, external editor return, resize, exit restore. |
| SSH | Release blocker | Delayed wheel coalescing, drag, native mode, disconnect restore. |

Windows Terminal is the local human merge gate for this PR. Other GUI terminals remain release gates and are listed as blockers rather than claimed tested.

## Rollback

Revert the five mouse-architecture commits in reverse order. Harness Agent/Session/model/settings/permissions/Profile/plugin/persistence state does not require a migration. After a functional rollback, rebuild `lib/` with `pnpm run build`.
