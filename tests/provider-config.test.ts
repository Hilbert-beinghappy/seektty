import { beforeEach, describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { setUiLocale } from '../src/client/locale.ts'
import {
  deriveProviderKeyRef,
  discoverProviderModels,
  loadProviderConfig,
  normalizeProviderApiKey,
  normalizeProviderBaseUrl,
  normalizeProviderModels,
  providerFailureMessage,
  providerModelsIssue,
  providerProfileOps,
  providerProtocolChoices,
  removeProviderConfig,
  saveProviderConfig,
  validProviderCredentialRef,
  validProviderId,
  type ProviderApi,
} from '../src/client/provider-config.ts'

function ok<T>(value: T): never {
  return { rpcId: 'test', result: { ok: true, value } } as never
}

function fail(code: string, message = 'sensitive upstream text'): never {
  return { rpcId: 'test', result: { ok: false, error: { code, message } } } as never
}

const piSchema = z.object({
  providers: z.dict(z.object({
    apiKeyEnv: z.string(),
    displayName: z.string(),
    api: z.union(['openai-completions', 'openai-responses', 'anthropic-messages']),
    baseURL: z.string(),
    models: z.array(z.object({ id: z.string() })),
  })),
})

function apiHarness(options: {
  readonly settingsCode?: string
  readonly credentialCode?: string
  readonly discoveryCode?: string
} = {}): {
  readonly api: ProviderApi
  readonly mutate: ReturnType<typeof vi.fn>
  readonly set: ReturnType<typeof vi.fn>
  readonly unset: ReturnType<typeof vi.fn>
} {
  let revision = 4
  const namespace = () => ({
    ns: 'llm-pi-ai',
    schema: piSchema.toJSON(),
    value: {
      providers: {
        'acme-gateway': {
          apiKeyEnv: 'ACME_GATEWAY_API_KEY',
          baseURL: 'https://example.invalid/v1',
          models: [{ id: 'model-a' }],
          untouched: { nested: true },
        },
      },
    },
    base: { providers: {} },
    user: {
      providers: {
        'acme-gateway': {
          apiKeyEnv: 'ACME_GATEWAY_API_KEY',
          baseURL: 'https://example.invalid/v1',
          models: [{ id: 'model-a' }],
          untouched: { nested: true },
        },
      },
    },
    applies: 'live' as const,
    secrets: [],
    revision,
  })
  const mutate = vi.fn(async () => {
    if (options.settingsCode !== undefined) return fail(options.settingsCode)
    revision += 1
    return ok(namespace())
  })
  const set = vi.fn(async () => options.credentialCode === undefined ? ok({}) : fail(options.credentialCode))
  const unset = vi.fn(async () => ok({}))
  return {
    api: {
      llm: {
        providers: vi.fn(async () => ok({
          providers: [{
            provider: 'acme-gateway',
            displayName: 'Acme',
            settingsNs: 'llm-pi-ai',
            settingsPath: ['providers', 'acme-gateway'],
            active: true,
            declared: true,
          }],
        })),
        models: vi.fn(async () => ok({ groups: [], failures: [] })),
        discoverModels: vi.fn(async () => options.discoveryCode === undefined
          ? ok({ models: [{ id: ' model-a ' }, { id: 'model-a' }, { id: 'model-b', contextWindow: 32000 }] })
          : fail(options.discoveryCode)),
      },
      settings: {
        describe: vi.fn(async () => ok({ writable: true, hasDocument: true, namespaces: [namespace()] })),
        mutate,
      },
      credentials: {
        describe: vi.fn(async () => ok({
          credentials: {
            ACME_GATEWAY_API_KEY: { configured: true, source: 'file', writable: true },
          },
        })),
        set,
        unset,
      },
    } as unknown as ProviderApi,
    mutate,
    set,
    unset,
  }
}

beforeEach(() => { setUiLocale('zh') })

describe('Provider configuration snapshot', () => {
  it('joins official directory, redacted Settings, and value-free credentials', async () => {
    const { api } = apiHarness()
    const snapshot = await loadProviderConfig(api)
    expect(snapshot.writable).toBe(true)
    expect(snapshot.credentialState).toBe('ready')
    expect(snapshot.rows).toHaveLength(1)
    expect(snapshot.rows[0]).toMatchObject({
      configured: true,
      removable: true,
      apiKeyEnv: 'ACME_GATEWAY_API_KEY',
      credential: { configured: true, source: 'file', writable: true },
    })
    expect(snapshot.rows[0]?.profile?.untouched).toEqual({ nested: true })
  })

  it('reads protocol choices from the installed schema', async () => {
    const snapshot = await loadProviderConfig(apiHarness().api)
    expect(providerProtocolChoices(snapshot.namespaces.get('llm-pi-ai'))).toEqual([
      'openai-completions', 'openai-responses', 'anthropic-messages',
    ])
  })
})

describe('Provider draft validation', () => {
  it.each(['openai', 'opencode-go', 'a1'])('accepts a stable lowercase route id: %s', (id) => {
    expect(validProviderId(id)).toBe(true)
  })

  it.each(['OpenAI', '1provider', 'provider_name', 'provider--name', '供应商/一'])('accepts an official dictionary route id: %s', (id) => {
    expect(validProviderId(id)).toBe(true)
  })

  it.each(['', '   ', '__add__', 'provider\nname'])('rejects a route id unsafe for this terminal surface: %j', (id) => {
    expect(validProviderId(id)).toBe(false)
  })

  it('derives the same credential reference vocabulary as the official Models surface', () => {
    expect(deriveProviderKeyRef('opencode-go')).toBe('OPENCODE_GO_API_KEY')
    expect(deriveProviderKeyRef('1provider')).toBe('_1PROVIDER_API_KEY')
    expect(deriveProviderKeyRef('供应商')).toBe('PROVIDER_API_KEY')
    expect(validProviderCredentialRef('OPENCODE_GO_API_KEY')).toBe(true)
    expect(validProviderCredentialRef('opencode_go_api_key')).toBe(true)
    expect(validProviderCredentialRef('_sharedKey')).toBe(true)
    expect(validProviderCredentialRef('opencode-key')).toBe(false)
  })

  it('accepts a clean endpoint and removes only its fragment', () => {
    expect(normalizeProviderBaseUrl(' https://opencode.ai/zen/go/v1/#local ')).toEqual({
      ok: true,
      value: 'https://opencode.ai/zen/go/v1',
    })
  })

  it.each([
    'not-a-url',
    'file:///tmp/provider',
    'https://user:secret@example.invalid/v1',
  ])('rejects an endpoint that is not safe Provider configuration: %s', (value) => {
    expect(normalizeProviderBaseUrl(value).ok).toBe(false)
  })

  it('keeps API key errors value-free', () => {
    const secret = 'OPENCODE_API_KEY=top-secret-value'
    const result = normalizeProviderApiKey(secret)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain(secret)
  })

  it('normalizes model candidates without inventing capacities', () => {
    expect(normalizeProviderModels([
      { id: ' alpha ' },
      { id: 'alpha', name: 'duplicate' },
      { id: 'beta', name: ' Beta ', contextWindow: 32000, maxTokens: -1 },
      { id: 'gamma', name: 'unsafe\u001b[31m' },
      { id: 'bad\u0000id' },
    ])).toEqual([
      { id: 'alpha' },
      { id: 'beta', name: 'Beta', contextWindow: 32000 },
      { id: 'gamma' },
    ])
  })

  it('rejects duplicate model ids and invalid capacities before writes', () => {
    expect(providerModelsIssue([{ id: 'same' }, { id: 'same' }])).toContain('重复')
    expect(providerModelsIssue([{ id: 'model', maxTokens: 1.5 }])).toContain('正整数')
    expect(providerModelsIssue([{ id: 'model', name: 'unsafe\u001b[31m' }])).toContain('名称')
  })
})

describe('Provider API writes', () => {
  it('builds only curated field ops so unknown and redacted fields survive', () => {
    expect(providerProfileOps(
      ['providers', 'acme'],
      { baseURL: 'https://next.invalid/v1', models: [{ id: 'next' }] },
      ['displayName'],
    )).toEqual([
      { op: 'set', path: ['providers', 'acme', 'baseURL'], value: 'https://next.invalid/v1' },
      { op: 'set', path: ['providers', 'acme', 'models'], value: [{ id: 'next' }] },
      { op: 'unset', path: ['providers', 'acme', 'displayName'] },
    ])
  })

  it('commits Settings before writing a credential', async () => {
    const { api, mutate, set } = apiHarness()
    const result = await saveProviderConfig(api, {
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', 'acme-gateway', 'baseURL'], value: 'https://next.invalid/v1' }],
      expectedRevision: 4,
      credential: { ref: 'ACME_GATEWAY_API_KEY', value: 'secret-never-rendered' },
    })
    expect(result).toMatchObject({ ok: true, credentialWritten: true })
    expect(mutate.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0] ?? 0)
  })

  it('retries a credential without reloading or rewriting Settings', async () => {
    const { api, mutate, set } = apiHarness()
    const result = await saveProviderConfig(api, {
      ns: 'llm-pi-ai',
      ops: [],
      expectedRevision: 5,
      credential: { ref: 'ACME_GATEWAY_API_KEY', value: 'secret-never-rendered' },
    })
    expect(result).toEqual({ ok: true, credentialWritten: true })
    expect(mutate).not.toHaveBeenCalled()
    expect(api.settings.describe).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledOnce()
  })

  it('reports credential partial success without retrying Settings', async () => {
    const { api, mutate, set } = apiHarness({ credentialCode: 'credential-rejected' })
    const result = await saveProviderConfig(api, {
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', 'acme-gateway', 'baseURL'], value: 'https://next.invalid/v1' }],
      expectedRevision: 4,
      credential: { ref: 'ACME_GATEWAY_API_KEY', value: 'secret-never-rendered' },
    })
    expect(result).toMatchObject({ ok: false, stage: 'credential', settingsCommitted: true })
    expect(mutate).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledOnce()
    expect(providerFailureMessage('credential', 'credential-rejected')).not.toContain('secret-never-rendered')
  })

  it('keeps credentials when removing a user-owned profile', async () => {
    const { api, unset } = apiHarness()
    const row = (await loadProviderConfig(api)).rows[0]
    expect(row).toBeDefined()
    await expect(removeProviderConfig(api, row!)).resolves.toMatchObject({ ok: true })
    expect(unset).not.toHaveBeenCalled()
  })

  it('normalizes official discovery candidates and hides the raw failure', async () => {
    await expect(discoverProviderModels(apiHarness().api, {
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://example.invalid/v1',
      api: 'openai-completions',
    })).resolves.toEqual([{ id: 'model-a' }, { id: 'model-b', contextWindow: 32000 }])
    await expect(discoverProviderModels(apiHarness({ discoveryCode: 'model-discovery-failed' }).api, {
      settingsNs: 'llm-pi-ai',
      baseURL: 'https://example.invalid/v1',
      api: 'openai-completions',
    })).rejects.not.toThrow('sensitive upstream text')
  })
})
