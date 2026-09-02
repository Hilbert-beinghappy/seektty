/** Provider configuration facts and writes backed only by official Harness APIs. */

import type {
  ConfigurableProviderView,
  CredentialView,
  DiscoveredModelView,
  IApiClient,
  SettingsNamespaceView,
  SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  getPath,
  hasPath,
  nodeAtPath,
  rehydrateSchema,
} from '@deepseek-ai/dsh-client-schema-form'
import { normalizeApiKey } from '@deepseek-ai/dsh-llm'
import { ui } from './locale.ts'

const ENV_ASSIGNMENT = /^[A-Z][A-Z0-9_]*=[^=]/u
const PROVIDER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const CREDENTIAL_REF = /^[A-Z][A-Z0-9_]*$/u
const PROTOCOL_PROBE_ROUTE = '\0seektty-probe'

export type ProviderApi = Pick<IApiClient, 'credentials' | 'llm' | 'settings'>

/** Editable model fields plus lossless storage for the complete official pi-ai profile. */
export interface ProviderModelDraft {
  readonly [key: string]: unknown
  readonly id: string
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
  readonly input?: readonly string[]
  readonly reasoningEfforts?: false | Readonly<Record<string, string | null>>
  readonly compat?: Readonly<Record<string, unknown>>
}

/** One official directory row joined with redacted Settings and Credential metadata. */
export interface ProviderConfigRow {
  readonly entry: ConfigurableProviderView
  readonly namespace: SettingsNamespaceView | undefined
  readonly profile: Readonly<Record<string, unknown>> | undefined
  readonly configured: boolean
  readonly removable: boolean
  readonly apiKeyEnv: string | undefined
  readonly credential: CredentialView | undefined
}

/** A fresh, uncached Provider configuration view. */
export interface ProviderConfigSnapshot {
  readonly writable: boolean
  readonly credentialState: 'ready' | 'unavailable'
  readonly rows: readonly ProviderConfigRow[]
  readonly namespaces: ReadonlyMap<string, SettingsNamespaceView>
}

export type ProviderSaveResult =
  | {
    readonly ok: true
    readonly namespace?: SettingsNamespaceView
    readonly credentialWritten: boolean
  }
  | {
    readonly ok: false
    readonly stage: 'settings' | 'credential'
    readonly code: string
    readonly settingsCommitted: boolean
    readonly namespace?: SettingsNamespaceView
  }

function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function credentialRefOf(profile: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = profile?.apiKeyEnv
  if (typeof value !== 'string') return undefined
  const ref = value.trim()
  return CREDENTIAL_REF.test(ref) ? ref : undefined
}

function failureCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown'
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code !== '' ? code : 'unknown'
}

/** Stable, non-secret copy for official Provider API failures. */
export function providerFailureMessage(stage: 'load' | 'settings' | 'credential' | 'discovery', code: string): string {
  if (code === 'settings-conflict') return ui(
    'Provider 设置已被其他界面更新；本次没有覆盖，请重新打开后再保存。',
    'Provider settings changed in another surface. Nothing was overwritten; reopen before saving.',
  )
  if (stage === 'credential') return ui(
    'Provider 配置已保存，但凭据写入失败；请只重试 API Key。',
    'Provider settings were saved, but the credential write failed. Retry only the API key.',
  )
  if (stage === 'discovery') return ui(
    '模型发现失败；请检查认证、地址或协议，也可以手工添加模型。',
    'Model discovery failed. Check authentication, endpoint, or protocol, or add models manually.',
  )
  if (stage === 'settings') return ui(
    'Provider 设置未保存；请重新读取后再试。',
    'Provider settings were not saved. Reload and try again.',
  )
  return ui(
    '无法读取 Provider 配置；请检查 Harness 连接。',
    'Could not load Provider settings. Check the Harness connection.',
  )
}

