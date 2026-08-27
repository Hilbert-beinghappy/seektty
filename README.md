<div align="center">

<img src="assets/seektty-logo.png" alt="SeekTTY logo" width="200">

<h1>SeekTTY</h1>

<p>A keyboard-first terminal workspace for DeepSeek Harness.</p>

<p>
  <a href="https://github.com/Hilbert-beinghappy/seektty/releases"><img src="https://img.shields.io/badge/Version-1.2.3-orange" alt="Version 1.2.3"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-5B5BD6" alt="DeepSeek Harness 0.1.1-rc.2">
  <img src="https://img.shields.io/badge/Node-%5E22.19.0%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22.19 or newer">
  <a href="https://github.com/Hilbert-beinghappy/seektty/actions"><img src="https://github.com/Hilbert-beinghappy/seektty/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
</p>

<p>
  <a href="#overview">Overview</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#clarify-and-plan">Clarify and Plan</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#compatibility-and-verification">Compatibility</a>
</p>

<p>English · <a href="README.zh.md">中文</a></p>

</div>

---

## Overview

Run `deepseek` from a project directory to use the native Agent, Session, model, permission, Settings, Profile, plugin, and persistence services of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) in one terminal workspace. SeekTTY is the terminal surface; Harness remains the owner of runtime state.

Models, Providers, Agent Presets, permissions, commands, tools, Settings, Skills, MCP servers, and marketplace sources are discovered from the running Harness. Capabilities added by upstream or third-party Bundles therefore appear without being hard-coded into SeekTTY.

