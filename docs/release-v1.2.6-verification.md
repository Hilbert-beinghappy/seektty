# SeekTTY 1.2.6 — release verification

This record describes the exact package inputs and checks for `seektty@1.2.6`.

Publication remains pending until an authorized npm account completes registry authentication and publishes the verified tarball.

## Package contract

- Source baseline: the merged `main` commit containing the dsh `0.1.5-rc.1` adaptation.
- Host range: minimum and tested `0.1.5-rc.1`.
- Package is public and contains no `workspace:` dependency, credential, Session data, or generated package-manager cache.
- Native `dsh.bundle.patch` and dsh plugin reconciliation remain intact.

## Required checks

Run with Node 24 and pnpm 11.7.0:

```sh
corepack pnpm run check
```

The release check covers type checking, the full unit and integration suite, the production build, and the packed-content allowlist. The exact packed tarball must also be installed and booted against an unmodified official dsh `0.1.5-rc.1` under an isolated `DSH_HOME`; remove and reinstall it in the same isolated home before publication.

## Scope limits

The local evidence covers macOS Apple Silicon. Windows/Linux, real GUI mouse and clipboard behavior, optional plugin combinations, and paid external model calls require their own acceptance evidence. The user's existing DSH_HOME, credentials, Settings, and Sessions are not test fixtures and must remain unchanged.
