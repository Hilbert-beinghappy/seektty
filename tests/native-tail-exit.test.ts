import { EventEmitter } from 'node:events'
import { Worker } from 'node:worker_threads'
import type { Terminal } from '@mariozechner/pi-tui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TuiClient } from '../src/client/client-runtime.ts'
import type { HarnessTuiCapabilities, TuiActiveSession } from '../src/client/capabilities.ts'
import type { TuiStartOptions, TuiSurfaceHandle } from '../src/client/index.ts'
import type { TuiManagementBridge } from '../src/protocol.ts'
import { NativeOutput } from '../src/client/native-output.ts'
import { NativeMarkdownPreparation } from '../src/client/native-markdown.ts'
import { internals as surface, startTuiSurface } from '../src/client/surface.ts'
import { Transcript } from '../src/client/transcript.ts'
import { SyntaxHighlighter } from '../src/client/syntax-highlighter.ts'
import * as provider from '../src/client/provider-onboarding.ts'
import { CLEANUP_TIMEOUT_MS } from '../src/process-guards.ts'
import { welcomeAssistant, welcomeSettings, welcomeSnapshot } from './helpers/welcome-fixture.ts'

vi.mock('node:worker_threads', () => ({ Worker: vi.fn() }))
vi.mock('../src/client/client-runtime.ts', () => ({ startTuiClient: vi.fn() }))

class FakeWorker extends EventEmitter {
  termination: Promise<number> | undefined
  referenced = true
  postMessage = vi.fn()
  unref = vi.fn(() => { this.referenced = false })
  terminate = vi.fn(() => { this.referenced = true; return this.termination ?? Promise.resolve(0) })
}

