# F062 / F117: Host files and terminal observation

Base: `17770b9bfa12671c13fac80d2c040eb935ee25ed`. Tested native range: **dsh 0.2.0-rc.2 only**, release `639ed015397290b3745d163aafe02ffee4aa3f84`.

The implementation contains a working file controller, native watch lifecycle, live navigated terminal view, directory browser and bounded binary viewer. `artifactViewCommand` now reaches the live viewer through either `OverlayManager.navigate` or an already open `OverlayNavigation` when complete Host ports are supplied. Until E supplies those ports, the old read-only bridge retains its manual viewer. This commit does **not** mark production F062/F117 acceptance complete: public bridge/actions/context integration and final PTY are E's remaining gate.

## Published contract and deliberate boundary

Source of truth: unchanged npm `@deepseek-ai/dsh-api-workspace-files@0.2.0-rc.2`, `lib/typert.host.js`, `lib/types/types.d.ts`, `lib/types/index.d.ts`, `lib/index.js`. Registry SHA512: `X2mKXzaWOjTv2rBvZl4GyKsB63ZUHJZaq9KX2r+yaMJfguxMkWMCx0to6bdp2BPrzaD826X1D672hFY6Ps/0jA==`. Host source locations retained by those published descriptors:

| Method | Source | Wire/business distinction |
| --- | --- | --- |
| `workspaceFiles/read` | `packages/api/workspace-files/src/index.ts:233` | `workspaceFileScopeId`, `path`, required `range`; text lines are 1-based |
| `workspaceFiles/readBytes` | same file `:257` | required `options`, optional `range` and `baseFile`; byte offsets are 0-based; generated binary encode/decode are retained |
| `workspaceFiles/stat` | same file `:290` | absolute execution-world path, opaque version, optional bytes |
| `workspaceFiles/list` | same file `:303` | output path is workspace-relative; direct entries and `truncated`; no offset or cursor exists |
| `workspaceFiles/changes` | same file `:340` | stream begins with `ready` only after watcher initialization, followed by target metadata invalidations/deletions |

All five descriptors use service/namespace `workspaceFiles`, exact package-qualified id, direct invocation, **no Agent scope**, a `workspaceFileScope` lookup (wire `workspaceFileScopeId`, SessionId strict codec) and injected cancellation `signal`. The adapter validates all parameter/result type symbols, ordered names/sources, implementation, strict codecs and binary codec presence, plus inert invalid-value probes. A foreign service/implementation carrying the official codec labels cannot dispatch. Authorization, mounted service and current descriptor are checked each time, including after unary responses and each stream frame.

The published rc.2 file `read/stat/readBytes/changes` contract permits files readable by the configured backend outside workspace; directory `list/changes` checks workspace containment. The terminal browser applies **best-effort lexical/canonical path filters** before dispatch and to returned metadata. These are navigation/response checks, **not an atomic workspace-only security boundary**. A directory or symlink replacement after stat can redirect a native open while its response still reports the earlier inside path and version. Normal explicitly authorized Host reading retains the provider's read authority; the adapter does not broaden it. Unknown permission, missing plugin/service/descriptor or absent authoritative root disables actions.

The workspace root must be the canonical **execution-world** root. If a Session header cwd is an alias (for example macOS `/tmp` versus `/private/tmp`), E must resolve it through the Host's existing `ctx.fs.resolve` + `processPath` before publishing the file-view source, and fence that result to the same Session/generation. Do not canonicalize it with client `realpath`, `stat` or `process.cwd`. Until the canonical Host root is confirmed, return unavailable; the controller fails closed rather than reading a same-name local target. The native scope lookup still derives its own root from Session header/persistence/sandbox policy; it is not replaced by a client-supplied scope object.

Content and selected-file watch ports require confirmed native `stat` permission/descriptor too. Preflight metadata can filter an already redirected path and observed version drift; neither another stat nor the returned path/version proves what a later open actually read. The current adapter keeps those existing filters without adding more stat calls or claiming they close the race. Initially absent files and directory watch targets are rejected by this selected-regular-file adapter with the native stat reason; existing-file deletion/recreation remains observable on the same live watch. Directory browsing/refresh uses `list`; no directory watch capability is implied by that view.

### Explicit strict requirement and upstream limit

`HostFileOptions.strictConfined` and `WorkspaceFileAdapterOptions.strictConfined` express a consumer's requirement, not a newly invented native capability. Absent/false preserves normal authorized Host operations. True fails closed before **any** Gateway/port call with `Strict workspace confinement is unavailable`; both the client controller and Host adapter enforce it, including byte reads and watches. `HOST_FILE_READ_BOUNDARY.atomicStrictConfined` / `adapter.boundary.atomicStrictConfined` is false for the tested release. Native descriptor availability, a preflight stat, a canonical root and `sandboxMode` must never be converted to true for this guarantee. The terminal text, directory and binary views state the backend read boundary.

