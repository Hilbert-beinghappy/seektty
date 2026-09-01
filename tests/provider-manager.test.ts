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
}[] = [], credential = { configured: false, writable: true, source: undefined as string | undefined }): {
  readonly api: ProviderApi
  readonly mutate: ReturnType<typeof vi.fn>
  readonly set: ReturnType<typeof vi.fn>
} {
  let revision = 2
  const profiles: Record<string, unknown> = {}
  for (const provider of providers) profiles[provider.provider] = {
    baseURL: 'https://old.example/v1',
    models: [{ id: 'old-model' }],
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
    revision += 1
    const create = request.ops.find(op => op.op === 'set' && op.path.length === 2)
    if (create?.value !== undefined) profiles[create.path[1]!] = create.value
    return ok(namespace())
  })
  const set = vi.fn(async () => ok({}))
  return {
    api: {
      llm: {
        providers: vi.fn(async () => ok({ providers })),
        models: vi.fn(async () => ok({ groups: [], failures: [] })),
        discoverModels: vi.fn(async () => ok({ models: [] })),
      },
      settings: {
        describe: vi.fn(async () => ok({ writable: true, hasDocument: true, namespaces: [namespace()] })),
        mutate,
      },
      credentials: {
        describe: vi.fn(async ({ refs }: { refs: string[] }) => ok({
          credentials: Object.fromEntries(refs.map(ref => [ref, credential])),
        })),
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
      confirms: [true],
    })

    await expect(manageProviders(overlays, api, { notice: () => undefined })).resolves.toBe('changed')

    expect(set).not.toHaveBeenCalled()
    expect(mutate.mock.calls[0]?.[0].ops[0]?.value).toMatchObject({
      apiKeyEnv: 'EXTERNAL_GATEWAY_API_KEY',
    })
  })
})
