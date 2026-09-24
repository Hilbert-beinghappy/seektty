# SeekTTY 1.2.6 — release verification

This record describes the exact package inputs and checks for `seektty@1.2.6`.

Published to [npm](https://www.npmjs.com/package/seektty/v/1.2.6) on 2026-09-15 at 05:08 UTC and as [GitHub Release v1.2.6](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.2.6) on 2026-09-15 at 05:09 UTC. The later dsh `0.1.5-rc.2` adaptation is a development checkout, not part of this published package.

## Package contract

- Source baseline: the merged `main` commit containing the dsh `0.1.5-rc.1` adaptation.
- Host range: minimum and tested `0.1.5-rc.1`.
- Package is public and contains no `workspace:` dependency, credential, Session data, or generated package-manager cache.
- Native `dsh.bundle.patch` and dsh plugin reconciliation remain intact.

## Reproducing the release checks

Run with Node 24 and pnpm 11.7.0:

```sh
corepack pnpm run check
```

The release check covers type checking, the full unit and integration suite, the production build, and the packed-content allowlist. To reproduce the lifecycle gate, install and boot the exact packed tarball against an unmodified official dsh `0.1.5-rc.1` under an isolated `DSH_HOME`, then remove and reinstall it in the same isolated home.

## Scope limits

The local evidence covers macOS Apple Silicon. Windows/Linux, real GUI mouse and clipboard behavior, optional plugin combinations, and paid external model calls require their own acceptance evidence. The user's existing DSH_HOME, credentials, Settings, and Sessions are not test fixtures and must remain unchanged.