Published evidence: `dsh-fs/lib/types/index.d.ts` exposes path-shaped `FsTarget`, resolve/contains/stat and read/stream operations; it exposes no opened-file handle or atomic root-confined read. `dsh-fs-local/lib/index.js:387/420/451` reopens `target.targetKey` with `createReadStream` after its checks. `workspace-files/lib/index.js:425/446` reports the metadata obtained before content reads. `dsh-fs-sandbox@0.2.0-rc.2/lib/types/index.d.ts` explicitly says reads pass through and declares only mutation fences (`writeText/editText`); the mode therefore cannot prove confined reads. The Local read race cannot be repaired using a public provider primitive available at this seam. A future provider integration needs a real documented atomic read guarantee and separately tested binding of result/handle to the confined target; no such existing capability is fabricated here.

Threat model: the race actor can rename/replace a workspace ancestor directory or symlink while an authorized Host read is pending. For a backend already permitted to read the outside target, a normal read may return outside content. The response checks can also reject only **after** outside content has already been read. Deployments or actions that require confidentiality against this actor must request `strictConfined: true` and accept the unavailable gate until a proven upstream primitive is present. This is distinct from an unprivileged actor unable to replace those paths, and from direct malicious code in the already trusted Host/provider.

## Minimal integration for E (shared files not edited here)

1. `src/host/session-management-bridge.ts:58`: replace the handwritten `artifacts.read` Gateway call with `createWorkspaceFileAdapter`. Supply `gateway: ctx.typertGateway`, current registry accessor, current service accessor, existing authenticated surface permission check in `authorize(method, sessionId)` and a Host-derived canonical root getter in `workspaceRoot(sessionId)`. The root getter is assembly metadata, **not a new Remote method**. Do not turn an absent authorization result into true or activate an Agent to obtain a cold Session header. Preserve `summary/diff` and Session/history/export ownership.
2. `src/protocol.ts:562`: extend the existing optional artifacts bridge with `stat/readBytes/list/changes` ports typed from `HostFilePorts`, plus the root/gate metadata needed by the existing bridge. Keep `available` for existing callers if needed, but carry the actual unavailable reason to the file controller. No new public namespace or SSH endpoint is introduced.
3. `src/client/capabilities.ts:812–846`: keep the existing event/projection source, supply the complete file ports rather than `{ read }`, and pass current gate status/reason. The file-view source's `hostWorkspacePath` must use the confirmed canonical Host execution root of this generation. If it is being resolved, the file view remains disabled. Session state itself is still owned by Harness.
4. `src/client/actions.ts:4607` old `/files`: add a `Host workspace browser` row that calls `hostWorkspaceFilesView(fileOptions, navigation)`. Replace the generated-path `view` branch's `readProducedFile` call with `workspaceFileView(new WorkspaceFileObserver(selected.id, fileOptions, navigation.signal), selected.label, navigation)`. It already supports text pagination, version refresh, cancellation, disconnect and reconnect. The recorded-artifact row now reaches the same live view automatically after step 3; this is covered for both manager and nested navigation.
5. Old file context targets: route **Host references** to `HostFileController.stat/read/readBytes/list` and the viewer above; do not pass them to client `node:fs`, local open/editor, or client upload `addPath`. A copied Host process path can be displayed/copied; opening it with a local program requires a genuinely available existing execution-world mapping, otherwise disable that action with its reason. Keep explicit **client uploads** on the existing `FileAttachmentController.addPath` and official receipt flow; no receipt, local file or remote path is substituted for another.

