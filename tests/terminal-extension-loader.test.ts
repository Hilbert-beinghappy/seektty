import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalExtensionRegistry } from '../src/host/terminal-extensions.ts'

const target = { sessionId: 'session-a', displayTitle: 'A' }
const roots: Context[] = []
afterEach(async () => { for (const root of roots.splice(0)) await root.fiber.dispose() })
async function registry(): Promise<{ root: Context; service: TerminalExtensionRegistry }> {
  const root = new Context(); roots.push(root)
  await root.plugin({ name: 'fixture-terminal-registry', apply: ctx => { new TerminalExtensionRegistry(ctx) } })
  return { root, service: root.get('seekttyExtensions')! }
}

describe('explicit terminal plugin loading through official Cordis Loader', () => {
  it('imports an external file, injects the public service, dispatches exact targets, and removes contributions on unload', async () => {
    const { root, service } = await registry()
    await root.plugin(Loader, { baseUrl: import.meta.url })
    const id = await root.loader.create({ name: new URL('./fixtures/terminal-extension-plugin.mjs', import.meta.url).href })
    await root.loader.await()
    const row = service.sessionActions(target)[0]!
    expect(row.label).toBe('Fixture Session action')
    expect(await service.runSessionAction(target, row.id, row.revision, new AbortController().signal)).toBe('Session target: session-a')
    const input = { ...target, draft: 'draft', selection: { start: 1, end: 4 } }, activity = service.inputActivities(input)[0]!
    expect(await service.runInputActivity(input, activity.id, activity.revision, new AbortController().signal)).toBe('input:1-4')
    root.loader.remove(id); await root.loader.await()
    expect(service.sessionActions(target)).toEqual([])
    expect(service.inputActivities(input)).toEqual([])
    await expect(service.runSessionAction(target, row.id, row.revision, new AbortController().signal)).rejects.toThrow('changed')
  })
  it('invalidates menus after re-registration, with idempotent old disposers', async () => {
    const { service } = await registry(), run = vi.fn(async () => 'done')
    const remove = service.registerSessionAction({ id: 'fixture.action', label: 'First', run }), first = service.sessionActions(target)[0]!
    remove(); service.registerSessionAction({ id: 'fixture.action', label: 'Second', run }); remove()
    expect(service.sessionActions(target)[0]!.revision).not.toBe(first.revision)
    await expect(service.runSessionAction(target, first.id, first.revision, new AbortController().signal)).rejects.toThrow('changed')
    expect(run).not.toHaveBeenCalled()
  })
  it('rechecks disabled reasons and never dispatches an action disabled after menu construction', async () => {
    const { service } = await registry(); let reason: string | undefined
    const run = vi.fn(async () => 'done')
    service.registerSessionAction({ id: 'fixture.action', label: 'Action', reason: () => reason, run })
    const row = service.sessionActions(target)[0]!
    reason = 'Scope no longer allows this action'
    await expect(service.runSessionAction(target, row.id, row.revision, new AbortController().signal)).rejects.toThrow(reason)
    expect(run).not.toHaveBeenCalled()
  })
  it('rejects cancelled work promptly and suppresses the old plugin result even if its callback ignores abort', async () => {
    const { service } = await registry(); let finish!: (value: string) => void
    const remove = service.registerSessionAction({ id: 'fixture.action', label: 'Action', run: () => new Promise(resolve => { finish = resolve }) })
    const row = service.sessionActions(target)[0]!
    const pending = service.runSessionAction(target, row.id, row.revision, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow('not confirmed')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    remove(); await rejected; finish('late success')
  })
  it('withholds callbacks for pre-cancelled and malformed target requests', async () => {
    const { service } = await registry(), run = vi.fn(async () => 'done')
    service.registerSessionAction({ id: 'fixture.action', label: 'Action', run })
    const row = service.sessionActions(target)[0]!, cancelled = new AbortController(); cancelled.abort()
    await expect(service.runSessionAction(target, row.id, row.revision, cancelled.signal)).rejects.toThrow()
    await expect(service.runSessionAction({ ...target, sessionId: '' }, row.id, row.revision, new AbortController().signal)).rejects.toThrow('target')
    expect(run).not.toHaveBeenCalled()
  })
  it('copies immutable target values, rejects duplicate ids, and preserves order', async () => {
    const { service } = await registry(), run = vi.fn(async (t: typeof target) => { expect(Object.isFrozen(t)).toBe(true); return t.sessionId })
    service.registerSessionAction({ id: 'fixture.second', label: 'Second', order: 20, run })
    service.registerSessionAction({ id: 'fixture.first', label: 'First', order: -1, run })
    expect(service.sessionActions(target).map(row => row.id)).toEqual(['fixture.first', 'fixture.second'])
    expect(() => service.registerSessionAction({ id: 'fixture.first', label: 'Duplicate', run })).toThrow('already registered')
    const row = service.sessionActions(target)[0]!
    expect(await service.runSessionAction(target, row.id, row.revision, new AbortController().signal)).toBe('session-a')
  })
})
