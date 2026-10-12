import { expect, it, vi } from 'vitest'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { HarnessAutocompleteProvider } from '../src/client/autocomplete.ts'

function fixture(host = async () => ({ ok: true, value: [{ name: 'host-fixture', description: 'Native command' }] }),
  skills = async () => ({ result: { ok: true, value: { skills: [{ name: 'skill-fixture', description: 'Native skill' }] } } })) {
  const handlers = new Map()
  const remote = { $on: (event, callback) => handlers.set(event, callback), commands: { list: vi.fn(host) } }
  const ctx = { remote, on: (event, callback) => handlers.set(event, callback), sessions: { subagentAddress: () => undefined } }
  const api = { skills: { list: vi.fn(skills) } }
  const capabilities = new HarnessTuiCapabilities(ctx, api, 'fixture', '/tmp')
  vi.spyOn(capabilities, 'active').mockReturnValue({ sessionId: 'fixture', workspacePath: '/tmp' })
  return { capabilities, remote, api, handlers }
}
it('retains local and Host commands when the Skill carrier throws, then retries the failed source', async () => {
  let healthy = false
  const f = fixture(undefined, async () => {
    if (!healthy) throw new Error('skill disconnected')
    return { result: { ok: true, value: { skills: [{ name: 'recovered-skill', description: '' }] } } }
  })
  const first = await f.capabilities.commandCatalog()
  expect(first.map(c => c.name)).toEqual(expect.arrayContaining(['sessions', 'exit', 'host-fixture']))
  expect(f.capabilities.commandCatalogWarnings().join()).toContain('skill disconnected')
  healthy = true
  const second = await f.capabilities.commandCatalog()
  expect(second.some(c => c.name === 'recovered-skill')).toBe(true)
  expect(f.capabilities.commandCatalogWarnings()).toEqual([])
  expect(f.api.skills.list).toHaveBeenCalledTimes(2)
})
it('retains Skills and local commands on a failed native command reply', async () => {
  const f = fixture(async () => ({ ok: false, error: { message: 'Host unavailable' } }))
  expect((await f.capabilities.commandCatalog()).map(c => c.name)).toEqual(expect.arrayContaining(['sessions', 'skill-fixture']))
  expect(f.capabilities.commandCatalogWarnings().join()).toContain('Host unavailable')
})
it('both failed sources still leave usable local commands and two diagnostics', async () => {
  const f = fixture(() => { throw new Error('host disconnected') }, async () => ({ result: { ok: false, error: { message: 'skills unavailable' } } }))
  expect((await f.capabilities.commandCatalog()).some(c => c.name === 'exit')).toBe(true)
  expect(f.capabilities.commandCatalogWarnings()).toHaveLength(2)
})
it('does not let old finally or warnings overwrite a directory refreshed during a pending read', async () => {
  let resolveOld
  let calls = 0
  const f = fixture(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve({ ok: true, value: [{ name: 'new-host', description: '' }] }))
  const old = f.capabilities.commandCatalog()
  await Promise.resolve()
  f.handlers.get('connection/reset')()
  const current = await f.capabilities.commandCatalog()
  resolveOld({ ok: false, error: { message: 'old-generation' } })
  expect((await old).some(c => c.name === 'sessions')).toBe(true)
  expect(f.capabilities.commandCatalogWarnings()).toEqual([])
  expect(await f.capabilities.commandCatalog()).toBe(current)
  expect(f.remote.commands.list).toHaveBeenCalledTimes(2)
})
it('offers slash completions and reports the degraded source at the same time', async () => {
  const f = fixture(async () => ({ ok: false, error: { message: 'disconnected' } }))
  const notice = vi.fn()
  const provider = new HarnessAutocompleteProvider(f.capabilities, notice)
  const suggestions = await provider.getSuggestions(['/ses'], 0, 4, { signal: new AbortController().signal })
  const item = suggestions.items.find(item => item.value === 'sessions')
  expect(item).toBeDefined()
  expect(provider.applyCompletion(['/ses'], 0, 4, item, suggestions.prefix).lines[0]).toBe('/sessions ')
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('disconnected'))
})
it('preserves cancellation and avoids publishing cancelled autocomplete diagnostics', async () => {
  const f = fixture()
  const abort = new AbortController(); abort.abort(new Error('superseded'))
  const notice = vi.fn()
  expect(await new HarnessAutocompleteProvider(f.capabilities, notice).getSuggestions(['/'], 0, 1, { signal: abort.signal })).toBeNull()
  expect(notice).not.toHaveBeenCalled()
})
