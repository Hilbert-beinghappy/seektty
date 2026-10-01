# File receipt bridge handoff (dsh 0.2.0-rc.2)

Ownership: this change adds `src/host/file-receipt-bridge.ts` and independent tests/fixture only. It does **not** register the bridge, instantiate the public attachment controller, change `/attach`, or finish public file/audio/video intake. E owns those changes and PTY acceptance. No changes to actions, protocol, native-intake-bridge, index registration, clipboard, or generated lib.

## What can be reused

`FileAttachmentController` already accepts the published Native Remote signatures. There is no need for another upload controller or upload protocol. `createFileReceiptPort(ctx, bound, current, timeoutMs)` returns `{ remote, gate }`. Pass `remote` directly to that controller. Calls use the already-mounted `ctx.typertGateway.invoke`; native lookup, Agent ownership, existing operator/Connection authority and service error policies remain with Harness.

The port requires the exact published descriptor identity, service, namespace/method, implementation, invocation/scope, parameters/lookup/wire, strict codec symbols and cancellation contract. It validates with the published generated codecs, including the result (direct Gateway invoke does not itself decode results). SRC fallback and similarly named services are rejected. Tested identities:

| Endpoint | Descriptor ID | Actual service key | Wire |
|---|---|---|---|
| `fileUploads/upload` | `@deepseek-ai/dsh-client-file-upload#fileUploads/upload` | `fileUploads` | `{ agentId, request: { data, name? } }` |
| `fileReferences/list` | `@deepseek-ai/dsh-api-session-controller#fileReferences/list` | `sessionFileReferences` | `{ agentId, query }` |

The reference result is `{ path, kind: 'file' | 'directory' }[]`. It is path-only discovery; `referencePromptText` returns quoted ordinary `@` text. It does not upload the referenced file/directory. Upload result is `{ receiptId, file: { attachmentId, name, bytes } }`. Audio/video remain saved generic file handles; this does not assert model-native audio/video input.

## Minimal E wiring

1. Expose a Session-bound factory from the existing in-process management/intake bridge. Construct the port with the actual selected ordinary Session ID and connection generation, and a callback reading those same live values. Bind an existing Surface/Session/connection lifetime signal; its owner aborts it on switch, reconnect and close. A new generation gets a new port, and `controller.reconnect(...)` clears old draft/reservations. Merely changing the generation rejects late results but cannot wake a carrier ignoring abort before its deadline.
2. Provide `files: true` only from confirmed Host file-intake composition. Missing/disabled metadata stays unknown/false. A mounted generic base attachment service alone does not prove file support: the published `AttachmentStore.saveFile` default rejects with `ATTACHMENT_FILES_UNSUPPORTED`. No new model-derived capability or fabricated Host budget should be introduced. `gate('upload')` checks both bound and current confirmed Files intake; path references remain independently gated. Keep explicit, bounded client bytes/count budgets; rc.2 verbatim storage itself documents no file admission limit.
3. Instantiate the existing `FileAttachmentController(port.remote, sessionId, confirmedFiles, budget)` for the active ordinary Session. `/attach` should retain the image path and offer generic file/audio/video plus reference selection. Display `gate` refusal reasons; check the gate before presenting a selectable upload entry. References become ordinary quoted text; uploads stage receipts. Cancel/removal affects this controller's own draft only.
4. Submit `controller.promptParts()` with existing text/images to the official `session/prompt` request (`mode: 'queue' | 'steer'`, stable request ID). Clear staged receipts only after known acceptance. Preserve them after a known refusal. A dispatched timeout/carrier loss has an unknown outcome: do not blindly retry. Refresh/reconcile the request before an explicit user retry. Preserve existing prompt state/error/notifier behavior and subagent restrictions.
5. **Retained terminal wire blocker at committed E `6abb5c6`:** `vendor/api-contract/api/sessions.schema.js:222` accepts only text/image; `NativeTerminalApi` calls `clientRequestSchema.parse` before native dispatch. Appending `file` to `active.session.prompt(...)` currently fails before Harness sees it. E must either extend the retained prompt schema/types using the actual published receipt part (`{ type: 'file', receiptId }`) and keep the existing dispatch request-ID path, or route this intake through the exact published `session/prompt` Remote with all existing prompt lifecycle bookkeeping. Do not send `attachmentId` as a receipt, guess `followup` as a wire mode, or claim that port tests prove the public entry works.
6. Public acceptance still needed after E wiring: PTY file/audio/video selection → receipt → real send, mixed existing image/text + file receipt, reference selection, cancel/unknown outcome, disabled Files, Session switch/reconnect, and command intake if offered. Keep the default render mode. The Host translates accepted file parts into durable `{ type: 'file', attachment: file }` messages; this is distinct from the intake wire part.

## Cancellation and ownership

Both port and controller enforce deadlines and consume late rejections. Before-dispatch cancellation does not upload. After dispatch, timeout/cancellation/generation change/malformed reply/transport loss is reported as `File upload outcome unknown...`; no automatic retry or deletion is performed. Official Remote business refusal retains its original error.

The controller's outer cancellation can reject before the port's inner cancellation error reaches its caller. E's explicit cancellation notice must therefore say that a dispatched upload outcome is unknown, even when the outer error is only `Operation cancelled`; it must not label this as a confirmed Host rollback. The official cancellation fixture verifies empty local draft, released budgets and untouched prior receipt, rather than inventing a revoke acknowledgement.

rc.2 publishes **no receipt revoke/delete/cancel endpoint**. A Host write may finish after caller abort; its bytes/receipt remain Harness-owned. The port discards an obsolete receipt, and the controller releases local file handles, draft and byte/count reservations. It cannot truthfully claim Host cancellation completed. Do not mutate `FileUploads`' private WeakMap, call internal `retirePrompt` to implement UI cancel, remove stored attachments, or touch other receipts. Official prompt binding/queue/history and Session disposal own retirement. The fixture's direct `retirePrompt` call tests that official internal behavior only; it is not an integration instruction.

## Actual verification

Node 24.20.0, unmodified published rc.2 packages. The stock fixture reads an explicitly supplied `SEEKTTY_OFFICIAL_NODE_MODULES`, creates its own temporary workspace and isolated `dshHome`, and removes only that temporary directory. It instantiates official Cordis, Typert Registry/Gateway, LocalAttachmentStore, FileUploads, SessionStore/ProjectionRegistry, SessionController and LocalFileReferenceService. Agent execution/inbox and operator Connection admission are inert fixture seams; no model or real account executes.

Targeted command (set the environment variable to an existing unmodified official rc.2 installation):

```sh
SEEKTTY_OFFICIAL_NODE_MODULES=/path/to/official/node_modules node node_modules/vitest/vitest.mjs run tests/file-receipt-bridge.test.ts tests/file-receipt-bridge-official.test.js tests/file-attachments.test.ts
```

Actual targeted run: **55 passed** (33 port boundaries, 10 official service/loopback cases, 12 existing controller tests). Official cases cover exact stored bytes and receipt submission for file/mp3/mp4, workspace references, foreign receipt refusal, reconnect, budgets, storage refusal, unresponsive store/late receipt and own-draft cancellation. Loopback uses the published existing `/api/session/uploadFileBinary` raw-byte route, then the official native prompt; it does not add an upload protocol. Only `127.0.0.1` is bound. No external upload or real user file/credential/DSH_HOME is used.

The official fixture suite explicitly skips without that environment variable; a skipped run is not evidence of stock service coverage. Typecheck passed. Full suite with the official environment supplied: **188 files passed, 1700 tests passed, 1 existing test skipped**. The full run exited 0; the official 10-case suite was enabled and passed.
