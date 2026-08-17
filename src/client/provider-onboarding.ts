/** First-run model Provider readiness and write-only DeepSeek credential flow. */

import type {
  ConfigurableProviderView,
  CredentialView,
  IApiClient,
  SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { getPath } from '@deepseek-ai/dsh-client-schema-form'
import { normalizeApiKey } from '@deepseek-ai/dsh-llm'
import { ui } from './locale.ts'
import type { InputOverlayRequest, OverlayPrompts } from './overlays.ts'

const DEEPSEEK_PROVIDER = 'deepseek-official'
const DEEPSEEK_SETTINGS_NAMESPACE = 'llm-deepseek'
const ENV_ASSIGNMENT = /^[A-Z][A-Z0-9_]*=[^=]/u

type OnboardingApi = Pick<IApiClient, 'credentials' | 'llm' | 'settings'>

/** Why SeekTTY cannot safely offer a writable credential prompt. */
export type ProviderOnboardingUnavailableReason =
  | 'adapter-absent'
  | 'credential-read-only'
  | 'credentials-unavailable'
  | 'load-failed'
  | 'provider-inactive'

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
export type ProviderOnboardingOverlays = Pick<OverlayPrompts, 'secretInput'>

function apiKeyEnvOf(namespace: SettingsNamespaceView | undefined, path: readonly string[]): string | undefined {
  if (namespace === undefined) return undefined
  const profile = getPath(namespace.value, path)
  if (typeof profile !== 'object' || profile === null) return undefined
  const ref = (profile as { apiKeyEnv?: unknown }).apiKeyEnv
  return typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : undefined
}

function providerUsable(row: ProviderRow): boolean {
  if (!row.entry.active) return false
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
  try {
    const [providersResponse, settingsResponse] = await Promise.all([
      api.llm.providers({}),
      api.settings.describe({}),
    ])
    if (!providersResponse.result.ok || !settingsResponse.result.ok) {
      return { kind: 'unavailable', reason: 'load-failed' }
    }
    providers = providersResponse.result.value.providers
    namespaces = settingsResponse.result.value.namespaces
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
  if (joined.some(providerUsable)) return { kind: 'ready' }

  const deepseek = joined.find(row =>
    row.entry.provider === DEEPSEEK_PROVIDER
    && row.entry.settingsNs === DEEPSEEK_SETTINGS_NAMESPACE
    && row.entry.settingsPath.length === 0)
  if (deepseek === undefined) return { kind: 'unavailable', reason: 'adapter-absent' }
  if (!deepseek.entry.active) return { kind: 'unavailable', reason: 'provider-inactive' }
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
  const value = raw.trim()
  const first = value[0]
  const quoted = (first === '"' || first === '\'' || first === '`')
    && value.length > 1
    && value.endsWith(first)
  if (ENV_ASSIGNMENT.test(value) || quoted) {
    return {
      ok: false,
      message: ui(
        '请只粘贴 API Key，不要包含变量名、等号或包裹引号。',
        'Paste only the API key, without a variable name, equals sign, or wrapping quotes.',
      ),
    }
  }
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked
  return {
    ok: false,
    message: checked.reason === 'empty'
      ? ui('API Key 不能为空。', 'The API key cannot be empty.')
      : ui(
        'API Key 包含不能用于 Provider 请求的字符，请重新粘贴。',
        'The API key contains characters that cannot be used in a Provider request. Paste it again.',
      ),
  }
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
    case 'provider-inactive': return ui(
      '当前没有可用的模型 Provider；请使用 /settings 或 /doctor 检查配置。',
      'No model Provider is currently available; inspect /settings or /doctor.',
    )
    case 'credential-read-only': return ui(
      'DeepSeek API Key 由外部配置管理；请在启动环境中配置后重试。',
      'The DeepSeek API key is managed externally; configure it in the launch environment and retry.',
    )
  }
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
    let readiness = initial
    let failure: string | undefined
    while (true) {
      readiness ??= await inspectProviderReadiness(this.api)
      if (readiness.kind === 'ready') return 'ready'
      if (readiness.kind === 'unavailable') {
        this.notice(providerUnavailableNotice(readiness.reason), 'warning')
        return 'unavailable'
      }

      const raw = await this.overlays.secretInput(promptRequest(readiness, failure))
      if (raw === undefined) {
        this.notice(ui(
          '尚未配置可用模型；发送消息时会再次提示。',
          'No usable model is configured; setup will open again when you send a message.',
        ), 'warning')
        return 'deferred'
      }
      const checked = normalizeOnboardingApiKey(raw)
      if (!checked.ok) {
        failure = checked.message
        continue
      }
      try {
        const response = await this.api.credentials.set({ ref: readiness.ref, value: checked.value })
        if (!response.result.ok) {
          failure = credentialSaveFailure()
          continue
        }
      } catch {
        failure = credentialSaveFailure()
        continue
      }

      const refreshed = await inspectProviderReadiness(this.api)
      if (refreshed.kind === 'needs-credential') {
        readiness = refreshed
        failure = ui(
          '凭证已写入，但 Harness 仍报告未配置；请重新输入或使用 /doctor 检查。',
          'The credential was written, but Harness still reports it missing. Re-enter it or inspect /doctor.',
        )
        continue
      }
      if (refreshed.kind === 'unavailable') {
        this.notice(providerUnavailableNotice(refreshed.reason), 'warning')
        return 'unavailable'
      }
      this.notice(ui('API Key 已保存，可以开始使用。', 'API key saved. You can start using the model.'), 'success')
      return 'ready'
    }
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
