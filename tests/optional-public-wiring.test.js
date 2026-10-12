import { expect, it, vi } from 'vitest'
import { Context, Service, symbols } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE as questionDescriptors } from '@deepseek-ai/dsh-user-questions/remote'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { createOptionalManagementPorts } from '../src/host/optional-management-bridge.ts'
import { createContinuedQuestionPorts } from '../src/host/continued-question-bridge.ts'
import { syntheticContinuedProjection, syntheticContinuedAnswer } from './fixtures/continued-questions.ts'
import { scriptedOverlays, syntheticSchedules, syntheticTeamBoard, syntheticLeadJournal, freshSignal, deferred, tick } from './fixtures/optional-native-views.ts'

function observable(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { value = next; for (const fn of [...listeners]) fn() }, listeners }
}
function fixture() {
  const agent = { id: 'synthetic-member' }
  let live = agent
  let teamRoot = 'synthetic-lead'
  const execute = vi.fn(async () => ({ isError: false, value: { resources: [{ uri: 'fixture://one', name: 'One' }] }, content: [] }))
  const journal = vi.fn(async () => ({ meta: { id: 'synthetic-lead' }, events: syntheticLeadJournal.events }))
  const invoke = vi.fn(async request => {
    if (request.namespace === 'userQuestions' && request.method === 'answer') return true
    if (request.method === 'catalog') return syntheticSchedules
    if (request.method === 'history') return { id: request.args.request.id, records: [], earlierRecordsUnavailable: true, earlierRecordsPruned: false, retention: { days: 30, records: 100 } }
    throw new Error('Unexpected gateway mutation in public read fixture')
  })
  const services = {
    agents: { get: id => id === agent.id ? live : undefined, roots: () => live === undefined ? [] : [live] },
    tools: { get: (_name, scope) => scope === agent ? {} : undefined, execute },
    agentTeams: { membership: () => ({ ...syntheticTeamBoard.membership, root: { id: teamRoot } }), listMembers: () => syntheticTeamBoard.members, listTasks: () => syntheticTeamBoard.tasks },
    sessionController: { inspect: journal }, schedule: { catalog() {}, list() {}, history() {}, update() {}, delete() {} },
    typert: { local: { get: endpoint => endpoint.startsWith('schedule/') ? { namespace: 'schedule', method: endpoint.split('/')[1], service: 'schedule', invocation: { kind: 'direct' } } : undefined } },
  }
  const hostContext = { get: key => services[key], typertGateway: { invoke } }
  const bridge = { ...createOptionalManagementPorts(hostContext), ...createContinuedQuestionPorts(hostContext) }
  const sessionState = observable({ openState: 'open', running: false, pending: [] })
  const faces = new Map()
  const faceOf = key => { if (!faces.has(key)) faces.set(key, observable(undefined)); return faces.get(key) }
  const session = { getSnapshot: sessionState.getSnapshot, subscribe: sessionState.subscribe, projections: { faceOf } }
  const sessions = observable({ phase: 'ready', ids: ['synthetic-member', 'other'], current: agent.id, byId: { [agent.id]: { id: agent.id, cwd: '/fixture', running: false }, other: { id: 'other', cwd: '/fixture', running: false } } })
  const description = observable({ version: '0.2.0-rc.2' })
  const effects = []
  const events = new Map()
  const ctx = { sessions: { list: sessions, binding: () => ({ session }), subagentAddress: () => undefined },
    workspaces: { list: observable({ items: [] }) }, connection: { hostDescription: description }, remote: { $on() {} },
    on: (name, fn) => { const set = events.get(name) ?? new Set(); events.set(name, set); set.add(fn); return () => set.delete(fn) },
    effect: fn => effects.push(fn()) }
  const capabilities = new HarnessTuiCapabilities(ctx, {}, 'fixture', '/fixture', bridge)
  const actions = (script, extra = {}) => new TuiActions(capabilities, { overlays: script.overlays, notice: vi.fn(), refresh() {}, refreshHeader() {}, ...extra })
  return { capabilities, actions, services, execute, invoke, journal, sessions, description, agent, bridge, runtime: ctx.sessions, faceOf,
    setLive: value => { live = value }, setRoot: id => { teamRoot = id }, dispose: () => effects.forEach(fn => fn?.()) }
}
it('public /mcp resources reaches shared scoped ToolRuntime instead of a fabricated Remote', async () => {
  const f = fixture()
  f.execute.mockImplementation(async request => ({ isError: false, content: [], value: request.name === 'read_mcp_resource' ? { contents: [{ uri: 'fixture://one', text: 'Native canonical resource' }] } : { resources: [{ uri: 'fixture://one', name: 'One' }] } }))
  const script = scriptedOverlays(['resources', '0', 'read', undefined], ['synthetic'])
  await f.actions(script).execute('mcp', 'resources')
  expect(f.execute.mock.calls.map(([r]) => r.name)).toEqual(['list_mcp_resources', 'read_mcp_resource'])
  expect(f.execute.mock.calls.every(([r]) => r.agent === f.agent)).toBe(true)
  expect(script.details.some(row => row.content.includes('Native canonical resource'))).toBe(true)
  expect(f.invoke).not.toHaveBeenCalled()
  f.dispose()
})
it('public /team reads native membership and Lead journal with explicit partial coverage', async () => {
  const f = fixture(); const script = scriptedOverlays(['mailbox', undefined])
  await f.actions(script).execute('team', '')
  expect(f.journal).toHaveBeenCalledWith('synthetic-lead', expect.any(AbortSignal))
  expect(script.details[0].content).toContain('delivery-unobserved')
  expect(script.details[0].content).toContain('"complete": false')
  expect(f.execute).not.toHaveBeenCalled(); f.dispose()
})
it('public /schedules uses native catalog and history with the original Session binding', async () => {
  const f = fixture(); const script = scriptedOverlays(['0', 'history', undefined])
  await f.actions(script).execute('schedules', '')
  expect(f.invoke.mock.calls.map(([r]) => [r.namespace, r.method, r.args])).toEqual([
    ['schedule', 'catalog', {}], ['schedule', 'history', { request: { sessionId: 'synthetic-other', id: 'schedule-daily', limit: 20 } }],
  ])
  expect(script.details[0].content).toContain('earlierRecordsUnavailable'); f.dispose()
})
it('cold Agent and unmounted Schedule fail closed without dispatch', async () => {
  const f = fixture(); f.setLive(undefined)
  const mcp = scriptedOverlays(['resources'], ['synthetic'])
  await f.actions(mcp).execute('mcp', 'resources')
  expect(mcp.selects[0].choices[0].disabledReason).toContain('exact live Agent')
  expect(f.execute).not.toHaveBeenCalled()
  delete f.services.schedule
  const schedule = scriptedOverlays([])
  await f.actions(schedule).execute('schedules', '')
  expect(schedule.details[0].content).toContain('does not publish schedule/catalog')
  expect(f.invoke).not.toHaveBeenCalled(); f.dispose()
})
it('selection away and back invalidates in-flight resource observations and stale controller', async () => {
  const f = fixture(); const pending = deferred()
  f.execute.mockImplementation(() => pending.promise)
  const controller = f.capabilities.mcpResources()
  const request = controller.page('synthetic', 'resources', freshSignal()).then(() => 'unexpected', error => error)
  await tick()
  f.sessions.set({ ...f.sessions.getSnapshot(), current: 'other' })
  f.sessions.set({ ...f.sessions.getSnapshot(), current: 'synthetic-member' })
  pending.resolve({ isError: false, content: [], value: { resources: [] } })
  expect(await request).toBeInstanceOf(Error)
  expect(f.execute.mock.calls[0][0].signal.aborted).toBe(true)
  f.description.set(undefined)
  await expect(controller.page('synthetic', 'resources', freshSignal())).rejects.toThrow()
  expect(f.execute).toHaveBeenCalledOnce(); f.dispose()
})
it('Team Lead membership change while journal is pending rejects the read', async () => {
  const f = fixture(); const pending = deferred(); f.journal.mockImplementation(() => pending.promise)
  const read = f.bridge.optionalViews.team('synthetic-member').readLeadJournal('synthetic-lead', freshSignal())
  f.setRoot('another-lead'); pending.resolve({ meta: { id: 'synthetic-lead' }, events: [] })
  await expect(read).rejects.toThrow('Lead identity changed'); f.dispose()
})

