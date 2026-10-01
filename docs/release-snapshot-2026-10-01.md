# Clean terminal-adapter release snapshot

Release branch: `codex/seektty-rc2-terminal-release`. Source snapshot: **07d9558915b81abe2c82e501a7722ca134bcc601**, directly parented by PR211 head **00dba96f32fc2e02bcd8544c325c4e1bb8a97a67**. Draft PR base remains `codex/adapt-dsh-0.2.0-rc.2`, avoiding the duplicate compatibility update while PR211 is open. No push or PR was performed.

The earlier integration branch remains at294396d5aeb4be3eaa10be68874e12cda67ed3a2, and its original205207c package remains preserved. The release snapshot does not carry its65 intermediate development commits. Subsequent acceptance-document commits change no package content. Temporary release-staging objects were retained in a private local ref rather than deleted; they are outside the proposed release history.

## Privacy and portability scope

Real personal checkout/tool paths were removed from acceptance/handoff and older task documents. Private review-directory references became revision/digest-based public acceptance summaries and repository reproduction commands. A pasted-path parser fixture uses synthetic user/account/file identifiers with the same path/escaping cases. No test was removed or changed into a skip.

The two public Host-file/WAV tests default to normal project `createRequire(import.meta.url)` dependency resolution. An independently installed official fixture may still be selected explicitly through `SEEKTTY_STOCK_NODE_MODULES`/`SEEKTTY_OFFICIAL_NODE_MODULES`; no developer checkout is assumed. Their missing native dependencies are now declared as exactrc.2 development dependencies: `dsh-fs-local`, `dsh-experimental-speech-to-text` and `dsh-experimental-api-speech-to-text`. This does not install/enable experimental services for users or add production-native dependencies.

The first two release commits were checked for the specifically targeted personal checkout/tool paths, private review/task/Library references, credential/private-key token patterns and tracked runtime artifacts. Their newly added content had no findings for those patterns; this is not a claim that the entire inherited tree or all historical paths were exhaustively cleared. Independent review subsequently found macOS temporary-directory references inherited from the already-public PR211/main baseline in two older documents; the current documentation replaces them with generic temporary-directory/run placeholders. Synthetic paths such as `/Users/me` and `/Users/fixture-account` remain intentional parser examples. `.artifacts`, logs, tarballs, raw terminal captures, Session JSONL and credentials remain untracked. Already-remote base history and the earlier release commits are preserved, not rewritten; inherited historical content and newly introduced publication content are distinct audit scopes.

## Exact package mapping

New immutable tarball: `.artifacts/release-07d9558/seektty-1.2.6.tgz`.

**SHA25653a0fef70619edd057b571f3bc05946b7e879ff702dbcd28511d7e35389eaeea**.

The previous independently accepted package is SHA25616a14965908f3068ce74c999d9a9ad280c3ec09e4bc50643677ce0f1acfd7e51. A complete55-member comparison found exactly one changed member, `package/package.json`, containing only the three additional development dependencies. The other54 members, including all23 production `lib` JS files, are byte-identical. Production dependencies, peers, native Bundle patch, optional compositions, executable code and published README are unchanged.

`src`, `lib`, `vendor`, optional compositions and the native patch match the preserved294396d tree. Thus this is document/test/fixture/development-metadata cleanup, **not a runtime change**. A fresh immutable07d9558 Git archive build also produced23 JS files identical to tracked outputs and the new tarball.

## Completed gates

| Gate | Result |
| --- | --- |
| Affected file/WAV/path-parser regressions with explicit official fixture | 3 files,23 passed |
| Disposable source archive with normal project dependency view and no fixture override variables | 3 files,23 passed; dependencies are read-only links, not a fresh package installation claim |
| Full suite with verified official/optional fixtures | 241 files,2369 passed,1 existing optional Clarify-install skip |
| `tsc --noEmit`; centralized `tsdown`; fresh Git archive build | Exit0; all23 generated/tracked/packed JS files identical |
| Package check | Exit0;55 allowlisted members |
| pnpm11.7.0 lock supply-chain verification |602 entries passed; lockfile-only, no package scripts/shared dependency installation |
| New tarball stock lifecycle | Unmodified official0.2.0-rc.2,278 exact native packages; isolated HOME/XDG/DSH_HOME; install/launch/remove/reinstall exit0 |

Local machine-readable mapping is excluded from Git at `.artifacts/release-07d9558/privacy-and-candidate-map.json`; source/lib proof and gate logs are beside it. Reproduce contract and lifecycle tests using `scripts/acceptance-run-isolated.mjs`, `scripts/settings-default-pty.mjs`, `scripts/pack-check.mjs` and the commands in `remaining-terminal-acceptance-2026-10-01.md`, supplying this exact new digest.

One sandbox lock-verification attempt was interrupted after DNS failures; the authorized read-only registry-metadata retry passed all602 entries. An initial privacy helper could not parse Git's quoted non-ASCII filenames; the complete scan was rerun with NUL-delimited filenames. Failed attempts were not counted as passes.

## Independent runtime evidence and limits

The old immutable16a149…7e51 package passed default privacy/Host-watch PTY,26 core and17 management steps. Its final independent WAV check used the unchanged official Loader/SpeechController/Gateway and an explicitly inert recognizer: catalog, exactly one explicit preparation, legal3244-byte WAV, reviewed insertion and undo; a second dispatched transcription cancelled before a5s late result kept the new draft, with no retry or model request. The original restricted-Context P2 is closed.

Those are exact old-package PTY results, associated with this release through the complete production-byte mapping. They are **not a claim that every PTY journey was rerun on the new metadata-only tarball**. The new tarball did rerun its stock lifecycle. Real ASR, model downloads, real-time microphone capture, live SSH credentials, browser sessions and desktop OS actions remain untested; real-time microphone capture is not implemented by the WAV-only entry. React-only slots and browser WebWorker preview remain terminal-inapplicable. Native path-based Host reads remain best effort, not an atomic TOCTOU fix. GVS=false remains the verified lifecycle setting.

The127-row ledger retains individual implementation/inheritance/N/A/untested boundaries; a total test count is not a certification of127 separate interactive journeys. Publication remains explicitly withheld pending the parent's instruction.
