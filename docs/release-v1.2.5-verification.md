# SeekTTY 1.2.5 — Owner review and release checklist

This is the review record for the `1.2.5` release candidate. It is not evidence that `v1.2.5` has been tagged or published.

- Previous published release: `v1.2.4`.
- Candidate branch: `codex/release-1.2.5`, based on current upstream `main` plus the pnpm 11 layout adapter and release-document updates.
- Candidate artifact: `seektty-1.2.5.tgz`, built with pnpm `11.7.0`.
- Tested Host: unmodified official `@deepseek-ai/dsh@0.1.1-rc.2`.
- Release notes: [English and Chinese in one document](release-v1.2.5.md).
- Publication status: **not tagged, not released, and not published to npm**.

No credentials, Profile/Session contents, raw terminal logs, personal themes, or generated package-manager caches belong in this review evidence.

## Review map

| Area | Primary implementation and evidence |
| --- | --- |
| Per-command pnpm policy | `src/pnpm-compat.ts`, `src/bin.ts`, `src/host/profile-plugin-manager.ts`, launcher/plugin tests |
| Exact failure classification and recovery | `src/pnpm-compat.ts`, `src/bin.ts`, `tests/pnpm-compat.test.ts`, `tests/launcher.test.ts` |
| Profile plugin commands and help | `src/client/actions.ts`, `src/client/help.ts`, `src/host/profile-plugin-manager.ts` |
| Real layout lifecycle | `scripts/pnpm11-layout-acceptance.mjs`, `scripts/stock-dsh-cycle.mjs`, `scripts/mouse-pty-harness.mjs` |
| Shared candidate CI | `.github/workflows/ci.yml`, [layout acceptance record](pnpm11-layout-acceptance.md) |
| Package and documentation contract | `tests/package-contract.test.ts`, both READMEs, generated `lib/`, pack allowlist |

## Candidate evidence

The final values below must describe the exact package inputs proposed for Owner review. GitHub-hosted matrix results remain separate from local Windows evidence.

| Gate | Result |
| --- | --- |
| `pnpm run check` | Pass — 117 test files; 1051 passed / 1 conditional skip; typecheck, build, and pack check passed |
| Tracked `lib/` and launcher `--version` | Pass — generated bundle rebuilt; launcher reports `seektty 1.2.5` and tested dsh `0.1.1-rc.2` |
| Package allowlist | Pass — 24 packaged entries; no Profile, Session, `.env`, cache, or personal theme paths included |
| Structural TUI performance | Pass — 12 isolated runs at 1k / 10k / 50k / 100k transcript lines, 80 columns × 24 rows |
| Windows GVS=false isolated lifecycle | Pass — official dsh install plus add, boot, remove, re-add, second boot, launcher isolation, and Host identity checks |
| Windows GVS=true compatibility branch | Pass as a diagnostic gate — real paths entered `store/v11/links`; the exact current dsh/Cordis failure and recovery advice were classified. This is not a claim of GVS=true support |
| GitHub CI, Windows/macOS/Linux × Node 22/24 | Pending PR checks; Owner must review |

Candidate SHA-256 (`seektty-1.2.5.tgz`): `16c6b46de8bfdfc015864dade138c3eb6b54733d78b9952668433393c4d33e62`.

Local evidence was collected on Windows `10.0.22631`, x64, Node.js `v26.1.0`, pnpm `11.7.0`, against the unmodified official dsh `0.1.1-rc.2`. The package targets Node `^22.19.0 || >=24`; the PR matrix separately covers Node 22 and 24.

Local process gates do not substitute for manual GUI-terminal, clipboard, network Provider, or optional-plugin acceptance. CI runners are not evidence of macOS/Linux desktop terminal interaction.

## Reproduce the candidate in isolation

Use a new terminal and a disposable directory. Do not point `DSH_HOME` at a normal Profile.

### Windows PowerShell

```powershell
pnpm install --frozen-lockfile
pnpm run check
$reviewRoot = Join-Path $env:TEMP ('seektty-125-review-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $reviewRoot | Out-Null
pnpm pack --pack-destination $reviewRoot
$env:DSH_HOME = Join-Path $reviewRoot 'dsh-home'
$env:SEEKTTY_UPDATE = 'off'
$env:SEEKTTY_SPEC = Join-Path $reviewRoot 'seektty-1.2.5.tgz'
dsh plugin --profile tui add --config.enable-global-virtual-store=false $env:SEEKTTY_SPEC
dsh --profile tui
```

