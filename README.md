# SeekTTY

English | [中文](README.zh.md)

SeekTTY brings [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) into the terminal. Run `deepseek` from a project directory to work in a keyboard-first interface for prompting, code changes, tool calls, session management, model and permission switching, plugin installation, subagent coordination, and runtime diagnostics.

SeekTTY joins Harness as a Profile Bundle and uses its native Agent, Session, model, permission, Settings, Profile, plugin, and persistence services. Every terminal action uses the same Harness state, so upgrades stay focused on the compatibility baseline and adapters.

## DeepSeek light and dark interfaces

### Light theme

![SeekTTY DeepSeek light start screen](assets/seektty-tui.png)

### Dark theme

![SeekTTY DeepSeek dark start screen](assets/seektty-tui-dark.png)

The live view fills the terminal and keeps the composer and status at the bottom. Unused rows remain inside the conversation viewport and disappear as output grows; longer conversations continue into native terminal scrollback.

## Custom interface and code themes, including VS Code imports

Theme customization is a first-class SeekTTY feature: interface background and text colors are editable, code-block colors and syntax styles are independently editable, and `/theme import` accepts local VS Code JSON/JSONC themes with portable TextMate token colors. A palette of 3–16 colors can also generate a complete light or dark theme for preview and further adjustment.

### TypeScript in the DeepSeek light interface

![SeekTTY light TypeScript syntax highlighting](assets/seektty-code-light.png)

### Tool parameters, file reads, and Diff in the DeepSeek dark interface

![SeekTTY dark tool and Diff syntax highlighting](assets/seektty-code-dark.png)

Markdown fences disappear into continuous code surfaces. Assistant code, Shell commands, structured tool parameters, file reads, JSON, and Diff use the same active code theme; ordinary conversation text keeps the interface style. Every code background occupies continuous terminal cells instead of producing disconnected per-line stripes.

## Harness capabilities available in the TUI

The current release covers these capabilities:

| Area | Available operations |
| --- | --- |
| Conversation and runs | Streaming responses, Markdown/GFM, fence-free theme-aware syntax-highlighted code blocks, links, tables, reasoning visibility, collapsed/expanded/hidden tool cards, model retries, compaction, output-limit and error states, and Ctrl+C cancellation |
| Sessions | Create, resume, list, full-text search, rename, fork, archive, copy the last answer, and export the current session or its complete subagent tree and attachments as ZIP |
| Workspaces | Start from the current directory; add, select, rename, unregister, reorder, and reorder sessions within a workspace; unregistering never deletes files or session logs |
| Agent modes | Standard, Code/PTC, Minimal, and Cordis/Create baseline modes plus dynamically registered Agent Presets; switching an active conversation creates a new session in the same workspace |
| Models and Providers | Dynamic Provider, model, and supported reasoning-effort discovery; current route display; per-session switching; catalog, credential, and routing diagnostics |
| Permissions and approvals | Inspect and switch Host permission presets, cycle with Shift+Tab, confirm risky upgrades, and allow or reject one tool call at a time |
| Input queue and steering | Queue prompts while the Agent runs, inspect/edit/remove entries, steer one entry or the entire queue into the active turn, and send `/steer` directly |
| Human interaction | Single choice, multi-select, custom answers, skip, cancel, and plan review; submitting an interaction returns to the latest output while the blocked turn resumes, with `/pending` recovery when retrying is needed |
| Image attachments | Add PNG, JPEG, GIF, or WebP by path or paste; enforce Harness count/size limits; render inline when supported and fall back to file metadata otherwise |
| Plan, Goal, Todo, and compaction | Native `/plan`, `/goal`, and `/compact` commands with plan review, goal state, Todo counts, and compaction records in the transcript |
| Tools and produced files | `◆ action · duration` headers with live elapsed time and connected invocation code, dynamic tool catalog, parameters, execution-boundary guidance, line-numbered highlighted file reads, highlighted Shell/JSON/Diff views, safe native terminal ANSI, generic fallback cards, produced-file listing, path copy, and confirmed external open |
| Subagents | Inspect direct children, activity, tree state, token use, and duration; open continuable or read-only sessions and stop an active child turn |
| Background jobs and workflows | Job type, status, start/end times, duration, and detail views; workflow phases, members, results, and failure states in the transcript |
| Statistics and trajectory | Per-turn steps, LLM/tool time, first-token latency, throughput, cache hit, input/output tokens, model requests, running calls, and structured trajectory inspection |
| Profiles | List, create, copy, switch, and diagnose terminal compatibility; controlled restart restores the workspace, session, unsent draft, and attachments |
| Settings and credentials | Enumerate every Settings namespace in the active Profile; dedicated default-model, permission, Agent-mode, and marketplace-source controls; Schema fallback for all other fields; write-only secrets |
| Plugins and marketplace | `/plugin` center, installed list, search, details, install, remove, update, Bundle ordering, source management, and diagnostics; npm, Git, tarball, and local-path specs |
| Skills and MCP | Dynamic user-invocable Skill discovery and native command insertion; MCP tools, instances, settings, load state, and separate process/remote-service risk information |
| Feedback | Session feedback plus positive/negative Assistant-message ratings, optional notes, and feedback removal |
| Status and diagnostics | Harness, Node, platform, Profile, workspace, session, mode, model, permission, pnpm, plugin state, and actionable diagnostics |
| Themes | Independent interface and code-block themes; automatic code colors follow DeepSeek dark/light; named custom themes, manual colors, 3–16-color generation, and local VS Code JSON/JSONC import with TextMate colors and portable token styles; live preview, contrast warnings, terminal-color fallbacks, and `NO_COLOR` |
| Interface language | Live Chinese/English switching through `/language`; the explicit preference is shared with Harness Web through the official `locale.preference` Settings value, while `auto` follows the terminal locale |

