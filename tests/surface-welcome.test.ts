import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@mariozechner/pi-tui'
import type { ConversationSnapshot, SessionFace } from '@deepseek-ai/dsh-client-runtime/node-client'
import type { TuiActiveSession, TuiHeaderFacts, HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { TuiStartOptions, TuiSurfaceHandle } from '../src/client/index.ts'
import type { TuiClient } from '../src/client/client-runtime.ts'
import type { TuiManagementBridge, TuiSettingsDocument } from '../src/protocol.ts'
import { internals as surface, startTuiSurface } from '../src/client/surface.ts'
import { internals, Transcript } from '../src/client/transcript.ts'
import { SyntaxHighlighter } from '../src/client/syntax-highlighter.ts'
import * as provider from '../src/client/provider-onboarding.ts'
import { welcomeAssistant, welcomeSnapshot, welcomeSettings } from './helpers/welcome-fixture.ts'

vi.mock('../src/client/client-runtime.ts', () => ({ startTuiClient: vi.fn() }))

class SurfaceTerminal implements Terminal {
  columns = 100
  rows = 32
  kittyProtocolActive = false
  writes: string[] = []
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve() }
  write(data: string): void { this.writes.push(data) }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

const handles: TuiSurfaceHandle[] = []
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.stop()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('actual Surface Header → Welcome wiring (#196)', () => {
  it.each(['full', 'native', 'native-tail'] as const)('%s preserves historical components through asynchronous header changes', async (mode) => {
    const mouseMode = mode === 'native-tail' ? 'native' : mode
    if (mode === 'native-tail') vi.stubEnv('SEEKTTY_NATIVE_TAIL', '1')
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    vi.spyOn(provider, 'inspectProviderReadiness').mockResolvedValue({ kind: 'ready' })
    // Isolate welcome invalidation from genuine lazy syntax invalidation. Syntax
    // behavior remains covered by the existing syntax/theme regression suites.
    vi.spyOn(SyntaxHighlighter, 'create').mockImplementation(() => new Promise(() => {}))
    const terminal = new SurfaceTerminal()
    vi.spyOn(surface, 'createTerminal').mockReturnValue(terminal)
    vi.spyOn(surface, 'isInteractive').mockReturnValue(true)
    const documents: TuiSettingsDocument[] = [
      ['locale', { locale: 'en' }],
      ['seektty-appearance', { theme: 'dark', colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' }],
      ['seektty-behavior', { mouseMode, desktopNotifications: false }],
      ['seektty-welcome', welcomeSettings()],
    ].map(([namespace, value]) => ({ namespace: namespace as string, value, schema: {}, revision: 1, applies: 'live', secrets: [] }))
    const management = {
      settings: { describe: vi.fn(async () => documents) },
      welcome: { collectFastfetch: vi.fn(async () => ({ status: 'cancelled', rows: [] })), collectFastfetchLogo: vi.fn(async () => ({ status: 'cancelled' })) },
    } as unknown as TuiManagementBridge
    let snapshot: ConversationSnapshot = welcomeSnapshot([])
    const session = {
      getSnapshot: () => snapshot,
      projections: { faceOf: () => ({ getSnapshot: () => undefined }) },
      loadOlder: vi.fn(async () => {}),
    } as unknown as SessionFace
    const active = {
      sessionId: snapshot.sessionId, session, workspacePath: 'synthetic',
      summary: { id: snapshot.sessionId, displayTitle: 'fixture', agentPreset: 'standard' },
    } as TuiActiveSession
    let listener!: (current: TuiActiveSession | undefined, value: ConversationSnapshot | undefined) => void
    const unsubscribe = vi.fn()
    let model = 'MODEL_BEFORE'
    const header: TuiHeaderFacts = { hostVersion: 'fixture', nodeVersion: 'fixture', platform: 'win32', architecture: 'x64',
      profile: 'tui', workspace: 'synthetic', session: 'fixture', mode: 'standard', model, permission: 'workspace-write', running: false }
    const headerFacts = vi.fn(async () => ({ ...header, model }))
    const capabilities = {
      active: () => active,
      subscribeActive: vi.fn((callback: typeof listener) => { listener = callback; return unsubscribe }),
      headerFacts, draftAttachments: () => [], jobs: () => [],
      managementBridge: () => management,
      subagentPresentation: () => ({
        continuation: () => ({ support: 'unsupported', reason: 'navigation-unavailable' }),
        publicStatusEvidence: () => ({ support: 'unsupported', reason: 'session-status-unavailable' }),
        listDirectChildren: async () => ({ support: 'unsupported', reason: 'catalog-unavailable' }),
      }),
    } as unknown as HarnessTuiCapabilities
    const dispose = vi.fn(async () => {})
    const start = vi.spyOn(surface, 'startClient').mockResolvedValue({ capabilities, session,
      ctx: { fiber: { dispose } }, sessionId: snapshot.sessionId, workspacePath: 'synthetic',
    } as unknown as TuiClient)
    const handle = await startTuiSurface({ api: {}, rpc: {}, cwd: 'synthetic', management, draft: 'UNSENT_DRAFT' } as TuiStartOptions)
    handles.push(handle)
    await vi.waitFor(() => expect(terminal.writes.join('')).toContain('MODEL_BEFORE'))
    const unit = 'cached historical content.\n'
    const history = Array.from({ length: 4 }, (_, i) => welcomeAssistant(`history-${i}`, unit.repeat(100), 'settled', i + 1))
    snapshot = welcomeSnapshot([...history, welcomeAssistant('live', 'LIVE_START', 'running', 5)])
    listener(active, snapshot)
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 50))
    const before = internals.markdownCreated
    const updated = internals.markdownUpdated
    const globalRefresh = vi.spyOn(Transcript.prototype, 'refreshPresentation')
    for (let i = 0; i < 20; i++) {
      if (i === 10) model = 'MODEL_CHANGED_WHILE_HIDDEN'
      snapshot = welcomeSnapshot([...history, welcomeAssistant('live', `LIVE_START ${'stream '.repeat(i + 1)}`, 'running', 5)])
      listener(active, snapshot)
      // Allow every header Promise to run, rather than suppressing them with one
      // synchronous notification burst and mistaking that for a fixed callback.
      await Promise.resolve()
      await Promise.resolve()
    }
    expect(internals.markdownCreated - before).toBe(0)
    expect(internals.markdownUpdated - updated).toBe(20)
    expect(globalRefresh).not.toHaveBeenCalled()
    expect(headerFacts.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(start).toHaveBeenCalledOnce()
    expect(capabilities.subscribeActive).toHaveBeenCalledOnce()
    expect(dispose).not.toHaveBeenCalled()
    snapshot = welcomeSnapshot([...history, welcomeAssistant('live', 'LIVE_START FINAL_SURFACE_END', 'settled', 5)])
    listener(active, snapshot)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(terminal.writes.join('')).toContain('UNSENT_DRAFT')
    expect(terminal.writes.join('')).toContain('FINAL_SURFACE_END')
    await handle.stop()
    handles.splice(handles.indexOf(handle), 1)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