function descendantFixture() {
  const f = fixture()
  f.services.subagents = { listDescendants: vi.fn(async () => [
    { id: 'synthetic-parent', parentId: f.agent.id, depth: 1, kind: 'child', mode: 'continuable', label: 'Parent', activity: 'inactive', hasChildren: true },
    { id: 'synthetic-child', parentId: 'synthetic-parent', depth: 2, kind: 'child', mode: 'one-shot', activity: 'inactive', hasChildren: false },
  ]) }
  f.runtime.refreshSubagents = vi.fn(async id => { f.sessions.set({ ...f.sessions.getSnapshot(), subagentsByParent: {
    [id]: { state: 'ready', parentAvailable: true, entries: [{ id: 'synthetic-child', kind: 'child', mode: 'one-shot', activity: 'inactive', hasChildren: false }] },
  } }) })
  return f
}
it('public descendant route loads only the selected direct-parent catalog before frozen-parent navigation', async () => {
  const f = descendantFixture(); const openCatalogChild = vi.fn(() => true)
  try {
    await f.actions(scriptedOverlays(['1']), { openCatalogChild }).execute('descendants', '')
    expect(f.services.subagents.listDescendants).toHaveBeenCalledWith(f.agent.id, expect.any(AbortSignal))
    expect(f.runtime.refreshSubagents).toHaveBeenCalledExactlyOnceWith('synthetic-parent')
    expect(openCatalogChild).toHaveBeenCalledExactlyOnceWith({ parentSessionId: 'synthetic-parent', childSessionId: 'synthetic-child', mode: 'one-shot' })
    expect(f.sessions.getSnapshot().current).toBe(f.agent.id)
    expect(f.invoke).not.toHaveBeenCalled()
  } finally { f.dispose() }
})
it('descendant direct-parent refusal and scope changes never invoke navigation', async () => {
  const f = descendantFixture(); const openCatalogChild = vi.fn(() => true)
  try {
    f.runtime.refreshSubagents.mockImplementationOnce(async () => {})
    await f.actions(scriptedOverlays(['1', undefined]), { openCatalogChild }).execute('descendants', '')
    expect(openCatalogChild).not.toHaveBeenCalled()
    f.runtime.refreshSubagents.mockImplementationOnce(async () => { f.sessions.set({ ...f.sessions.getSnapshot(), current: 'other' }) })
    await f.actions(scriptedOverlays(['1', undefined]), { openCatalogChild }).execute('subagents', 'descendants')
    expect(openCatalogChild).not.toHaveBeenCalled()
  } finally { f.dispose() }
})

