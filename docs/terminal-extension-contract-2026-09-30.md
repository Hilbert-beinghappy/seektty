# Explicit terminal plugin extensions (F066/F077)

This is a SeekTTY-specific in-process contract for official Harness 0.2.0-rc.2. It does not render or automatically import Web React slots. The official session menu seats and `conversation.input.activity` are React components; there is no published Host session-action descriptor catalog to translate automatically.

An explicitly installed Cordis plugin uses the ordinary Harness Loader and declares `inject: ['seekttyExtensions']`. The SeekTTY runner publishes that service before awaiting the Loader. No additional package entrypoint, private source import, browser module loader, or model request is required.

```js
export const inject = ['seekttyExtensions']
export function apply(ctx) {
  ctx.effect(() => ctx.seekttyExtensions.registerSessionAction({
    id: 'my-plugin.inspect', label: 'Inspect Session', order: 10,
    reason: target => undefined,
    async run(target, signal) {
      signal.throwIfAborted()
      return `Selected Session: ${target.sessionId}`
    },
  }))
  ctx.effect(() => ctx.seekttyExtensions.registerInputActivity({
    id: 'my-plugin.input', label: 'Produce draft text',
    async run(target, signal) {
      signal.throwIfAborted()
      return 'Text for the captured selection'
    },
  }))
}
```

Load the plugin through its own package/Bundle's normal `dsh.bundle.patch` declaration. Both registration methods return an effect disposer. IDs are unique within each seat; re-registration changes the revision and invalidates open menus. `reason(target)` is rechecked before dispatch; throwing or malformed availability fails closed. `danger: true` requires the existing explicit confirmation flow. Plugins remain ordinary trusted Host code and own their service calls, permission enforcement, and cooperative cancellation; this surface does not add blanket tool authorization.

Session actions appear in the exact Session row's context menu, including a target other than the active Session. The callback receives immutable `{sessionId, displayTitle}`. An optional returned string is a notice, not confirmation of a durable Host write. Unload, cancellation, scope loss, or deadline rejects an unconfirmed result; callbacks are not replayed.

Input activities are reachable through `/input-activities` and the composer's context menu. The callback receives immutable `{sessionId, displayTitle, draft, selection: {start, end}}`; offsets are UTF-16 positions in the draft. Returned text is inserted at the original selection only when its Session, connection generation, draft revision, ready/lock state, and capture identity remain valid. Editing and undoing back to identical text still invalidates a capture. The insertion is one undo step, normalizes terminal control text, and never submits a prompt. The modal finishes before composer focus is restored. Cancellation and stale results leave the draft unchanged.

Supported terminal scope is session actions and asynchronous text insertion. Browser-only React/DOM/File objects, toolbar layout expansion, bundle React activation/configuration components, and arbitrary third-party Web plugins require their authors to provide an explicit terminal entry. These parts are not automatically compatible.

Evidence: `tests/terminal-extension-loader.test.ts` loads an actual external `.mjs` through the official Cordis Loader, dispatches both seats, and unloads their effects. `tests/terminal-input-extensions.test.ts` exercises the real pinned pi-tui editor, Unicode/reversed selections, single-step undo, revisions, cancellation, and scope isolation. `tests/terminal-extensions-public.test.ts` checks public actions with an actual Loader and real OverlayQueue/TUI focus lifecycle. These are source-level composed tests; packaged stock PTY certification is still pending for this new stage. The frozen 17770b9 candidate remains the earlier package, not this source revision.

Official contracts: [session menu slots](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-workspace/src/client/contract/slots.ts), [input actions](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-conversation/src/client/contract/input.ts), [published input extension fixture](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/web/tests/fixtures/plugins/fixture-input-extension/client.js).
