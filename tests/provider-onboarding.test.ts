import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import type { InputOverlayRequest, SecretTransactionRequest } from '../src/client/overlays.ts'
import {
  dispatchAfterProviderOnboarding,
  inspectProviderReadiness,
  normalizeOnboardingApiKey,
  ProviderOnboardingGate,
  type ProviderOnboardingResult,
  type ProviderReadiness,
} from '../src/client/provider-onboarding.ts'

const DEEPSEEK_REF = 'TEAM_DEEPSEEK_TOKEN'

type OnboardingApi = Parameters<typeof inspectProviderReadiness>[0]

function transactionHarness(
  secretInput: (request: InputOverlayRequest) => Promise<string | undefined>,
) {
  return async <T>(request: SecretTransactionRequest<T>): Promise<T | undefined> => {
    let failure: string | undefined
    while (true) {
      const raw = await secretInput({
        ...request.input,
        detail: [request.input.detail, failure]
          .filter((line): line is string => line !== undefined && line !== '')
          .join('\n'),
      })
      if (raw === undefined) return undefined
      const checked = request.validate(raw)
      if (!checked.ok) {
        failure = checked.message
        continue
      }
      try {
        const result = await request.work(checked.value, new AbortController().signal)
        if (result.ok) return result.value
        failure = result.message
      } catch {
        failure = request.failureMessage
      }
    }
  }
}

const provider = {
  provider: 'deepseek-official',
  displayName: 'DeepSeek',
  settingsNs: 'llm-deepseek',
  settingsPath: [],
  active: true,
}

function ok<T>(value: T): never {
  return { rpcId: 'test', result: { ok: true, value } } as never
}

function fail(message: string): never {
  return {
    rpcId: 'test',
    result: { ok: false, error: { code: 'internal', message } },
  } as never
}

interface ApiOptions {
  readonly providers?: readonly typeof provider[]
  readonly namespaceValue?: unknown
  readonly settingsWritable?: boolean
  readonly configured?: boolean
  readonly credentialWritable?: boolean
  readonly credentialSource?: string
  readonly credentialsFail?: boolean
  readonly providerLoadFail?: boolean
  readonly setResponses?: readonly ('ok' | 'fail')[]
  readonly setErrorMessage?: string
}

function apiHarness(options: ApiOptions = {}): {
  readonly api: OnboardingApi
  readonly describe: ReturnType<typeof vi.fn>
  readonly set: ReturnType<typeof vi.fn>
} {
  let configured = options.configured ?? false
  let setIndex = 0
  const describe = vi.fn(async ({ refs }: { refs: string[] }) => options.credentialsFail === true
    ? fail('credential service down')
    : ok({
      credentials: Object.fromEntries(refs.map(ref => [ref, {
        configured,
        ...(options.credentialSource === undefined ? {} : { source: options.credentialSource }),
        writable: options.credentialWritable ?? true,
      }])),
    }))
  const set = vi.fn(async (_request: { ref: string; value: string }) => {
    const result = options.setResponses?.[setIndex++] ?? 'ok'
    if (result === 'fail') return fail(options.setErrorMessage ?? 'credential write rejected')
    configured = true
    return ok({})
  })
  const api = {
    llm: {
      providers: vi.fn(async () => {
        if (options.providerLoadFail === true) throw new Error('provider directory down')
        return ok({ providers: [...(options.providers ?? [provider])] })
      }),
    },
    settings: {
      describe: vi.fn(async () => ok({
        writable: options.settingsWritable ?? true,
        hasDocument: true,
        namespaces: [{
          ns: 'llm-deepseek',
          schema: {},
          value: options.namespaceValue ?? { apiKeyEnv: DEEPSEEK_REF },
          applies: 'live',
          secrets: [],
          revision: 0,
        }],
      })),
    },
    credentials: { describe, set },
  } as unknown as OnboardingApi
  return { api, describe, set }
}

beforeEach(() => {
  setUiLocale('zh')
})

describe('Provider readiness', () => {
  it('discovers the credential reference from Harness Settings', async () => {
    const { api, describe } = apiHarness()

    await expect(inspectProviderReadiness(api)).resolves.toEqual({
      kind: 'needs-credential',
      provider: 'deepseek-official',
      displayName: 'DeepSeek',
      ref: DEEPSEEK_REF,
    })
    expect(describe).toHaveBeenCalledWith({ refs: [DEEPSEEK_REF] })
  })

  it.each(['env', 'file'])('accepts a credential from the Harness %s layer without prompting', async (source) => {
    const { api } = apiHarness({ configured: true, credentialWritable: false, credentialSource: source })
    await expect(inspectProviderReadiness(api)).resolves.toEqual({ kind: 'ready' })
  })

  it('does not require Settings writes when the resolved credential reference is writable', async () => {
    const { api } = apiHarness({ settingsWritable: false })
    await expect(inspectProviderReadiness(api)).resolves.toMatchObject({
      kind: 'needs-credential',
      ref: DEEPSEEK_REF,
    })
  })

  it('accepts another active keyless Provider', async () => {
    const { api } = apiHarness({
      providers: [
        provider,
        {
          provider: 'bedrock',
          displayName: 'Amazon Bedrock',
          settingsNs: 'llm-bedrock',
          settingsPath: [],
          active: true,
        },
      ],
    })
    await expect(inspectProviderReadiness(api)).resolves.toEqual({ kind: 'ready' })
  })

  it.each([
    ['adapter-absent', { providers: [] }],
    ['provider-inactive', { providers: [{ ...provider, active: false }] }],
    ['credentials-unavailable', { namespaceValue: {} }],
    ['credential-read-only', { credentialWritable: false }],
    ['credentials-unavailable', { credentialsFail: true }],
    ['load-failed', { providerLoadFail: true }],
  ] as const)('returns %s instead of opening a broken form', async (reason, options) => {
    const { api } = apiHarness(options)
    await expect(inspectProviderReadiness(api)).resolves.toEqual({ kind: 'unavailable', reason })
  })
})

