import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { TUI } from '@mariozechner/pi-tui'
import { OverlayQueue } from '../src/client/overlays.ts'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-session-controller/remote'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'
import { sessionPromptRequestSchema } from '../vendor/api-contract/api/sessions.schema.js'
import { scriptedOverlays, deferred, tick } from './fixtures/optional-native-views.ts'

const cleanups = []
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose() })
function observable(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { value = next; for (const fn of [...listeners]) fn() } }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'seektty-file-public-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const sessions = observable({ phase: 'ready', current: 'root', ids: ['root', 'other'],
    byId: { root: { id: 'root', cwd: root }, other: { id: 'other', cwd: root } } })
  const state = observable({ openState: 'open', running: false })
  const description = observable({ version: '0.2.0-rc.2' })
  const resets = [], effects = []
  const ctx = { connection: { hostDescription: description }, remote: { $on() {} },
    on: (name, fn) => { if (name === 'connection/reset') resets.push(fn); return () => { const at = resets.indexOf(fn); if (at >= 0) resets.splice(at, 1) } },
    effect: fn => effects.push(fn()),
    sessions: { list: sessions, binding: () => ({ session: { getSnapshot: state.getSnapshot, subscribe: state.subscribe,
      projections: { faceOf: () => observable(undefined) } } }), subagentAddress: () => undefined },
    workspaces: { list: observable({ items: [] }) } }
  let serial = 0, disabled
  let owner = {}
  const upload = vi.fn(async (_id, request) => ({ ok: true, value: { receiptId: `receipt-${++serial}`,
    file: { attachmentId: `digest-${serial}`, name: request.name, bytes: Buffer.from(request.data, 'base64').length } } }))
  const list = vi.fn(async () => ({ ok: true, value: [{ path: '目录/my file', kind: 'directory' }, { path: 'clip.mp4', kind: 'file' }] }))
  const open = vi.fn(async () => ({ ok: true, value: { opened: true } }))
  const bridge = { fileReceipts: { forSession: () => ({ owner: () => owner, reason: () => disabled, referencesReason: () => undefined,
    remote: { fileUploads: { upload }, fileReferences: { list }, session: { openWorkspacePath: open } } }) } }
  const caps = new HarnessTuiCapabilities(ctx, {}, 'fixture', root, bridge)
  cleanups.push(() => effects.forEach(fn => fn?.()))
  const notice = vi.fn(), copy = vi.fn(), setEditor = vi.fn()
  const actions = script => {
    // Exercise real action callbacks without introducing a real terminal/browser.
    if (!(script.overlays instanceof OverlayQueue)) {
      script.overlays.selectPage = async (request, selected) => {
        const row = await script.overlays.select(request)
        if (row) await selected(row)
      }
      script.overlays.updateChoices = vi.fn()
      script.overlays.finish = vi.fn()
    }
    return new TuiActions(caps, { overlays: script.overlays, notice, copy, setEditor,
      composerText: () => 'hello', refresh() {}, refreshHeader() {} })
  }
  return { root, caps, actions, notice, copy, setEditor, sessions, description, upload, list, open,
    disable: reason => { disabled = reason }, replaceOwner: () => { owner = {} }, reset: () => resets.slice().forEach(fn => fn()),
    select: id => sessions.set({ ...sessions.getSnapshot(), current: id }),
    file: (name = '中文 clip.mp4', data = 'synthetic bytes') => { const path = join(root, name); writeFileSync(path, data); return path } }
}
it.each(['report.txt', 'voice.mp3', '中文 clip.mp4'])('public /attach-file stages %s and prompts with an opaque native receipt', async name => {
  const f = fixture(), path = f.file(name)
  await f.actions(scriptedOverlays([])).execute('attach-file', path)
  expect(f.upload).toHaveBeenCalledExactlyOnceWith('root', { name, data: Buffer.from('synthetic bytes').toString('base64') }, expect.any(AbortSignal))
  const parts = f.caps.promptContent('inspect')
  expect(parts).toEqual([{ type: 'text', text: 'inspect' }, { type: 'file', receiptId: 'receipt-1' }])
  expect(sessionPromptRequestSchema.parse({ sessionId: 'root', content: parts, mode: 'queue' }).content).toEqual(parts)
  expect(JSON.stringify(parts)).not.toContain(path); expect(JSON.stringify(parts)).not.toContain('digest-')
  expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('句柄'), 'success')
})
it('rejects unconfirmed Files intake before touching an absent path or dispatching an upload', async () => {
  const f = fixture(); f.disable('Files intake is unknown')
  await f.actions(scriptedOverlays([])).execute('attach-file', '/synthetic/does-not-exist')
  expect(f.upload).not.toHaveBeenCalled(); expect(f.caps.draftFiles()).toEqual([])
  expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('unknown'), 'error')
})
it('retains receipts on a failed prompt and clears only receipts/images captured by confirmed success', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  const image = { name: 'synthetic.png', path: '/synthetic.png', mediaType: 'image/png', bytes: 1, data: 'YQ==' }
  f.caps.restoreDraftAttachments([image])
  const captured = f.caps.capturePrompt('first')
  // Failed dispatch makes no accept call: drafts remain available for explicit retry.
  expect(f.caps.draftFiles()).toHaveLength(1)
  await f.caps.addFile(f.file('later.txt'), new AbortController().signal)
  const laterImage = { ...image, name: 'later.png' }; f.caps.restoreDraftAttachments([image, laterImage])
  f.caps.acceptPrompt(captured)
  expect(f.caps.draftFiles().map(item => item.receiptId)).toEqual(['receipt-2'])
  expect(f.caps.draftAttachments()).toEqual([laterImage])
})
it('owns each receipt draft by Session and does not clear another Session on late prompt success', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  const parent = f.caps.capturePrompt('parent')
  f.select('other'); expect(f.caps.draftFiles()).toEqual([])
  await f.caps.addFile(f.file('other.txt'), new AbortController().signal)
  f.caps.acceptPrompt(parent); expect(f.caps.draftFiles().map(item => item.receiptId)).toEqual(['receipt-2'])
  f.select('root'); expect(f.caps.draftFiles()).toEqual([])
})
it('returning to the parent preserves its unsent file draft and never shares it with the other Session', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  f.select('other'); expect(f.caps.promptContent('other')).toEqual([{ type: 'text', text: 'other' }])
  f.select('root'); expect(f.caps.promptContent('parent')[1]).toEqual({ type: 'file', receiptId: 'receipt-1' })
})
it.each(['disconnect', 'reset', 'switch'])('does not retain a late upload after %s', async loss => {
  const f = fixture(), pending = deferred(); f.upload.mockImplementation(() => pending.promise)
  const work = f.caps.addFile(f.file(), new AbortController().signal)
  const rejected = expect(work).rejects.toThrow()
  await vi.waitFor(() => expect(f.upload).toHaveBeenCalledOnce())
  if (loss === 'disconnect') f.description.set(undefined)
  else if (loss === 'reset') f.reset()
  else f.select('other')
  await rejected
  pending.resolve({ ok: true, value: { receiptId: 'late', file: { name: 'late', bytes: 15, attachmentId: 'late-digest' } } })
  await tick(); f.select('root'); expect(f.caps.draftFiles()).toEqual([])
})
it('public directory reference insertion uses Host candidates without uploading or recursively reading', async () => {
  const f = fixture(), script = scriptedOverlays(['0', 'insert'])
  await f.actions(script).execute('file-references', '目录')
  expect(f.list).toHaveBeenCalledExactlyOnceWith('root', '目录', expect.any(AbortSignal))
  expect(f.setEditor).toHaveBeenCalledExactlyOnceWith('hello @"目录/my file"')
  expect(f.upload).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
})

