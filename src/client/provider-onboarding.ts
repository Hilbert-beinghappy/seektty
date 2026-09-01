/** First-run model Provider readiness and write-only DeepSeek credential flow. */

import type {
  ConfigurableProviderView,
  CredentialView,
  IApiClient,
  SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { getPath } from '@deepseek-ai/dsh-client-schema-form'
import { ui } from './locale.ts'
import type { InputOverlayRequest, OverlayPrompts } from './overlays.ts'
import { normalizeProviderApiKey } from './provider-config.ts'
import { manageProviders } from './provider-manager.ts'

const DEEPSEEK_PROVIDER = 'deepseek-official'
const DEEPSEEK_SETTINGS_NAMESPACE = 'llm-deepseek'

type OnboardingApi = Pick<IApiClient, 'credentials' | 'llm' | 'settings'>

/** Why SeekTTY cannot safely offer a writable credential prompt. */
export type ProviderOnboardingUnavailableReason =
  | 'adapter-absent'
  | 'credential-read-only'
  | 'credentials-unavailable'
  | 'load-failed'
  | 'provider-inactive'
  | 'provider-no-models'

/** Current ability to make model requests or repair the official DeepSeek route. */
export type ProviderReadiness =
  | { readonly kind: 'ready' }
  | {
    readonly kind: 'needs-credential'
    readonly provider: string
    readonly displayName: string
    readonly ref: string
  }
  | {
    readonly kind: 'unavailable'
    readonly reason: ProviderOnboardingUnavailableReason
  }

/** Result of one user-paced readiness gate. Only deferred blocks a prompt. */
export type ProviderOnboardingResult = 'ready' | 'deferred' | 'unavailable'

interface ProviderRow {
  readonly entry: ConfigurableProviderView
  readonly apiKeyEnv: string | undefined
  readonly credential: CredentialView | undefined
}

/** Minimal write-only prompt surface needed by the onboarding controller. */
export type ProviderOnboardingOverlays = OverlayPrompts

function apiKeyEnvOf(namespace: SettingsNamespaceView | undefined, path: readonly string[]): string | undefined {
  if (namespace === undefined) return undefined
  const profile = getPath(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : undefined
}

function providerUsable(row: ProviderRow, providersWithModels: ReadonlySet<string>): boolean {
  if (!row.entry.active || !providersWithModels.has(row.entry.provider)) return false
  if (row.entry.provider === DEEPSEEK_PROVIDER
    && row.entry.settingsNs === DEEPSEEK_SETTINGS_NAMESPACE
    && row.entry.settingsPath.length === 0
    && row.apiKeyEnv === undefined) return false
  if (row.apiKeyEnv === undefined) return true
  return row.credential?.configured === true
}

/**
 * Join Harness Provider topology, Settings, and value-free Credential metadata.
 * @param api - official Harness client faces.
 * @returns readiness without ever reading a credential value.
 */
export async function inspectProviderReadiness(api: OnboardingApi): Promise<ProviderReadiness> {
  let providers: ConfigurableProviderView[]
  let namespaces: SettingsNamespaceView[]
  let providersWithModels: Set<string>
  try {
    const [providersResponse, modelsResponse, settingsResponse] = await Promise.all([
      api.llm.providers({}),
      api.llm.models({}),
      api.settings.describe({}),
    ])
    if (!providersResponse.result.ok || !modelsResponse.result.ok || !settingsResponse.result.ok) {
      return { kind: 'unavailable', reason: 'load-failed' }
    }
    providers = providersResponse.result.value.providers
    namespaces = settingsResponse.result.value.namespaces
    providersWithModels = new Set(modelsResponse.result.value.groups
      .filter(group => group.models.length > 0)
      .map(group => group.id))
  } catch {
    return { kind: 'unavailable', reason: 'load-failed' }
  }

  const namespaceById = new Map(namespaces.map(namespace => [namespace.ns, namespace]))
  const rows: ProviderRow[] = providers.map(entry => ({
    entry,
    apiKeyEnv: apiKeyEnvOf(namespaceById.get(entry.settingsNs), entry.settingsPath),
    credential: undefined,
  }))
  const refs = [...new Set(rows.flatMap(row => row.apiKeyEnv === undefined ? [] : [row.apiKeyEnv]))]
  let credentials: Record<string, CredentialView> = {}
  let credentialsAvailable = true
  if (refs.length > 0) {
    try {
      const response = await api.credentials.describe({ refs })
      if (response.result.ok) credentials = response.result.value.credentials
      else credentialsAvailable = false
    } catch {
      credentialsAvailable = false
    }
  }
  const joined = rows.map(row => ({
    ...row,
    credential: row.apiKeyEnv === undefined ? undefined : credentials[row.apiKeyEnv],
  }))
  if (joined.some(row => providerUsable(row, providersWithModels))) return { kind: 'ready' }

  const deepseek = joined.find(row =>
    row.entry.provider === DEEPSEEK_PROVIDER
    && row.entry.settingsNs === DEEPSEEK_SETTINGS_NAMESPACE
    && row.entry.settingsPath.length === 0)
  if (deepseek === undefined) return { kind: 'unavailable', reason: 'adapter-absent' }
  if (!deepseek.entry.active) return { kind: 'unavailable', reason: 'provider-inactive' }
  if (!providersWithModels.has(deepseek.entry.provider)) return { kind: 'unavailable', reason: 'provider-no-models' }
  if (!credentialsAvailable || deepseek.apiKeyEnv === undefined || deepseek.credential === undefined) {
    return { kind: 'unavailable', reason: 'credentials-unavailable' }
  }
  if (!deepseek.credential.writable) return { kind: 'unavailable', reason: 'credential-read-only' }
  return {
    kind: 'needs-credential',
    provider: deepseek.entry.provider,
    displayName: deepseek.entry.displayName,
    ref: deepseek.apiKeyEnv,
  }
}

/**
 * Normalize a pasted key with Harness' transport rule and reject common wrapper mistakes.
 * @param raw - exact write-only input value.
 * @returns normalized key or localized safe failure text.
 */
export function normalizeOnboardingApiKey(raw: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  return normalizeProviderApiKey(raw)
}

/** Human guidance when the native readiness join cannot offer a useful form. */
export function providerUnavailableNotice(reason: ProviderOnboardingUnavailableReason): string {
  switch (reason) {
    case 'load-failed':
    case 'credentials-unavailable': return ui(
      '无法确认模型凭证状态；可使用 /doctor 检查 Harness。',
      'Could not confirm model credential state; use /doctor to inspect Harness.',
    )
    case 'adapter-absent':
    case 'provider-inactive':
    case 'provider-no-models': return ui(
      '当前没有可用的模型 Provider；请使用 /settings 或 /doctor 检查配置。',
      'No model Provider is currently available; inspect /settings or /doctor.',
    )
    case 'credential-read-only': return ui(
      'DeepSeek API Key 由外部配置管理；请在启动环境中配置后重试。',
      'The DeepSeek API key is managed externally; configure it in the launch environment and retry.',
    )
  }
}

/** Status-bar copy after the user defers first-run credential setup. */
export function onboardingDeferredNotice(): string {
  return ui(
    '尚未配置可用模型；发送消息时会再次提示。',
    'No usable model is configured; setup will open again when you send a message.',
  )
}

function credentialSaveFailure(): string {
  return ui(
    '保存失败；请重试，或按 Esc 后使用 /doctor 检查。',
    'Save failed. Retry, or press Esc and inspect /doctor.',
  )
}

function promptRequest(readiness: Extract<ProviderReadiness, { kind: 'needs-credential' }>, failure?: string): InputOverlayRequest {
  return {
    title: ui('添加 API Key 开始使用', 'Add an API key to get started'),
    detail: [
      ui(`配置 ${readiness.displayName} 官方模型，即可开始使用。`, `Configure the official ${readiness.displayName} models to get started.`),
      ui('密钥由 DeepSeek Harness 安全保存，不会回显或写入日志。', 'DeepSeek Harness stores the key securely; it is never echoed or written to logs.'),
      failure,
    ].filter((line): line is string => line !== undefined).join('\n'),
    placeholder: ui('粘贴 DeepSeek API Key', 'Paste your DeepSeek API key'),
    footer: ui('Enter 保存并继续 · Esc 稍后配置', 'Enter save and continue · Esc configure later'),
    options: { width: '80%', minWidth: 52, maxHeight: '80%', anchor: 'center', margin: 1 },
  }
}

/**
 * One deduplicated first-run gate. A successful readiness result is cached for
 * this Surface; deferred and unavailable states are rechecked on the next send.
 */
export class ProviderOnboardingGate {
  private active: Promise<ProviderOnboardingResult> | undefined
  private initial: ProviderReadiness | undefined
  private ready = false

  /**
   * @param api - official Harness provider/settings/credentials client.
   * @param overlays - write-only secret input surface.
   * @param notice - safe status reporter that never receives the secret.
   * @param initial - readiness resolved before the first terminal render.
   */
  constructor(
    private readonly api: OnboardingApi,
    private readonly overlays: ProviderOnboardingOverlays,
    private readonly notice: (message: string, tone: 'success' | 'warning') => void,
    initial?: ProviderReadiness,
    private readonly selectCurrentModel?: () => Promise<boolean>,
  ) {
    this.initial = initial
  }

  /**
   * Ensure a useful provider is available or let the user defer setup.
   * @returns only `deferred` blocks the waiting prompt.
   */
  ensure(): Promise<ProviderOnboardingResult> {
    if (this.ready) return Promise.resolve('ready')
    if (this.active !== undefined) return this.active
    const initial = this.initial
    this.initial = undefined
    const operation = this.run(initial).then((result) => {
      if (result === 'ready') this.ready = true
      return result
    }).finally(() => {
      if (this.active === operation) this.active = undefined
    })
    this.active = operation
    return operation
  }

  private async run(initial?: ProviderReadiness): Promise<ProviderOnboardingResult> {
    const readiness = initial ?? await inspectProviderReadiness(this.api)
    if (readiness.kind === 'ready') return 'ready'
    if (readiness.kind === 'unavailable' && readiness.reason === 'load-failed') {
      this.notice(providerUnavailableNotice(readiness.reason), 'warning')
      return 'unavailable'
    }

    const choice = await this.overlays.select({
      title: ui('配置模型 Provider', 'Configure a model Provider'),
      detail: ui('可以使用 DeepSeek 快捷配置，也可以配置其他 catalog 或自定义 Provider。', 'Use the DeepSeek quick setup, or configure another catalog or custom Provider.'),
      choices: [
        ...(readiness.kind === 'needs-credential' ? [{
          id: 'deepseek',
          label: ui('DeepSeek 官方 API Key…', 'Official DeepSeek API key…'),
          description: ui('最快开始使用；密钥只写入 Harness Credentials', 'Fastest setup; the key is written only to Harness Credentials'),
        }] : []),
        {
          id: 'providers',
          label: ui('选择或添加其他 Provider…', 'Choose or add another Provider…'),
          description: ui('配置 endpoint、协议、凭据和模型', 'Configure endpoint, protocol, credential, and models'),
        },
        {
          id: 'later',
          label: ui('稍后配置', 'Configure later'),
          description: ui('保留当前消息，下次发送时再提示', 'Keep the message and ask again on the next send'),
        },
      ],
    })
    if (choice === undefined || choice.id === 'later') {
      this.notice(onboardingDeferredNotice(), 'warning')
      return 'deferred'
    }
    if (choice.id === 'providers') {
      await manageProviders(this.overlays, this.api, {
        notice: (message, tone) => { this.notice(message, tone === 'success' ? 'success' : 'warning') },
        allowDelete: false,
      })
      const refreshed = await inspectProviderReadiness(this.api)
      if (refreshed.kind === 'ready') {
        if (this.selectCurrentModel !== undefined && !await this.selectCurrentModel()) {
          this.notice(onboardingDeferredNotice(), 'warning')
          return 'deferred'
        }
        this.notice(ui('Provider 已可用，可以开始发送消息。', 'A Provider is ready; you can send messages.'), 'success')
        return 'ready'
      }
      this.notice(onboardingDeferredNotice(), 'warning')
      return 'deferred'
    }
    if (readiness.kind !== 'needs-credential') {
      this.notice(providerUnavailableNotice(readiness.reason), 'warning')
      return 'unavailable'
    }

    const saved = await this.overlays.secretTransaction<ProviderReadiness>({
      input: promptRequest(readiness),
      busyTitle: ui('正在保存 API Key', 'Saving API key'),
      busyDetail: ui(
        '正在通过 DeepSeek Harness 写入并重新检查凭证状态。',
        'Writing through DeepSeek Harness and rechecking credential status.',
      ),
      failureMessage: credentialSaveFailure(),
      validate: normalizeOnboardingApiKey,
      work: async (value) => {
        const response = await this.api.credentials.set({ ref: readiness.ref, value })
        if (!response.result.ok) return { ok: false, message: credentialSaveFailure() }
        const refreshed = await inspectProviderReadiness(this.api)
        if (refreshed.kind === 'needs-credential') {
          return {
            ok: false,
            message: ui(
              '凭证已写入，但 Harness 仍报告未配置；请重新输入或使用 /doctor 检查。',
              'The credential was written, but Harness still reports it missing. Re-enter it or inspect /doctor.',
            ),
          }
        }
        return { ok: true, value: refreshed }
      },
    })
    if (saved === undefined) {
      this.notice(onboardingDeferredNotice(), 'warning')
      return 'deferred'
    }
    if (saved.kind === 'unavailable') {
      this.notice(providerUnavailableNotice(saved.reason), 'warning')
      return 'unavailable'
    }
    this.notice(ui('API Key 已保存，可以开始使用。', 'API key saved. You can start using the model.'), 'success')
    return 'ready'
  }
}

/**
 * Dispatch one prompt only after onboarding, restoring local state on defer.
 * @param readiness - shared startup or send-time gate result.
 * @param onDeferred - restores submitted text while attachments remain owned by the draft.
 * @param dispatch - authoritative Harness prompt call.
 * @returns whether Harness accepted the prompt.
 */
export async function dispatchAfterProviderOnboarding(
  readiness: Promise<ProviderOnboardingResult>,
  onDeferred: () => void,
  dispatch: () => Promise<boolean>,
): Promise<boolean> {
  if (await readiness === 'deferred') {
    onDeferred()
    return false
  }
  return dispatch()
}
