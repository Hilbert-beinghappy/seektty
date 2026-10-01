import { expect, it } from 'vitest'
import { AbstractApiClient } from '../vendor/api-contract/fetch/client.js'
import { SessionManager } from '../vendor/client-runtime/client/sessions/manager.js'
import { ProjectionValueStore } from '../vendor/client-runtime/client/sessions/projection-store.js'
import { toolDefinition } from '../vendor/ui-conversation/client/conversation-nodes/tool.js'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'
import { sessionV4Fixture } from './helpers/session-v4-fixture.ts'

class NativeFixtureCarrier extends AbstractApiClient {
  constructor(read) { super(); this.read = read }
  async doFetch(_url, init) {
    const request = JSON.parse(init.body)
    const value = await this.read(request)
    return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value } })
  }
}
function hints(kind, value = 'stale-cache', seq = 100) {
  return { items: [{ sessionId: 'fixture', updatedAt: 1, running: false, blank: false,
    projections: { ...(kind === undefined ? {} : { kind }), asOfSeq: seq, values: { title: value, agentPreset: value } } }] }
}
function live(manager, value = 'authoritative-live', seq = 1) {
  for (const key of ['title', 'agentPreset']) manager.handleMuxEnvelope({ rpcId: `live-${key}`, payload: {
    type: 'session/projection', sessionId: 'fixture', key, value, seq,
  } })
}
it.each(['cached-first', 'live-first'])('prefers live projections in either arrival order: %s', async order => {
  const api = new NativeFixtureCarrier(() => hints('cached'))
  const manager = new SessionManager(api, {})
  if (order === 'live-first') live(manager)
  await manager.refreshList()
  if (order === 'cached-first') live(manager)
  expect(manager.getListSnapshot().items[0]).toMatchObject({ title: 'authoritative-live', agentPreset: 'authoritative-live' })
  await manager.refreshList()
  expect(manager.getListSnapshot().items[0].title).toBe('authoritative-live')
})
it.each(['future', undefined])('ignores unknown hint domain %s without losing the session listing', async kind => {
  const api = new NativeFixtureCarrier(() => hints(kind))
  const result = await api.sessions.list({})
  expect(result.result.ok).toBe(true)
  expect(result.result.value.items[0].projections.kind).toBe(kind)
  const manager = new SessionManager(api, {})
  await manager.refreshList()
  expect(manager.getListSnapshot().items[0].title).toBeUndefined()
  live(manager)
  expect(manager.getListSnapshot().items[0].title).toBe('authoritative-live')
})
it('compares sequenced hints with live frames only within their common domain', async () => {
  const manager = new SessionManager(new NativeFixtureCarrier(() => hints('sequenced', 'newer-live', 5)), {})
  live(manager, 'older-live', 1)
  await manager.refreshList()
  expect(manager.getListSnapshot().items[0].title).toBe('newer-live')
  live(manager, 'replayed', 4)
  expect(manager.getListSnapshot().items[0].title).toBe('newer-live')
})
it('an authoritative baseline clears cache-only keys and preserves newer live keys', () => {
  const store = new ProjectionValueStore()
  const face = store.faceOf('title')
  store.applyCached({ title: 'cold', agentPreset: 'stale' })
  store.apply('title', 'live', 2)
  store.seed({ asOfSeq: 1, values: {} })
  expect(store.values()).toEqual({ title: 'live' })
  store.clear()
  store.apply('title', 'new-generation', 0)
  expect(store.faceOf('title')).toBe(face)
  expect(face.getSnapshot()).toBe('new-generation')
})
it('fences old list replies and their finally cleanup across a connection reset', async () => {
  let resolveOld
  let calls = 0
  const api = new NativeFixtureCarrier(() => ++calls === 1
    ? new Promise(resolve => { resolveOld = resolve }) : hints('sequenced', 'new-generation', 0))
  const manager = new SessionManager(api, {})
  const old = manager.refreshList()
  await Promise.resolve()
  manager.handleDisconnected()
  const current = manager.refreshList()
  await current
  live(manager, 'accepted-live', 1)
  resolveOld(hints('sequenced', 'old-generation', 100))
  await old
  expect(calls).toBe(2)
  expect(manager.getListSnapshot().items[0].title).toBe('accepted-live')
})
it('decodes native Preset dispatch through the actual fetch carrier without fabricated flags', async () => {
  const roster = { presets: [{ id: 'standard', isDefault: true }] }
  const document = { agentPreset: 'standard', content: 'fixture' }
  const api = new NativeFixtureCarrier(request => dispatchTerminalRequest({ invoke: async (_endpoint) =>
    request.method === 'agentPreset.list' ? roster : document }, {}, request.method,
    request.payload, request.rpcId, new AbortController().signal))
  expect((await api.agentPresets.list({})).result).toEqual({ ok: true, value: roster })
  expect((await api.agentPresets.read({ agentPreset: 'standard' })).result).toEqual({ ok: true, value: document })
})
it.each([[], [{ type: 'text', text: 'permission denied: output.txt' }]])('builds flat V4 error nodes with content %j', content => {
  const f = sessionV4Fixture(true)
  const call = { event: f.events[0], location: { kind: 'none' } }
  const result = { event: { ...f.events[1], data: { ...f.events[1].data, message: { ...f.events[1].data.message, content } } }, location: { kind: 'none' } }
  const state = toolDefinition.update({ state: toolDefinition.start({}, call) }, result)
  const context = { id: 'v4-call', state, start: call, matches: [call, result], location: { kind: 'none' } }
  const node = toolDefinition.buildViewNode(context)
  expect(node.data.root).toMatchObject({ isError: true, content })
})
