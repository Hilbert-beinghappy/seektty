<div align="center">

<img src="assets/seektty-logo.png" alt="SeekTTY logo" width="200">

<h1>SeekTTY</h1>

<p>A keyboard-first terminal workspace for DeepSeek Harness, from an early idea to an executable plan.</p>

<p>
  <a href="https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.0"><img src="https://img.shields.io/badge/Version-1.2.0-orange" alt="Version 1.2.0"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.8-5B5BD6" alt="DeepSeek Harness 0.1.0-rc.8">
  <img src="https://img.shields.io/badge/Node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22.19 or newer">
  <a href="https://github.com/Hilbert-beinghappy/seektty/actions"><img src="https://github.com/Hilbert-beinghappy/seektty/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
</p>

<p>
  <a href="#project-overview">Project overview</a>
  ·
  <a href="#clarify-and-plan">Clarify and Plan</a>
  ·
  <a href="#harness-capabilities-available-in-the-tui">Terminal capabilities</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#verified-scope">Verification</a>
</p>

<p>English · <a href="README.zh.md">中文</a></p>

</div>

---

## Project overview

Run `deepseek` from a project directory to use the native Agent, Session, model, permission, Settings, Profile, plugin, and persistence services of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) from one terminal workspace. Prompts, code changes, tool calls, sessions, model routes, permissions, plugins, subagents, and diagnostics all operate on the same Harness state.

When an idea still needs definition, `/clarify` reads the active Session and composer draft, follows the real model route, and generates Socratic questions, contextual options, and a live draft preview that evolves after every answer. Accepting the preview places a complete Draft back in the ordinary composer for review and manual submission. Harness native `/plan` can then turn the clarified requirement into an implementation plan.

