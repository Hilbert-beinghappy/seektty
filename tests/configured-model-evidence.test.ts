import { expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { configuredModelEvidence } from '../src/client/configured-model-evidence.ts'
import type { ProviderApi } from '../src/client/provider-config.ts'

const selection = { provider: 'exact-route', model: 'selected' }
const profile = z.object({ baseURL: z.string(), models: z.array(z.object({ id: z.string(), input: z.array(z.string()), contextWindow: z.number(), maxTokens: z.number() })) })
function fixture() {
  const documents = [{ ns: 'other-instance', schema: z.object({ connections: z.dict(profile) }).toJSON() as unknown, value: { connections: { right: { baseURL: 'https://example.invalid', models: [{ id: 'selected', input: ['text'], contextWindow: 4096, maxTokens: 1024 }] } } } }]
  const providers = [{ provider: selection.provider, settingsNs: 'other-instance', settingsPath: ['connections', 'right'], displayName: 'No inferred modality', active: true }]
  const ok = (value: unknown) => ({ result: { ok: true, value } })
  const api = { llm: { providers: async () => ok({ providers }) }, settings: { describe: async () => ok({ namespaces: documents, writable: true }) }, credentials: { describe: async () => ok({ credentials: {} }) } } as unknown as ProviderApi
  return { documents, providers, api }
}
it('reads only the exact native instance/address and declared metadata fields', async () => {
  const f = fixture()
  expect(await configuredModelEvidence(f.api, selection)).toEqual({ ...selection, source: 'manual', inputModalities: ['text'], contextWindow: 4096, maxTokens: 1024 })
})
it('unmatched routes/models and ambiguous provider identities remain unknown', async () => {
  const f = fixture()
  expect(await configuredModelEvidence(f.api, { ...selection, provider: 'other' })).toBeUndefined()
  expect(await configuredModelEvidence(f.api, { ...selection, model: 'other' })).toBeUndefined()
  f.providers.push({ ...f.providers[0]! })
  expect(await configuredModelEvidence(f.api, selection)).toBeUndefined()
})
it('unknown preserved model fields do not become authoritative metadata', async () => {
  const f = fixture()
  f.documents[0]!.schema = z.object({ connections: z.dict(z.object({ baseURL: z.string(), models: z.array(z.object({ id: z.string() })) })) }).toJSON()
  expect(await configuredModelEvidence(f.api, selection)).toBeUndefined()
})