/** Read a fresh Provider/settings/credential join without creating client-owned state. */
export async function loadProviderConfig(api: ProviderApi): Promise<ProviderConfigSnapshot> {
  let providersResponse: Awaited<ReturnType<ProviderApi['llm']['providers']>>
  let settingsResponse: Awaited<ReturnType<ProviderApi['settings']['describe']>>
  try {
    [providersResponse, settingsResponse] = await Promise.all([
      api.llm.providers({}),
      api.settings.describe({}),
    ])
  } catch {
    throw new Error(providerFailureMessage('load', 'transport'))
  }
  if (!providersResponse.result.ok) {
    throw new Error(providerFailureMessage('load', failureCode(providersResponse.result.error)))
  }
  if (!settingsResponse.result.ok) {
    throw new Error(providerFailureMessage('load', failureCode(settingsResponse.result.error)))
  }

  const namespaces = new Map(settingsResponse.result.value.namespaces.map(namespace => [namespace.ns, namespace]))
  const rows = providersResponse.result.value.providers.map((entry): ProviderConfigRow => {
    const namespace = namespaces.get(entry.settingsNs)
    const profile = recordOf(namespace === undefined ? undefined : getPath(namespace.value, entry.settingsPath))
    const configured = namespace !== undefined
      && (entry.settingsPath.length === 0 || profile !== undefined)
    const removable = entry.declared === true
      && namespace !== undefined
      && entry.settingsPath.length > 0
      && hasPath(namespace.user, entry.settingsPath)
      && !hasPath(namespace.base, entry.settingsPath)
    return {
      entry,
      namespace,
      profile,
      configured,
      removable,
      apiKeyEnv: credentialRefOf(profile),
      credential: undefined,
    }
  })

  const refs = [...new Set(rows.flatMap(row => row.apiKeyEnv === undefined ? [] : [row.apiKeyEnv]))]
  let credentials: Record<string, CredentialView> = {}
  let credentialState: ProviderConfigSnapshot['credentialState'] = 'ready'
  if (refs.length > 0) {
    try {
      const response = await api.credentials.describe({ refs })
      if (response.result.ok) credentials = response.result.value.credentials
      else credentialState = 'unavailable'
    } catch {
      credentialState = 'unavailable'
    }
  }

  return {
    writable: settingsResponse.result.value.writable,
    credentialState,
    rows: rows.map(row => ({
      ...row,
      credential: row.apiKeyEnv === undefined ? undefined : credentials[row.apiKeyEnv],
    })),
    namespaces,
  }
}

