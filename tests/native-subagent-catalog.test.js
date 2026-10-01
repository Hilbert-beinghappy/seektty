import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { readNativeSubagentCatalog } from '../src/host/native-subagent-catalog.ts'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'
import { createSubagentPresentationCapabilities } from '../src/client/subagent-presentation.ts'
import { SessionManager } from '../vendor/client-runtime/client/sessions/manager.js'

function fixture() {
  const ctx = new Context(), parent = { id: 'parent' }
  let resident = parent
  const agents = new Service(ctx, 'agents'); agents.get = vi.fn(() => resident)
  const service = new Service(ctx, 'subagents')
  service.list = vi.fn(() => ['provider-name-only'])
  const entries = [{ kind: 'child', id: 'child', mode: 'continuable', label: 'Child', activity: 'inactive', hasChildren: false },
    { kind: 'child', id: 'one-shot', mode: 'one-shot', activity: 'running', hasChildren: true },
    { kind: 'diagnostic', id: 'corrupt-child', reason: 'corrupt' }]
  service.listChildren = vi.fn(async () => [{ id: 'child', createdAt: 123, mode: 'continuable', label: 'Child' }])
  service.listDescendants = vi.fn(async () => [...entries.map(row => ({ ...row, parentId: 'parent', depth: 1 })),
    { kind: 'child', id: 'grandchild', mode: 'one-shot', activity: 'inactive', hasChildren: false, parentId: 'child', depth: 2 }])
  return { ctx, parent, agents, service, entries, resident: next => { resident = next } }
}
it('routes old terminal catalog reads to Host listDescendants direct-parent rows and never to provider-name list/Gateway', async () => {
  const f = fixture(); const invoke = vi.fn(), signal = new AbortController().signal
  try {
    const value = await dispatchTerminalRequest({ invoke }, { readSubagents: (p, s) => readNativeSubagentCatalog(f.ctx, p, s) },
      'subagent.list', { parentSessionId: 'parent' }, 'catalog-1', signal)
    expect(value).toEqual({ entries: f.entries, parentAvailable: true })
    expect(f.service.listDescendants).toHaveBeenCalledExactlyOnceWith('parent', signal)
    expect(f.service.listChildren).not.toHaveBeenCalled()
    expect(f.service.list).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled()
    expect(f.ctx.get('subagents')).not.toBe(f.ctx.get('subagents')) // real Cordis contextual proxies
  } finally { await f.ctx.fiber.dispose() }
})
it('keeps cold-parent residency false while reading durable child/diagnostic modes without warming', async () => {
  const f = fixture(); f.resident(undefined)
  try {
    expect(await readNativeSubagentCatalog(f.ctx, { parentSessionId: 'parent' }, new AbortController().signal))
      .toEqual({ entries: f.entries, parentAvailable: false })
    expect(f.agents.get).toHaveBeenCalledTimes(2)
  } finally { await f.ctx.fiber.dispose() }
})
it.each(['agent', 'service', 'cancel'])('rejects changed %s ownership before publishing a delayed catalog', async changed => {
  const f = fixture(), signal = new AbortController()
  let finish; f.service.listDescendants.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  try {
    const pending = readNativeSubagentCatalog(f.ctx, { parentSessionId: 'parent' }, signal.signal)
    const rejected = expect(pending).rejects.toThrow(changed === 'cancel' ? 'cancelled' : 'scope changed')
    if (changed === 'agent') f.resident({ id: 'parent' })
    else if (changed === 'service') f.ctx.set('subagents', { listDescendants: async () => [] })
    else signal.abort(new Error('cancelled'))
    finish(f.entries.map(row => ({ ...row, parentId: 'parent', depth: 1 }))); await rejected
  } finally { await f.ctx.fiber.dispose() }
})
it.each([['bad-mode', [{ kind: 'child', id: 'child', mode: 'future', activity: 'inactive', hasChildren: false }]],
  ['provider-names', ['name-only']], ['missing-label', [{ kind: 'child', id: 'child', mode: 'continuable', activity: 'inactive', hasChildren: false }]]])
('refuses malformed %s rows instead of granting navigation', async (_name, entries) => {
  const f = fixture(); f.service.listDescendants.mockResolvedValue(entries.map(row => ({ ...row, parentId: 'parent', depth: 1 })))
  try { await expect(readNativeSubagentCatalog(f.ctx, { parentSessionId: 'parent' }, new AbortController().signal)).rejects.toThrow() }
  finally { await f.ctx.fiber.dispose() }
})
it('rejects cancelled/invalid requests before reading Host files', async () => {
  const f = fixture(), signal = new AbortController(); signal.abort()
  try {
    await expect(readNativeSubagentCatalog(f.ctx, { parentSessionId: 'parent' }, signal.signal)).rejects.toThrow()
    await expect(readNativeSubagentCatalog(f.ctx, { parentSessionId: '' }, new AbortController().signal)).rejects.toThrow()
    expect(f.service.listChildren).not.toHaveBeenCalled()
  } finally { await f.ctx.fiber.dispose() }
})
it('feeds the actual vendored SessionManager catalog/address contract for the selected direct parent', async () => {
  const f = fixture()
  const invoke = vi.fn()
  const api = { subagents: { list: async payload => ({ result: { ok: true, value: await dispatchTerminalRequest({ invoke },
    { readSubagents: (p, signal) => readNativeSubagentCatalog(f.ctx, p, signal) }, 'subagent.list', payload, 'catalog-2', new AbortController().signal) } }) } }
  const manager = new SessionManager(api, {}, 'parent')
  const runtime = { list: { getSnapshot: () => manager.getListSnapshot(), subscribe: fn => manager.subscribe(fn) },
    refreshSubagents: id => manager.refreshSubagents(id), navigationAddress: id => manager.navigationAddress(id) }
  try {
    const catalog = await createSubagentPresentationCapabilities(runtime).listDirectChildren('parent', { refresh: true })
    expect(catalog.support).toBe('supported'); expect(catalog.value.state).toBe('ready')
    expect(catalog.value.children[0].address).toEqual({ parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable' })
    expect(manager.navigationAddress('one-shot')).toEqual({ parentSessionId: 'parent', childSessionId: 'one-shot', mode: 'one-shot' })
    expect(invoke).not.toHaveBeenCalled()
  } finally { await f.ctx.fiber.dispose() }
})

it('rejects a descendant claiming another parent at direct-child depth instead of granting its address', async () => {
 const f = fixture(); f.service.listDescendants.mockResolvedValue([{ ...f.entries[0], parentId: 'foreign', depth: 1 }])
 try { await expect(readNativeSubagentCatalog(f.ctx, { parentSessionId: 'parent' }, new AbortController().signal)).rejects.toThrow('direct-parent') }
 finally { await f.ctx.fiber.dispose() }
})
