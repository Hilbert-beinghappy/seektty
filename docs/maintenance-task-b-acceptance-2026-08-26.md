# Maintenance task B acceptance record — 2026-08-26

Baseline: `main@6c03e80f0acb62f05dae9e80606ce54e80beb684`
Branch: `codex/terminal-fixed-viewport`
Candidate: SeekTTY `1.2.1`, official unmodified `@deepseek-ai/dsh@0.1.1-rc.2`, `@mariozechner/pi-tui@0.73.1`
Host: macOS 26.5.2 (25F84), Terminal.app 2.15 (470.2), iTerm2 3.6.11, tmux 3.7c, Node 24.19.0

## Automated verification

| Check | Status | Observed result |
| --- | --- | --- |
| Focused terminal/viewport suite | Pass | 7 files, 82 tests passed |
| `pnpm run check` | Pass | typecheck; 88 files, 563 passed / 1 skipped; build; pack-check 23 entries |
| Packed official dsh lifecycle | Pass | isolated `DSH_HOME`: add, full boot boundary, remove, re-add, full boot; Profile kept official Host module identity |
| Packaged launcher | Pass | isolated production install, `deepseek --version`, and non-TTY boot boundary from the tarball |
| Normal PTY `/exit` | Pass | exit 0; pre/post `stty -g` equal; one `1049h/l`, `1000h/l`, and `1006h/l`; zero `3J`; no CRLF or cursor movement between `1049l` and shell output |
| PTY double Ctrl+C + resize | Pass | 20 cycles between 24×80 and 60×100 with alternating wheel input; exit 0; one alternate-screen lifecycle; zero `3J`; mouse reports did not echo |
| PTY SIGTERM + 100 wheel detents | Pass | exit 143; original termios observed restored before process exit; one alternate-screen lifecycle; zero `3J`; mouse reports did not echo |
| PTY SIGHUP | Pass | exit 129; original termios observed restored before process exit; one alternate-screen lifecycle; zero `3J` |
| PTY `TERM=dumb` | Pass | rejected before terminal construction with exit 1; zero alternate, mouse, paste, or cursor private sequences |

The synchronous protocol restore emits bracketed-paste off once before `1049l`; the later pinned `ProcessTerminal.stop()` repeats only the idempotent paste-off sequence. It also detaches the input buffer, marks protocols restored, and quiesces pending TUI renders before leaving the alternate screen. Regression tests force a queued frame, a late Kitty reply, and the 150 ms modifyOtherKeys fallback; none can write after restore.

Two invalid driver attempts were excluded from acceptance: a background shell child was not a foreground interactive TTY and correctly exited before private modes; a resize run sent `Esc` before `/exit`, changed input context, and submitted `exit` as an ordinary prompt. The same resize workload passed with the specified double-Ctrl+C path.

## True-terminal matrix

| Environment | Status | Evidence / blocker |
| --- | --- | --- |
| Codex shared PTY, direct | Pass | Final packed candidate booted visibly; 100 SGR wheel reports were consumed; double Ctrl+C returned to the shell; restore order was mouse → paste/keyboard → cursor → `1049l`; after a further 5 seconds there was no late `>7u`, `>4;2m`, or TUI frame |
| Codex shared PTY + tmux 3.7c | Pass | Outer `TERM=xterm-256color`, inner `TERM=tmux-256color`; `mouse`, `alternate-screen`, and `extended-keys` all on; 100 wheel reports and double Ctrl+C returned to the tmux shell, then detach and exact test-server cleanup succeeded |
| Terminal.app direct, mouse reporting and alternate-scroll variants | Blocked | Computer-use safety policy explicitly rejected control of `com.apple.Terminal`; no visual or selection result is claimed |
| Terminal.app `Fn` drag + `Command+C` | Blocked | Same UI-control restriction; requires user-operated acceptance |
| iTerm2 direct and Option selection variants | Blocked | iTerm2 3.6.11 was installed, but computer-use safety policy explicitly rejected control of `com.googlecode.iterm2`; modifier-drag selection remains user-operated |
| Terminal.app/iTerm2 + tmux | Partial | tmux behavior passed in the shared PTY; Terminal.app/iTerm2 rendering and native selection remain blocked by UI-control policy |

The blocked Terminal.app/iTerm2 rows remain release gates. Shared-terminal and automated PTY evidence proves protocol lifecycle, fixed-size resize handling, input consumption, tmux behavior, and termios restoration, but it is not represented as equivalent to native Terminal.app/iTerm2 selection behavior.

## Rollback

Revert the task-B implementation commit. The rollback removes the terminal session, restores the previous main-screen/native-scrollback behavior, restores the prior pi-tui patch hash, and regenerates `lib/` through `pnpm run build`. No Harness, Profile, plugin, Session, credential, or persistence schema is changed.