/** Conventional writable credential reference used by the official Models surface. */
export function deriveProviderKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_API_KEY`
}

/** Provider IDs accepted by the official custom pi-ai route surface. */
export function validProviderId(provider: string): boolean {
  return PROVIDER_ID.test(provider)
}

/** Environment-style reference accepted by the official pi-ai apiKeyEnv field. */
export function validProviderCredentialRef(ref: string): boolean {
  return CREDENTIAL_REF.test(ref)
}

/** Read the custom-route protocol union from the installed llm-pi-ai schema. */
export function providerProtocolChoices(namespace: SettingsNamespaceView | undefined): readonly string[] {
  if (namespace === undefined) return []
  let node
  try {
    node = nodeAtPath(rehydrateSchema(namespace.schema), ['providers', PROTOCOL_PROBE_ROUTE, 'api'])
  } catch {
    return []
  }
  if (node?.type !== 'union' || node.list === undefined) return []
  return node.list.flatMap(entry => typeof entry.value === 'string' ? [entry.value] : [])
}

/** Validate an HTTP(S) Provider endpoint without accepting embedded credentials. */
export function normalizeProviderBaseUrl(raw: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  const value = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, message: ui('请输入有效的 HTTP(S) Base URL。', 'Enter a valid HTTP(S) base URL.') }
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username !== '' || parsed.password !== '') {
    return {
      ok: false,
      message: ui(
        'Base URL 必须使用 HTTP(S)，且不能包含用户名、密码或 API Key。',
        'The base URL must use HTTP(S) and cannot contain a username, password, or API key.',
      ),
    }
  }
  parsed.hash = ''
  return { ok: true, value: parsed.toString().replace(/\/$/u, '') }
}

/** Normalize a write-only API key and reject common pasted wrapper formats. */
export function normalizeProviderApiKey(raw: string):
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

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value)
}

/** Normalize and deduplicate model candidates before they enter a draft. */
export function normalizeProviderModels(models: readonly DiscoveredModelView[]): readonly ProviderModelDraft[] {
  const seen = new Set<string>()
  const normalized: ProviderModelDraft[] = []
  for (const model of models) {
    const id = model.id.trim()
    if (id === '' || hasControlCharacter(id) || seen.has(id)) continue
    seen.add(id)
    const name = model.name?.trim()
    const contextWindow = positiveInteger(model.contextWindow)
    const maxTokens = positiveInteger(model.maxTokens)
    normalized.push({
      id,
      ...(name === undefined || name === '' || hasControlCharacter(name) ? {} : { name }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    })
  }
  return normalized
}

/** Validate a complete user-edited model list before Settings sees it. */
export function providerModelsIssue(models: readonly ProviderModelDraft[]): string | undefined {
  const seen = new Set<string>()
  for (const [index, model] of models.entries()) {
    const id = model.id.trim()
    if (id === '' || hasControlCharacter(id)) return ui(
      `模型 ${String(index + 1)} 的 ID 无效。`,
      `Model ${String(index + 1)} has an invalid ID.`,
    )
    if (seen.has(id)) return ui(`模型 ID ${id} 重复。`, `Model ID ${id} is duplicated.`)
    seen.add(id)
    if (model.name !== undefined && (model.name.trim() === '' || hasControlCharacter(model.name))) return ui(
      `模型 ${id} 的显示名称不能为空。`,
      `Model ${id} has an empty display name.`,
    )
    if (model.contextWindow !== undefined && positiveInteger(model.contextWindow) === undefined) return ui(
      `模型 ${id} 的上下文窗口必须是正整数。`,
      `Model ${id} must have a positive-integer context window.`,
    )
    if (model.maxTokens !== undefined && positiveInteger(model.maxTokens) === undefined) return ui(
      `模型 ${id} 的最大输出必须是正整数。`,
      `Model ${id} must have a positive-integer output limit.`,
    )
  }
  return undefined
}

/** Ask the official adapter discovery seam and return safe, normalized candidates. */
export async function discoverProviderModels(
  api: ProviderApi,
  request: {
    readonly settingsNs: string
    readonly provider?: string
    readonly baseURL?: string
    readonly api?: string
    readonly apiKey?: string
  },
  signal?: AbortSignal,
): Promise<readonly ProviderModelDraft[]> {
  let response: Awaited<ReturnType<ProviderApi['llm']['discoverModels']>>
  try {
    response = await api.llm.discoverModels(request, signal)
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new Error(providerFailureMessage('discovery', 'transport'))
  }
  if (!response.result.ok) {
    throw new Error(providerFailureMessage('discovery', failureCode(response.result.error)))
  }
  return normalizeProviderModels(response.result.value.models)
}

/** Build field-level operations so redacted or unknown profile fields survive. */
export function providerProfileOps(
  settingsPath: readonly string[],
  updates: Readonly<Record<string, unknown>>,
  unsets: readonly string[] = [],
): readonly SettingsPathOpView[] {
  const unset = new Set(unsets)
  return [
    ...Object.entries(updates)
      .filter(([key]) => !unset.has(key))
      .map(([key, value]): SettingsPathOpView => ({ op: 'set', path: [...settingsPath, key], value })),
    ...unsets.map((key): SettingsPathOpView => ({ op: 'unset', path: [...settingsPath, key] })),
  ]
}

/** Commit Settings once, then an explicitly supplied credential once. */
export async function saveProviderConfig(
  api: ProviderApi,
  request: {
    readonly ns: string
    readonly ops: readonly SettingsPathOpView[]
    readonly expectedRevision: number
    readonly credential?: { readonly ref: string; readonly value: string }
  },
): Promise<ProviderSaveResult> {
  let namespace: SettingsNamespaceView | undefined
  if (request.ops.length > 0) {
    try {
      const response = await api.settings.mutate({
        ns: request.ns,
        ops: [...request.ops],
        expectedRevision: request.expectedRevision,
      })
      if (!response.result.ok) return {
        ok: false,
        stage: 'settings',
        code: failureCode(response.result.error),
        settingsCommitted: false,
      }
      namespace = response.result.value
    } catch {
      return { ok: false, stage: 'settings', code: 'transport', settingsCommitted: false }
    }
  }
  if (request.credential !== undefined) {
    try {
      const response = await api.credentials.set(request.credential)
      if (!response.result.ok) return {
        ok: false,
        stage: 'credential',
        code: failureCode(response.result.error),
        settingsCommitted: request.ops.length > 0,
        ...(namespace === undefined ? {} : { namespace }),
      }
    } catch {
      return {
        ok: false,
        stage: 'credential',
        code: 'transport',
        settingsCommitted: request.ops.length > 0,
        ...(namespace === undefined ? {} : { namespace }),
      }
    }
  }
  return {
    ok: true,
    ...(namespace === undefined ? {} : { namespace }),
    credentialWritten: request.credential !== undefined,
  }
}

/** Remove only one revision-protected user-owned profile; credentials are retained. */
export async function removeProviderConfig(
  api: ProviderApi,
  row: ProviderConfigRow,
): Promise<ProviderSaveResult> {
  if (!row.removable || row.namespace === undefined) {
    return { ok: false, stage: 'settings', code: 'not-removable', settingsCommitted: false }
  }
  return saveProviderConfig(api, {
    ns: row.namespace.ns,
    ops: [{ op: 'unset', path: [...row.entry.settingsPath] }],
    expectedRevision: row.namespace.revision,
  })
}
