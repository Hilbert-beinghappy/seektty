import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-workspace-controller/remote'
import { SessionBrowserController, sessionBrowserCommand, type SessionBrowserSnapshot, type SessionBrowserRemote } from '../src/client/session-browser.ts'
import type { OverlayPrompts, SelectOverlayRequest } from '../src/client/overlays.ts'

const id = SessionId('synthetic-running')
const archivedId = SessionId('synthetic-archived')
const allMethods = new Set(['workspace/archiveSession', 'workspace/unarchiveSession', 'workspace/pinSession', 'workspace/unpinSession', 'session/cancel'])
function fixture(running: boolean | undefined = false, timeoutMs = 1000) {
  let state: SessionBrowserSnapshot = { ready: true, generation: 1, sessions: [
    { id, displayTitle: '中文 long title 😀', updatedAt: 10, ...(running === undefined ? {} : { running }), cwd: '/synthetic-host/one' },
    { id: archivedId, displayTitle: 'Archived', updatedAt: 20, running: false, cwd: '/synthetic-host/two' },
  ], archivedSessionIds: [archivedId], pinnedSessionIds: [] }
  const listeners = new Set<() => void>()
  const source = { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const change = (patch: Partial<SessionBrowserSnapshot>): void => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }
  const remote: SessionBrowserRemote = {
    cancel: vi.fn<SessionBrowserRemote['cancel']>(async () => ({ ok: true, value: { accepted: true } })),
    archiveSession: vi.fn<SessionBrowserRemote['archiveSession']>(async ({ sessionId }) => { const ids = [...state.archivedSessionIds, sessionId]; change({ archivedSessionIds: ids }); return { ok: true, value: { archivedSessionIds: ids } } }),
    unarchiveSession: vi.fn<SessionBrowserRemote['archiveSession']>(async ({ sessionId }) => { const ids = state.archivedSessionIds.filter(id => id !== sessionId); change({ archivedSessionIds: ids }); return { ok: true, value: { archivedSessionIds: ids } } }),
    pinSession: vi.fn<SessionBrowserRemote['pinSession']>(async ({ sessionId }) => { change({ pinnedSessionIds: [sessionId] }); return { ok: true, value: { pinnedSessionIds: [sessionId] } } }),
    unpinSession: vi.fn<SessionBrowserRemote['pinSession']>(async () => { change({ pinnedSessionIds: [] }); return { ok: true, value: { pinnedSessionIds: [] } } }),
  }
  let methods: ReadonlySet<string> | undefined = allMethods
  const open = vi.fn()
  const controller = new SessionBrowserController({ source, remote, methods: () => methods, open, timeoutMs })
  return { controller, remote, source, open, change, listeners, setMethods: (value: ReadonlySet<string> | undefined) => { methods = value } }
}
const signal = (): AbortSignal => new AbortController().signal
async function tick(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
afterEach(() => vi.useRealTimers())

describe('published Session management contracts', () => {
  it('uses the installed official descriptor names and archive schema', () => {
    const descriptors = TYPERT_REMOTE.descriptors
    for (const method of [...allMethods].filter(name => name.startsWith('workspace/'))) {
      expect(descriptors.some(item => `${item.namespace}/${item.method}` === method)).toBe(true)
    }
    const archive = descriptors.find(item => item.method === 'archiveSession')!
    expect(archive.sourceLocation).toMatchObject({ file: 'packages/api/workspace-controller/src/index.ts' })
    const parameter = archive.parameters[0]!.codec!
    const result = archive.result!
    if (parameter.mode !== 'strict' || result.mode !== 'strict') throw new Error('Expected official strict descriptor codecs')
    const schema = parameter.create()
    expect(() => schema.parse({ sessionId: id })).not.toThrow()
    expect(() => result.create().parse({ archivedSessionIds: [id] })).not.toThrow()
    expect(() => result.create().parse({})).toThrow()
  })
  it('lists active/all/archived from the Host baseline and honors pin order after reopening', async () => {
    const f = fixture()
    expect(f.controller.rows().map(row => row.id)).toEqual([id])
    expect(f.controller.rows('all').map(row => row.id)).toEqual([archivedId, id])
    expect(f.controller.rows('archived').map(row => row.id)).toEqual([archivedId])
    await f.controller.mutate('restore', archivedId, signal())
    await f.controller.mutate('pin', id, signal())
    expect(f.controller.rows('all')[0]?.id).toBe(id)
    const reopened = new SessionBrowserController({ source: f.source, remote: f.remote, methods: () => allMethods, open: f.open })
    expect(reopened.rows()[0]?.pinned).toBe(true)
    await reopened.mutate('unpin', id, signal())
    expect(reopened.rows()[0]?.id).toBe(archivedId)
    f.controller.open(archivedId)
    expect(f.open).toHaveBeenCalledWith(archivedId)
  })
  it('keeps 1k sessions across workspaces and a running item reachable', () => {
    const f = fixture()
    f.change({ sessions: Array.from({ length: 1000 }, (_, index) => ({ id: SessionId(`s-${index}`), displayTitle: `长中文标题 ${index}`, updatedAt: index, running: index === 999, cwd: `/synthetic/${index % 5}` })), archivedSessionIds: [], pinnedSessionIds: [SessionId('s-0')] })
    expect(f.controller.rows()).toHaveLength(1000)
    expect(f.controller.rows().slice(0, 2).map(row => row.id)).toEqual(['s-0', 's-999'])
  })
  it.each([undefined, new Set<string>()])('does not invoke unknown or missing capabilities %s', async methods => {
    const f = fixture(); f.setMethods(methods)
    await expect(f.controller.mutate('pin', id, signal())).rejects.toThrow()
    expect(f.remote.pinSession).not.toHaveBeenCalled()
  })
  it('does not open an archived Session or infer unknown running state as idle', async () => {
    const f = fixture()
    f.change({ sessions: f.source.getSnapshot().sessions.map(({ running: _removed, ...row }) => row) })
    expect(() => f.controller.open(archivedId)).toThrow('Restore')
    await expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('unknown')
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
  })
  it('waits for successful cancel AND the Host idle observation before archive', async () => {
    const f = fixture(true)
    const work = f.controller.mutate('archive', id, signal())
    await tick()
    expect(f.remote.cancel).toHaveBeenCalledWith({ sessionId: id })
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
    f.change({ sessions: f.source.getSnapshot().sessions.map(row => ({ ...row, running: false })) })
    await work
    expect(f.remote.archiveSession).toHaveBeenCalledWith({ sessionId: id })
    expect(f.listeners.size).toBe(0)
  })
  it.each([true, undefined])('rechecks a coalesced idle edge before archive when current running=%s', async running => {
    const f = fixture(true)
    const work = f.controller.mutate('archive', id, signal())
    await tick()
    f.change({ sessions: f.source.getSnapshot().sessions.map(row => ({ ...row, running: false })) })
    f.change({ sessions: f.source.getSnapshot().sessions.map(({ running: _removed, ...row }) => ({ ...row, ...(running === undefined ? {} : { running }) })) })
    await expect(work).rejects.toThrow('archive refused')
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
    expect(f.listeners.size).toBe(0)
  })
  it.each([undefined, new Set<string>()])('rechecks withdrawn composition after stop: %s', async methods => {
    const f = fixture(true)
    const work = f.controller.mutate('archive', id, signal())
    await tick(); f.setMethods(methods)
    f.change({ sessions: f.source.getSnapshot().sessions.map(row => ({ ...row, running: false })) })
    await expect(work).rejects.toThrow()
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
    expect(f.listeners.size).toBe(0)
  })
  it('a failed stop never archives even if the running bit independently becomes false', async () => {
    const f = fixture(true)
    f.remote.cancel = vi.fn<SessionBrowserRemote['cancel']>(async () => { f.change({ sessions: f.source.getSnapshot().sessions.map(row => ({ ...row, running: false })) }); return { ok: false, error: new RemoteError('gateway/internal', 'stop failed', {}) } })
    await expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('stop failed')
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
  })
  it('an invalid stop receipt never archives', async () => {
    const f = fixture(true)
    f.remote.cancel = vi.fn<SessionBrowserRemote['cancel']>(async () => ({ ok: true, value: {} } as RemoteResult<{ accepted: true }>))
    await expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('Stop was not confirmed')
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
  })
  it('retains the official all-activity refusal rather than forcing archive', async () => {
    const f = fixture()
    f.remote.archiveSession = vi.fn<SessionBrowserRemote['archiveSession']>(async () => ({ ok: false, error: new RemoteError('workspace/session-active', 'background job still active', { sessionId: id, activity: [] }) }))
    await expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('workspace/session-active')
    expect(f.source.getSnapshot().archivedSessionIds).not.toContain(id)
  })
  it('permission failure and invalid receipts are not success', async () => {
    const f = fixture()
    f.remote.pinSession = vi.fn<SessionBrowserRemote['pinSession']>(async () => ({ ok: false, error: new RemoteError('gateway/internal', 'permission denied', {}) }))
    await expect(f.controller.mutate('pin', id, signal())).rejects.toThrow('permission denied')
    f.remote.pinSession = vi.fn<SessionBrowserRemote['pinSession']>(async () => ({ ok: true, value: { pinnedSessionIds: [] } }))
    await expect(f.controller.mutate('pin', id, signal())).rejects.toThrow('unconfirmed mutation')
  })
  it.each(['abort', 'reset', 'disconnect'] as const)('prevents late stop completion from archiving after %s', async reason => {
    const f = fixture(true)
    let finish!: (value: RemoteResult<{ accepted: true }>) => void
    f.remote.cancel = vi.fn<SessionBrowserRemote['cancel']>(() => new Promise(resolve => { finish = resolve }))
    const parent = new AbortController()
    const rejected = expect(f.controller.mutate('archive', id, parent.signal)).rejects.toThrow()
    await tick()
    if (reason === 'abort') parent.abort()
    else f.change(reason === 'reset' ? { generation: 2 } : { ready: false })
    await rejected
    finish({ ok: true, value: { accepted: true } })
    f.change({ ready: true, sessions: f.source.getSnapshot().sessions.map(row => ({ ...row, running: false })) })
    await tick()
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
    expect(f.listeners.size).toBe(0)
  })
  it('times out waiting for idle without issuing archive or leaving subscriptions', async () => {
    vi.useFakeTimers()
    const f = fixture(true, 20)
    const rejected = expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('archive refused')
    await tick(); await vi.advanceTimersByTimeAsync(21); await rejected
    expect(f.remote.archiveSession).not.toHaveBeenCalled()
    expect(f.listeners.size).toBe(0)
  })
  it('reports an unknown dispatched mutation outcome on cancellation, without retry', async () => {
    const f = fixture()
    f.remote.pinSession = vi.fn<SessionBrowserRemote['pinSession']>(() => new Promise(() => {}))
    const parent = new AbortController()
    const rejected = expect(f.controller.mutate('pin', id, parent.signal)).rejects.toThrow('may have completed')
    parent.abort(); await rejected
    expect(f.remote.pinSession).toHaveBeenCalledTimes(1)
    expect(f.source.getSnapshot().pinnedSessionIds).toEqual([])
  })
  it('terminal /sessions archived reaches restore through the existing overlay protocol', async () => {
    const f = fixture()
    const requests: SelectOverlayRequest[] = []
    const overlays = {
      select: vi.fn(async (request: SelectOverlayRequest) => { requests.push(request); return request.choices.find(row => row.id === (requests.length === 1 ? archivedId : 'restore')) }),
      progress: vi.fn(async (request: { work(report: (chunk: string) => void, signal: AbortSignal): Promise<void> }) => request.work(() => {}, signal())),
    } as unknown as OverlayPrompts
    await sessionBrowserCommand(f.controller, 'archived', overlays)
    expect(requests[0]?.choices.map(row => row.id)).toEqual([archivedId])
    expect(requests[1]?.choices.find(row => row.id === 'open')?.disabledReason).toBeDefined()
    expect(f.remote.unarchiveSession).toHaveBeenCalledWith({ sessionId: archivedId })
    expect(f.open).not.toHaveBeenCalled()
  })
  it('terminal cancellation leaves Session/draft selection untouched and a declined archive does not stop', async () => {
    const f = fixture(true)
    const select = vi.fn().mockResolvedValueOnce({ id }).mockResolvedValueOnce({ id: 'archive', label: 'Archive' })
    const overlays = { select, confirm: vi.fn(async () => false), progress: vi.fn() } as unknown as OverlayPrompts
    await sessionBrowserCommand(f.controller, 'active', overlays)
    expect(f.remote.cancel).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
    select.mockResolvedValueOnce(undefined)
    await sessionBrowserCommand(f.controller, 'all', overlays)
    expect(f.open).not.toHaveBeenCalled()
  })
})

it('keeps native manual Session order below the Host pin order without dropping archived members', async () => {
  const f = fixture()
  f.change({ sessionOrder: [id, archivedId] })
  expect(f.controller.rows('all').map(row => row.id)).toEqual([id, archivedId])
  await f.controller.mutate('pin', archivedId, signal())
  expect(f.controller.rows('all').map(row => row.id)).toEqual([archivedId, id])
  await f.controller.mutate('unpin', archivedId, signal())
  expect(f.controller.rows('all').map(row => row.id)).toEqual([id, archivedId])
})
it('a synchronous Host reset plus failed stop does not leak a rejection or dispatch archive', async () => {
  const f = fixture(true)
  f.remote.cancel = vi.fn<SessionBrowserRemote['cancel']>(async () => { f.change({ generation: 2 }); throw new Error('carrier reset') })
  await expect(f.controller.mutate('archive', id, signal())).rejects.toThrow('may have completed')
  await tick(); expect(f.remote.archiveSession).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0)
})
