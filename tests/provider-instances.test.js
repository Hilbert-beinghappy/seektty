import { expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { manageProviders } from '../src/client/provider-manager.ts'
import { providerProfileSchema } from '../src/client/provider-config.ts'

const profile = z.object({ apiKeyEnv: z.string(), displayName: z.string(), api: z.union(['openai-completions', 'openai-responses']), baseURL: z.string(), models: z.array(z.object({ id: z.string(), name: z.string() })) })
const ok = value => ({ result: { ok: true, value } })
function fixture(key = 'connections') {
  const documents = ['native-left-instance', 'alternate-llm-instance'].map((ns, index) => ({
    ns, schema: z.object({ [key]: z.dict(profile) }).toJSON(), revision: 1, applies: 'live', secrets: [], base: {},
    value: { [key]: { [index === 0 ? 'left' : 'right']: { baseURL: 'https://old.invalid', models: [{ id: 'old' }], api: 'openai-completions' } } },
  }))
  const directory = () => documents.flatMap(doc => Object.entries(doc.value[key]).map(([provider, value]) => ({ provider, displayName: value.displayName ?? provider, settingsNs: doc.ns, settingsPath: [key, provider], active: true, declared: true })))
  const mutate = vi.fn(async ({ ns, expectedRevision, ops }) => {
    const doc = documents.find(row => row.ns === ns)
    expect(expectedRevision).toBe(doc.revision)
    for (const op of ops) {
      let parent = doc.value
      for (const part of op.path.slice(0, -1)) parent = parent[part] ??= {}
      if (op.op === 'set') parent[op.path.at(-1)] = op.value
      else delete parent[op.path.at(-1)]
    }
    doc.revision++
    return ok(doc)
  })
  const credentials = { describe: vi.fn(async () => ok({ credentials: {} })), set: vi.fn(), unset: vi.fn() }
  const api = { settings: { describe: async () => ok({ writable: true, namespaces: documents }), mutate }, credentials,
    llm: { providers: async () => ok({ providers: directory() }), models: async () => ok({ groups: directory().map(entry => ({ id: entry.provider, name: entry.displayName, models: documents.find(doc => doc.ns === entry.settingsNs).value[key][entry.provider].models })), failures: [] }) } }
  return { documents, mutate, api, credentials }
}
function overlays(selections, inputs = []) {
  return { select: vi.fn(async request => { const id = selections.shift(); return request.choices.find(row => row.id === id && row.disabledReason === undefined) }),
    input: vi.fn(async () => inputs.shift()), confirm: vi.fn(async () => true), detail: vi.fn(),
    progress: request => request.work(() => {}, new AbortController().signal) }
}
it('public Provider editor writes the exact non-default namespace and non-default native settingsPath', async () => {
  const f = fixture()
  const untouched = JSON.stringify(f.documents[0])
  const ui = overlays(['right', 'baseURL', 'save', undefined], ['https://selected.invalid/v1'])
  await expect(manageProviders(ui, f.api, { notice: vi.fn() })).resolves.toBe('changed')
  expect(f.mutate).toHaveBeenCalledWith({ ns: 'alternate-llm-instance', expectedRevision: 1, ops: [{ op: 'set', path: ['connections', 'right', 'baseURL'], value: 'https://selected.invalid/v1' }] })
  expect(JSON.stringify(f.documents[0])).toBe(untouched)
  expect(f.documents[1].value.connections.right.baseURL).toBe('https://selected.invalid/v1')
  expect(f.credentials.set).not.toHaveBeenCalled()
})
it('creates a route only in the explicitly selected supported configuration instance', async () => {
  const f = fixture('providers')
  const untouched = JSON.stringify(f.documents[0])
  const ui = overlays(['__add__', 'alternate-llm-instance', 'openai-completions', '__add__', '__done__', undefined], ['new-route', 'New route', 'https://new.invalid', '', 'model-id', 'Model name', '', ''])
  await expect(manageProviders(ui, f.api, { notice: vi.fn() })).resolves.toBe('changed')
  expect(f.mutate).toHaveBeenCalledOnce()
  expect(f.mutate.mock.calls[0][0]).toMatchObject({ ns: 'alternate-llm-instance', expectedRevision: 1, ops: [{ op: 'set', path: ['providers', 'new-route'] }] })
  expect(JSON.stringify(f.documents[0])).toBe(untouched)
  expect(f.documents[1].value.providers['new-route']).toMatchObject({ models: [{ id: 'model-id', name: 'Model name' }] })
})
it('refuses unknown schemas despite a native address, without broad arbitrary-schema writes', async () => {
  const f = fixture()
  f.documents[1].schema = z.object({ connections: z.dict(z.object({ baseURL: z.number(), models: z.string() })) }).toJSON()
  const notice = vi.fn()
  await expect(manageProviders(overlays(['right', undefined]), f.api, { notice })).resolves.toBe('unchanged')
  expect(f.mutate).not.toHaveBeenCalled()
  expect(notice).toHaveBeenCalled()
  expect(providerProfileSchema(f.documents[1], ['connections', 'right'])).toBeUndefined()
})