Clarify model calls run through [Auxiliary Runtime](https://github.com/Hilbert-beinghappy/dsh-plugin-auxiliary-runtime) and are recorded in its dedicated `auxiliary_runtime` ledger. Official Agent-loop usage remains in `tokenUsage`; SeekTTY `/status` shows separately sourced Official, Auxiliary, and derived Combined totals while the snapshot contract is healthy.

## DeepSeek light and dark interfaces

### Light theme

![SeekTTY DeepSeek light start screen](assets/seektty-tui.png)

### Dark theme

![SeekTTY DeepSeek dark start screen](assets/seektty-tui-dark.png)

The live view fills the terminal and keeps the composer and status at the bottom. Unused rows remain inside the conversation viewport and disappear as output grows; longer conversations continue into native terminal scrollback.

## Clarify and Plan

[Clarify](https://github.com/Hilbert-beinghappy/dsh-plugin-clarify) and Plan cover consecutive parts of one workflow.

Clarify handles the stage where the desired outcome still needs definition. It uses the current Session and draft to ask one focused question at a time, carries accepted decisions forward, and updates a reviewable Draft after every answer. Accepting returns that Draft to the composer. You can edit it and press Enter when it represents what you want.

Plan handles the stage where the requirement is ready for implementation. Harness native `/plan` turns the submitted requirement into an implementation proposal and opens the normal plan-review flow.

```text
[Active Session + composer draft]
              |
              v
     +------------------+      clarify Remote      +------------------+
     | SeekTTY          | -----------------------> | Clarify          |
     | /clarify surface | <----------------------- | question/options |
     +--------+---------+   live Draft preview     +--------+---------+
              |                                            |
              |                                            | same-process run
              |                                            v
              |                                   +-------------------+
              |                                   | Auxiliary Runtime |
              |                                   | limits / cancel   |
              |                                   | usage ledger      |
              |                                   +---------+---------+
              |                                             |
              |                                             v
              |                                   [official model route]
              |                                   off-transcript, no-tools
              |
              | accept: Draft returns to the composer
              v
        [review and edit]
              |
              | press Enter
              v
     [formal Session message]
              |
              | /plan when an implementation plan is useful
              v
     [plan review -> Agent execution]

Auxiliary snapshot ---------------------> SeekTTY /status
                                          Official | Auxiliary | Combined
```

### Main Session transcript

Questions, options, preview revisions, and refine feedback live in a temporary clarification process held in Host memory. It enters `stale` after 15 minutes without interaction by default and reports `staleReason=ttl-expired`. The main Session transcript receives the formal user message only after you submit the accepted Draft. Clarification state stays out of the input queue, pending interactions, Plan, Goal, Profile files, and SeekTTY local files.

### Auxiliary model usage

Each Clarify model call is recorded by Auxiliary Runtime in the official `storageDomain` under `auxiliary_runtime`. Official `tokenUsage` continues to represent Agent-loop calls. Auxiliary derives Combined values from the four disjoint buckets—`uncachedInputTokens`, `outputTokens`, `cacheReadTokens`, and `cacheWriteTokens`—at read time, and SeekTTY `/status` validates and displays the snapshot. The auxiliary ledger stores call identity, purpose, status, token buckets, normalized failures, and timestamps; prompts, message text, model output, custom answers, credentials, and filesystem paths stay outside the ledger.

### Start Clarify from the composer

SeekTTY adds `/clarify` to its local command catalog while a compatible six-method Clarify Remote with `clarify.wire/1` is active. The current recommended installation is Clarify `0.2.1`; `0.2.0` remains an available rollback artifact.

- Run it from the command palette to keep the whole composer as the seed.
- Type `/clarify some text` to use the argument as the seed.
- End an existing draft with a standalone `/clarify` token or line to use the preceding draft as the seed.

Every answer refreshes the live Draft preview. The number of questions follows the unresolved decisions in the current Session: Clarify usually asks one focused question at a time and moves directly to review when the preview is ready to send. You can answer, refine the preview directly, accept it, or cancel. Accepting writes the reviewed Draft into the ordinary composer; Enter remains the explicit send action.

## Custom interface and code themes, including VS Code imports

Theme customization is a first-class SeekTTY feature: interface background and text colors are editable, code-block colors and syntax styles are independently editable, and `/theme import` accepts local VS Code JSON/JSONC themes with portable TextMate token colors. A palette of 3–16 colors can also generate a complete light or dark theme for preview and further adjustment.

### TypeScript in the DeepSeek light interface

![SeekTTY light TypeScript syntax highlighting](assets/seektty-code-light.png)

### Tool parameters, file reads, and Diff in the DeepSeek dark interface

![SeekTTY dark tool and Diff syntax highlighting](assets/seektty-code-dark.png)

Markdown fences disappear into continuous code surfaces. Assistant code, Shell commands, structured tool parameters, file reads, JSON, and Diff use the same active code theme; ordinary conversation text keeps the interface style. Every code background occupies continuous terminal cells and forms one uninterrupted surface.

## Harness capabilities available in the TUI

The current release covers these capabilities:

| Area | Available operations |
| --- | --- |
| Conversation and runs | Streaming responses, Markdown/GFM, fence-free theme-aware syntax-highlighted code blocks, links, tables, reasoning visibility, collapsed/expanded/hidden tool cards, model retries, compaction, output-limit and error states, and Ctrl+C cancellation |
| Sessions | Create, resume, list, full-text search, rename, fork, archive, copy the last answer, export ZIP, or `/export md` Markdown |
| Workspaces | Start from the current directory; add, select, rename, unregister, reorder, and reorder sessions within a workspace; unregistering never deletes files or session logs |
| Agent modes | Standard, Code/PTC, Minimal, and Cordis/Create baseline modes plus dynamically registered Agent Presets; switching an active conversation creates a new session in the same workspace |
| Models and Providers | Dynamic Provider, model, and supported reasoning-effort discovery; current route display; per-session switching; catalog, credential, and routing diagnostics |
| Permissions and approvals | Inspect and switch Host permission presets, cycle with Shift+Tab, confirm risky upgrades, allow one tool call, skip further prompts for a tool in this session, or reject |
| Input queue and steering | Queue prompts while the Agent runs, inspect/edit/remove entries, steer one entry or the entire queue into the active turn, and send `/steer` directly |
| Human interaction | Single choice, multi-select, custom answers, skip, cancel, and plan review; submitting an interaction returns to the latest output while the blocked turn resumes, with `/pending` recovery when retrying is needed |
| Image attachments | Add PNG, JPEG, GIF, or WebP by pasting an image or file path, or with `/attach`; macOS reads the clipboard via `osascript` (optional `pngpaste`), Linux via `wl-paste`/`xclip`, Windows via PowerShell; pending images appear under the composer; enforce Harness count/size limits; render inline when supported and fall back to file metadata otherwise |
| Plan, Goal, Todo, and compaction | Native `/plan`, `/goal`, and `/compact` commands with plan review, goal state, Todo counts, and compaction records in the transcript |
| Tools and produced files | `◆ action · duration` headers with live elapsed time and connected invocation code, dynamic tool catalog, parameters, execution-boundary guidance, line-numbered highlighted file reads, highlighted Shell/JSON/Diff views, safe native terminal ANSI, generic fallback cards, session-wide produced-file listing grouped by turn, in-TUI view, path copy, and confirmed external open |
| Subagents | Inspect direct children, activity, tree state, token use, and duration; open continuable or read-only sessions and stop an active child turn |
| Background jobs and workflows | Job type, status, start/end times, duration, and detail views; workflow phases, members, results, and failure states in the transcript |
| Statistics and trajectory | Per-turn steps, LLM/tool time, first-token latency, throughput, cache hit, input/output tokens, model requests, running calls, and structured trajectory inspection |
| Profiles | List, create, copy, switch, and diagnose terminal compatibility; controlled restart restores the workspace, session, unsent draft, and attachments |
| Settings and credentials | First-run API-key setup when no usable Provider exists; enumerate every Settings namespace in the active Profile; dedicated default-model, permission, Agent-mode, and marketplace-source controls; Schema fallback for all other fields; write-only secrets |
| Plugins and marketplace | `/plugin` center, installed list, search, details, install, remove, update, Bundle ordering, source management, and diagnostics; npm, Git, tarball, and local-path specs |
| Skills and MCP | Dynamic user-invocable Skill discovery and native command insertion; MCP tools, instances, settings, load state, and separate process/remote-service risk information |
| Feedback | Session feedback plus positive/negative Assistant-message ratings, optional notes, and feedback removal |
| Status and diagnostics | Harness, Node, platform, Profile, workspace, session, mode, model, permission, pnpm, plugin state, and actionable diagnostics |
| Themes | Independent interface and code-block themes; automatic code colors follow DeepSeek dark/light; named custom themes, manual colors, 3–16-color generation, and local VS Code JSON/JSONC import with TextMate colors and portable token styles; live preview, contrast warnings, terminal-color fallbacks, and `NO_COLOR` |
| Interface language | Live Chinese/English switching through `/language`; the explicit preference is shared with Harness Web through the official `locale.preference` Settings value, while `auto` follows the terminal locale |

Models, Providers, Agent Presets, permissions, Host commands, tools, Settings, Skills, MCP, and marketplace sources are discovered from the running Harness. New capabilities registered by upstream or third-party Bundles enter the dynamic catalogs, with Schema controls, structured details, and actionable diagnostics available while dedicated views evolve.

## Quick start

The repositories and Release assets are public. The complete Clarify workflow has been jointly verified with official DeepSeek Harness `0.1.0-rc.8`. Install the prebuilt Release tarballs through the native `dsh plugin` command:

```sh
pnpm add --global @deepseek-ai/dsh@0.1.0-rc.8

dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/dsh-plugin-auxiliary-runtime/releases/download/v0.1.0/dsh-plugin-auxiliary-runtime-0.1.0.tgz
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/dsh-plugin-clarify/releases/download/v0.2.1/dsh-plugin-clarify-0.2.1.tgz

dsh --profile tui
```

This path consumes packed artifacts and avoids Git-source `prepare` / `allowBuilds`. Installing only the first Bundle gives you the standalone SeekTTY shell; Clarify appears when the two optional Host plugins are active in the same Profile.

### Bare `deepseek` launcher

SeekTTY supports macOS, Linux, and Windows. Install the same Release tarball globally; on Windows, `pnpm add --global` creates PATHEXT-aware shims for `dsh.cmd`.

```sh
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
deepseek
```

PowerShell uses the same URL:

```powershell
pnpm add --global 'https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz'
$env:SEEKTTY_SPEC='https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz'
deepseek
```

`deepseek` requires `dsh` on `PATH`, or `DSH_BIN` pointing at the executable. `SEEKTTY_SPEC` pins Profile reconciliation to the same prebuilt tarball. Without that override, the current launcher uses its tagged `github:Hilbert-beinghappy/seektty#v1.2.0` default. Later runs boot the same Profile. Initial tasks, workspaces, Session resume, and custom Profiles are supported:

```sh
deepseek "check this project"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
deepseek --version
deepseek --update
```

`deepseek --update` still force-scans and installs. By default `deepseek` itself is `SEEKTTY_UPDATE=auto`: on launch it fetches official dsh npm `latest` (not `next` or GitHub pre-releases) and the newest SeekTTY GitHub Release, then updates the global dsh install (skipped when `DSH_BIN` pins the executable) and the SeekTTY Bundle through native `dsh plugin add`. Local `link:`/`file:` installs and `SEEKTTY_SPEC` overrides are left alone. Network or install failures never block boot. Set `SEEKTTY_UPDATE=check` to restore a post-session notice, or `SEEKTTY_UPDATE=0` to disable.

## First-run API key setup

When the active Profile has no usable model Provider, and the official DeepSeek Provider exposes a missing writable credential reference, SeekTTY opens a centered write-only prompt before the first interface frame. An existing environment credential, a credential already stored by Harness, or another active Provider that uses ambient or keyless authentication skips the prompt.

### Dark first-run prompt

![SeekTTY dark first-run API key prompt](assets/seektty-onboarding-dark.png)

### Light first-run prompt

![SeekTTY light first-run API key prompt](assets/seektty-onboarding-light.png)

Paste only the API key. Input is masked, and Enter passes the normalized value directly to Harness `credentials.set`; SeekTTY does not read it back, write a credential file, or place it in settings, logs, screenshots, or Session data. Saving does not send a paid validation request—the first real model request reports any authentication failure through the normal Harness Provider error path.

Escape defers setup without blocking `/settings`, `/plugin`, or other local surfaces. Sending a normal prompt, a Skill command, or a prompt with attachments opens the same setup again. An initial `deepseek "task"`, submitted text, and draft attachments remain intact; after a successful save the pending prompt continues automatically, while another deferral restores it to the composer. If Provider inspection is unavailable, the official adapter is absent, or the credential layer is read-only, SeekTTY avoids an unusable form and points to `/settings` and `/doctor` while preserving Harness behavior.

## Slash commands

Typing `/` opens a searchable command and Skill menu. It merges SeekTTY commands, Host commands registered for the active Agent, and user-invocable Skills.

| Category | Commands |
| --- | --- |
| Sessions | `/new`, `/resume`, `/sessions`, `/rename`, `/fork`, `/archive`, `/export`, `/export md`, `/copy` |
| Work environment | `/workspace`, `/profile` |
| Agent | `/mode`, `/model`, `/permission`, `/plan`, `/goal`, `/compact` |
| Runtime interaction | `/queue`, `/steer`, `/attach`, `/attachments`, `/pending` |
| Runtime content | `/tools`, `/files`, `/jobs`, `/subagents`, `/trajectory` |
| Extensions | `/plugin`, `/plugins`, `/skills`, `/mcp` |
| Configuration and diagnostics | `/settings`, `/language`, `/theme`, `/status`, `/doctor`, `/feedback`, `/restart`; when `dsh-plugin-auxiliary-runtime@0.1.0` is healthy, `/status` shows separately labeled Official, Auxiliary, and Combined (derived) whole-Session usage without changing the official `tokenUsage` projection |
| Help and exit | `/help`, `/quit`, `/exit` |

`/plugin`, `/workspace`, and `/profile` provide both complete interactive centers and direct subcommands. Unknown commands produce nearby suggestions and stay within the command surface. A compatible six-method Clarify Remote with `clarify.wire/1` contributes `/clarify` to the local `/` catalog. Its model-generated questions, contextual options, and evolving preview lead to a reviewed Draft in the ordinary composer; you decide when to submit it. See [Clarify and Plan](#clarify-and-plan) for the full journey.

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
| F1 | Open in-app help |
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
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
deepseek
```

Custom Profiles migrate independently on first launch, for example `deepseek --profile team-tui`. Native dsh-only installations can migrate explicitly:

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
```

## Plug and unplug

Removal changes only the target Profile, never the dsh installation:

```sh
dsh plugin --profile tui remove seektty
```

Reinstall with the same native command:

```sh
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
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

- Isolated install, configuration composition, and PTY boot against official stock `@deepseek-ai/dsh@0.1.0-rc.8`, plus the add/boot/remove/re-add contract against the declared minimum `@deepseek-ai/dsh@0.1.0-rc.6`.
- Recommended installation: Clarify `0.2.1` with SeekTTY `1.2.0`, Auxiliary Runtime `0.1.0`, and official dsh `0.1.0-rc.8`. Clarify `0.2.1` preserves the six-method Remote, `clarify.wire/1`, and exact rc.8 compatibility boundary of `0.2.0`.
- Clarify `0.2.0` live-provider acceptance covered model-generated questions/options/previews, multi-round preview evolution, review-and-accept into the composer without automatic submission, interruption recovery, usage provenance, and privacy.
- Clarify `0.2.1` post-release no-key acceptance re-downloaded and verified all three Release assets, passed stock add/boot/remove/re-add and `/doctor` with 0 errors, 0 warnings, and 99 plugins, then reached `running`, routed through Auxiliary, and returned the expected isolated-environment `MISSING_CREDENTIAL` result. Version `0.2.1` has not rerun live-provider multi-round acceptance or a cache/cost A/B.
- Historical standalone Clarify lifecycle evidence covers official dsh rc.6/rc.7/rc.8; the complete dynamic production boundary remains exact rc.8 with Auxiliary Runtime `0.1.0`.
- Auxiliary calls persist usage/limits/cancel only in the `auxiliary_runtime` storage domain. Official Agent `tokenUsage` remains unchanged, while `/status` displays validated `Official`, `Auxiliary`, and derived `Combined` buckets only when the optional snapshot contract is healthy.
- Model listing, Provider/model/reasoning selection, request submission, and Harness error propagation.
- First-run Provider readiness, masked API-key setup, deferral and draft restoration, Harness credential persistence, and restart without another prompt under an isolated `DSH_HOME`.
- Real dark, light, and palette-generated PTY rendering, independent live interface/code switching, 80/120/160-column layouts, and persistence after restarting the same Profile.
- Chinese/English locale resolution, revision-protected shared preference writes, live terminal switching, and preservation of unknown external content.
- Native removal clears the dependency, Bundle, and config entries; re-add boots again.
- A fresh packed global install, with no workspace development dependencies or duplicate `@deepseek-ai/*` packages, exposes bare `deepseek`, provisions the `tui` Profile, and boots through the official dsh module fallback.
- A real native `todo_write` journey passes after installation; the package gate also rejects Profile-local copies of official identity-bearing Host packages and verifies that Cordis, API proxy, Session, and tool runtime resolve to the official fallback instance.
- Installation, startup, keyboard navigation, and terminal interaction are supported on macOS, Linux, and Windows.

A real first-run session was verified with a valid DeepSeek credential pasted into the masked overlay under an isolated `DSH_HOME`: `v4-flash` returned `REALCHECK_58597`, then used that answer in the next turn to return `REALCHECK_58598`. Restarting the same Profile did not reopen setup, the Harness credential file was mode `0600`, and the credential never appeared in terminal output, screenshots, or the repository. The isolated credential store was removed after verification.

Reusable stock-dsh contract check:

```sh
DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock
```

Reusable cross-package doctor check:

```sh
CLARIFY_SPEC=/path/to/dsh-plugin-clarify.tgz \
pnpm test:clarify-doctor
```

## Compatibility and upgrades

The tested SeekTTY baseline is official `0.1.0-rc.8`; the shell's declared minimum remains official `0.1.0-rc.6`, with shell lifecycle coverage on rc.6/rc.7/rc.8. The optional Clarify + Auxiliary production combination is narrower and is verified only on exact rc.8. A newer dsh than `tested` still boots the shell with a notice, but the auxiliary runtime rejects known versions outside its published range; older than the shell minimum is rejected. The published Bundle does not install a second copy of Cordis or any `@deepseek-ai/dsh-*` Host package into a Profile: optional peers describe the host contract, while runtime imports resolve through the official `$DSH_HOME/profiles/node_modules` fallback. This preserves identity-bearing symbols such as the native tool scheduler. Pure client helpers that the official fallback does not ship are bundled instead. The Host plugin `seektty/attachment-compat` still runs immediately before `api-gateway` and adapts only the exact valid legacy image-limit capability shape; all other shapes fail closed. Future hosts are matched by capability and unsupported optional features degrade safely. A scheduled workflow scans the official npm `latest` dist-tag, upgrades development baselines only after `pnpm run check`, packed-launcher isolation, and the stock-dsh contract pass, then opens a pull request. npm `next` and GitHub harness pre-releases are not followed.

The source repository and its GitHub Releases are public. User packages come from the prebuilt tarball attached to the matching Release; there is currently no npm Registry release.
