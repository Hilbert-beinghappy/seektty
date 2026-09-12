import { expect, it } from 'vitest'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-llm/remote'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'
import { llmProvidersValueSchema } from '../vendor/api-contract/api/llm.schema.js'
import { loadProviderConfig } from '../src/client/provider-config.ts'

it('joins native configurable entries with loaded routes before the actual Provider manager decodes them', async () => {
  const configured = [
    { provider: 'loaded', displayName: 'Loaded', settingsNs: 'llm-fixture', settingsPath: ['providers', 'loaded'], declared: true },
    { provider: 'broken', displayName: 'Broken', settingsNs: 'llm-fixture', settingsPath: ['providers', 'broken'], declared: true, error: 'Invalid configuration' },
  ]
  const resultFor = { listConfigurableProviders: configured, listProviders: [{ id: 'loaded', name: 'Loaded' }] }
  const invoke = async ({ method }) => {
    const descriptor = TYPERT_REMOTE.descriptors.find(item => item.method === method)
    return descriptor.result.schema.parse(resultFor[method])
  }
  const result = await dispatchTerminalRequest({ invoke }, {}, 'llm.providers', {}, 'qa', new AbortController().signal)
  const value = llmProvidersValueSchema.parse(result)
  const snapshot = await loadProviderConfig({
    llm: { providers: async () => ({ result: { ok: true, value } }) },
    settings: { describe: async () => ({ result: { ok: true, value: { writable: true, hasDocument: false, namespaces: [] } } }) },
  })
  expect(snapshot.rows.map(row => [row.entry.provider, row.entry.active])).toEqual([['loaded', true], ['broken', false]])
})