class ExitTerminal implements Terminal {
  columns = 100
  rows = 32
  kittyProtocolActive = false
  writes: string[] = []
  raw = true
  start(): void {}
  stop = vi.fn()
  drainInput = vi.fn(async () => undefined)
  restoreRawModeSync = vi.fn(() => { this.raw = false })
  restoreProtocolsSync = vi.fn()
  write(data: string): void { this.writes.push(data) }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void { this.write('\x1b[?25h') }
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

const handles: TuiSurfaceHandle[] = []
const workers: FakeWorker[] = []
beforeEach(() => {
  workers.length = 0
  vi.mocked(Worker).mockImplementation(function () {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker as unknown as Worker
  })
})
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.stop()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function startExitSurface() {
  vi.stubEnv('SEEKTTY_NATIVE_TAIL', '1')
  vi.stubEnv('TERM', 'xterm-256color')
  vi.spyOn(provider, 'inspectProviderReadiness').mockResolvedValue({ kind: 'ready' })
  vi.spyOn(SyntaxHighlighter, 'create').mockImplementation(() => new Promise(() => undefined))
  const errors = vi.spyOn(surface, 'reportCleanupError').mockImplementation(() => undefined)
  const terminal = new ExitTerminal()
  vi.spyOn(surface, 'createTerminal').mockReturnValue(terminal)
  vi.spyOn(surface, 'isInteractive').mockReturnValue(true)
  const documents = [
    ['locale', { locale: 'en' }],
    ['seektty-appearance', { theme: 'dark', terminalBackgroundSync: 'off' }],
    ['seektty-behavior', { mouseMode: 'native', desktopNotifications: false }],
    ['seektty-welcome', welcomeSettings()],
  ].map(([namespace, value]) => ({ namespace, value, schema: {}, revision: 1, applies: 'live', secrets: [] }))
  const management = {
    settings: { describe: vi.fn(async () => documents) },
    welcome: { collectFastfetch: vi.fn(async () => ({ status: 'cancelled', rows: [] })),
      collectFastfetchLogo: vi.fn(async () => ({ status: 'cancelled' })) },
  } as unknown as TuiManagementBridge
  const snapshot = welcomeSnapshot([welcomeAssistant('pending-worker', '- pending table item\n'.repeat(4000), 'settled')])
  const session = { getSnapshot: () => snapshot, projections: { faceOf: () => ({ getSnapshot: () => undefined }) } }
  const active = { sessionId: snapshot.sessionId, session, workspacePath: 'synthetic',
    summary: { id: snapshot.sessionId, displayTitle: 'exit fixture', agentPreset: 'standard' } } as unknown as TuiActiveSession
  const unsubscribe = vi.fn()
  const capabilities = {
    active: () => active, subscribeActive: vi.fn(() => unsubscribe),
    headerFacts: vi.fn(async () => ({ hostVersion: 'fixture', nodeVersion: 'fixture', platform: 'darwin',
      architecture: 'arm64', profile: 'tui', workspace: 'synthetic', session: 'fixture', mode: 'standard',
      model: 'fixture', permission: 'workspace-write', running: false })),
    draftAttachments: () => [], draftFiles: () => [], jobs: () => [], managementBridge: () => management,
    subagentPresentation: () => ({
      continuation: () => ({ support: 'unsupported', reason: 'navigation-unavailable' }),
      publicStatusEvidence: () => ({ support: 'unsupported', reason: 'session-status-unavailable' }),
      listDirectChildren: async () => ({ support: 'unsupported', reason: 'catalog-unavailable' }),
    }),
  } as unknown as HarnessTuiCapabilities
  const effects: (() => unknown)[] = []
  const dispose = vi.fn(async () => { for (const cleanup of effects.splice(0)) await cleanup() })
  vi.spyOn(surface, 'startClient').mockResolvedValue({ capabilities, session,
    ctx: { effect: (effect: () => () => unknown) => { effects.push(effect()) }, fiber: { dispose } }, sessionId: snapshot.sessionId, workspacePath: 'synthetic',
  } as unknown as TuiClient)
  const handle = await startTuiSurface({ api: {}, rpc: {}, cwd: 'synthetic', management } as TuiStartOptions)
  handles.push(handle)
  await vi.waitFor(() => expect(workers.some(worker => worker.postMessage.mock.calls.length > 0 && worker.terminate.mock.calls.length === 0)).toBe(true))
  const worker = workers.findLast(worker => worker.terminate.mock.calls.length === 0)!
  return { handle, terminal, worker, errors, dispose, unsubscribe }
}

describe('native-tail Surface exit', () => {
  it.each(['worker', 'output'] as const)('bounds an unresponsive %s, restores raw mode immediately, and completes repeated stops once', async (blocked) => {
    const before = process.listeners('SIGTERM')
    const { handle, terminal, worker, errors, dispose, unsubscribe } = await startExitSurface()
    const completed = vi.fn()
    void handle.closed.then(completed)
    let releaseOutput: (() => void) | undefined
    if (blocked === 'output') {
      vi.spyOn(NativeOutput.prototype, 'drain').mockImplementation(() => new Promise(resolve => { releaseOutput = resolve }))
    }
    const started = Date.now()
    const first = handle.stop()
    expect(handle.stop()).toBe(first)
    expect(terminal.raw).toBe(false)
    expect(terminal.restoreProtocolsSync).toHaveBeenCalled()
    expect(process.listeners('SIGTERM').length).toBe(before.length + 1)
    await first
    expect(Date.now() - started).toBeLessThan(CLEANUP_TIMEOUT_MS + 1500)
    expect(await handle.closed).toEqual({ kind: 'exit', code: 1 })
    expect(completed).toHaveBeenCalledOnce()
    expect(errors).toHaveBeenCalledOnce()
    expect(errors.mock.calls[0]?.[0].message).toContain('deadline')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(process.listeners('SIGTERM')).toEqual(before)
    const writes = terminal.writes.length
    worker.emit('message', { lines: ['LATE_WORKER_PAGE'], done: true, total: 1 })
    worker.emit('error', new Error('late worker error'))
    worker.emit('exit', 1)
    releaseOutput?.()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(terminal.writes.length).toBe(writes)
  })

  it('delivers a slow final worker page within the deadline and closes successfully', async () => {
    const { handle, terminal, worker, errors } = await startExitSurface()
    const stopping = handle.stop()
    expect(terminal.raw).toBe(false)
    setTimeout(() => worker.emit('message', { lines: ['SLOW_FINAL_HISTORY'], done: true, total: 1 }), 30)
    await stopping
    expect(await handle.closed).toEqual({ kind: 'exit', code: 0 })
    expect(terminal.writes.join('')).toContain('SLOW_FINAL_HISTORY')
    expect(terminal.writes.at(-1)).toBe('\x1b[?25h')
    expect(errors).not.toHaveBeenCalled()
  })

  it('continues resource cleanup after worker and input-drain failures', async () => {
    const { handle, terminal, worker, errors, dispose, unsubscribe } = await startExitSurface()
    terminal.drainInput.mockRejectedValue(new Error('input drain failed'))
    const disposeTranscript = Transcript.prototype.dispose
    vi.spyOn(Transcript.prototype, 'dispose').mockImplementationOnce(function (this: Transcript) {
      disposeTranscript.call(this)
      throw new Error('transcript disposal failed')
    })
    const stopping = handle.stop()
    queueMicrotask(() => worker.emit('error', new Error('worker failed')))
    await stopping
    expect(terminal.raw).toBe(false)
    expect(await handle.closed).toEqual({ kind: 'exit', code: 1 })
    expect(terminal.stop).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(errors).toHaveBeenCalledOnce()
  })

  it('does not acknowledge a final frame resolving after the cleanup deadline', async () => {
    const { handle, worker, terminal } = await startExitSurface()
    let release!: (delivered: boolean) => void
    vi.spyOn(NativeOutput.prototype, 'frame').mockImplementation(() => new Promise(resolve => { release = resolve }))
    const acknowledge = vi.fn()
    const takeBatch = Transcript.prototype.takeNativeHistoryBatch
    vi.spyOn(Transcript.prototype, 'takeNativeHistoryBatch').mockImplementation(function (this: Transcript) {
      const batch = takeBatch.call(this)
      return batch === undefined ? undefined : { ...batch, acknowledge }
    })
    const stopping = handle.stop()
    worker.emit('message', { lines: ['FINAL_IN_FLIGHT'], done: true, total: 1 })
    await stopping
    expect(await handle.closed).toEqual({ kind: 'exit', code: 1 })
    expect(terminal.raw).toBe(false)
    const writes = terminal.writes.length
    release(true)
    await new Promise(resolve => setImmediate(resolve))
    expect(acknowledge).not.toHaveBeenCalled()
    expect(terminal.writes.length).toBe(writes)
  })

  it.each([
    { event: 'SIGTERM' as const, code: 143 },
    { event: 'SIGHUP' as const, code: 129 },
    { event: 'uncaughtException' as const, code: 1 },
    { event: 'unhandledRejection' as const, code: 1 },
  ])('keeps $event guards during stop and cancels preparation on repeated fatal events', async ({ event, code }) => {
    const listeners = (): Array<(...args: unknown[]) => void> => (process as EventEmitter).listeners(event) as Array<(...args: unknown[]) => void>
    const before = listeners()
    const { handle, terminal, worker, dispose } = await startExitSurface()
    const fatal = listeners().find(listener => !before.includes(listener))!
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stopping = handle.stop()
    // Call only the Surface's registered listener, leaving the test runner's
    // real signal/crash handlers untouched.
    await new Promise(resolve => setTimeout(resolve, 20))
    fatal(event === 'SIGTERM' || event === 'SIGHUP' ? event : new Error('fatal fixture'))
    fatal(event === 'SIGTERM' || event === 'SIGHUP' ? event : new Error('repeated fatal fixture'))
    await stopping
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(code))
    expect(exit).toHaveBeenCalledOnce()
    expect(terminal.raw).toBe(false)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
    expect(listeners()).toEqual(before)
  })
})

