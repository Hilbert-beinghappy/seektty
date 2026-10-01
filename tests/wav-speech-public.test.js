import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { TuiActions } from '../src/client/actions.ts'
import { PromptEditor } from '../src/client/chrome.ts'
import { TerminalInputExtensions } from '../src/client/terminal-input-extensions.ts'
import { createWavSpeechPort } from '../src/host/wav-speech-port.ts'
import { officialWavSpeechFixture, waveFixture } from './fixtures/wav-speech-official.js'
import { scopedSource, scriptedOverlays } from './fixtures/optional-native-views.ts'
const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
const cleanup = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(confirmations, selection = ['fixture-asr', 'wav', 'en', undefined]) {
  const root = await mkdtemp('/tmp/seektty-speech-public-'); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'synthetic.wav'); await writeFile(path, waveFixture())
  const native = await officialWavSpeechFixture(stock); cleanup.push(native.dispose)
  const scoped = scopedSource(), editor = new PromptEditor({ terminal: { rows: 24 }, requestRender: vi.fn() })
  editor.setText('hello'); editor.setSelection({ line: 0, col: 1 }, { line: 0, col: 4 })
  const inputs = new TerminalInputExtensions(editor, () => ({ ...scoped.source.getSnapshot(), displayTitle: 'Synthetic', locked: false })); cleanup.push(() => inputs.dispose())
  const script = scriptedOverlays(selection, [path], confirmations), submit = vi.fn(), notice = vi.fn()
  editor.onSubmit = submit
  const factory = vi.fn((target, current) => createWavSpeechPort(native.ctx, target, current, 1000))
  const cap = { managementBridge: () => ({ wavSpeech: { forScope: factory } }), terminalExtensionSource: () => scoped.source }
  const actions = new TuiActions(cap, { overlays: script.overlays, notice,
    captureInsertion: () => inputs.captureInsertion(), insertExtensionText: (text, capture, signal) => inputs.insertText(text, capture, signal) })
  return { native, editor, inputs, scoped, script, actions, submit, factory, notice }
}
it('public /speech wav uses the real published Gateway and exact composer selection; explicit confirmation inserts one undoable draft without sending', async () => {
  const f = await fixture([true, true])
  await f.actions.execute('speech', 'wav')
  expect(f.factory).toHaveBeenCalledOnce(); expect(f.native.calls.transcribe).toHaveLength(1); expect(f.native.calls.prepare).toEqual([])
  expect(f.editor.getText()).toBe('hInert fixture transcript 原文o'); expect(f.submit).not.toHaveBeenCalled()
  f.editor.handleInput('\u001a'); expect(f.editor.getText()).toBe('hello'); expect(f.submit).not.toHaveBeenCalled()
})
it('public WAV dispatch or insertion rejection never changes the existing draft and does not retry', async () => {
  for (const confirmations of [[false], [true, false]]) {
    const f = await fixture(confirmations)
    await f.actions.execute('speech', 'wav')
    expect(f.native.calls.transcribe).toHaveLength(confirmations[0] ? 1 : 0)
    expect(f.native.calls.prepare).toEqual([]); expect(f.editor.getText()).toBe('hello'); expect(f.submit).not.toHaveBeenCalled()
  }
})
it('an ABA draft edit during review cannot insert an old speech proposal through the public command', async () => {
  const f = await fixture([true, true])
  const detail = f.script.overlays.detail
  f.script.overlays.detail = async request => { f.editor.setText('edited'); f.editor.setText('hello'); await detail(request) }
  await f.actions.execute('speech', 'wav')
  expect(f.native.calls.transcribe).toHaveLength(1); expect(f.editor.getText()).toBe('hello'); expect(f.submit).not.toHaveBeenCalled()
  expect(f.script.details.some(row => /stale/.test(row.content))).toBe(true)
})
it('the public WAV entry refuses an absent service or unknown command vocabulary without any preparation/transcription', async () => {
  const f = await fixture([])
  await f.actions.execute('speech', 'microphone')
  expect(f.native.calls.transcribe).toEqual([]); expect(f.native.calls.prepare).toEqual([])
  expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('/speech wav'), 'error')
  const absent = new TuiActions({ managementBridge: () => ({}) }, { overlays: f.script.overlays, notice: f.notice })
  await absent.execute('speech', '')
  expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('unavailable'), 'error')
})

it('real injected Cordis consumer Context runs official catalog and transcription without undeclared service getters', async () => {
  const native = await officialWavSpeechFixture(stock, { scopedServices: true }); cleanup.push(native.dispose)
  const f = { native, scoped: scopedSource() }
  let scopedPort, restricted
  await f.native.ctx.plugin({ name: 'synthetic-restricted-speech-consumer', inject: ['speechController'], apply: ctx => {
    restricted = ctx
    scopedPort = createWavSpeechPort(ctx, f.scoped.source.getSnapshot(), () => f.scoped.source.getSnapshot(), 1000)
  } })
  await vi.waitFor(() => expect(scopedPort).toBeDefined())
  expect(() => restricted.typert).toThrow(/without inject/)
  expect(scopedPort.reason('catalog')).toBeUndefined()
  expect((await scopedPort.catalog(new AbortController().signal)).providers[0].id).toBe('fixture-asr')
  const value = await scopedPort.transcribe({ providerId: 'fixture-asr', language: 'en', audioBase64: waveFixture().toString('base64') }, new AbortController().signal)
  expect(value.text).toBe('Inert fixture transcript 原文'); expect(f.native.calls.prepare).toEqual([])
  const abort = new AbortController(), stream = scopedPort.follow(abort.signal)[Symbol.asyncIterator]()
  expect((await stream.next()).value.providers[0].id).toBe('fixture-asr')
  abort.abort(); await stream.return()
})