### macOS / Linux

```sh
pnpm install --frozen-lockfile
pnpm run check
review_root="$(mktemp -d "${TMPDIR:-/tmp}/seektty-125-review.XXXXXX")"
pnpm pack --pack-destination "$review_root"
export DSH_HOME="$review_root/dsh-home"
export SEEKTTY_UPDATE=off
export SEEKTTY_SPEC="$review_root/seektty-1.2.5.tgz"
dsh plugin --profile tui add --config.enable-global-virtual-store=false "$SEEKTTY_SPEC"
dsh --profile tui
```

Press Esc at first-run credential setup for local-only testing. Use no real credentials in disposable fields.

The dedicated layout gate installs its own official dsh and candidate under isolated pnpm and dsh directories:

```sh
pnpm test:pnpm11-layout false /path/to/candidate-directory
pnpm test:pnpm11-layout true /path/to/candidate-directory
```

`false` must complete the stock lifecycle. `true` must either complete after an upstream fix or prove the real GVS layout and classify the exact current dsh/Cordis loader failure. A known, correctly diagnosed upstream failure is not the same as GVS=true support.

## Owner sign-off

- [ ] Review the source adapter and exact dsh range; confirm it does not alter global pnpm configuration or Profile ownership.
- [ ] Confirm CI uses one uploaded candidate across all six OS/Node combinations and review every matrix result.
- [ ] Download or locally produce the exact candidate, verify its allowlist and SHA-256, then run an isolated install and boot.
- [ ] Confirm the failure message contains no credential and does not misclassify unrelated loader failures.
- [ ] Decide whether pending macOS/Linux real-terminal checks block publication or should remain explicitly untested.
- [ ] Explicitly authorize tag and GitHub Release creation in a separate action. Merging this PR alone is not publication authorization.
- [ ] Keep `private: true` unless npm identity, access, Trusted Publishing, provenance, and rollback are separately reviewed and approved.

## Publication procedure — Owner only, after approval

1. Confirm the merge commit has green required checks and no package-input changes after the reviewed artifact was produced.
2. Rebuild `seektty-1.2.5.tgz`, verify its allowlist and checksum, and store `SHA256SUMS` outside the checkout.
3. Create `v1.2.5` at the exact approved commit and prepare a **draft** GitHub Release using [the bilingual notes](release-v1.2.5.md).
4. Attach the tarball and `SHA256SUMS`; verify version, tag, filename, and checksum before publishing the draft.
5. After publication, download the assets again, compare SHA-256, and repeat isolated installation from the downloaded package.

This candidate intentionally has no automated publishing workflow and no npm Registry publication step.

## Rollback

No state migration is introduced. Close SeekTTY, retain the affected Profile, and reinstall the published predecessor with native reconciliation:

```sh
dsh plugin --profile tui add --config.enable-global-virtual-store=false https://github.com/Hilbert-beinghappy/seektty/releases/download/v1.2.4/seektty-1.2.4.tgz
```

Do not delete `DSH_HOME`, Settings, Sessions, or plugin manifests. If the global launcher is also under review, pin `SEEKTTY_SPEC` to the same known-good tarball and keep automatic updates disabled while testing.

## 中文审核摘要

本文件对应 1.2.5 Release 候选，不代表已经打 tag、创建 GitHub Release 或发布 npm 包。候选版本只增加 pnpm 11 包布局适配、精确故障诊断、跨平台共享候选门禁，并同步版本与过时文档；不迁移 Settings、Profile 或 Session，也不改变现有 TUI 功能。

Owner 需要审核适配器范围、六组 CI 矩阵、精确候选包、打包白名单和 SHA-256，并在隔离 `DSH_HOME` 下启动验证。GVS=true 当前若命中已知上游 Loader 错误，只能说明诊断正确，不能宣称已经支持该布局。macOS/Linux CI 与真实桌面终端人工验收继续分开记录。

合并这个 PR 不等于授权发布。只有 Owner 后续明确批准，才创建 `v1.2.5` 和 GitHub Release。包继续保留 `private: true`；npm 身份、权限、Trusted Publishing、provenance 与回滚没有单独审核前，不进行 npm 发布。