function continuedFixture() {
  const f = fixture()
  const descriptor = questionDescriptors.descriptors.find(row => row.method === 'answer')
  const get = f.services.typert.local.get
  f.services.typert.local.get = endpoint => endpoint === 'userQuestions/answer' ? descriptor : get(endpoint)
  f.services.userQuestions = { answer() {} }
  f.faceOf('userQuestions').set(syntheticContinuedProjection)
  return { ...f, descriptor }
}
it('public /questions preserves queued duplicate guards across page close and reconnect until native settlement', async () => {
  const f = continuedFixture()
  try {
    const controller = f.capabilities.continuedQuestions()
    const script = scriptedOverlays(['question:synthetic-call', 'answer', '0', 'custom', undefined], ['Synthetic answer'], [true])
    await f.actions(script).execute('questions', '')
    expect(f.invoke).toHaveBeenCalledExactlyOnceWith({ namespace: 'userQuestions', method: 'answer', args: {
      agentId: f.agent.id, callId: 'synthetic-call', answer: syntheticContinuedAnswer,
    } })
    expect(controller.rows()[0].status).toBe('queued')
    f.description.set(undefined); f.description.set({ version: '0.2.0-rc.2' })
    expect(f.capabilities.continuedQuestions()).toBe(controller)
    await f.actions(scriptedOverlays(['question:synthetic-call', 'answer', undefined])).execute('questions', '')
    expect(f.invoke).toHaveBeenCalledOnce()
    f.faceOf('userQuestions').set({ active: [], settled: [{ callId: 'synthetic-call', answers: syntheticContinuedAnswer.answers }] })
    expect(controller.rows()[0].status).toBe('settled')
    expect(f.faceOf('userQuestions').listeners.size).toBe(1)
  } finally { f.dispose(); expect(f.faceOf('userQuestions').listeners.size).toBe(0) }
})
it('continued public Host bridge rechecks exact live root and descriptor before any Gateway write', async () => {
  const f = continuedFixture()
  try {
    const controller = f.capabilities.continuedQuestions()
    f.setLive(undefined)
    expect(controller.reason()).toContain('CALLER_NOT_LIVE')
    await expect(f.bridge.continuedQuestions.remote.answer(f.agent.id, 'synthetic-call', syntheticContinuedAnswer)).rejects.toThrow('CALLER_NOT_LIVE')
    f.setLive(f.agent)
    f.services.typert.local.get = () => ({ ...f.descriptor, service: 'foreign', implementation: 'write' })
    f.services.foreign = { write: vi.fn(() => true) }
    await expect(f.bridge.continuedQuestions.remote.answer(f.agent.id, 'synthetic-call', syntheticContinuedAnswer)).rejects.toThrow('contract is unavailable')
    expect(f.services.foreign.write).not.toHaveBeenCalled()
    expect(f.invoke).not.toHaveBeenCalled()
  } finally { f.dispose() }
})

