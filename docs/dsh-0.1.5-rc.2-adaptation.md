# dsh 0.1.5-rc.2 adaptation and verification

Verified on 2026-09-22, macOS arm64, Node 24.20.0, pnpm 11.7.0.

## Target and changes

The official npm `latest` tag resolved to `0.1.5-rc.2`; `next` resolved to
`0.1.5-rc.3` and was not selected. This development change starts from SeekTTY
1.2.6 (`3db14ac`). It is not a new npm release.

- `dsh.compatibility.tested`, direct dsh development dependencies, optional
  peer pins, and the pnpm adapter now target exactly `0.1.5-rc.2`.
- The declared minimum remains `0.1.5-rc.1`. The current auto-install target is
  the exact tested pin; unknown future Hosts are not automatically installed.
- All 230 internal workspace overrides target rc.2. pnpm regenerated the
  lockfile; all non-dsh package records remain unchanged.
- Version-scan tests now follow the declared tested target while retaining
  explicit rejection, no-reinstall, no-downgrade, and pinned-install cases.
- The README updater changes current development instructions and compatibility
  rows while preserving published release and rollback records. An offline
  regression exercises two consecutive bumps, rc.1 → rc.2 → rc.3, including
  npm `latest` discovery and atomic failure cases.
- The scheduled scan passes its already selected target to the bump command.
  Management acceptance derives the default stock Host from current metadata
  and requires an explicit candidate tarball.

Harness ownership, `dsh.bundle.patch`, native plugin reconciliation, package
identity, and consumer dependencies are unchanged. The Bundle still contains
no `workspace:` dependency or second Host identity graph.

## Official package audit

Compared 64 official packages across rc.1 and rc.2: all 61 direct dsh peer/dev
packages plus the CLI, base, and subagent packages. All 128 registry tarballs
passed SHA-512 integrity validation. After normalizing the dsh version strings,
all 64 manifests are identical, including exports and non-dsh dependencies.

61 packages are byte-identical outside `package.json`. The remaining changes
are browser file-card layout in `client-ui-deliverables`, SVG artwork in
`client-ui-primitives`, and a comment in `message-feedback`. The deliverables
projection, Remote/controller contracts, connection, conversation, subagent,
CLI, and base implementations used by the terminal are unchanged. No runtime
adapter rewrite was needed for this upgrade.

## Candidate and observed results

Candidate: `.artifacts/dsh-rc2-final/seektty-1.2.6.tgz`.

SHA-256: `d9a48383c7f20592117971fb32eae47fef50bc66181318aa1868f75a49d7fd85`.

| Check | Observed result |
| --- | --- |
| Frozen pnpm install | Passed |
| `pnpm run check` | Typecheck, 178 test files, 1546 passed / 1 skipped, build, and 28-entry pack check passed |
| Committed build synchronization | Rebuilding produced no difference from the staged `lib/` output |
| Official stock Host | CLI and all 231 resolved dsh packages verified at exactly rc.2 |
| `stock-dsh-cycle.mjs` | Actual candidate install, boot, remove, reinstall, isolated launcher, and module-identity checks passed |
| `native-dsh-acceptance.mjs` | All 25 recorded steps passed using the candidate above |
| `native-management-acceptance.mjs` | All 17 recorded steps passed using the same candidate |
| pnpm 11 GVS disabled | Full official dsh and SeekTTY lifecycle passed |
| pnpm 11 GVS enabled | Reproduced and correctly classified the known dsh/Cordis loader incompatibility; positive boot did not pass |
| Latest-version scan after adaptation | Tested and latest both rc.2; `updateAvailable: false` |

The native PTY run covered streaming, cancel, Session search, tool output,
questions, denied and allowed approvals, subagents, images, produced files,
Markdown/ZIP export, clean exit, and resumed history/new turns. Management
covered settings persistence, language, welcome preferences, theme import and
export, Provider operations, plugin install/remove with restart, and Profile
creation/copy/switch. Model responses came from local loopback fixtures.

Local evidence logs are `/tmp/seektty-rc2-check-final.log`,
`/tmp/seektty-rc2-stock-cycle-final.log`, `/tmp/seektty-rc2-native-final.log`,
`/tmp/seektty-rc2-management-final.log`, and `/tmp/seektty-rc2-gvs-{false,true}.log`.
The acceptance logs identify their temporary report and terminal-snapshot
directories. Generated evidence and installed Host packages are not committed.

## Reproduction and limits

Build with `pnpm install --frozen-lockfile && pnpm run check`, then pack with
`pnpm pack --pack-destination .artifacts/dsh-rc2-final`. Install an unchanged
official Host using `node scripts/install-stock-dsh.mjs` and pass its `DSH_BIN`
and the absolute candidate `SEEKTTY_SPEC` to the stock and native acceptance
scripts. Native PTY acceptance also takes the matching `DSH_ENTRY`. Management
acceptance takes `SEEKTTY_PNPM_ENTRY`, the installed pnpm CLI JavaScript entry.
Both scripts allocate isolated Harness homes; neither uses personal Sessions
or credentials.

The local checks do not establish Windows/Linux or Node 22 acceptance, real
GUI-terminal mouse/clipboard behavior, paid external-provider behavior, or
optional Clarify/Vision-Exp combinations. GVS remains disabled per package-tree
mutation. No push, PR, or npm publication was performed for this adaptation.
