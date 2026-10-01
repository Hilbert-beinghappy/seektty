import { expect, it, vi } from 'vitest'
import { HarnessTuiCapabilities, tuiCommands } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'
import { createSessionManagementPorts, workspaceBrowserFrame } from '../src/host/session-management-bridge.ts'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-workspace-controller/remote'
import { setUiLocale } from '../src/client/locale.ts'

function observable(initial) {
  let state = initial
  const listeners = new Set()
  return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { state = next; for (const fn of [...listeners]) fn() }, listeners }
}
async function fixture() {
  const events = [{ event: { type: 'artifact/future', seq: 0, time: 1, data: { note: 'retained artifact' } } }]
  const session = new Session('a', { sessions: { history: async () => ({ result: { ok: true, value: { events, hasMore: true, projections: { asOfSeq: 0, values: { plan: { active: true, pending: false }, todos: [{ title: 'Host todo' }] } }, assistantStream: { revision: 0 } } } }) } }, {})
  await session.open()
  const sessions = observable({ ids: ['a', 'b'], byId: {
    a: { id: 'a', displayTitle: 'Active row', cwd: '/synthetic-host', updatedAt: 2, running: false },
    b: { id: 'b', displayTitle: 'Archived row', cwd: '/synthetic-host', updatedAt: 1, running: false },
  }, phase: 'ready', current: 'a' })
  const native = observable({ items: [], archivedSessionIds: ['b'], pinnedSessionIds: ['b'] })
  const description = observable({ version: '0.2.0-rc.2' })
  const effects = []
  const restore = vi.fn(async ({ sessionId }) => { native.set({ ...native.getSnapshot(), archivedSessionIds: [] }); return { ok: true, value: { archivedSessionIds: [] } } })
  const archive = vi.fn(async ({ sessionId }) => { native.set({ ...native.getSnapshot(), archivedSessionIds: [sessionId] }); return { ok: true, value: { archivedSessionIds: [sessionId] } } })
  const open = vi.fn()
  const oldArchive = vi.fn()
  const ctx = { remote: { $on() {}, workspace: { archiveSession: archive, unarchiveSession: restore, pinSession: vi.fn(), unpinSession: vi.fn() } }, on() {}, effect: fn => effects.push(fn()),
    connection: { hostDescription: description }, sessions: { list: sessions, subagentAddress: () => undefined, binding: () => ({ session }), open },
    workspaces: { list: observable({ items: [], archivedSessionIds: ['b'] }), archiveSession: oldArchive } }
  const bridge = { sessionManagement: { snapshot: native.getSnapshot, subscribe: native.subscribe, methods: () => new Set(['workspace/archiveSession', 'workspace/unarchiveSession', 'workspace/pinSession', 'workspace/unpinSession', 'session/cancel']) } }
  const cancel = vi.fn(async () => ({ result: { ok: true, value: { accepted: true } } }))
  const capabilities = new HarnessTuiCapabilities(ctx, { sessions: { cancel } }, 'fixture', '/synthetic-host', bridge)
  return { capabilities, sessions, native, description, archive, restore, oldArchive, open, session, events, effects, cancel }
}
it('public /sessions archived restores from the real archive/pin baseline', async () => {
  const f = await fixture()
  const requests = []
  const ids = ['b', 'restore']
  const host = { overlays: { select: async request => { requests.push(request); const id = ids.shift(); return request.choices.find(row => row.id === id) }, progress: request => request.work(() => {}, new AbortController().signal) }, notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn() }
  await new TuiActions(f.capabilities, host).execute('sessions', 'archived')
  expect(requests[0].choices).toHaveLength(1)
  expect(requests[0].choices[0].label).toContain('★ Archived row')
  expect(f.restore).toHaveBeenCalledWith({ sessionId: 'b' })
  expect(f.capabilities.sessionBrowser().rows('archived')).toEqual([])
})
it('public /archive uses controller receipts and never the old Workspace facade', async () => {
  const f = await fixture()
  const host = { overlays: { confirm: async () => true, progress: request => request.work(() => {}, new AbortController().signal) }, notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn() }
  await new TuiActions(f.capabilities, host).execute('archive', '')
  expect(f.archive).toHaveBeenCalledWith({ sessionId: 'a' })
  expect(f.oldArchive).not.toHaveBeenCalled()
  f.description.set(undefined)
  await f.capabilities.archiveSession('a').catch(() => {})
  expect(f.archive).toHaveBeenCalledOnce()
})
it('public /plans reads current Host projection and loaded-window coverage; disposal releases subscriptions', async () => {
  setUiLocale('en')
  try {
    const f = await fixture()
    const requests = []
    const detail = vi.fn()
    let first = true
    const host = { overlays: { select: async request => { requests.push(request); if (!first) return; first = false; return request.choices.find(row => row.id === '__plan_state__') }, detail }, copy: vi.fn(), notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn() }
    await new TuiActions(f.capabilities, host).execute('plans', '')
    expect(requests[0].detail).toContain('loaded history window')
    expect(detail.mock.calls[0][0].content).toContain('Plan mode: active')
    expect(detail.mock.calls[0][0].content).toContain('Host todo')
    const journal = f.session.recordedEvents()
    expect(journal[0].event).toBe(f.events[0].event)
    expect(Object.isFrozen(journal)).toBe(true)
    for (const dispose of f.effects) dispose()
    expect(f.description.listeners.size).toBe(0)
    expect(f.sessions.listeners.size).toBe(0)
    expect(tuiCommands().some(c => c.name === 'plans')).toBe(true)
    expect(tuiCommands().some(c => c.name === 'plan')).toBe(false)
  } finally { setUiLocale('zh') }
})
it('native Workspace frames preserve pins/order/archive and do not fabricate a pre-baseline state', () => {
  const a = { workspaceId: 'a', path: '/a', sessionIds: ['s1'] }
  const b = { workspaceId: 'b', path: '/b', sessionIds: ['s2'] }
  expect(workspaceBrowserFrame(undefined, { type: 'pinned', pinnedSessionIds: ['s2'] })).toBeUndefined()
  let state = workspaceBrowserFrame(undefined, { type: 'baseline', value: { items: [a, b], pinnedSessionIds: [], archivedSessionIds: [] } })
  state = workspaceBrowserFrame(state, { type: 'pinned', pinnedSessionIds: ['s2'] })
  state = workspaceBrowserFrame(state, { type: 'order', workspaceIds: ['b', 'a'] })
  state = workspaceBrowserFrame(state, { type: 'archived', archivedSessionIds: ['s1'] })
  expect(state).toEqual({ items: [b, a], pinnedSessionIds: ['s2'], archivedSessionIds: ['s1'] })
})
it('Host ports refuse unconfirmed file scopes despite lookalike descriptor/receiver names', async () => {
  const descriptor = { service: 'workspaceFiles', namespace: 'workspaceFiles', method: 'read', invocation: { kind: 'direct' } }
  const read = vi.fn()
  const invoke = vi.fn(async request => { expect(request.args).toEqual({ workspaceFileScopeId: 'fixture', path: '/Host/data', range: { offset: 1, limit: 200 } }); return { absolutePath: '/Host/data', version: 'v1', offset: 1, text: 'Host bytes', lines: 1, eof: true } })
  let mounted = true
  const services = { typert: { local: { get: name => name === 'workspaceFiles/read' ? descriptor : TYPERT_REMOTE.descriptors.find(row => `${row.namespace}/${row.method}` === name) } }, workspaceFiles: { read }, workspaceChanges: { summary() { return { turn: 1 } }, async diff() { return undefined } } }
  const ctx = { effect: effect => effect(), get: key => key === 'workspaceFiles' && !mounted ? undefined : services[key], typertGateway: { invoke } }
  const ports = createSessionManagementPorts(ctx)
  expect(ports.artifacts.available('workspaceFiles/read')).toBe(true)
  await expect(ports.artifacts.read('fixture', '/Host/data', { offset: 1, limit: 200 }, new AbortController().signal)).rejects.toThrow(/scope|permission|root/)
  expect(read).not.toHaveBeenCalled()
  expect(ports.artifacts.available('workspaceChanges/summary')).toBe(true)
  mounted = false
  await expect(ports.artifacts.read('fixture', '/Host/data', {}, new AbortController().signal)).rejects.toThrow(/scope|permission|root/)
  expect(invoke).not.toHaveBeenCalled()
})
