# SeekTTY

English | [中文](README.zh.md)

SeekTTY is an independent [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Profile Bundle. Harness remains the owner of Agent, Session, model, settings, permissions, Profile, plugin, and persistence state. This repository supplies only the DeepSeek-colored terminal Surface and its compatibility adapters; it is not a Harness fork.

![Real SeekTTY TUI conversation](assets/seektty-tui.png)

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

The package declares the standard `dsh.bundle.patch`. It owns no second plugin database, Profile format, Session store, model adapter, settings store, or permission system.

## Models and settings

The model catalog, Providers, reasoning effort, credentials, and every non-visual setting come from Harness. Configure them through `/model`, `/settings`, or the native Harness settings. Secrets do not belong to this plugin and must never enter the repository.

## Verified scope

- Isolated install, configuration composition, and PTY boot against official stock `@deepseek-ai/dsh@0.1.0-rc.6`.
- `/doctor`: 95 Harness plugins running, 0 errors, 0 warnings.
- Model listing, Provider/model/reasoning selection, request submission, and Harness error propagation.
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

Only official `0.1.0-rc.6` is currently supported. A dsh update does not require merging this repository back into a fork. Update the exact dependencies and compatibility snapshots here, then pass add/boot/remove/re-add before widening the compatibility range.

The source repository is public. No npm package or GitHub Release is currently published; install from the GitHub source above.