describe('API key input', () => {
  it('uses Harness normalization for surrounding whitespace', () => {
    expect(normalizeOnboardingApiKey('  sk-valid-key\n')).toEqual({ ok: true, value: 'sk-valid-key' })
  })

  it.each([
    '',
    '   ',
    'DEEPSEEK_API_KEY=sk-wrapped',
    '"sk-wrapped"',
    "'sk-wrapped'",
    '`sk-wrapped`',
    'sk-key with spaces',
    '密钥',
  ])('rejects an unsafe pasted value without echoing it: %j', (raw) => {
    const result = normalizeOnboardingApiKey(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain(raw.trim() || 'never-present')
  })
})

describe('Provider onboarding gate', () => {
  const missing: ProviderReadiness = {
    kind: 'needs-credential',
    provider: 'deepseek-official',
    displayName: 'DeepSeek',
    ref: DEEPSEEK_REF,
  }

  it('stores a normalized key, rechecks readiness, and never renders the secret', async () => {
    const { api, set } = apiHarness()
    const requests: InputOverlayRequest[] = []
    const secret = 'sk-do-not-render-123'
    const secretInput = vi.fn(async (request: InputOverlayRequest) => {
      requests.push(request)
      return `  ${secret}  `
    })
    const notices: string[] = []
    const gate = new ProviderOnboardingGate(
      api,
      { secretTransaction: transactionHarness(secretInput) },
      message => { notices.push(message) },
      missing,
    )

    await expect(gate.ensure()).resolves.toBe('ready')
    await expect(gate.ensure()).resolves.toBe('ready')
    expect(secretInput).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith({ ref: DEEPSEEK_REF, value: secret })
    expect(JSON.stringify(requests)).not.toContain(secret)
    expect(notices.join('\n')).not.toContain(secret)
  })

  it('keeps prompting after invalid input and a rejected write', async () => {
    const { api, set } = apiHarness({
      setResponses: ['fail', 'ok'],
      setErrorMessage: 'credential write rejected sk-first-valid',
    })
    const requests: InputOverlayRequest[] = []
    const secretInput = vi.fn()
      .mockImplementationOnce(async (request: InputOverlayRequest) => {
        requests.push(request)
        return 'DEEPSEEK_API_KEY=sk-wrong'
      })
      .mockImplementationOnce(async (request: InputOverlayRequest) => {
        requests.push(request)
        return 'sk-first-valid'
      })
      .mockImplementationOnce(async (request: InputOverlayRequest) => {
        requests.push(request)
        return 'sk-second-valid'
      })
    const gate = new ProviderOnboardingGate(api, { secretTransaction: transactionHarness(secretInput) }, () => undefined, missing)

    await expect(gate.ensure()).resolves.toBe('ready')
    expect(secretInput).toHaveBeenCalledTimes(3)
    expect(set).toHaveBeenCalledTimes(2)
    expect(requests[1]?.detail).toContain('请只粘贴 API Key')
    expect(requests[2]?.detail).toContain('保存失败')
    expect(JSON.stringify(requests)).not.toContain('sk-first-valid')
  })

  it('deduplicates concurrent prompts and lets the user configure later', async () => {
    const { api, set } = apiHarness()
    let settle: ((value: string | undefined) => void) | undefined
    const secretInput = vi.fn(() => new Promise<string | undefined>((resolve) => { settle = resolve }))
    const gate = new ProviderOnboardingGate(api, { secretTransaction: transactionHarness(secretInput) }, () => undefined, missing)

    const first = gate.ensure()
    const second = gate.ensure()
    expect(second).toBe(first)
    expect(secretInput).toHaveBeenCalledOnce()
    settle?.(undefined)
    await expect(Promise.all([first, second])).resolves.toEqual(['deferred', 'deferred'])
    expect(set).not.toHaveBeenCalled()
  })
})

describe('prompt continuation', () => {
  it('restores an initial or submitted task and retains attachments when setup is deferred', async () => {
    let editor = ''
    const attachments = ['image.png']
    const dispatch = vi.fn(async () => {
      attachments.splice(0)
      return true
    })

    await expect(dispatchAfterProviderOnboarding(
      Promise.resolve<ProviderOnboardingResult>('deferred'),
      () => { editor = 'check this project' },
      dispatch,
    )).resolves.toBe(false)
    expect(editor).toBe('check this project')
    expect(attachments).toEqual(['image.png'])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it.each(['ready', 'unavailable'] as const)('preserves Harness behavior after %s', async (result) => {
    const dispatch = vi.fn(async () => true)
    const restore = vi.fn()

    await expect(dispatchAfterProviderOnboarding(Promise.resolve(result), restore, dispatch)).resolves.toBe(true)
    expect(dispatch).toHaveBeenCalledOnce()
    expect(restore).not.toHaveBeenCalled()
  })
})