Concrete assembly fragment (the auth and canonical root callbacks are the existing Host boundary's responsibilities):

```ts
const nativeFiles = createWorkspaceFileAdapter({
  gateway: ctx.typertGateway,
  local: () => ctx.get('typert')?.local,
  service: key => ctx.get(key as never),
  authorize: currentFileAuthorization,
  workspaceRoot: confirmedExecutionRoot,
  strictConfined: consumerRequiresAtomicWorkspaceRead,
})
// Attach nativeFiles.files and nativeFiles.gate through the existing management bridge.
// Propagate the same explicit requirement into fileOptions.strictConfined. Default/false keeps ordinary Host reads.
// Client:
await hostWorkspaceFilesView(fileOptions, navigation)
// Explicit Host reference:
await workspaceFileView(new WorkspaceFileObserver(path, fileOptions, navigation.signal), title, navigation)
```

No code is required in native interactions, Session normalization/history/export, transcript, plugin actions or vendor/reconnect modules. No second filesystem, SSH client, permission engine, watcher or scheduler is created.

## Lifecycle and capability limits

- File observation resolves metadata to reuse the same reported canonical path for watch and content requests; it performs no content read until native `ready`. This does not pin an inode/handle against later path replacement. Missing watch support uses a truthful manual mode; `workspace-file/watch-unsupported` stays visible, including for the official base provider inherited by SSH. A real change causes a stat and first-page reread; duplicate versions (including during pending reads) are ignored; deletion clears content. Versions are opaque.
- Reads are bounded and cancel on owner/generation/root changes, disconnect, timeout, page close or disposal. Unknown/late responses never publish success. Reconnect waits for watcher cleanup and obtains a new `ready` before rereading. Unknown cleanup blocks a successor watch; late open results are disposed. There is no polling or automatic error retry.
- Back closes only the page's observation; it does not cancel a Session or persist a file action. Two instances have independent watches/reads. The browser refuses stale selections across scope changes.
- Optional disposer faults are tested port/carrier faults, not claims that stock Local spontaneously throws. Disposal and iterator return are independently attempted with bounded waits, even if either throws. Errors remain in `cleanupFailure`; `closed()` rejects and a successor watch is blocked. A successful iterator return does not erase a disposer failure. The same rule applies to late-open cleanup and adapter failed-open cleanup.
- Text pages are at most 200 lines; byte pages at most 65536 bytes (UI uses 4096). Binary view is a read-only hexadecimal display, not a downloaded client file. `baseFile` is resolved in Host coordinates by the controller; the adapter ports consume the resolved reference.
- Directory entries are capped by native `maxEntries` and show `truncated`. Native list has **no pagination cursor**; no fake paging is advertised. Directory refresh is explicit; F062 watches the selected regular file. Unsupported/missing endpoints stay disabled.
- Native providers own UTF-8/binary/regular-file checks and backend authorization. Terminal responses get best-effort path filters and shape/version validation, without an atomic confinement guarantee. No SSH config, key, host connection or real model request is used by tests.

## Verification and replay

Targeted suite (isolated HOME/XDG/DSH_HOME): `tests/host-file-controller.test.ts`, `workspace-file-observer.test.ts`, `workspace-file-adapter.test.ts`, `workspace-file-view.test.ts`, existing `artifact-view.test.ts`; plus public Session artifact and Session browser regressions. `tsc --noEmit` covers the new contracts.

Initial `afc79d7` local result (2026-09-30): **9 files / 148 tests passed**, including existing `file-attachments.test.ts` and `file-public-wiring.test.js`. Follow-up read-boundary / cleanup fix: **10 files / 158 tests passed**, **`tsc --noEmit` passed**, **`git diff --check` passed**. The original reviewer lifetime fixture was replayed unchanged: **3/3 passed**, including `dispose` throwing before iterator return. The unchanged-release Local + remote loopback verification script passed again with `realSSH: false` and `modelRequests: 0`. The native race-boundary script passed both counterexample assertions and the strict zero-call assertion. Existing vendor sourcemap absence warnings were observed and left unchanged.

`scripts/verify-workspace-files-published.mjs <isolated-packages-directory>` verifies the four fixed npm tarball digests and every extracted `lib` artifact against the tarball, then uses real official Context/Registry/Gateway/WorkspaceFiles/LocalFileSystem. Run with Node 24 `--experimental-transform-types`, isolated HOME/XDG/DSH_HOME and the unchanged rc.2 packages extracted into `<directory>/<name>/package`. Fixture dependencies use only isolated symlinks to existing unchanged npm packages. Actual Local chokidar ready/change/close/reconnect and binary/list/escape rejection pass outside the filesystem-watch sandbox; that sandbox returned `EMFILE`, truthfully exercising manual fallback.

The same script tests a synthetic remote provider derived from the real official `FileSystem` through a temporary **127.0.0.1 HTTP fixture carrier** over the actual Gateway. It covers all five calls, native unsupported watch, explicit refresh/no polling, and an identical local absolute path containing `CLIENT LOCAL TRAP` that must never be read. This test carrier is confined to fixtures; it is not a shipped Host endpoint or evidence of real SSH connectivity. A separate real Gateway negative-control test proves a harmless foreign service is callable without the new gate, then proves the adapter does not invoke it.

Remaining acceptance: E's actual public bridge/context/actions wiring, lib rebuild and real terminal PTY. Real SSH hosts, credentials and model requests are intentionally untested; SSH configuration remains the official provider owner's responsibility.

Review counterexamples are retained in `scripts/verify-workspace-files-race-boundary.mjs <isolated-packages-directory>` using unchanged real Local/WorkspaceFiles/Gateway: (1) replacement after adapter stat but before native locate returns outside metadata and is rejected after a native outside read; (2) replacement immediately before `streamText` open returns outside text with the earlier inside path/version and is accepted as an ordinary authorized native receipt, explicitly without an atomic guarantee. A third native case proves `strictConfined: true` issues zero content/metadata calls. Both original reviewer scripts are also replayed byte-for-byte in an owned isolated directory; the review tree stays unchanged. The new cleanup regression has its own `host-file-stream-lifetime.test.ts`, alongside the original three reviewer lifetime cases.