For requirements that still need definition, the optional [Clarify Host plugin](https://github.com/Hilbert-beinghappy/dsh-plugin-clarify) adds a guided `/clarify` workflow. It asks focused questions, updates a reviewable Draft after each answer, and returns the accepted Draft to the composer. Harness-native `/plan` can then turn the submitted requirement into an implementation plan.

## Quick start

The last jointly accepted Clarify stack uses official DeepSeek Harness `0.1.0-rc.8`, SeekTTY `1.2.0`, [Auxiliary Runtime](https://github.com/Hilbert-beinghappy/dsh-plugin-auxiliary-runtime) `0.1.0`, and Clarify `0.2.1`:

```sh
pnpm add --global @deepseek-ai/dsh@0.1.0-rc.8

dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/dsh-plugin-auxiliary-runtime/releases/download/v0.1.0/dsh-plugin-auxiliary-runtime-0.1.0.tgz
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/dsh-plugin-clarify/releases/download/v0.2.1/dsh-plugin-clarify-0.2.1.tgz

dsh --profile tui
```

These commands install prebuilt tarballs through native `dsh plugin` reconciliation. SeekTTY works on its own; the two Host plugins add `/clarify` and its separately accounted model runtime.

### Bare `deepseek` launcher

After installing `dsh`, install the same SeekTTY release globally and pin Profile reconciliation to that tarball:

```sh
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
deepseek
```

PowerShell uses the same package URL:

```powershell
pnpm add --global 'https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz'
$env:SEEKTTY_SPEC='https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz'
deepseek
```

`deepseek` requires `dsh` on `PATH`, or `DSH_BIN` pointing to its executable. Common launch forms include:

```sh
deepseek "check this project"
deepseek --cwd ../project
deepseek --resume
deepseek --resume <sessionId>
deepseek --profile team-tui
deepseek --version
deepseek --update
```

`deepseek --update` is self-first: it checks SeekTTY before dsh, installs at most one compatible component per run, and never installs an untested gap or future Host. `DSH_BIN`, local installs, and `SEEKTTY_SPEC` overrides are left unchanged. Update failures do not block startup. Set `SEEKTTY_UPDATE=check` for a post-session notice or `SEEKTTY_UPDATE=0` to disable checks.

SeekTTY `1.2.3` adds complete application-owned mouse interaction while retaining native terminal selection as an escape hatch. It targets official Harness `0.1.1-rc.2`. Use the package listed on the [Releases page](https://github.com/Hilbert-beinghappy/seektty/releases), or build it with `pnpm run build && pnpm pack` and point `SEEKTTY_SPEC` to the resulting tarball.

### What's new in 1.2.3

- A resident transcript scrollbar and viewport-bound wheel handling keep scrolling out of the composer and make short and long conversations behave consistently.
- In-app text selection persists after release, supports word and line selection, and auto-scrolls across loaded transcript pages. Copy-on-select and right-click Copy/Paste use explicit UTF-8 paths on Windows, macOS, Wayland, and X11.
- Stable hover feedback and target-aware clicks cover tool cards, examples, autocomplete, overlays, and the model, mode, and permission controls.
- Autocomplete hit testing follows the candidates actually rendered after scrolling. The first click selects; Enter or a safe second click executes a slash command once; Tab only completes it.
- F3 or `/mouse` switches between full mouse mode and native terminal selection. Dangerous confirmations remain keyboard-only.

## Interface

| DeepSeek light | DeepSeek dark |
| --- | --- |
| ![SeekTTY DeepSeek light start screen](assets/seektty-tui.png) | ![SeekTTY DeepSeek dark start screen](assets/seektty-tui-dark.png) |

| TypeScript in the light interface | Tools, file reads, and Diff in the dark interface |
| --- | --- |
| ![SeekTTY light TypeScript syntax highlighting](assets/seektty-code-light.png) | ![SeekTTY dark tool and Diff syntax highlighting](assets/seektty-code-dark.png) |

The live view uses a fixed alternate-screen viewport and keeps the composer and status at the bottom. Full mouse mode browses history with the wheel, selects text, and clicks existing controls inside SeekTTY. Holding a selection at the transcript edge auto-scrolls across loaded pages while preserving one logical text anchor; only the visible viewport is repainted. F3 or `/mouse` switches to native terminal selection without leaving the alternate screen. Exiting restores the previous main screen and its scrollback. Assistant code, Shell commands, tool parameters, file reads, JSON, and Diff share the active code theme while ordinary conversation text keeps the interface theme.

## Clarify and Plan

Clarify and Plan cover consecutive stages of one workflow: Clarify helps decide **what** should be built; Harness-native Plan proposes **how** to build it.

| Component | Responsibility |
| --- | --- |
| **SeekTTY** | Detects the Clarify Remote, adds `/clarify`, renders the terminal interaction, supplies the active Session and draft, and returns an accepted Draft to the composer. |
| **dsh-plugin-clarify** | Owns the temporary clarification process and publishes `start`, `answer`, `accept`, `refine`, `cancel`, and `fetchDraft` over `clarify.wire/1`. |
| **dsh-plugin-auxiliary-runtime** | Runs Clarify model calls through the active model route with limits, cancellation, and a separate usage ledger. |

Start Clarify in any of these ways:

- Choose `/clarify` from the command palette to use the whole composer as the seed.
- Type `/clarify some text` to use its argument as the seed.
- End an existing draft with a standalone `/clarify` token or line to use the preceding text as the seed.

Clarify asks one focused question at a time, carries accepted decisions forward, and refreshes the Draft preview after every answer. You can answer, refine, accept, or cancel. Accepting only writes the Draft into the ordinary composer; Enter remains the explicit send action. Run `/plan` after submission when an implementation proposal is useful.

Questions, options, previews, and refine feedback remain in Host memory and become stale after 15 minutes without interaction by default. The main Session receives only the Draft you explicitly submit. Auxiliary usage is stored in the official `storageDomain` under `auxiliary_runtime`; prompts, answers, model output, credentials, and filesystem paths are excluded. `/status` displays validated Official, Auxiliary, and derived Combined totals without changing official Agent `tokenUsage`.

See [Compatibility and verification](#compatibility-and-verification) for the accepted release stack and current candidate boundary.

## Features

| Area | Available operations |
| --- | --- |
| Conversation | Streaming Markdown/GFM, syntax-highlighted code, links, tables, reasoning visibility, tool-card display modes, retries, compaction, cancellation, and error states |
| Sessions and workspaces | Create, resume, search, rename, fork, archive, reorder, copy, export, and switch workspaces without deleting project files or logs |
| Agents, models, and permissions | Dynamic Agent Presets, Providers, models, reasoning efforts, and permission presets with per-session switching and diagnostics |
| Queue and interaction | Queue or steer prompts during a run; edit queue entries; answer single-choice, multi-select, custom, skip, cancel, and plan-review prompts |
| Images | Paste or attach PNG, JPEG, GIF, or WebP; enforce live Host limits; restore pending attachments; render inline when the terminal supports it |
| Plan, Goal, Todo, and compaction | Native `/plan`, `/goal`, and `/compact` with plan review, goal state, Todo counts, and transcript records |
| Tools and files | Live tool duration, highlighted parameters and results, file reads with source line numbers, Shell/JSON/Diff views, produced-file browsing, path copy, and confirmed external open |
| Subagents and background work | Inspect or stop direct subagents; view jobs, workflow phases, results, failures, token use, duration, and structured trajectory data |
| Profiles and Settings | Create, copy, switch, and diagnose Profiles; edit every registered Settings namespace with Schema fallbacks, revision checks, and write-only secrets |
| Plugins, Skills, and MCP | Plugin center, native Bundle reconciliation, dynamic Skill commands, MCP instances, load state, settings, and risk information |
| Themes and language | Independent interface/code themes, palette generation, VS Code theme import, contrast checks, `NO_COLOR`, and live Chinese/English switching |
| Diagnostics and feedback | Runtime status, actionable `/doctor` checks, Session feedback, Assistant-message ratings, and feedback removal |

SeekTTY reads these catalogs from the active Harness Profile. Unsupported optional capabilities degrade safely while dedicated terminal views continue to evolve.

## First-run API key setup

| Dark | Light |
| --- | --- |
| ![SeekTTY dark first-run API key prompt](assets/seektty-onboarding-dark.png) | ![SeekTTY light first-run API key prompt](assets/seektty-onboarding-light.png) |

When the active Profile has no usable model Provider and the official DeepSeek Provider exposes a writable missing credential, SeekTTY opens a centered, write-only prompt. Existing environment credentials, stored Harness credentials, and ambient or keyless Providers skip it.

Input is masked and passed directly to Harness `credentials.set`. SeekTTY does not read it back or put it in Settings, logs, screenshots, or Session data. Saving does not make a paid validation request; authentication errors follow the normal Provider path on the first real request.

Escape defers setup without blocking local surfaces such as `/settings` or `/plugin`. Pending text and attachments are preserved, and the request continues automatically after a successful save. If credentials cannot be inspected or written, SeekTTY points to `/settings` and `/doctor` instead of showing an unusable form.

## Slash commands

Typing `/` opens a searchable menu that merges SeekTTY commands, Host commands for the active Agent, and user-invocable Skills.

| Category | Commands |
| --- | --- |
| Sessions | `/new`, `/resume`, `/sessions`, `/rename`, `/fork`, `/archive`, `/export`, `/export md`, `/copy` |
| Work environment | `/workspace`, `/profile` |
| Agent | `/mode`, `/model`, `/permission`, `/plan`, `/goal`, `/compact` |
| Runtime interaction | `/queue`, `/steer`, `/attach`, `/attachments`, `/pending` |
| Runtime content | `/tools`, `/files`, `/jobs`, `/subagents`, `/trajectory` |
| Extensions | `/plugin`, `/plugins`, `/skills`, `/mcp` |
| Plugin workflow | `/clarify` appears when a compatible Clarify Remote and Auxiliary Runtime are active |
| Configuration and diagnostics | `/settings`, `/language`, `/theme`, `/status`, `/doctor`, `/feedback`, `/restart` |
| Help and exit | `/help`, `/quit`, `/exit` |

`/plugin`, `/workspace`, and `/profile` provide interactive centers and direct subcommands. Unknown commands stay inside the command surface and show nearby suggestions.

The rendered candidate window is authoritative: the wheel and arrow keys move its highlight, pointer hover is preview-only, and the first click visibly selects the exact candidate under the pointer. Enter or a safe second click completes and runs a slash command once; Tab only completes it. File and path completions never auto-submit, and the scroll-position footer is not clickable.

Full-mode clipboard copy encodes text once as UTF-8. Windows uses a fixed PowerShell `Set-Clipboard` writer, macOS runs `pbcopy` under a UTF-8 locale, Wayland declares `text/plain;charset=utf-8`, and X11 requests `UTF8_STRING`; OSC 52 remains available for terminal, SSH, and tmux paths.

## Common controls

| Input | Action |
| --- | --- |
| Full mouse mode | Wheel, resident scrollbar, in-app selection, copy-on-select, stable hover feedback, and target-aware clicks on tool cards, examples, autocomplete, overlays, and remaining model/mode/permission chrome. Dangerous confirmations still require Enter. |
| Hold the terminal selection modifier while dragging, then copy | Native selection for visible TUI text: hold `Fn` in Terminal.app or `Option` in iTerm2, drag, then press `Command+C`; use the outer terminal/tmux selection modifier elsewhere. Switch with F3 or `/mouse native`. |
| Mouse wheel / trackpad | Browse the internal transcript without moving composer focus, draft, selection, or cursor |
| Ctrl+Shift+C / F3 | Copy the in-app selection / toggle full and native mouse modes |
| `/` | Open command and Skill candidates |
| Enter / Shift+Enter | Submit or confirm; a selected slash candidate completes and runs once / insert a newline |
| Tab / Escape | Complete the selected candidate without submitting / return or close the active overlay |
| PgUp / PgDn / Home / End | Page through the transcript, jump to the oldest content, or return to the latest |
| Shift+Tab | Cycle permission presets, confirming full access first |
| Shift+Left / Shift+Right | Jump to the previous or next user turn |
| F1 / Ctrl+P | Open help / open the command palette |
| Ctrl+M / Ctrl+S | Open model selection / open Session resume |
| Ctrl+O / Ctrl+T | Cycle tool-card display / show or hide reasoning |
| F2 / Ctrl+, / Cmd+, | Open Settings |
| Ctrl+C | Stop the active turn, clear a draft, or confirm exit with a second press |

## Themes and language

SeekTTY starts with its DeepSeek dark theme. `/theme` opens the theme center; direct forms include:

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

Interface and code themes are independent. A palette of 3–16 HEX/RGB colors can generate light and dark candidates. `/theme import` reads local VS Code JSON/JSONC themes, resolves relative `include` files, and preserves portable TextMate colors and styles. Every customization path previews changes and flags low contrast before saving. Definitions live in the revision-protected `seektty-appearance` Harness Settings namespace.

Use `/language` or a direct command to switch the terminal copy live:

```text
/language auto
/language zh
/language en
```

The explicit preference is stored by the official locale plugin as `locale.preference` and shared with Harness Web. `auto` removes the override and follows the terminal locale. Switching changes SeekTTY chrome and transcript presentation without rewriting model, tool, user, Provider, or plugin-authored content.

## Plugin center

`/plugin` opens the active Profile's plugin center; `/plugins` is an alias. Direct subcommands include `list`, `search`, `info`, `install`, `remove`, `update`, `reorder`, `source`, and `doctor`.

- Search npm by default, add JSON/HTTP catalogs, or use sources registered by other Bundles.
- Install npm names, Git URLs, tarballs, file URLs, and local directories.
- Preflight `dsh.bundle.patch`, packed files, install specs, build scripts, and the target Profile.
- Restart after a mutation while restoring the workspace, Session, draft, and attachments.
- Inspect versions, sources, publishers, Bundle order, load state, and actionable diagnostics.

TUI `/plugin` and native `dsh plugin` reconcile the same Profile dependencies, Bundle order, and pnpm lockfile.

## Migration and removal

Replace the former `deepseek-tui` global package once:

```sh
pnpm remove --global deepseek-tui
pnpm add --global https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
export SEEKTTY_SPEC=https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
deepseek
```

Custom Profiles migrate independently on first launch. Native dsh-only installations can replace the Bundle explicitly:

```sh
dsh plugin --profile tui remove deepseek-tui
dsh plugin --profile tui add https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.0/seektty-1.2.0.tgz
```

Removing SeekTTY changes only the target Profile, never the dsh installation:

```sh
dsh plugin --profile tui remove seektty
```

## Compatibility and verification

The current tested Host is official `0.1.1-rc.2`; the complete compatibility boundary is summarized below.

| Boundary | Version |
| --- | --- |
| Node.js | `^22.19.0 || >=24` |
| Declared minimum Harness Host | `0.1.0-rc.6` |
| Current tested Harness Host | `0.1.1-rc.2` |
| Last jointly accepted Clarify release stack | dsh `0.1.0-rc.8` + SeekTTY `1.2.0` + Auxiliary Runtime `0.1.0` + Clarify `0.2.1` |
| Current mouse release | SeekTTY `1.2.3` + Auxiliary Runtime `0.1.1` + Clarify `0.2.2`; this release does not establish new complete joint acceptance |

Hosts older than the declared minimum are rejected. Newer-than-tested Hosts may boot with a notice, but automatic updates install only an explicitly compatible range. The published Bundle does not install Cordis or identity-bearing `@deepseek-ai/dsh-*` packages into a Profile: optional peers describe the Host contract, and runtime imports resolve through the official Harness installation. The attachment compatibility adapter handles only the exact tested legacy image-limit shape and fails closed for unknown shapes.

Verification includes:

- Isolated stock-dsh add, boot, remove, and re-add lifecycle checks, including the declared minimum.
- Type checking, unit tests, production build, packed-content checks, and duplicate-Host-package rejection.
- Real PTY coverage for startup, navigation, dark/light/custom themes, 80/120/160-column layouts, locale switching, and restart restoration; installation and terminal interaction are supported on macOS, Linux, and Windows.
- First-run credential setup and a real multi-turn Provider session without credential leakage into output, screenshots, or the repository.
- Candidate observations on stock `0.1.1-rc.2` for Clarify, separate usage, PNG/JFIF attachments, Vision-Exp selection, and restart restoration. These observations do not establish full Web UI, GIF/WebP, over-limit, interruption-recovery, or cost/cache coverage.

Reusable checks:

```sh
pnpm run check

DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
pnpm test:stock

DSH_BIN=/path/to/dsh \
SEEKTTY_SPEC=/path/to/seektty.tgz \
SEEKTTY_MOUSE_PTY=1 \
pnpm test:mouse-pty

CLARIFY_SPEC=/path/to/dsh-plugin-clarify.tgz \
pnpm test:clarify-doctor
```

User packages are distributed as prebuilt tarballs attached to matching GitHub Releases. There is currently no npm Registry release.