Models, Providers, Agent Presets, permissions, Host commands, tools, Settings, Skills, MCP, and marketplace sources are discovered from the running Harness. New capabilities registered by upstream or third-party Bundles enter the dynamic catalogs, with Schema controls, structured details, and actionable diagnostics available while dedicated views evolve.

## Install the bare command

The repository is public and can be installed directly from GitHub without private-repository authentication. SeekTTY supports macOS, Linux, and Windows.

```sh
pnpm add --global github:Hilbert-beinghappy/seektty#v1.0.0
deepseek
```

On first run, `deepseek` uses the native `dsh plugin` command to create the default `tui` Profile and install this Bundle. Later runs boot the same Profile. Initial tasks, workspaces, Session resume, and custom Profiles are supported:

```sh
deepseek "check this project"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
```

The native dsh entry remains available:

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty#v1.0.0
dsh --profile tui
```

## Slash commands

Typing `/` opens a searchable command and Skill menu. It merges SeekTTY commands, Host commands registered for the active Agent, and user-invocable Skills.

| Category | Commands |
| --- | --- |
| Sessions | `/new`, `/resume`, `/sessions`, `/rename`, `/fork`, `/archive`, `/export`, `/copy` |
| Work environment | `/workspace`, `/profile` |
| Agent | `/mode`, `/model`, `/permission`, `/plan`, `/goal`, `/compact` |
| Runtime interaction | `/queue`, `/steer`, `/attach`, `/attachments`, `/pending` |
| Runtime content | `/tools`, `/files`, `/jobs`, `/subagents`, `/trajectory` |
| Extensions | `/plugin`, `/plugins`, `/skills`, `/mcp` |
| Configuration and diagnostics | `/settings`, `/language`, `/theme`, `/status`, `/doctor`, `/feedback`, `/restart` |
| Help and exit | `/help`, `/quit`, `/exit` |

`/plugin`, `/workspace`, and `/profile` provide both complete interactive centers and direct subcommands. Unknown commands produce nearby suggestions instead of being sent to the model as ordinary prompts.

## Common controls

| Input | Action |
| --- | --- |
| Left-button drag, then the terminal copy shortcut | Use the terminal's native selection and copy for any visible TUI text (`Command+C` on macOS; normally `Ctrl+Shift+C` on Linux and Windows terminals) |
| Mouse wheel / trackpad | Browse the native terminal scrollback while the composer remains active |
| `/` | Open command and Skill candidates |
| Enter / Shift+Enter | Submit or confirm / insert a newline |
| Tab / Escape | Switch between composer and transcript / return or close the active overlay |
| PgUp / PgDn / Home / End | Page through the transcript, jump to the oldest content, or return to the latest |
| Shift+Tab | Cycle the current permission, confirming full access first |
| Shift+Left / Shift+Right | Jump to the previous or next user turn |
| Ctrl+P | Open the complete command palette |
| Ctrl+M | Open model selection when the terminal exposes an extended keyboard protocol |
| Ctrl+S | Open session resume |
| Ctrl+O / Ctrl+T | Cycle tool-card display / show or hide reasoning |
| F2 / Ctrl+, / Cmd+, | Open Settings |
| Ctrl+C | Stop the active turn, clear a draft, or confirm exit with a second press |

## Migrate from deepseek-tui

Replace the former global package once. The new `deepseek` launcher then uses native `dsh plugin` commands to replace the legacy Bundle identity in the target Profile with `seektty`:

```sh
pnpm remove --global deepseek-tui
pnpm add --global github:Hilbert-beinghappy/seektty#v1.0.0
deepseek
```

Custom Profiles migrate independently on first launch, for example `deepseek --profile team-tui`. Native dsh-only installations can migrate explicitly:

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty#v1.0.0
```

