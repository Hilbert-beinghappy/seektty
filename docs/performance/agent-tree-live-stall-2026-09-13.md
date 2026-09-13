# Agent tree evidence growth during a live stall

## Evidence

The user confirmed the existing mouse-mode process was currently lagging. A
20.353-second CPU profile was collected from that process without restarting or
pausing it (Node 26.1.0, official dsh 0.1.5-rc.1, SeekTTY commit 3458797).
The loopback inspector was closed after collection. Session contents were not
read. The raw local profile is intentionally not part of the package or commit.

`reduceAgentTree` accounted for approximately 12.39 seconds of self samples.
Additional time was spent in `appendEvidence` and its array-search callback;
GC accounted for approximately 0.98 seconds. The dominant callers were the
public status subscription and `refreshVisibleStatus` reached through `resume`.
Heap usage at collection was approximately 813 MB; this single reading alone
does not establish a memory leak.

Each global list notification minted a fresh local lifecycle evidence ID even
when a child's lifecycle had not changed. The reducer copied its accumulated
deduplication Set, scanned accumulated node evidence and appended another record.
Repeated catalog reads also minted loading/catalog evidence for unchanged data.
Consequently ordinary stream notifications created growing presentation history.
The previous notifier/stream fairness repair did not remove this work.

## Repair and boundaries

- Both status entry points suppress an observation when the node already has
  the same Session-derived lifecycle. Catalog-derived status still receives the
  first authoritative Session observation. Actual lifecycle changes and restarts
  continue through the existing reducer and ordering rules.
- Background catalog reads compare the complete public catalog serialization
  against the previous catalog for that parent. Unchanged data neither marks the
  tree loading nor replays stale catalog lifecycle over a newer Session status.
  Explicit refresh still shows loading and reapplies the result.
- Root changes clear catalog snapshots. Unsupported/error responses invalidate
  them, allowing an identical successful retry to restore loaded state.
- This changes presentation observation admission only. No Harness Session,
  persistence, reducer deduplication or evidence ordering contract is replaced.
  The comparison is proportional to the public child catalog, not transcript
  length. Genuine lifecycle/catalog changes still retain reducer evidence; this
  is not a claim that an unlimited number of real state transitions is bounded.

## Regression coverage

A collapsed running child receives 20,000 iterations of status notification,
resume/status reread and awaited catalog reload. The node and evidence-array
identities must remain unchanged, then completion and restart must still apply.
Separate checks cover child discovery/renaming, error recovery, explicit refresh
and root switching. Existing reducer tests retain stale/duplicate evidence and
terminal-state ordering coverage.

The stress fixture verifies structural stability, not a substitute for another
long interactive run in the user's terminal. In particular, it cannot certify
that every possible source of mouse lag has disappeared.

Validation on Windows: the old code fails the unchanged-node assertion with a
200-iteration version of the fixture; the repaired code passes 20,000 iterations.
`pnpm run check` passes (180 files, 1,556 tests passed, one skipped), including
build and package checks. The final tarball passes isolated install, boot,
remove and reinstall with unmodified official dsh 0.1.5-rc.1 (231 exact official
packages verified), plus the ConPTY mouse/menu harness with normal exit code 0.
The PTY checks are not a GUI-equivalent long-duration acceptance test.
