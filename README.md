# SeekTTY

English | [中文](README.zh.md)

SeekTTY brings [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) into the terminal. Run `deepseek` from a project directory to work in a keyboard-first interface for prompting, code changes, tool calls, session management, model and permission switching, plugin installation, subagent coordination, and runtime diagnostics.

SeekTTY joins Harness as a Profile Bundle and uses its native Agent, Session, model, permission, Settings, Profile, plugin, and persistence services. Every terminal action uses the same Harness state, so upgrades stay focused on the compatibility baseline and adapters.

## DeepSeek light and dark interfaces

### Light theme

![SeekTTY DeepSeek light start screen](assets/seektty-tui.png)

### Dark theme

![SeekTTY DeepSeek dark start screen](assets/seektty-tui-dark.png)

## Harness capabilities available in the TUI

The current release covers these capabilities:

| Area | Available operations |
| --- | --- |
| Conversation and runs | Streaming responses, Markdown/GFM, code blocks, links, tables, reasoning visibility, collapsed/expanded/hidden tool cards, model retries, compaction, output-limit and error states, and Ctrl+C cancellation |
| Sessions | Create, resume, list, full-text search, rename, fork, archive, copy the last answer, and export the current session or its complete subagent tree and attachments as ZIP |
| Workspaces | Start from the current directory; add, select, rename, unregister, reorder, and reorder sessions within a workspace; unregistering never deletes files or session logs |
| Agent modes | Standard, Code/PTC, Minimal, and Cordis/Create baseline modes plus dynamically registered Agent Presets; switching an active conversation creates a new session in the same workspace |
| Models and Providers | Dynamic Provider, model, and supported reasoning-effort discovery; current route display; per-session switching; catalog, credential, and routing diagnostics |
| Permissions and approvals | Inspect and switch Host permission presets, cycle with Shift+Tab, confirm risky upgrades, and allow or reject one tool call at a time |
| Input queue and steering | Queue prompts while the Agent runs, inspect/edit/remove entries, steer one entry or the entire queue into the active turn, and send `/steer` directly |
| Human interaction | Single choice, multi-select, custom answers, skip, cancel, plan review, and `/pending` recovery when an interaction needs to be retried |
| Image attachments | Add PNG, JPEG, GIF, or WebP by path or paste; enforce Harness count/size limits; render inline when supported and fall back to file metadata otherwise |
| Plan, Goal, Todo, and compaction | Native `/plan`, `/goal`, and `/compact` commands with plan review, goal state, Todo counts, and compaction records in the transcript |
| Tools and produced files | Dynamic tool catalog, parameters, execution-boundary guidance, structured results, generic fallback cards, produced-file listing, path copy, and confirmed external open |
| Subagents | Inspect direct children, activity, tree state, token use, and duration; open continuable or read-only sessions and stop an active child turn |
| Background jobs and workflows | Job type, status, start/end times, duration, and detail views; workflow phases, members, results, and failure states in the transcript |
| Statistics and trajectory | Per-turn steps, LLM/tool time, first-token latency, throughput, cache hit, input/output tokens, model requests, running calls, and structured trajectory inspection |
| Profiles | List, create, copy, switch, and diagnose terminal compatibility; controlled restart restores the workspace, session, unsent draft, and attachments |
| Settings and credentials | Enumerate every Settings namespace in the active Profile; dedicated default-model, permission, Agent-mode, and marketplace-source controls; Schema fallback for all other fields; write-only secrets |
| Plugins and marketplace | `/plugin` center, installed list, search, details, install, remove, update, Bundle ordering, source management, and diagnostics; npm, Git, tarball, and local-path specs |
| Skills and MCP | Dynamic user-invocable Skill discovery and native command insertion; MCP tools, instances, settings, load state, and separate process/remote-service risk information |
| Feedback | Session feedback plus positive/negative Assistant-message ratings, optional notes, and feedback removal |
| Status and diagnostics | Harness, Node, platform, Profile, workspace, session, mode, model, permission, pnpm, plugin state, and actionable diagnostics |
| Themes | DeepSeek dark and light themes, True Color/256-color/16-color fallbacks, `NO_COLOR`, and immediate `/theme` changes persisted by Harness Settings |

Models, Providers, Agent Presets, permissions, Host commands, tools, Settings, Skills, MCP, and marketplace sources are discovered from the running Harness. New capabilities registered by upstream or third-party Bundles enter the dynamic catalogs, with Schema controls, structured details, and actionable diagnostics available while dedicated views evolve.

## Install the bare command

The repository is public and can be installed directly from GitHub without private-repository authentication.

```sh
pnpm add --global github:Hilbert-beinghappy/seektty
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
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
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
| Configuration and diagnostics | `/settings`, `/theme`, `/status`, `/doctor`, `/feedback`, `/restart` |
| Help and exit | `/help`, `/quit`, `/exit` |

`/plugin`, `/workspace`, and `/profile` provide both complete interactive centers and direct subcommands. Unknown commands produce nearby suggestions instead of being sent to the model as ordinary prompts.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Open command and Skill candidates |
| Enter / Shift+Enter | Submit or confirm / insert a newline |
| Tab / Escape | Switch between composer and transcript / return or close the active overlay |
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
pnpm add --global github:Hilbert-beinghappy/seektty
deepseek
```

Custom Profiles migrate independently on first launch, for example `deepseek --profile team-tui`. Native dsh-only installations can migrate explicitly:

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
```

## Plug and unplug

Removal changes only the target Profile, never the dsh installation:

```sh
dsh plugin --profile tui remove seektty
```

Reinstall with the same native command:

```sh
dsh plugin --profile tui add github:Hilbert-beinghappy/seektty
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

SeekTTY starts with its DeepSeek dark theme. Run `/theme` for the light/dark selector or switch directly with `/theme dark` and `/theme light`. The new theme renders immediately and persists through Harness Settings.

## Verified scope

- Isolated install, configuration composition, and PTY boot against official stock `@deepseek-ai/dsh@0.1.0-rc.6`.
- `/doctor`: 95 Harness plugins running, 0 errors, 0 warnings.
- Model listing, Provider/model/reasoning selection, request submission, and Harness error propagation.
- Real PTY rendering for both themes, live `/theme` switching, and persistence after restarting the same Profile.
- Native removal clears the dependency, Bundle, and config entries; re-add boots again.
- A fresh global install exposes bare `deepseek`, which provisions and boots the `tui` Profile.
- macOS and Linux only; Windows is unsupported.

A real live-provider response was verified with a valid DeepSeek credential injected only into the test process: `v4-flash` returned exactly `DSH_PLUGIN_DEEPSEEK_OK`. The credential was not written to a Profile, settings file, log, or the repository.

Reusable stock-dsh contract check:

```sh
DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock
```

## Compatibility and upgrades

The current compatibility baseline is official `0.1.0-rc.6`. For each new dsh release, update the exact dependencies and compatibility snapshots here, then complete the add/boot/remove/re-add contract before publishing the expanded range.

The source repository is public. No npm package or GitHub Release is currently published; install from the GitHub source above.
