import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'

const sessionId = (value: string): SessionId => value as SessionId

function harness() {
  const current = sessionId('current')
  const target = sessionId('target')
  const renameSession = vi.fn(async (_id: SessionId, title: string) => title)
  const forkSession = vi.fn(async () => sessionId('forked'))
  const archiveSession = vi.fn(async () => undefined)
  const exportSession = vi.fn(async () => ({ path: 'target.zip', bytes: 12 }))
  const exportMarkdown = vi.fn(async () => ({ path: 'target.md', bytes: 8 }))
  const sessionTarget = vi.fn((id: SessionId) => id === target ? {
    sessionId: target,
    summary: { id: target, displayTitle: 'Target Session', title: 'Target Session' },
  } : id === current ? {
    sessionId: current,
    summary: { id: current, displayTitle: 'Current Session', title: 'Current Session' },
  } : undefined)
  const capabilities = {
    active: () => ({ sessionId: current }),
    sessionTarget,
    renameSession,
    forkSession,
    archiveSession,
    exportSession,
    exportMarkdown,
  } as unknown as HarnessTuiCapabilities
  const overlays = {
    input: vi.fn(async () => 'renamed'),
    confirm: vi.fn(async () => true),
    progress: vi.fn(async (request: { work: (report: (value: string) => void, signal: AbortSignal) => Promise<unknown> }) => request.work(() => undefined, new AbortController().signal)),
  }
  const notice = vi.fn()
  const host = {
    overlays,
    transcript: {},
    notice,
    refresh: vi.fn(), refreshHeader: vi.fn(), applyTheme: vi.fn(), applyAppearance: vi.fn(), applyLocale: vi.fn(),
    setEditor: vi.fn(), copy: vi.fn(), close: vi.fn(), restart: vi.fn(), requireRestart: vi.fn(),
    canChangeSession: () => true,
  } as unknown as TuiActionHost
  return { actions: new TuiActions(capabilities, host), target, current, renameSession, forkSession, archiveSession, exportSession, exportMarkdown, notice }
}

describe('targeted Session context actions', () => {
  it('renames, forks, and archives the right-clicked Session rather than the active Session', async () => {
    const h = harness()
    await h.actions.executeContext({ target: { kind: 'session', sessionId: h.target }, actionId: 'rename' })
    await h.actions.executeContext({ target: { kind: 'session', sessionId: h.target }, actionId: 'fork' })
    await h.actions.executeContext({ target: { kind: 'session', sessionId: h.target }, actionId: 'archive' })
    expect(h.renameSession).toHaveBeenCalledWith(h.target, 'renamed')
    expect(h.forkSession).toHaveBeenCalledWith(h.target)
    expect(h.archiveSession).toHaveBeenCalledWith(h.target)
    expect(h.renameSession).not.toHaveBeenCalledWith(h.current, expect.anything())
  })

  it('exports both formats from the exact target Session', async () => {
    const h = harness()
    await h.actions.executeContext({ target: { kind: 'session', sessionId: h.target }, actionId: 'export-descendants' })
    await h.actions.executeContext({ target: { kind: 'session', sessionId: h.target }, actionId: 'export-markdown' })
    expect(h.exportSession).toHaveBeenCalledWith(h.target, 'renamed', true, expect.any(AbortSignal))
    expect(h.exportMarkdown).toHaveBeenCalledWith(h.target, 'renamed')
  })

  it('revalidates a stale Session before doing anything', async () => {
    const h = harness()
    await h.actions.executeContext({ target: { kind: 'session', sessionId: 'gone' }, actionId: 'archive' })
    expect(h.archiveSession).not.toHaveBeenCalled()
    expect(h.notice).toHaveBeenCalledWith(expect.stringMatching(/不可用/u), 'error')
  })
})