## Plug and unplug

Removal changes only the target Profile, never the dsh installation:

```sh
dsh plugin --profile tui remove seektty
```

Reinstall with the same native command:

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty#v1.0.0
```

Installation writes directly to the target Harness Profile dependencies, Bundle order, and pnpm lockfile. TUI `/plugin` and native `dsh plugin` operate on that same Profile state.

## Plugin center

Bare `/plugin` opens the current Profile's plugin center, and `/plugins` is an alias. Direct subcommands include `list`, `search`, `info`, `install`, `remove`, `update`, `reorder`, `source`, and `doctor`.

- Search npm Registry by default, add JSON/HTTP Catalogs, and consume sources registered by other Harness Bundles.
- Install npm names, Git URLs, tarballs, file URLs, and local directories.
- Preflight `dsh.bundle.patch`, packed files, the final install spec, build scripts, and the target Profile.
- Restart immediately after install, removal, update, or reorder while restoring the workspace, session, draft, and attachments.
- Inspect version, source, publisher, Bundle state, load order, and actionable diagnostics.

## Models, settings, and themes

`/model` discovers Providers, models, and reasoning efforts from Harness and immediately refreshes the effective model shown in the composer. `/mode` manages Agent Presets, while `/permission` manages the active session permission; each has a separate runtime meaning.

`/settings` lists every Settings namespace registered in the current Profile. Default model, default permission, default Agent mode, and marketplace sources have dedicated selectors. Boolean, enum, number, text, JSON, Secret, Credential Ref, and other fields remain editable through the generic Schema UI. It shows inherited values, user overrides, reset actions, and live/restart timing; revision checks protect concurrent writes. Secrets expose only whether a value is configured and use masked input.

SeekTTY terminal copy ships in Chinese and English. `/language` opens the language selector, and direct forms are available for scripts or quick switching:

```text
/language auto
/language zh
/language en
```

The selection is stored by the official `@deepseek-ai/dsh-client-locale` Host plugin as `locale.preference`, so the TUI and Harness Web use the same explicit preference. `auto` removes that override: SeekTTY then checks `LC_ALL`, `LC_MESSAGES`, `LANGUAGE`, and `LANG`, while the browser keeps using its own platform-language fallback. Switching is live and rebuilds the terminal chrome and transcript presentation without changing model, tool, user, Provider, or plugin-authored content.

SeekTTY starts with its DeepSeek dark theme. `/theme` opens a complete theme center; built-in and named themes can also be managed directly:

```text
/theme dark
/theme light
/theme code [auto|dark|light|<name>]
/theme use <name>
/theme edit [name]
/theme palette [name]
/theme import [name] [local-file]
/theme delete <name>
```

The interface theme and code-block theme are independent. `/theme light`, `/theme dark`, and `/theme use <name>` select a complete matching interface/code pair. With `/theme code auto`, code background, foreground, syntax colors, and dark/light direction follow the active interface theme, so DeepSeek light uses light code blocks. `/theme code dark`, `/theme code light`, or `/theme code <name>` explicitly overrides only code until another complete interface theme is selected. `/theme edit` changes a complete named theme, while `/theme palette` accepts 3–16 HEX/RGB color codes and builds dark and light candidates.

`/theme import` reads a local VS Code JSON/JSONC theme, recursively resolves relative `include` files, maps editor and semantic-token colors, and preserves portable TextMate foreground, background, bold, italic, underline, and strikethrough rules. An imported VS Code theme becomes the active code theme without replacing the current interface theme. Every customization path opens a live preview before saving. Low-contrast colors are never silently replaced; the preview identifies the affected roles and asks for a second confirmation.

Custom themes cover the terminal canvas, panels, selection, text, border, brand and status colors, code background and foreground, and semantic roles for comments, keywords, strings, numbers, constants, functions, types, variables, properties, parameters, operators, punctuation, tags, attributes, and regular expressions. Assistant Markdown code, Shell invocations, structured tool parameters, file reads, JSON, and Diff all use the same code theme. Tool calls render as a compact action/duration header followed by `⎿`-connected invocation code; the duration advances from the Harness call timestamp while the tool is active and freezes at settlement. Collapsed cards retain the invocation while expanded cards add results. Common grammars are ready at startup; other supported grammars load on demand and redraw in place. Theme changes recolor existing messages without moving the transcript, losing expanded state, or changing the draft.

The interface selection, independent code selection, and named definitions live in the `seektty-appearance` Harness Settings namespace under revision protection. `/settings` can therefore edit the same data through its generic Schema UI. Theme names are case-insensitively unique; overwrites and deletion require confirmation. Deleting an active interface theme returns the interface to DeepSeek dark, while deleting an active code theme returns code to automatic pairing. VS Code font families and sizes are deliberately ignored because the terminal owns the character-grid font; imported bold/italic and related styles apply only to code tokens and never restyle ordinary Chinese, English, system text, or tool titles.

## Verified scope

- Isolated install, configuration composition, and PTY boot against official stock `@deepseek-ai/dsh@0.1.0-rc.6`.
- `/doctor`: 95 Harness plugins running, 0 errors, 0 warnings.
- Model listing, Provider/model/reasoning selection, request submission, and Harness error propagation.
- Real dark, light, and palette-generated PTY rendering, independent live interface/code switching, 80/120/160-column layouts, and persistence after restarting the same Profile.
- Chinese/English locale resolution, revision-protected shared preference writes, live terminal switching, and preservation of unknown external content.
- Native removal clears the dependency, Bundle, and config entries; re-add boots again.
- A fresh global install exposes bare `deepseek`, which provisions and boots the `tui` Profile.
- Installation, startup, keyboard navigation, and terminal interaction are supported on macOS, Linux, and Windows.

A real multi-turn live-provider session was verified with a valid DeepSeek credential injected only into the test process: `v4-flash` returned `DSH_THEME_LIVE_OK` and `DSH_MULTI_TURN_OK` with rendered TypeScript and JSON highlighted blocks. The credential was not written to a Profile, settings file, log, or the repository.

Reusable stock-dsh contract check:

```sh
DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock
```

## Compatibility and upgrades

The current compatibility baseline is official `0.1.0-rc.6`. For each new dsh release, update the exact dependencies and compatibility snapshots here, then complete the add/boot/remove/re-add contract before publishing the expanded range.

The source repository and the stable `v1.0.0` GitHub Release are public. No npm-registry package is published; install the tagged GitHub source above or use the tarball attached to the Release.
