# SeekTTY 1.3.0 — release verification

## Package inputs

- Reviewed main baseline: `37c8cdff7bc15b2057bf5256209ff3e88a449aaf` (PR212 merged after PR211).
- Release package: `seektty@1.3.0`; minimum and tested official Host: `0.2.0-rc.2`.
- Node.js contract: `^22.19.0 || >=24`; package manager: pnpm `11.7.0`.
- Changes on top of the baseline: release documentation, synchronized English/Chinese README, package/companion version metadata, existing version assertions, and rebuilt generated `lib/`.
- PR scope and earlier documentation gaps: [complete audit](release-v1.3.0-pr-audit.md).
- Historical integration evidence: [PR212 integration](pr212-main-integration-2026-10-13.md). Those old candidate results are not counted as fresh checks of `1.3.0`.

## Fresh release gates

Observed locally on Windows, Node **22.23.3**, and pnpm **11.7.0**. The verified unmodified official dsh installation contains **278** packages pinned to **0.2.0-rc.2**. Its existing installation was verified again; each candidate journey uses a fresh isolated user environment.

Candidate: `seektty-1.3.0.tgz`.

**SHA-256:** `a5ffc0c311406d54d4b9dbffb46f56fca9e55824f056a9a00e176648ed4efda4`.

| Gate | Observed result |
| --- | --- |
| Frozen installation | Passed; committed lockfile unchanged |
| Full check with verified official/optional fixtures | **242 files, 2369 tests passed, 4 existing skips**; typecheck, build, and pack check passed |
| Existing skips | Optional Clarify package installation, two POSIX clipboard-writer termination cases, POSIX FIFO case |
| Host version scan | `tested == target == 0.2.0-rc.2`; no latest-channel update available |
| Generated runtime | Rebuilt tracked `lib/`; subsequent build has no drift. Only package-version metadata and its generated imports changed from main |
| Packed content | **55** allowlisted files; no consumer `workspace:` dependency or packaged helper/cache/Profile/Session files |
| Optional official fixtures | All four retained artifact SHA-256 receipts rechecked |
| Stock lifecycle | Exact candidate installed, booted, removed, reinstalled; official module identity, worker and launcher checks passed; wrapper/child exited **0** |
| Native terminal | **26** steps on this exact candidate passed, including streaming, permissions, approvals, questions, subagents, images, files, exports and resume; wrapper/runner exited **0** |
| Native management | **17** steps on this exact candidate passed, including Settings, themes, Provider edits, plugin restarts, Profile creation/copy and persistence; wrapper/runner exited **0** |
| npm publish dry run | Accepted `seektty@1.3.0`, public access, `latest` tag, official registry; this does not count as actual publication |
| Documentation | **183** unique PR rows, **46** local Markdown links checked, synchronized **26** README heading levels, balanced code fences and clean Git whitespace checks |

The initial full run retained an old `1.2.6` client-version expectation in the account intake test. Updating that existing assertion to `1.3.0` preserved the callback origin, login source, and safe-URL assertions. The final complete run passed; the initial failed log remains local evidence and is not counted as a pass. No test was removed or newly skipped.

Machine-readable wrapper reports and logs remain untracked under `.artifacts/release-v1.3.0/`. They bind all three acceptance suites to the digest above; raw terminal captures and disposable Session data are excluded from Git and release assets.

## Reproduction

Use a supported Node.js version and pnpm `11.7.0`:

```sh
pnpm install --frozen-lockfile
pnpm run check
node scripts/bump-dsh.mjs --check
pnpm pack --pack-destination .artifacts/release-v1.3.0
node scripts/install-stock-dsh.mjs .artifacts/release-v1.3.0/stock-dsh
```

Run the candidate through `scripts/acceptance-run-isolated.mjs`, supplying `--suite stock` (then `terminal` and `management`), the exact candidate and SHA-256, the verified official CLI shim/entry, an installed pnpm entry, and a fresh output directory. The wrapper creates isolated HOME/USERPROFILE/XDG/DSH_HOME directories and excludes inherited `NODE_PATH`. It preserves the user's normal Profiles, Settings, credentials, and Sessions.

GitHub CI additionally runs Linux/macOS/Windows on Node 22/24, the Windows launcher, and pnpm 11 layout gates. GVS disabled must complete the lifecycle; enabled GVS may only pass by a successful boot or classification of the exact known upstream loader failure.

## Publication references and verification

- npm version: [seektty@1.3.0](https://www.npmjs.com/package/seektty/v/1.3.0).
- GitHub Release: [v1.3.0](https://github.com/Hilbert-beinghappy/seektty/releases/tag/v1.3.0).
- Assets: `seektty-1.3.0.tgz` and `SHA256SUMS`; use the exact candidate digest above.
- [Release branch CI](https://github.com/Hilbert-beinghappy/seektty/actions?query=branch%3Acodex%2Frelease-v1.3.0) must pass before merge/publication. It supplies the Linux/macOS/Windows and Node 22/24 matrix beyond the local Windows evidence.

The same immutable tarball is used for npm and the GitHub asset. Confirm actual registry metadata and download integrity rather than treating a local commit or dry run as publication:

```sh
npm view seektty@1.3.0 version dist.integrity dist.tarball --json --registry=https://registry.npmjs.org/
npm view seektty dist-tags --json --registry=https://registry.npmjs.org/
gh release view v1.3.0 --repo Hilbert-beinghappy/seektty
```

A registry-download lifecycle pass may reuse the candidate's acceptance only after byte-for-byte digest equality is established. Otherwise the downloaded artifact needs fresh acceptance.

## Limits

Model journeys use loopback fixtures. The release gates do not certify paid model calls, real ASR or model downloads, microphone recording, SSH deployment, real Browser/Computer actions, or manual desktop-terminal mouse/clipboard acceptance. Optional Clarify installation needs its own fixture. Existing POSIX-only skips on Windows remain platform limits. The 127-row feature ledger is a scope inventory, not a count of independently completed PTY journeys. Host path-based reads remain best effort; unavailable remote watching offers manual refresh.

PR207 was merged into `codex/fix-native-activation-jobs`, not this main history. Its long-stream stall/hover fixes are excluded and are not marked resolved by this release.
