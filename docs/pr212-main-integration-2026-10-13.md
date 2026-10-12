# PR212 integration after PR211

PR211 is merged into `main` at `ab32ab2fb250b9b4737ff8c47f44f6ce76246eea`. PR212 now targets `main`. Merge commit `e7dab51` incorporates that main revision into the existing terminal feature branch without rewriting its commits. The single add/add conflict was in `tests/module-file-identity.test.js`: retain the three physical identity controls and the Windows directory junction from main, alongside PR212's five cold-presenter regressions.

The follow-up fixes Windows validation: OS temporary directories instead of `/tmp`, POSIX mode assertions on POSIX platforms, real Node child pipes instead of executable shebang requirements, file URLs for the official Creator Loader, directory junctions for optional fixture dependencies, and Windows pnpm shims/PATH delimiters. The isolated wrapper verifies the official CLI behind its shim and supplies disposable HOME, USERPROFILE, XDG and DSH_HOME paths. The attachment cancellation regression now controls its deadline after real filesystem intake reaches the carrier, avoiding an 80 ms wall-clock race with a cancelled/reconnected upload. Tests and their late-result assertions remain present; no new skips were introduced.

Production source, vendor code, dependencies, lockfile, Bundle manifest and optional compositions are unchanged from PR212 head `27138b9eae271d3a56effa391aa578c1cc5df87d`. All **23** runtime JS files in the freshly built tarball were compared byte-for-byte against that Git revision and matched.

## Fresh candidate and local gates

Node **22.23.3**, pnpm **11.7.0**, unmodified official **dsh 0.2.0-rc.2** with **278** exactly pinned native packages. The registry check still reports `tested == target == 0.2.0-rc.2`, with no latest-channel update available.

Candidate: `.artifacts/dsh-latest-20261013/pr212-candidate/seektty-1.2.6.tgz`.

SHA256: `a7466b2c9b15df4febfc96db55bfc1057150e28fedbabe148f45e5fe8774df0f`.

| Gate | Observed result |
| --- | --- |
| Frozen dependency installation | Passed; committed lockfile unchanged |
| Full check with verified official/optional fixtures | Typecheck, **242 files / 2369 passed / 4 existing platform or optional skips**, build and **55-member** package check passed |
| Existing skips on Windows | Optional Clarify installation, two POSIX writer termination cases, POSIX FIFO case |
| Conflict regressions | Physical aliases/copies/generated probe and cold-presenter cleanup: **8/8 passed** |
| Generated runtime | All 23 packed JS files exactly match original PR212 Git blobs; no committed lib drift |
| Stock lifecycle | Fresh isolated installation, boot, removal, reinstallation and module/launcher gates passed; wrapper and child exited **0** |
| Native terminal | **26** steps on this exact candidate passed, including clean initial/resumed exits; wrapper and runner exited **0** |
| Native management | **17** steps on this exact candidate passed, including settings, Provider, plugin and Profile persistence/restarts; wrapper and runner exited **0** |

Logs and machine-readable reports remain under `.artifacts/dsh-latest-20261013/`, including `pr212-check-stable.log`, `pr212-packed-runtime-report.json`, the three `pr212-{stock,terminal,management}.log` files and `pr212-acceptance/*/wrapper-report.json`. Native logs identify their temporary journey reports. Run `scripts/acceptance-run-isolated.mjs` with the exact candidate/hash, official shim/entry, installed pnpm entry, fresh output directory and the selected `stock`, `terminal` or `management` suite.

Initial Windows full checks exposed the fixture path/permission/executable assumptions and Creator Loader path handling. A later full run exposed the attachment timer race; these failed attempts are retained in local logs and are not counted as passes. The final complete check and all three isolated candidate suites passed.

Model requests used loopback fixtures; the management theme journey additionally fetched a public HTTPS theme. No real credentials, personal Profiles/Session history, real ASR, microphone, SSH deployment, browser or desktop device operations, or paid model requests were used. These gates do not expand the original 127-row ledger into 127 independent PTY journeys. GVS=true retains its previously classified upstream loader limitation. GitHub CI and merge state are recorded on PR212 separately; no npm publication or Release is part of this integration.
