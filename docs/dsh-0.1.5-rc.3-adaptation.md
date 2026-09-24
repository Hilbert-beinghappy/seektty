# dsh 0.1.5-rc.3 adaptation and verification

Verified locally on 2026-09-24 with Windows, Node 24.19.0, and pnpm 11.7.0. At the time of the upgrade, the official npm `latest` tag was `0.1.5-rc.3`; `next` was `0.1.7-rc.1` and was not selected. This is a development candidate based on the published SeekTTY 1.2.6 source. The rc.3 adaptation has not been published as a new npm package.

## Contract and package audit

- `dsh.compatibility.tested`, 61 direct dsh development packages, optional dsh peers, and all 230 internal workspace overrides now target exactly `0.1.5-rc.3`. The minimum remains `0.1.5-rc.1`; automatic installation remains limited to the exact tested target.
- The official rc.3 CLI pins Cordis `4.0.2`, its include plugin `1.0.7`, loader plugin `1.0.3`, and Schemastery `3.18.2`. SeekTTY's optional peers and development packages use those exact versions, keeping the Profile free of a second Host identity graph. The upgrade script now stops without writing files if a future official CLI changes any of these four pins; a regression covers that failure.
- Registry manifests for 64 official packages were compared between rc.2 and rc.3: the 61 direct dsh packages plus the CLI, base, and subagent packages. Their `exports`, `bin`, `types`, and `dsh` metadata did not change. Non-dsh dependency changes mainly tighten ranges to exact versions. The regenerated lockfile also follows the official Cordis group/include/loader updates and a small set of transitive compression packages.
- The terminal Remote and controller adapters needed no source rewrite for the audited rc.3 contract. Harness remains the owner of Agent, Session, model, Settings, permissions, Profile, plugins, and persistence. The native `dsh.bundle.patch` and `dsh plugin` reconciliation remain in place; consumer dependencies contain no `workspace:` specifier.

## Candidate and local evidence

Candidate: `.artifacts/seektty-rc3-qa/seektty-1.2.6.tgz`.

SHA-256: `9ca4f60ce4956ecb0c0834c1fe62e7c941c0d11489a31478f2a36931c2392cb9`.

| Check | Observed result |
| --- | --- |
| Frozen pnpm install and `pnpm run check` | Typecheck, 178 test files, 1547 passed / 1 skipped, production build, and 28-entry pack check passed after the generated `lib/` files were staged |
| Official stock dsh | CLI and all 231 resolved dsh packages verified at exactly rc.3 |
| `stock-dsh-cycle.mjs` | Same candidate installed, booted, removed, and reinstalled under an isolated `DSH_HOME`; launcher, packaged worker, and official module identity checks passed |
| `native-dsh-acceptance.mjs` | Report recorded 25 passed terminal/API steps, including streaming, approval, subagent, image, export, resume, and clean terminal-session exit |
| `native-management-acceptance.mjs` | Report recorded 17 passed steps for Settings, themes, Provider, plugin restart, and Profile management |
| pnpm 11, GVS disabled | Full official dsh and SeekTTY lifecycle passed |
| pnpm 11, GVS enabled | Reproduced and classified the known dsh/Cordis loader incompatibility; this is not a successful boot |

The native acceptance model responses used loopback fixtures. Both native acceptance runners saved passing reports but retained a runner process after reporting; that process was stopped manually. Their PTY terminal sessions recorded clean exits. The runner teardown remains a separate test-harness limitation.

The first stock-cycle attempt inherited this Windows machine's `NODE_PATH`, which pointed to a globally installed older SeekTTY. Official dsh then selected that global Bundle before the Profile candidate and failed with a duplicate `storage` entry. The stock-cycle and pnpm-layout test processes now omit `NODE_PATH` so they actually test the isolated candidate. No global package, normal `DSH_HOME`, Session, Settings, or credential was modified.

Local logs are in the ignored `.artifacts/` directory. The native reports also name their disposable evidence directories. These generated artifacts are not committed.

## Reproduction and limits

Run `pnpm install --frozen-lockfile && pnpm run check`, pack the local tarball, install the unchanged official Host with `node scripts/install-stock-dsh.mjs`, and pass its `DSH_BIN` plus the absolute candidate `SEEKTTY_SPEC` to `scripts/stock-dsh-cycle.mjs`. The native terminal run also needs `DSH_ENTRY`, the official CLI JavaScript entry; the management run needs `SEEKTTY_PNPM_ENTRY`, the pnpm CLI JavaScript entry. Use a supported Node 22 or 24 runtime and isolated homes.

This local record covers Windows and loopback fixtures. Linux/macOS and Node 22 depend on PR CI. Real GUI terminal mouse/clipboard behavior, paid external model calls, and optional Clarify/Vision-Exp combinations were not revalidated. It does not establish npm publication or production deployment.
