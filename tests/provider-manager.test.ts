import { beforeEach, describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { setUiLocale } from '../src/client/locale.ts'
import type {
  DetailOverlayRequest,
  InputOverlayRequest,
  OverlayChoice,
  OverlayPrompts,
  ProgressOverlayRequest,
  SecretTransactionRequest,
  SelectOverlayRequest,
} from '../src/client/overlays.ts'
import { manageProviders } from '../src/client/provider-manager.ts'
import type { ProviderApi } from '../src/client/provider-config.ts'

function ok<T>(value: T): never {
  return { rpcId: 'test', result: { ok: true, value } } as never
}

const schema = z.object({
  providers: z.dict(z.object({
    apiKeyEnv: z.string(),
    displayName: z.string(),
    api: z.union(['openai-completions', 'openai-responses', 'anthropic-messages']),
    baseURL: z.string(),
    models: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
})

function apiHarness(providers: readonly {
  readonly provider: string
  readonly displayName: string
  readonly settingsNs: string
  readonly settingsPath: string[]
  readonly active: boolean
  readonly declared?: boolean
}[] = [], credential = { configured: false, writable: true, source: undefined as string | undefined }, options: {
  readonly profile?: Readonly<Record<string, unknown>>
  readonly credentials?: Readonly<Record<string, { configured: boolean; writable: boolean; source?: string }>>
  readonly credentialDescribeFails?: boolean
  readonly modelFailures?: readonly string[]
  readonly settingsTransport?: 'before-apply' | 'after-apply'
} = {}): {
  readonly api: ProviderApi
  readonly mutate: ReturnType<typeof vi.fn>
  readonly set: ReturnType<typeof vi.fn>
} {
  let revision = 2
  const directory = providers.map(provider => ({ ...provider }))
  const profiles: Record<string, unknown> = {}
  for (const provider of providers) profiles[provider.provider] = {
    baseURL: 'https://old.example/v1',
    models: [{ id: 'old-model' }],
    ...(options.profile ?? {}),
  }
  const namespace = () => ({
    ns: 'llm-pi-ai',
    schema: schema.toJSON(),
    value: { providers: profiles },
    base: { providers: {} },
    user: { providers: profiles },
    applies: 'live' as const,
    secrets: [],
    revision,
  })
  const mutate = vi.fn(async (request: { ops: readonly { op: string; path: readonly string[]; value?: unknown }[] }) => {
    if (options.settingsTransport === 'before-apply') throw new Error('settings transport failed')
    revision += 1
    for (const op of request.ops) {
      const provider = op.path[1]
      if (provider === undefined) continue
      if (op.op === 'set' && op.path.length === 2 && op.value !== undefined) profiles[provider] = op.value
      if (op.op === 'set' && op.path.length === 2 && op.value !== undefined
        && !directory.some(entry => entry.provider === provider)) {
        directory.push({
          provider,
          displayName: provider,
          settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', provider],
          active: true,
          declared: true,
        })
      }
      if (op.op === 'set' && op.path.length === 3) {
        const profile = profiles[provider]
        if (typeof profile === 'object' && profile !== null && !Array.isArray(profile)) {
          ;(profile as Record<string, unknown>)[op.path[2]!] = op.value
        }
      }
      if (op.op === 'unset' && op.path.length === 2) delete profiles[provider]
      if (op.op === 'unset' && op.path.length === 3) {
        const profile = profiles[provider]
        if (typeof profile === 'object' && profile !== null && !Array.isArray(profile)) {
          delete (profile as Record<string, unknown>)[op.path[2]!]
        }
      }
    }
    if (options.settingsTransport === 'after-apply') throw new Error('settings transport failed')
    return ok(namespace())
  })
  const writtenCredentials = new Set<string>()
  const set = vi.fn(async ({ ref }: { ref: string }) => {
    writtenCredentials.add(ref)
    return ok({})
  })
  return {
    api: {
      llm: {
        providers: vi.fn(async () => ok({ providers: directory.map(entry => ({
          ...entry,
          active: profiles[entry.provider] !== undefined && entry.active,
        })) })),
        models: vi.fn(async () => ok({
          groups: Object.entries(profiles).flatMap(([id, profile]) => {
            const models = typeof profile === 'object' && profile !== null && !Array.isArray(profile)
              && Array.isArray((profile as Record<string, unknown>).models)
              ? (profile as { models: readonly { id: string; name?: string }[] }).models
              : []
            return models.length === 0 ? [] : [{ id, name: id, models }]
          }),
          failures: (options.modelFailures ?? []).map(id => ({ id, name: id, message: 'catalog failed' })),
        })),
        discoverModels: vi.fn(async () => ok({ models: [] })),
      },
      settings: {
        describe: vi.fn(async () => ok({ writable: true, hasDocument: true, namespaces: [namespace()] })),
        mutate,
      },
      credentials: {
        describe: vi.fn(async ({ refs }: { refs: string[] }) => {
          if (options.credentialDescribeFails) throw new Error('describe unavailable')
          return ok({
            credentials: Object.fromEntries(refs.map(ref => [ref, writtenCredentials.has(ref)
              ? { configured: true, writable: true }
              : options.credentials?.[ref] ?? credential])),
          })
        }),
        set,
        unset: vi.fn(async () => ok({})),
      },
    } as unknown as ProviderApi,
    mutate,
    set,
  }
}

function overlayHarness(options: {
  readonly selections: readonly (string | undefined)[]
  readonly inputs?: readonly (string | undefined)[]
  readonly secrets?: readonly (string | undefined)[]
  readonly confirms?: readonly boolean[]
}): {
  readonly overlays: OverlayPrompts
  readonly rendered: string[]
} {
  const selections = [...options.selections]
  const inputs = [...(options.inputs ?? [])]
  const secrets = [...(options.secrets ?? [])]
  const confirms = [...(options.confirms ?? [])]
  const rendered: string[] = []
  const remember = (request: unknown): void => { rendered.push(JSON.stringify(request)) }
  const overlays: OverlayPrompts = {
    select: vi.fn(async (request: SelectOverlayRequest): Promise<OverlayChoice | undefined> => {
      remember(request)
      const id = selections.shift()
      return id === undefined ? undefined : request.choices.find(choice => choice.id === id)
    }),
    input: vi.fn(async (request: InputOverlayRequest) => {
      remember(request)
      return inputs.shift()
    }),
    multilineInput: vi.fn(async () => undefined),
    secretInput: vi.fn(async (request: InputOverlayRequest) => {
      remember(request)
      return secrets.shift()
    }),
    secretTransaction: vi.fn(async <T>(_request: SecretTransactionRequest<T>) => undefined),
    multiSelect: vi.fn(async (request: SelectOverlayRequest) => {
      remember(request)
      return request.choices.filter(choice => choice.active === true)
    }),
    detail: vi.fn(async (request: DetailOverlayRequest) => { remember(request) }),
    confirm: vi.fn(async (title: string, detail: string, confirmLabel?: string) => {
      remember({ title, detail, confirmLabel })
      return confirms.shift() ?? false
    }),
    progress: async <T>(request: ProgressOverlayRequest<T>): Promise<T | undefined> => {
      remember(request)
      return request.work(() => undefined, new AbortController().signal)
    },
  }
  return { overlays, rendered }
}

beforeEach(() => { setUiLocale('zh') })

describe('shared Provider manager', () => {
  it('creates a custom Provider with one path mutation and one credential write', async () => {
    const { api, mutate, set } = apiHarness()
    const secret = 'secret-that-must-not-render'
    const { overlays, rendered } = overlayHarness({
      selections: [
        '__add__',
        'openai-completions',
        '__add__',
        '__done__',
        undefined,
      ],
      inputs: [
        'opencode-go',
        'OpenCode Go',
        'https://opencode.ai/zen/go/v1',
        'OPENCODE_GO_API_KEY',
        'deepseek-v4-flash',
        'DeepSeek V4 Flash',
        '',
        '',
      ],
      secrets: [secret],
      confirms: [true],
    })
    const notices: string[] = []
    await expect(manageProviders(overlays, api, {
      notice: message => { notices.push(message) },
    })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledWith({
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'opencode-go'],
        value: {
          displayName: 'OpenCode Go',
          apiKeyEnv: 'OPENCODE_GO_API_KEY',
          api: 'openai-completions',
          baseURL: 'https://opencode.ai/zen/go/v1',
          models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }],
        },
      }],
      expectedRevision: 2,
    })
    expect(set).toHaveBeenCalledWith({ ref: 'OPENCODE_GO_API_KEY', value: secret })
    expect(rendered.join('\n')).not.toContain(secret)
    expect(notices.join('\n')).toContain('已保存')
  })

  it('edits only Base URL on an existing Provider and preserves unknown fields', async () => {
    const provider = {
      provider: 'acme',
      displayName: 'Acme',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'],
      active: true,
      declared: true,
    }
    const { api, mutate } = apiHarness([provider])
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'save', undefined],
      inputs: ['https://new.example/v1'],
    })
    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')
    expect(mutate).toHaveBeenCalledWith({
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', 'acme', 'baseURL'], value: 'https://new.example/v1' }],
      expectedRevision: 2,
    })
  })

  it('saves an externally managed Credential Ref without asking for or writing a key', async () => {
    const { api, mutate, set } = apiHarness([], { configured: true, writable: false, source: 'env' })
    const { overlays } = overlayHarness({
      selections: ['__add__', 'openai-completions', '__add__', '__done__', undefined],
      inputs: [
        'external-gateway',
        'External Gateway',
        'https://example.invalid/v1',
        'EXTERNAL_GATEWAY_API_KEY',
        'model-a',
        '',
        '',
        '',
      ],
      confirms: [true, true],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(set).not.toHaveBeenCalled()
    expect(mutate.mock.calls[0]?.[0].ops[0]?.value).toMatchObject({
      apiKeyEnv: 'EXTERNAL_GATEWAY_API_KEY',
    })
  })

  it('reuses a configured writable Ref when creating without offering to overwrite its key', async () => {
    const { api, mutate, set } = apiHarness([], { configured: true, writable: true, source: 'file' })
    const { overlays, rendered } = overlayHarness({
      selections: ['__add__', 'openai-completions', '__add__', '__done__', undefined],
      inputs: [
        'configured-route',
        'Configured Route',
        'https://configured.example/v1',
        'configured_key',
        'model-a',
        '',
        '',
        '',
      ],
      secrets: ['must-not-be-requested'],
      confirms: [true, true],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(overlays.secretInput).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(mutate.mock.calls[0]?.[0].ops[0]?.value).toMatchObject({ apiKeyEnv: 'configured_key' })
    expect(rendered.join('\n')).toContain('https://configured.example/v1')
    expect(rendered.join('\n')).toContain('configured_key')
  })

  it('adds endpoint and key to a Provider with no prior Ref through a fresh unconfigured Ref', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider])
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'credential', 'save', undefined],
      inputs: ['https://new.example/v1', 'acme_key'],
      secrets: ['new-secret'],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledWith({
      ns: 'llm-pi-ai',
      ops: [
        { op: 'set', path: ['providers', 'acme', 'apiKeyEnv'], value: 'acme_key' },
        { op: 'set', path: ['providers', 'acme', 'baseURL'], value: 'https://new.example/v1' },
      ],
      expectedRevision: 2,
    })
    expect(set).toHaveBeenCalledExactlyOnceWith({ ref: 'acme_key', value: 'new-secret' })
  })

  it('explicitly reuses a configured read-only Ref on a Provider with no prior Ref', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider], { configured: true, writable: false, source: 'env' })
    const { overlays, rendered } = overlayHarness({
      selections: ['acme', 'credential', 'save', undefined],
      inputs: ['shared_key'],
      confirms: [true],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(set).not.toHaveBeenCalled()
    expect(mutate.mock.calls[0]?.[0].ops).toEqual([
      { op: 'set', path: ['providers', 'acme', 'apiKeyEnv'], value: 'shared_key' },
    ])
    expect(rendered.join('\n')).toContain('shared_key')
    expect(rendered.join('\n')).toContain('https://old.example/v1')
  })

  it('requires a new endpoint-and-Ref confirmation when the endpoint changes after reuse confirmation', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider], { configured: true, writable: false, source: 'env' })
    const { overlays, rendered } = overlayHarness({
      selections: ['acme', 'credential', 'baseURL', 'save', undefined],
      inputs: ['shared_key', 'https://changed.example/v1'],
      confirms: [true, false],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('unchanged')

    expect(mutate).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(rendered.join('\n')).toContain('https://changed.example/v1')
    expect(rendered.join('\n')).toContain('shared_key')
  })

  it('fails closed when a fresh Ref becomes configured after confirmation', async () => {
    const { api, mutate, set } = apiHarness()
    let describeCalls = 0
    vi.mocked(api.credentials.describe).mockImplementation(async ({ refs }) => {
      describeCalls += 1
      return ok({
        credentials: Object.fromEntries(refs.map(ref => [ref, {
          configured: describeCalls > 1,
          writable: true,
        }])),
      })
    })
    const { overlays } = overlayHarness({
      selections: ['__add__', 'openai-completions', '__add__', '__done__', undefined],
      inputs: ['racy-route', '', 'https://racy.example/v1', 'racy_key', 'model-a', '', '', ''],
      secrets: ['new-secret'],
      confirms: [true],
    })
    const notices: string[] = []

    await expect(manageProviders(overlays, api, {
      notice: message => { notices.push(message) },
    })).resolves.toBe('unchanged')

    expect(mutate).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(notices.join('\n')).toContain('确认后发生变化')
  })

  it('switches endpoint and key through a different unconfigured writable Ref', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider], undefined, {
      profile: { apiKeyEnv: 'ACME_API_KEY' },
      credentials: {
        ACME_API_KEY: { configured: true, writable: true, source: 'file' },
        ACME_API_KEY_NEXT: { configured: false, writable: true },
      },
    })
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'credential', 'save', undefined],
      inputs: ['https://new.example/v1', 'ACME_API_KEY_NEXT'],
      secrets: ['new-secret'],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledWith({
      ns: 'llm-pi-ai',
      ops: [
        { op: 'set', path: ['providers', 'acme', 'apiKeyEnv'], value: 'ACME_API_KEY_NEXT' },
        { op: 'set', path: ['providers', 'acme', 'baseURL'], value: 'https://new.example/v1' },
      ],
      expectedRevision: 2,
    })
    expect(set).toHaveBeenCalledExactlyOnceWith({ ref: 'ACME_API_KEY_NEXT', value: 'new-secret' })
    const describe = vi.mocked(api.credentials.describe)
    const freshRefDescribe = describe.mock.calls.findIndex(([request]) => request.refs.includes('ACME_API_KEY_NEXT'))
    expect(describe.mock.invocationCallOrder[freshRefDescribe] ?? 0).toBeLessThan(mutate.mock.invocationCallOrder[0] ?? 0)
    expect(mutate.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0] ?? 0)
  })

  it('does not combine other Settings changes with overwriting a configured Ref', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider], undefined, {
      profile: { apiKeyEnv: 'ACME_API_KEY' },
      credentials: { ACME_API_KEY: { configured: true, writable: true } },
    })
    const { overlays } = overlayHarness({
      selections: ['acme', 'displayName', 'credential', 'save', undefined],
      inputs: ['Renamed Acme'],
      secrets: ['replacement-secret'],
    })
    const notices: string[] = []

    await expect(manageProviders(overlays, api, {
      notice: message => { notices.push(message) },
    })).resolves.toBe('unchanged')

    expect(mutate).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(notices.join('\n')).toContain('必须单独保存')
  })

  it('reads back an applied Settings mutation after a transport failure instead of retrying it', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate } = apiHarness([provider], undefined, { settingsTransport: 'after-apply' })
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'save', undefined],
      inputs: ['https://new.example/v1'],
    })
    const notices: string[] = []

    await expect(manageProviders(overlays, api, {
      notice: message => { notices.push(message) },
    })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(notices.join('\n')).toContain('回读核实')
  })

  it('continues with the same credential only after an unknown Settings result is confirmed applied', async () => {
    const { api, mutate, set } = apiHarness([], undefined, { settingsTransport: 'after-apply' })
    const { overlays } = overlayHarness({
      selections: ['__add__', 'openai-completions', '__add__', '__done__', undefined],
      inputs: ['transport-route', '', 'https://transport.example/v1', 'transport_key', 'model-a', '', '', ''],
      secrets: ['new-secret'],
      confirms: [true],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledExactlyOnceWith({ ref: 'transport_key', value: 'new-secret' })
    expect(mutate.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0] ?? 0)
  })

  it('does not retry an unknown Settings mutation when readback cannot confirm it', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate } = apiHarness([provider], undefined, { settingsTransport: 'before-apply' })
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'save', undefined],
      inputs: ['https://new.example/v1'],
    })
    const notices: string[] = []

    await expect(manageProviders(overlays, api, {
      notice: message => { notices.push(message) },
    })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(notices.join('\n')).toContain('不会自动重试')
  })

  it('does not report full success when the official model catalog reports a route failure', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api } = apiHarness([provider], undefined, { modelFailures: ['acme'] })
    const { overlays } = overlayHarness({
      selections: ['acme', 'baseURL', 'save', undefined],
      inputs: ['https://new.example/v1'],
    })
    const notices: { message: string; tone: string }[] = []

    await expect(manageProviders(overlays, api, {
      notice: (message, tone) => { notices.push({ message, tone }) },
    })).resolves.toBe('changed')

    expect(notices.some(notice => notice.tone === 'success')).toBe(false)
    expect(notices.map(notice => notice.message).join('\n')).toContain('模型目录尚不可用')
  })

  it('preserves complete official model fields while editing projected fields', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const completeModel = {
      id: 'vision-reasoner',
      name: 'Vision Reasoner',
      contextWindow: 128000,
      maxTokens: 8192,
      input: ['text', 'image'],
      reasoningEfforts: { off: null, high: 'high' },
      compat: { supportsStrictMode: true },
    }
    const { api, mutate } = apiHarness([provider], undefined, { profile: { models: [completeModel] } })
    const { overlays } = overlayHarness({
      selections: ['acme', 'models', 'model:0', 'edit', '__done__', 'save', undefined],
      inputs: ['vision-reasoner', 'Vision Reasoner 2', '128000', '8192'],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(mutate.mock.calls[0]?.[0].ops).toEqual([{
      op: 'set',
      path: ['providers', 'acme', 'models'],
      value: [{ ...completeModel, name: 'Vision Reasoner 2' }],
    }])
  })

  it('fails closed when Credential metadata cannot be described', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, set } = apiHarness([provider], undefined, {
      profile: { apiKeyEnv: 'ACME_API_KEY' },
      credentialDescribeFails: true,
    })
    const { overlays, rendered } = overlayHarness({ selections: ['acme', 'credential', undefined], secrets: ['must-not-be-read'] })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('unchanged')

    expect(set).not.toHaveBeenCalled()
    expect(overlays.secretInput).not.toHaveBeenCalled()
    expect(rendered.join('\n')).toContain('无法确认凭据来源与可写性')
  })

  it('rechecks current/default references after confirmation before deletion', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate } = apiHarness([provider])
    const { overlays } = overlayHarness({ selections: ['acme', 'delete', undefined], confirms: [true] })

    await expect(manageProviders(overlays, api, {
      notice: () => undefined,
      allowDelete: true,
      protectedProviders: [],
      reloadProtectedProviders: async () => ['acme'],
    })).resolves.toBe('unchanged')

    expect(mutate).not.toHaveBeenCalled()
  })

  it('rereads ownership and verifies the Provider is gone after deletion', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate, set } = apiHarness([provider])
    const { overlays } = overlayHarness({ selections: ['acme', 'delete', undefined], confirms: [true] })

    await expect(manageProviders(overlays, api, {
      notice: () => undefined,
      allowDelete: true,
      protectedProviders: [],
      reloadProtectedProviders: async () => [],
    })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      ns: 'llm-pi-ai',
      ops: [{ op: 'unset', path: ['providers', 'acme'] }],
      expectedRevision: 2,
    })
    expect(vi.mocked(api.settings.describe)).toHaveBeenCalledTimes(4)
    expect(set).not.toHaveBeenCalled()
  })

  it('rechecks current/default references again after deletion and reports a concurrent reference', async () => {
    const provider = {
      provider: 'acme', displayName: 'Acme', settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'acme'], active: true, declared: true,
    }
    const { api, mutate } = apiHarness([provider])
    const { overlays } = overlayHarness({ selections: ['acme', 'delete', undefined], confirms: [true] })
    const reloadProtectedProviders = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['acme'])
    const notices: { message: string; tone: string }[] = []

    await expect(manageProviders(overlays, api, {
      notice: (message, tone) => { notices.push({ message, tone }) },
      allowDelete: true,
      protectedProviders: [],
      reloadProtectedProviders,
    })).resolves.toBe('changed')

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(reloadProtectedProviders).toHaveBeenCalledTimes(2)
    expect(notices.some(notice => notice.tone === 'success')).toBe(false)
    expect(notices.map(notice => notice.message).join('\n')).toContain('并发变更')
  })
})
