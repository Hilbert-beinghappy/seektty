# F094/F023 — published dsh 0.2.0-rc.2 presentation adapter

Baseline: `17770b9bfa12671c13fac80d2c040eb935ee25ed`.
Fixed worktree: `/tmp/seektty-height-clipboard-t07`.
Branch: `codex/seektty-f094-f023-20260930`.

## Implemented

- F094: `experimental-package.ts` follows the exact official ui-plugin-manager
  rule, `name.startsWith('@deepseek-ai/dsh-experimental-')`. Installed list,
  center, detail and existing plugin choices use the shared display identity.
  The badge precedes the name because the existing list truncates its label
  column. Package name/spec/version, choice ids and all mutations are unchanged.
  No label asserts that an unmarked package is stable.
- F023: decorate only an already-advertised Host `auto` permission option with
  an experimental label and risk/token explanation. The Host catalog, current
  projection, separate default catalog and conservative confirmation gate are
  unchanged. No plugin is enabled or permission changed by this adapter.
- `NativeInteractions` snapshots the official localized `displayReason` without
  translating, sanitizing or changing the audited `reason`. The transient frame
  type and parser retain that optional dictionary through the existing pending
  wait. Replay preserves its values and original interaction identity.
- `composeApprovalDetail` selects current-locale copy then English; absent copy
  uses the existing reason. Terminal controls are sanitized at presentation;
  long single-line prompts also obey the existing 1200-character visible budget
  and retain the safe full-detail page.
- Tool cards classify final Auto denials only when `isError` and both official
  error fields match `AutoReviewDeniedError` / `AUTO_REVIEW_DENIED`. The folded
  title shows Auto/experimental/denied; expansion retains the reviewer reason
  and original tool body. Technical review failures keep their generic failed
  presentation. Neither tool names nor error text establish denial identity.
- A throwing approval terminal observer now withdraws its wait and settles as
  `unavailable`. A failed withdrawal notification cannot strand the outcome or
  leave a late grantable wait. Only `allowed-once` remains a grant.

## Exact remaining E wiring

The allocation restricts D's `actions.ts` changes to plugin list/detail; the
approval call below is therefore **not changed in this commit**. In
`TuiActions.approval()`, add this spread to `composeApprovalDetail({...})` next
to the existing `reason` spread:

```ts
...(wait.payload.displayReason === undefined
  ? {} : { displayReason: wait.payload.displayReason }),
```

The locale defaults to `uiLocale()` inside the helper. Do not replace `reason`
or infer Auto from its text. Current permission choices already show the Auto
experimental badge. No additional protocol registration is needed.
Until E applies this spread, the actual approval overlay still receives only
the original reason: the localized end-user entry is not yet complete. The
official fixture tests the frame-to-composer boundary, not that missing action
call. After wiring, E should verify a pending localized approval overlay in both
locales, rejection, Escape/cancellation, and late/cross-session responses.

## Actual validation (2026-09-30)

Node `/opt/homebrew/opt/node@24/bin/node` (24.20.0). Unmodified published fixture
packages from explicit `SEEKTTY_OFFICIAL_NODE_MODULES`, never a user Profile.
The fixture executes the real Auto plugin and ApprovalService with inert
Session/LLM seams; the fixed review stream never calls a model, tool body,
credential source or external endpoint. It exercises localized ask/audit,
structured denial, failed review, a failed terminal observer, cancellation,
late/cross-session answers, and bypass for a non-Auto Host preset.

- Targeted: **7 files / 100 tests passed** (`experimental-package`,
  `auto-review-presentation`, `auto-review-official`, `native-interactions`,
  `approval-preview`, `permissions`, `transcript`).
- Full `vitest run` with the explicit official fixture path: **225 files,
  2210 passed, 1 skipped**. This includes isolated existing receipt loopback tests.
- `tsc --noEmit`: **passed**.
- `git diff --check`: **passed**.

Logs: `/tmp/seektty-f094-f023-targeted.log`,
`/tmp/seektty-f094-f023-full.log`, `/tmp/seektty-f094-f023-typecheck.log`.
Earlier failed test attempts remain accurately described in progress messages;
these counts describe the corrected implementation's completed runs.
No build, pack/install/boot/remove/reinstall or final PTY acceptance was run in
this task. E owns generated `lib` and final assembled-package validation.
The earlier untracked coverage audit is preserved and excluded from this commit.

## Separate review correction: SGR conceal at the approval boundary

The shared theme sanitizer intentionally preserves numeric SGR for trusted UI
styles. An untrusted reviewer reason ending in `ESC[8m` therefore concealed the
subsequent tool preview. `plainApprovalText` now removes the remaining SGR after
the shared control sanitizer, only in approval composition; raw audit and prompt
dictionaries and global theme rendering are unchanged. This also removes color,
inverse and conceal styles from the original-reason fallback, preview and full
detail text.

The new regression loads the unmodified official Auto plugin, returns a fixed
high-risk denial containing conceal SGR, verifies the actual ask still contains
it, then renders `composeApprovalDetail` through the real `SearchSelectOverlay`
into xterm/headless. Every command cell must have `isInvisible() === 0`, for both
localized copy and original-reason fallback. Unit cases cover color/inverse/C1
controls and audit immutability too. Corrected targeted run: **104 passed**;
typecheck passed. The full 2210-pass run above predates this separate correction;
it is not counted as a post-correction full run.