function cordisTeamFixture() {
  const ctx = new Context()
  const replacementContext = new Context()
  let agent = { id: 'synthetic-member' }
  let root = 'synthetic-lead'
  const agents = new Service(ctx, 'agents')
  agents.get = id => id === 'synthetic-member' ? agent : undefined
  const teams = new Service(ctx, 'agentTeams')
  teams.membership = () => ({ root: { id: root } })
  teams.listMembers = () => []
  teams.listTasks = () => []
  const controller = new Service(ctx, 'sessionController')
  controller.inspect = vi.fn(async () => ({ meta: { id: 'synthetic-lead' }, events: [] }))
  const bridge = createOptionalManagementPorts(ctx)
  return { ctx, teams, controller, port: bridge.optionalViews.team('synthetic-member'),
    changeAgent: () => { agent = { id: 'synthetic-member' } },
    changeRoot: () => { root = 'another-lead' },
    replaceService: () => { ctx.set('agentTeams', new Service(replacementContext, 'agentTeams')) },
    removeService: () => { ctx.set('agentTeams', undefined) },
    dispose: async () => { await ctx.fiber.dispose(); await replacementContext.fiber.dispose() } }
}
it('real Cordis contextual proxies retain native Team identity before and after journal inspection', async () => {
  const f = cordisTeamFixture()
  try {
    expect(f.ctx.get('agentTeams')).not.toBe(f.ctx.get('agentTeams'))
    expect(f.ctx.get('agentTeams')[symbols.original]).toBe(f.teams)
    await expect(f.port.readLeadJournal('synthetic-lead', freshSignal())).resolves.toEqual({ teamId: 'synthetic-lead', events: [], complete: false })
    expect(f.controller.inspect).toHaveBeenCalledOnce()
  } finally { await f.dispose() }
})
it.each(['changeAgent', 'replaceService', 'removeService', 'changeRoot'])('real Cordis Team journal rejects %s during inspection', async change => {
  const f = cordisTeamFixture(); const pending = deferred()
  try {
    f.controller.inspect.mockImplementation(() => pending.promise)
    const read = f.port.readLeadJournal('synthetic-lead', freshSignal())
    expect(f.controller.inspect).toHaveBeenCalledOnce()
    f[change]()
    pending.resolve({ meta: { id: 'synthetic-lead' }, events: [] })
    await expect(read).rejects.toThrow(change === 'changeRoot' ? 'Lead identity changed' : 'Team scope changed')
  } finally { await f.dispose() }
})
it('real Cordis Team journal rejects cancellation and mismatched journal identity', async () => {
  const f = cordisTeamFixture()
  try {
    const abort = new AbortController(); abort.abort()
    await expect(f.port.readLeadJournal('synthetic-lead', abort.signal)).rejects.toThrow()
    expect(f.controller.inspect).not.toHaveBeenCalled()
    f.controller.inspect.mockResolvedValue({ meta: { id: 'another-lead' }, events: [] })
    await expect(f.port.readLeadJournal('synthetic-lead', freshSignal())).rejects.toThrow('journal identity mismatch')
  } finally { await f.dispose() }
})

it.each(['disconnect', 'owner-change'])('foreground native claim releases on %s without carrying it into another view', async change => {
  const f = fixture(); const released = vi.fn()
  const wait = { key: 'q:synthetic', sessionId: f.agent.id, payload: { wait: { callId: 'synthetic', timed: true } } }
  f.capabilities.active().session.getSnapshot().pending = [wait]
  f.bridge.continuedQuestions.attachWait = async function* (_sessionId, _callId, signal) {
    try {
      yield { remainingMs: 1000 }
      await new Promise(resolve => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', resolve, { once: true })
      })
    } finally { released() }
  }
  try {
    const stream = f.capabilities.attachQuestionWait(wait, new AbortController().signal)[Symbol.asyncIterator]()
    expect(await stream.next()).toEqual({ value: { remainingMs: 1000 }, done: false })
    const end = stream.next()
    if (change === 'disconnect') f.description.set(undefined)
    else f.sessions.set({ ...f.sessions.getSnapshot(), current: 'other' })
    await expect(end).resolves.toMatchObject({ done: true })
    expect(released).toHaveBeenCalledOnce()
  } finally { f.dispose() }
})