it.each(['directory', 'file'])('ends the real %s reference navigation before editor focus, permitting Escape and a fresh picker', async kind => {
  const f = fixture()
  f.list.mockResolvedValue({ ok: true, value: [{ path: '目录/my file', kind }] })
  let input, mounted
  const terminal = { columns: 100, rows: 30, kittyProtocolActive: false,
    start: onInput => { input = onInput }, stop() {}, write() {}, drainInput: async () => {},
    moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} }
  const tui = new TUI(terminal, false)
  const show = tui.showOverlay.bind(tui)
  vi.spyOn(tui, 'showOverlay').mockImplementation((component, options) => { mounted = component; return show(component, options) })
  const overlays = new OverlayQueue(tui)
  const editorInput = vi.fn(), submitted = vi.fn()
  const editor = { render: () => ['composer'], invalidate() {}, handleInput: value => { editorInput(value); if (value === '\r') submitted() } }
  tui.addChild(editor); tui.setFocus(editor); tui.start()
  const render = () => mounted?.render(90).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') ?? ''
  f.setEditor.mockImplementation(() => {
    expect(overlays.hasActive()).toBe(false)
    tui.setFocus(editor)
  })
  try {
    const actions = f.actions({ overlays })
    const first = actions.execute('file-references', 'first')
    await vi.waitFor(() => expect(render()).toContain('my file'))
    input('\r')
    await vi.waitFor(() => expect(render()).toMatch(/Insert path reference|插入路径引用/u))
    input('\r')
    await first
    expect(f.setEditor).toHaveBeenCalledExactlyOnceWith('hello @"目录/my file"')
    expect(overlays.hasActive()).toBe(false)
    input('\u001B'); input('ordinary draft')
    expect(editorInput.mock.calls.map(call => call[0])).toEqual(['\u001B', 'ordinary draft'])
    expect(submitted).not.toHaveBeenCalled()
    const second = actions.execute('file-references', 'second')
    await vi.waitFor(() => expect(f.list).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(overlays.hasActive()).toBe(true))
    input('picker search')
    expect(editorInput).toHaveBeenCalledTimes(2)
    input('\u001B'); await second
    expect(overlays.hasActive()).toBe(false)
    input('after escape')
    expect(editorInput).toHaveBeenLastCalledWith('after escape')
    expect(submitted).not.toHaveBeenCalled()
  } finally { overlays.dispose(); tui.stop() }
})
it('external file open refuses consent without dispatch, and confirmed open uses the resolved workspace path', async () => {
  const f = fixture(); await f.actions(scriptedOverlays(['1', 'open'], [], [false])).execute('file-references', 'clip')
  expect(f.open).not.toHaveBeenCalled()
  await f.actions(scriptedOverlays(['1', 'open'], [], [true])).execute('file-references', 'clip')
  expect(f.open).toHaveBeenCalledExactlyOnceWith({ path: join(f.root, 'clip.mp4') }, expect.any(AbortSignal))
})
it('real progress Escape warns about possible Host storage and ignores a late receipt without retry or draft mutation', async () => {
  const f = fixture(), pending = deferred()
  f.upload.mockImplementation(() => pending.promise)
  let mounted
  const hide = vi.fn()
  const overlays = new OverlayQueue({ showOverlay: component => { mounted = component; return { hide } }, requestRender() {} })
  try {
    const execution = f.actions({ overlays }).execute('attach-file', f.file('slow.txt'))
    await vi.waitFor(() => expect(f.upload).toHaveBeenCalledOnce())
    mounted.handleInput('\u001B')
    await execution
    expect(overlays.hasActive()).toBe(false)
    expect(f.notice).toHaveBeenCalledWith(expect.stringMatching(/Host.*可能已保存|Host may have saved/u), 'warning')
    expect(f.notice.mock.calls.some(([text]) => /撤销成功|已删除|rolled back|deleted successfully/u.test(text))).toBe(false)
    pending.resolve({ ok: true, value: { receiptId: 'saved-after-cancel', file: { attachmentId: 'stored', name: 'slow.txt', bytes: 15 } } })
    await tick()
    expect(f.caps.draftFiles()).toEqual([])
    expect(f.upload).toHaveBeenCalledOnce()
    expect(f.notice.mock.calls.some(([, tone]) => tone === 'success')).toBe(false)
  } finally { overlays.dispose() }
})
it('public /attachments removal changes only the local receipt selection', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  await f.actions(scriptedOverlays(['receipt-1', 'remove'])).execute('attachments', '')
  expect(f.caps.draftFiles()).toEqual([]); expect(f.upload).toHaveBeenCalledOnce()
  expect(f.open).not.toHaveBeenCalled()
})

