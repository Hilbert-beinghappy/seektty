# F083 WAV transcription — tested dsh 0.2.0-rc.2

Fixed tree `/tmp/seektty-height-clipboard-t07`, branch
`codex/seektty-f094-f023-20260930`. Separate speech commit after F023 conceal fix
`0dd529a5256beba941b9a8ffe004e44148d743b3`; no shared actions/surface/protocol edits.

## Deliverable

- `speech-contract.ts`: business-value types for the published optional speech
  service, plus explicit unknown-outcome errors. It does not register Remotes.
- `wav-speech-port.ts`: admission requires the exact published descriptor id,
  service, method, invocation, ordered parameters, strict codec symbols, mode and
  cancellation shape. Object property order is immaterial. Codecs come from the
  mounted official descriptor; calls use the existing authenticated Gateway.
  No optional dependency, route, credential store or ASR system is introduced.
- `wav-input.ts`: selected regular file only, canonical RIFF/WAVE/fmt/data,
  16kHz mono PCM16. Check bytes before allocation, detect length/mtime changes,
  enforce header duration, create a 0700/0600 private temporary snapshot and
  remove only that owned directory on completion/refusal/cancellation. The
  selected original is retained. No conversion, resampling or recording.
- `WavSpeechController`: read catalog, explicit configure/prepare/cancel,
  bounded follow and transcribe, immutable resource offers, late generation and
  composer-revision protection. Unknown dispatched outcomes are never retried.
  Result text is capped and stripped of terminal controls/styles, kept as a
  proposal, and inserted only after explicit confirmation and synchronous CAS.
- `wavSpeechCommand(controller, overlays)`: actual provider/language/file UI,
  explicit WAV dispatch confirmation, preparation resource/source confirmation,
  shared-task cancellation confirmation, progress/failure and full transcript
  review followed by separate insertion confirmation. No message submission.

## Budgets and Host ownership

Local WAV ceiling is **4MiB / 120 seconds**, reduced by advertised Host limits;
default result text ceiling **65,536 characters**. Default unary observation deadline is
30 seconds (native port 15 seconds per call/stream item). Scope/disposal aborts
observation; a carrier/provider ignoring cancellation still cannot hang the UI
or insert a late result. The Host owns its accepted work and resources.

Default preparation admission checks **Host estimates** against 4GiB recommended disk,
2GiB expected memory, and 30 minutes. Unknown estimates refuse preparation.
The published protocol offers no download-byte/storage hard-cap parameter:
these ceilings cannot be claimed as physical enforcement. UI says so explicitly.
Download progress uses actual Host completed/total bytes, and missing totals
stay unknown; no invented percentage or automatic retry. Preparing may start or
join shared provider work. Closing a page only stops observation. Only the
explicit shared-task cancel button calls `cancelPreparation`; no implicit
late-response cancellation can interfere with another window's preparation.

## Exact minimal E wiring

1. Add an optional factory on the existing same-process management/intake bridge,
   calling `createWavSpeechPort(ctx, boundScope, currentScope)`. `boundScope` and
   `currentScope` contain the real selected Session id, management/connection
   generation and readiness. Create a fresh port/controller per entry or
   reconnect; never weaken descriptor admission to namespace/method names alone.
   Keep the factory absent/unavailable when the native speech service is absent;
   do not enable or install experimental plugins by opening this entry.
2. Reuse E's existing `TerminalInputExtensions`. The controller draft port is:

   ```ts
   read: () => {
     const capture = inputExtensions.captureInsertion()
     return { revision: capture.draftRev, text: capture.target.draft, capture }
   },
   insert: (text, expectedRevision, opaqueCapture) => {
     const capture = opaqueCapture as TerminalInsertion | undefined
     if (capture === undefined || capture.draftRev !== expectedRevision) return false
     return inputExtensions.insertText(text, capture, pageLifetime.signal)
   },
   ```

   The controller retains the **original** opaque capture from transcription
   start across intermediate reads and review, preserving selection and the
   existing WeakMap ownership check. Text equality alone cannot protect ABA
   edits. Existing input scope also refuses locked/unavailable composers.
3. Add one explicit WAV-only slash/menu entry (for example `/speech wav`) calling
   `wavSpeechCommand(controller, host.overlays)` and dispose the controller in
   `finally`. Feed the existing reactive Session/management source into the
   controller. Do not call Agent submit/prompt, do not fake microphone actions,
   and do not alter the default render mode.

These common registration/call sites are deliberately **not patched here**.
The complete module view path is exercised against the official fixture, but
the production entry remains incomplete until E applies this wiring. E should
add command-dispatch + existing input-capture/PTY acceptance after integration.

## Actual verification and boundaries

Unmodified published `@deepseek-ai/dsh-experimental-api-speech-to-text` and
`@deepseek-ai/dsh-experimental-speech-to-text` **0.2.0-rc.2**, actual TypertRegistry,
Gateway, SpeechController and SpeechToText registry. The recognizer is explicitly
an inert fixture provider, not an actual ASR model. The loopback HTTP test is a
test-only admission/transport shim into the actual Gateway; it is not a new
production URL. Configure refusal is exercised on a real service deliberately
mounted without Loader/Profile persistence; the generic thrown failure is
reported as unknown with its original cause, not as a confirmed rollback.

- Targeted WAV + approval regressions: **4 files / 49 tests passed**.
- Final full suite: **227 files / 2248 passed / 1 skipped**.
- `tsc --noEmit` and `git diff --check`: passed.
- Logs: `/tmp/seektty-wav-speech-targeted.log`,
  `/tmp/seektty-wav-speech-full.log`, `/tmp/seektty-wav-speech-typecheck.log`.

Tests cover malformed format/length/duration/byte limits, permissions and owned
temp cleanup, missing/wrong descriptor and reconnect reuse, explicit dispatch
and insertion refusals, empty/oversized/styled text, inference failure/unknown
timeout, cancellation/late result, original insertion capture and ABA revision,
resource estimates/source/fact changes, prepare failure/progress/cancel, stream
subscription cleanup, and loopback. No credentials, user files, user DSH_HOME,
real model preparation/download/transcription, real microphone/OS permissions,
external upload, or Agent messages were used. ASR accuracy, hardware/model
behavior, final package install/boot and production PTY entry have not been
validated here. E owns final wiring, generated lib and assembled acceptance.
