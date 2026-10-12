# F091 bounded display repair

`foldLineBlock` now keeps head/tail source lines (100 + 100 at the existing default), with one exact middle-omission marker. It preserves an original EOF newline. Small caps remain bounded; a cap of one keeps the last line. The function signature is unchanged; existing Transcript expanded rows and selection/copy automatically consume the repair. No transcript/surface wiring or default Settings/render mode change is required.

No text is classified as an authenticated spill reference. Unknown/forged footer text receives exactly the same retention. No path is opened, locator is dereferenced, missing bytes are reconstructed or Host budget is changed. The bound remains logical output lines, not bytes or wrapped terminal screen rows, as before. The explicit existing zero-limit preference remains unchanged. Very long multiline notices can themselves exceed the retained tail; the published local store's current recovery notice is one logical line.

Fixture provenance: untouched published `@deepseek-ai/dsh-spill-policy@0.2.0-rc.2` `lib/types/notice.js` formatter was executed read-only with `formatSpillNotice({kind:'exact',count:98765}, {locator:'/isolated-fixture/session-owned/spill.txt', retrievalHint:'Use read with offset/limit, or grep this path to search within it.'}, 2)`. The result matches the test constant. Official policy merges adjacent text and appends this notice to retained content. This is a shape/presentation fixture; it does not assert authenticated origin or real spill creation.

Actual validation (Node 24.20.0):

- Focused tool folding, spill, expansion and selection suites: 4 files, 56 passed.
- Typecheck: passed.
- Full own-branch suite: 185 files passed; 1626 passed, 1 skipped. Log `.artifacts/spill-full-suite.log`. No final tarball/build/lifecycle rerun for this display-only repair; E owns final lib and immutable package acceptance.
- Public full-record path: froze E committed `e8e48eac51ba9f4460636cc1acfd07942d2f6481` with `git archive` under `.artifacts/spill-frozen-e8e48ea` (not a new worktree), applied only this branch's line-fold helper and new test fixture. New actual `/trajectory` entry test + E's five existing public Session/artifact tests: 6 passed. The direct recorded-view fallback for absent Trajectory projection was exercised through real TuiActions/HarnessTuiCapabilities/Session and a mocked native history reply. Original retained text, its middle and recovery notice stayed intact; no credential/model/upload/filesystem recovery action ran. Log `.artifacts/spill-public-entry.log`. Missing committed source-map warnings did not prevent passing tests. E's worktree/WIP was never modified or imported.

To include the public entry regression in E's normal suite, add a new test wrapper (this branch intentionally does not yet contain those E modules):

```js
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'
import { registerRecordedSpillEntryTest } from './fixtures/tool-output-recorded-entry.js'
registerRecordedSpillEntryTest({ Session, HarnessTuiCapabilities, TuiActions })
```

Name it `tests/tool-output-recorded-entry.test.js`. The committed fixture contains the assertions and exact flat native message; this wrapper was used in the frozen archive. Recorded artifacts expose full *retained Host content*; recovering Host-spilled omitted bytes is a separate permission-bound Host operation, not something this fix reconstructs.

Separate account review repair preceding this change: `c87ea3deb367639be6484b06cc67dcf58b022191`. Its original independent six checks (including the failed deferred-cancel counterexample) and fifteen account tests passed; typecheck passed. The initial loopback test hit sandbox EPERM, then passed with authorized escalation. No unknown cancellation outcome is represented as completed or automatically retried.