it('invalidates retained receipts when the exact Host Agent/receipt-owner lifecycle changes', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  f.replaceOwner(); expect(f.caps.draftFiles()).toEqual([])
  expect(f.caps.promptContent('fresh')).toEqual([{ type: 'text', text: 'fresh' }])
})
it('keeps path reference discovery available when the mounted store cannot upload Files', async () => {
  const f = fixture(); f.disable('Files unsupported')
  await f.actions(scriptedOverlays(['0', 'insert'])).execute('file-references', 'directory')
  expect(f.setEditor).toHaveBeenCalledWith('hello @"目录/my file"'); expect(f.upload).not.toHaveBeenCalled()
})

it('retained native Session → wire schema → Gateway sends mixed image/text/file parts with the original request correlation', async () => {
  const f = fixture(); await f.caps.addFile(f.file(), new AbortController().signal)
  f.caps.restoreDraftAttachments([{ name: 'synthetic.png', path: '/synthetic.png', mediaType: 'image/png', bytes: 1, data: 'YQ==' }])
  const descriptor = TYPERT_REMOTE.descriptors.find(d => d.id === '@deepseek-ai/dsh-api-session-controller#session/prompt')
  const gateway = { invoke: vi.fn(async ({ args }) => {
    const request = descriptor.parameters[0].codec.create().parse(args.request)
    expect(request.content.map(part => part.type)).toEqual(['text', 'image', 'file'])
    expect(request.content[2]).toEqual({ type: 'file', receiptId: 'receipt-1' })
    expect(request.requestId).toBe('original-rpc')
    return { accepted: true }
  }) }
  const session = new Session('root', { sessions: { prompt: async p => ({ result: { ok: true,
    value: await dispatchTerminalRequest(gateway, {}, 'session.prompt', sessionPromptRequestSchema.parse(p), 'original-rpc', new AbortController().signal) } }) } }, {})
  const captured = f.caps.capturePrompt('inspect')
  expect(await session.prompt(captured.content, 'queue')).toEqual({ ok: true, value: { accepted: true } })
  f.caps.acceptPrompt(captured); expect(f.caps.draftFiles()).toEqual([]); expect(f.caps.draftAttachments()).toEqual([])
  expect(gateway.invoke).toHaveBeenCalledOnce()
})
it('actual continuable child Session rejects a receipt before either prompt Remote dispatch', async () => {
  const rootPrompt = vi.fn(), childPrompt = vi.fn()
  const session = new Session('child', { sessions: { prompt: rootPrompt }, subagents: { prompt: childPrompt } }, {},
    { address: { parentSessionId: 'root', childSessionId: 'child', mode: 'continuable' }, parentAvailable: true })
  const result = await session.prompt([{ type: 'file', receiptId: 'ordinary-owner-receipt' }], 'steer')
  expect(result).toMatchObject({ ok: false, error: { details: { reason: 'SUBAGENT_FILE_RECEIPT_UNSUPPORTED' } } })
  expect(rootPrompt).not.toHaveBeenCalled(); expect(childPrompt).not.toHaveBeenCalled()
})
