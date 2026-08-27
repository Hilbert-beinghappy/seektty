# Mouse architecture acceptance record — 2026-08-27

Rollback baseline: `9b8f712`
Branch: `codex/complete-mouse-architecture`
Candidate: SeekTTY `1.2.3`, official unmodified `@deepseek-ai/dsh@0.1.1-rc.2`, `@mariozechner/pi-tui@0.73.1`
Candidate tarball: `seektty-1.2.3.tgz`, SHA-256 `E325C60803CAE6645FEF1AFAD4FAEC437DE914CC60022847D2783994E450808F`
Host: Windows NT 10.0.22631.0, Windows Terminal `1.24.11911.0`, Node `v26.1.0`
Updated: 2026-08-28

This record contains no credential dumps, Session/Profile contents, raw terminal logs, or user transcript text.

## Automated verification

| Check | Status | Observed result |
| --- | --- | --- |
| `pnpm run typecheck` | Pass | `tsc --noEmit` |
| `pnpm run test` | Pass | 103 files passed; 747 passed / 1 skipped. Includes separated-chunk click repaint, edge-drag dwell and a stable logical selection anchor across three viewports, visual-only hover distinct from selection, rendered autocomplete head/middle/tail windows, non-clickable scroll footer, stale-generation rejection, and a shared UTF-8 corpus for PowerShell, `pbcopy`, `wl-copy`, and `xclip`. |
| `pnpm run build` | Pass | Tracked `lib/` rebuilt (`lib/index.js` 1487.38 kB) |
| `pnpm run pack:check` | Pass | 23 packaged entries; no `workspace:` deps; no credentials |
| `pnpm run perf:tui` | Pass | Existing 100k-line structural TUI budget |
| `pnpm run test:stock` | Pass | The exact hashed tarball completed isolated `DSH_HOME` install/boot/remove/reinstall/second boot and native `dsh plugin` reconciliation against unmodified official dsh `0.1.1-rc.2`. |
| PowerShell writer parser | Pass | The fixed strict-UTF-8 `Set-Clipboard` script parsed with zero PowerShell syntax errors; no clipboard contents were read or changed. |

## Opt-in PTY mouse harness

Command: set `DSH_BIN`, `SEEKTTY_SPEC` to the exact candidate tarball, and `SEEKTTY_MOUSE_PTY=1`; then run `pnpm test:mouse-pty`.

The harness first installs that tarball into a fresh isolated `DSH_HOME`, verifies the `seektty` bundle in the Profile manifest, and waits for SeekTTY's OSC title. It then executes the packed `/help` candidate through Down + Enter without a Provider call, confirms the Help overlay, and injects SGR press/drag/release, wheel, overlay, resize, and FocusOut/FocusIn input. On Windows it uses the pinned development-only `node-pty@1.1.0`; POSIX can fall back to `python3` `pty`. The exact hashed candidate passed one cycle with exit code 0 and 7018 captured bytes. `SEEKTTY_MOUSE_PTY_CYCLES=100` remains a separate release-lifecycle run and has not been claimed. ConPTY may consume DEC mode writes in captured output, so protocol byte symmetry remains covered by unit/integration tests; this PTY result proves candidate installation, interactive boot, slash Enter routing, injected-input handling, resize, and clean Ctrl+C exit. It is not GUI-equivalent.

## True-terminal follow-up matrix

The automated release gate does not claim GUI-terminal equivalence. The environments below remain explicit manual follow-up coverage rather than inferred passes.

| Environment | Status | Evidence / blocker |
| --- | --- | --- |
| Windows Terminal 1.24.11911.0 | Manual follow-up | Host and version confirmed. Automated coverage includes release-triggered repaint with hover disabled and strict UTF-8 PowerShell writer bytes/provenance. Interactive GUI mouse and clipboard round-trip are not claimed here: this agent did not overwrite or inspect the user's real clipboard. |
| VS Code integrated terminal | Manual follow-up | Same matrix as Windows Terminal, plus assert full mode does not call an application URL launcher and right-click does not inject into the composer. Not claimed verified in this record. |
| Terminal.app | Manual follow-up | Synthetic adapter coverage fixes `pbcopy` to a UTF-8 locale; real CJK/emoji/newline clipboard round-trip, wheel, selection, native mode, and exit restore are not claimed here. |
| iTerm2 | Manual follow-up | Same UTF-8 `pbcopy` gate plus native-mode OSC 8 and tmux. Not claimed verified here. |
| GNOME Terminal / Konsole | Manual follow-up | Synthetic adapters explicitly use Wayland `text/plain;charset=utf-8` and X11 `UTF8_STRING`; real clipboard round-trip and mouse matrix are not claimed here. |
| Kitty / WezTerm / Ghostty | Manual follow-up | Kitty keyboard coexistence with SGR mouse is not claimed verified in this record. |
| tmux | Manual follow-up | Mouse on/off, external editor return, resize, and exit restore are not claimed verified in this record. |
| SSH | Manual follow-up | Delayed wheel coalescing, drag, native mode, and disconnect restore are not claimed verified in this record. |

No unchecked GUI environment is represented as a pass. The release evidence is limited to the automated, isolated-stock-dsh, adapter, and real-PTY results above.

## Rollback

Revert the mouse-architecture commits after the recorded baseline in reverse order. Harness Agent/Session/model/settings/permissions/Profile/plugin/persistence state does not require a migration. After a functional rollback, rebuild `lib/` with `pnpm run build`.