describe('native resource disposal', () => {
  it.each(['resolve', 'reject'] as const)('releases hung output waiters and ignores a late sink %s', async (settlement) => {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const sink = vi.fn(() => new Promise<void>((ok, fail) => { resolve = ok; reject = fail }))
    const onError = vi.fn()
    const output = new NativeOutput(sink, onError)
    const frame = output.frame(['IN_FLIGHT'], [], 80, 24, null)
    output.control('QUEUED_CONTROL')
    const drain = output.drain()
    await Promise.resolve()
    output.dispose()
    output.dispose()
    await expect(frame).resolves.toBe(false)
    await expect(drain).resolves.toBeUndefined()
    await expect(output.frame(['AFTER_DISPOSE'], [], 80, 24, null)).resolves.toBe(false)
    if (settlement === 'resolve') resolve()
    else reject(new Error('late sink error'))
    await new Promise(resolve => setImmediate(resolve))
    expect(sink).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    expect(output.presentedFrame()).toBeUndefined()
  })

  it.each(['slow', 'reject', 'throw'] as const)('does not wait on %s worker termination and ignores late callbacks', async (mode) => {
    const worker = new FakeWorker()
    let release!: (code: number) => void
    if (mode === 'slow') worker.termination = new Promise(resolve => { release = resolve })
    if (mode === 'reject') worker.terminate.mockImplementation(() => { worker.referenced = true; return Promise.reject(new Error('termination failed')) })
    if (mode === 'throw') worker.terminate.mockImplementation(() => { worker.referenced = true; throw new Error('termination failed') })
    const changed = vi.fn()
    const preparation = new NativeMarkdownPreparation('- large\n'.repeat(4000), 80, 1, undefined, changed,
      () => worker as unknown as Worker)
    const waiting = preparation.wait()
    preparation.dispose()
    preparation.dispose()
    await expect(waiting).resolves.toBeUndefined()
    worker.emit('message', { lines: ['LATE'], done: true, total: 1 })
    worker.emit('error', new Error('late worker error'))
    worker.emit('exit', 1)
    expect(changed).not.toHaveBeenCalled()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.unref).toHaveBeenCalledTimes(2)
    expect(worker.referenced).toBe(false)
    if (mode === 'slow') release(0)
    await new Promise(resolve => setImmediate(resolve))
    // A released scheduler slot must remain usable after termination failure.
    const next = new FakeWorker()
    const nextPreparation = new NativeMarkdownPreparation('next', 80, 1, undefined, vi.fn(), () => next as unknown as Worker)
    expect(next.postMessage).toHaveBeenCalledOnce()
    nextPreparation.dispose()
  })
})
