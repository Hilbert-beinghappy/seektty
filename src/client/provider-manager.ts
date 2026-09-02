/** Shared terminal Provider manager for Settings, Model, and first-run entry points. */

import { nodeAtPath, rehydrateSchema } from '@deepseek-ai/dsh-client-schema-form'
import { ui } from './locale.ts'
import type { OverlayChoice, OverlayPrompts } from './overlays.ts'
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
  verifyProviderWrite,
  type ProviderApi,
  type ProviderConfigRow,
  type ProviderModelDraft,
  type ProviderSaveResult,
} from './provider-config.ts'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'

export type ProviderManagerResult = 'changed' | 'unchanged'

export interface ProviderManagerOptions {
  readonly notice: (message: string, tone: 'info' | 'success' | 'warning' | 'error') => void
  readonly protectedProviders?: readonly string[]
  readonly allowDelete?: boolean
  readonly reloadProtectedProviders?: () => Promise<readonly string[] | undefined>
  readonly stateGeneration?: () => number
}

function providerStateChanged(options: ProviderManagerOptions, openedGeneration: number | undefined): boolean {
  if (openedGeneration === undefined || options.stateGeneration === undefined) return false
  if (options.stateGeneration() === openedGeneration) return false
  options.notice(ui(
    'Provider 状态已在其他界面发生变化；草稿未提交，请重新打开后核对。',
    'Provider state changed in another surface. The draft was not submitted; reopen and review it.',
  ), 'warning')
  return true
}

function stringOf(source: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function modelsOf(profile: Readonly<Record<string, unknown>> | undefined): ProviderModelDraft[] {
  const value = profile?.models
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const model = entry as Record<string, unknown>
    if (typeof model.id !== 'string') return []
    const normalized = normalizeProviderModels([{
      id: model.id,
      ...(typeof model.name === 'string' ? { name: model.name } : {}),
      ...(typeof model.contextWindow === 'number' ? { contextWindow: model.contextWindow } : {}),
      ...(typeof model.maxTokens === 'number' ? { maxTokens: model.maxTokens } : {}),
    }])[0]
    if (normalized === undefined) return []
    const preserved = { ...model }
    delete preserved.id
    delete preserved.name
    delete preserved.contextWindow
    delete preserved.maxTokens
    return [{ ...preserved, ...normalized }]
  })
}

function sameModels(left: readonly ProviderModelDraft[], right: readonly ProviderModelDraft[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function safeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, '')
}

function providerLabel(row: ProviderConfigRow): string {
  const displayName = safeDisplayText(row.entry.displayName)
  return row.entry.provider === displayName
    ? row.entry.provider
    : `${displayName || row.entry.provider} (${row.entry.provider})`
}

function providerDescription(row: ProviderConfigRow): string {
  const state = row.entry.active
    ? ui('路由已加载', 'Route loaded')
    : row.configured ? ui('已配置，路由未加载', 'Configured, route not loaded') : ui('可配置', 'Available to configure')
  const credential = row.apiKeyEnv === undefined
    ? ui('Provider 原生认证或无凭据引用', 'Provider-native auth or no credential reference')
    : row.credential?.configured === true
      ? ui('凭据已配置', 'Credential configured')
      : ui('凭据未配置', 'Credential missing')
  return `${state} · ${credential}`
}

function safeUrlPreview(value: string | undefined): string {
  if (value === undefined) return ui('未设置', 'Not set')
  try {
    const parsed = new URL(value)
    for (const key of parsed.searchParams.keys()) parsed.searchParams.set(key, '***')
    parsed.username = ''
    parsed.password = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/u, '')
  } catch {
    return ui('已设置但格式无效', 'Set, but invalid')
  }
}

function modelDescription(model: ProviderModelDraft): string {
  const capacities = [
    model.contextWindow === undefined ? undefined : ui(`上下文 ${String(model.contextWindow)}`, `context ${String(model.contextWindow)}`),
    model.maxTokens === undefined ? undefined : ui(`输出 ${String(model.maxTokens)}`, `output ${String(model.maxTokens)}`),
  ].filter((value): value is string => value !== undefined)
  return capacities.length === 0 ? model.id : `${model.id} · ${capacities.join(' · ')}`
}

async function optionalPositiveInteger(
  overlays: OverlayPrompts,
  title: string,
  initialValue?: number,
): Promise<number | undefined | 'cancelled'> {
  while (true) {
    const raw = await overlays.input({
      title,
      detail: ui('留空表示不声明，由 Provider 或 adapter 决定。', 'Leave blank to let the Provider or adapter decide.'),
      ...(initialValue === undefined ? {} : { initialValue: String(initialValue) }),
    })
    if (raw === undefined) return 'cancelled'
    if (raw.trim() === '') return undefined
    const value = Number(raw)
    if (Number.isSafeInteger(value) && value > 0) return value
  }
}

async function editModel(
  overlays: OverlayPrompts,
  current?: ProviderModelDraft,
): Promise<ProviderModelDraft | undefined> {
  const id = await overlays.input({
    title: ui(current === undefined ? '添加模型 ID' : '编辑模型 ID', current === undefined ? 'Add model ID' : 'Edit model ID'),
    ...(current === undefined ? {} : { initialValue: current.id }),
    requireText: true,
  })
  if (id === undefined) return undefined
  const normalizedId = id.trim()
  if (normalizedId === '' || /[\u0000-\u001f\u007f]/u.test(normalizedId)) return undefined
  const name = await overlays.input({
    title: ui('模型显示名称（可选）', 'Model display name (optional)'),
    ...(current?.name === undefined ? {} : { initialValue: current.name }),
  })
  if (name === undefined) return undefined
  const contextWindow = await optionalPositiveInteger(
    overlays,
    ui('上下文窗口（可选）', 'Context window (optional)'),
    current?.contextWindow,
  )
  if (contextWindow === 'cancelled') return undefined
  const maxTokens = await optionalPositiveInteger(
    overlays,
    ui('最大输出 tokens（可选）', 'Maximum output tokens (optional)'),
    current?.maxTokens,
  )
  if (maxTokens === 'cancelled') return undefined
  const edited: Record<string, unknown> = {
    ...(current ?? {}),
    id: normalizedId,
  }
  delete edited.name
  delete edited.contextWindow
  delete edited.maxTokens
  if (name.trim() !== '') edited.name = name.trim()
  if (contextWindow !== undefined) edited.contextWindow = contextWindow
  if (maxTokens !== undefined) edited.maxTokens = maxTokens
  return edited as ProviderModelDraft
}

async function editModels(
  overlays: OverlayPrompts,
  api: ProviderApi,
  initial: readonly ProviderModelDraft[],
  probe: () => {
    readonly settingsNs: string
    readonly provider?: string
    readonly baseURL?: string
    readonly api?: string
    readonly apiKey?: string
  },
  notice: ProviderManagerOptions['notice'],
): Promise<readonly ProviderModelDraft[] | undefined> {
  let models = initial.map(model => ({ ...model }))
  while (true) {
    const selected = await overlays.select({
      title: ui('Provider 模型', 'Provider models'),
      detail: models.length === 0
        ? ui('当前未覆盖模型目录；可发现或手工添加。', 'No model catalog override is set. Discover or add models manually.')
        : ui(`当前草稿包含 ${String(models.length)} 个模型。`, `The draft contains ${String(models.length)} models.`),
      choices: [
        { id: '__done__', label: ui('完成模型编辑', 'Finish model editing') },
        { id: '__discover__', label: ui('获取可用模型…', 'Fetch available models…') },
        { id: '__add__', label: ui('手工添加模型…', 'Add a model manually…') },
        ...models.map((model, index) => ({
          id: `model:${String(index)}`,
          label: model.name ?? model.id,
          description: modelDescription(model),
        })),
      ],
    })
    if (selected === undefined) return undefined
    if (selected.id === '__done__') return models
    if (selected.id === '__add__') {
      const model = await editModel(overlays)
      if (model === undefined) continue
      const next = [...models, model]
      const issue = providerModelsIssue(next)
      if (issue !== undefined) notice(issue, 'warning')
      else models = next
      continue
    }
    if (selected.id === '__discover__') {
      let candidates: readonly ProviderModelDraft[] | undefined
      try {
        candidates = await overlays.progress({
          title: ui('正在获取模型', 'Fetching models'),
          detail: ui('通过官方 llm.discoverModels 读取候选，不会自动保存。', 'Reading candidates through official llm.discoverModels; nothing is saved automatically.'),
          work: async (_report, signal) => discoverProviderModels(api, probe(), signal),
        })
      } catch (error) {
        notice(error instanceof Error ? error.message : providerFailureMessage('discovery', 'unknown'), 'warning')
        continue
      }
      if (candidates === undefined) continue
      if (candidates.length === 0) {
        notice(ui('Provider 没有返回模型；可以手工添加。', 'The Provider returned no models; add them manually.'), 'warning')
        continue
      }
      const known = new Set(models.map(model => model.id))
      const picked = await overlays.multiSelect({
        title: ui('选择要加入的模型', 'Choose models to add'),
        choices: candidates.map(candidate => ({
          id: candidate.id,
          label: candidate.name ?? candidate.id,
          description: modelDescription(candidate),
          active: !known.has(candidate.id),
        })),
      })
      if (picked === undefined) continue
      const selectedIds = new Set(picked.map(choice => choice.id))
      const byId = new Map(models.map(model => [model.id, model]))
      for (const candidate of candidates) {
        if (selectedIds.has(candidate.id) && !byId.has(candidate.id)) byId.set(candidate.id, candidate)
      }
      models = [...byId.values()]
      continue
    }
    if (selected.id.startsWith('model:')) {
      const index = Number(selected.id.slice('model:'.length))
      const current = models[index]
      if (current === undefined) continue
      const action = await overlays.select({
        title: current.name ?? current.id,
        choices: [
          { id: 'edit', label: ui('编辑模型', 'Edit model') },
          { id: 'delete', label: ui('从草稿中删除', 'Remove from draft') },
        ],
      })
      if (action?.id === 'delete') models = models.filter((_model, at) => at !== index)
      else if (action?.id === 'edit') {
        const edited = await editModel(overlays, current)
        if (edited === undefined) continue
        const next = models.map((model, at) => at === index ? edited : model)
        const issue = providerModelsIssue(next)
        if (issue !== undefined) notice(issue, 'warning')
        else models = next
      }
    }
  }
}

async function credentialDraft(
  overlays: OverlayPrompts,
  writable: boolean,
  notice: ProviderManagerOptions['notice'],
): Promise<string | undefined | 'cancelled'> {
  if (!writable) return 'cancelled'
  while (true) {
    const raw = await overlays.secretInput({
      title: ui('Provider API Key', 'Provider API key'),
      detail: ui('密钥只会传给 Harness Credentials API，不写入 Settings 或日志。留空保持现状。', 'The key goes only to Harness Credentials API, never Settings or logs. Leave blank to keep the current value.'),
    })
    if (raw === undefined) return 'cancelled'
    if (raw === '') return undefined
    const normalized = normalizeProviderApiKey(raw)
    if (normalized.ok) return normalized.value
    notice(normalized.message, 'warning')
  }
}

async function credentialMetadata(
  api: ProviderApi,
  ref: string,
): Promise<{ readonly configured: boolean; readonly writable: boolean } | undefined> {
  try {
    const response = await api.credentials.describe({ refs: [ref] })
    if (!response.result.ok) return undefined
    return response.result.value.credentials[ref]
  } catch {
    return undefined
  }
}

type CredentialIntent =
  | { readonly kind: 'reuse'; readonly ref: string; readonly confirmedEndpoint: string | undefined }
  | { readonly kind: 'write'; readonly ref: string; readonly value: string; readonly requireUnconfigured: boolean }

async function chooseCredentialRef(
  overlays: OverlayPrompts,
  api: ProviderApi,
  provider: string,
  endpoint: string | undefined,
  currentRef: string | undefined,
  allowReuse: boolean,
  notice: ProviderManagerOptions['notice'],
): Promise<CredentialIntent | undefined> {
  const conventional = deriveProviderKeyRef(provider)
  const initialValue = currentRef === undefined || conventional !== currentRef
    ? conventional
    : `${conventional}_NEXT`
  while (true) {
    const entered = await overlays.input({
      title: currentRef === undefined ? 'Credential Ref' : ui('新的 Credential Ref', 'New Credential Ref'),
      detail: ui(
        'Ref 是 Harness 凭据引用名。写入新 Key 必须使用尚未配置且可写的 Ref；已配置 Ref 只能明确复用且不会读取或覆盖其值。',
        'A Ref names a Harness credential. A new key requires an unconfigured, writable Ref; a configured Ref can only be explicitly reused without reading or overwriting its value.',
      ),
      initialValue,
      requireText: true,
    })
    if (entered === undefined) return undefined
    const ref = entered.trim()
    if (!validProviderCredentialRef(ref) || ref === currentRef) {
      notice(ui('请输入不同于当前值的有效 Credential Ref。', 'Enter a valid Credential Ref different from the current one.'), 'warning')
      continue
    }
    const metadata = await credentialMetadata(api, ref)
    if (metadata === undefined) {
      notice(ui('无法确认该 Credential Ref 的状态；为安全起见不允许继续。', 'The Credential Ref state could not be confirmed, so this operation is disabled for safety.'), 'error')
      return undefined
    }
    if (metadata.configured) {
      if (!allowReuse) {
        notice(ui('写入新 Key 必须选择尚未配置且可写的 Ref。', 'Writing a new key requires an unconfigured, writable Ref.'), 'warning')
        continue
      }
      const reuse = await overlays.confirm(
        ui('复用已配置的 Credential Ref？', 'Reuse configured Credential Ref?'),
        ui(
          `目标地址：${safeUrlPreview(endpoint)}\nCredential Ref：${ref}\n不会读取或覆盖现有 Key。`,
          `Endpoint: ${safeUrlPreview(endpoint)}\nCredential Ref: ${ref}\nThe existing key will not be read or overwritten.`,
        ),
        ui('确认复用', 'Confirm reuse'),
      )
      if (reuse) return { kind: 'reuse', ref, confirmedEndpoint: endpoint }
      continue
    }
    if (!metadata.writable) {
      notice(ui('该 Ref 尚未配置且不可写，不能用于此 Provider。', 'This Ref is unconfigured and read-only, so it cannot be used for this Provider.'), 'warning')
      continue
    }
    const value = await credentialDraft(overlays, true, notice)
    if (value === 'cancelled') return undefined
    if (value === undefined) {
      notice(ui('新的 Credential Ref 需要 API Key；如无需凭据，请返回并留空 Ref。', 'A new Credential Ref needs an API key. Go back and leave the Ref empty for keyless authentication.'), 'warning')
      continue
    }
    return { kind: 'write', ref, value, requireUnconfigured: true }
  }
}

interface ProviderSavePlan {
  readonly provider: string
  readonly ns: string
  readonly ops: readonly SettingsPathOpView[]
  readonly credential?: { readonly ref: string; readonly value: string }
  readonly credentialMustBeUnconfigured?: boolean
  readonly expectedCredentialRef?: string
}

async function reportSaveReadback(
  api: ProviderApi,
  plan: ProviderSavePlan,
  notice: ProviderManagerOptions['notice'],
): Promise<void> {
  const verified = await verifyProviderWrite(api, {
    provider: plan.provider,
    ns: plan.ns,
    ops: plan.ops,
    ...(plan.expectedCredentialRef === undefined ? {} : { credentialRef: plan.expectedCredentialRef }),
    verifyRoute: true,
  })
  if (verified.settings === 'confirmed'
    && (verified.credential === 'confirmed' || verified.credential === 'not-requested')
    && verified.route === 'confirmed') {
    notice(ui('Provider 配置已保存，并通过官方目录回读核实。', 'Provider configuration was saved and verified through the official directories.'), 'success')
    return
  }
  if (verified.settings === 'confirmed'
    && (verified.credential === 'confirmed' || verified.credential === 'not-requested')
    && verified.route === 'failed') {
    notice(ui('Settings 与 Credential 已回读核实，但 Provider 路由或模型目录尚不可用。', 'Settings and Credential were verified, but the Provider route or model catalog is not yet available.'), 'warning')
    return
  }
  notice(ui('保存请求已返回，但无法从官方 Settings、Credential 与模型目录完整核实最终状态；请重新读取后确认。', 'The save request returned, but final state could not be fully verified from official Settings, Credential, and model directories. Reload before continuing.'), 'warning')
}

async function finishSave(
  overlays: OverlayPrompts,
  api: ProviderApi,
  result: ProviderSaveResult,
  plan: ProviderSavePlan,
  notice: ProviderManagerOptions['notice'],
): Promise<boolean> {
  if (result.ok) {
    await reportSaveReadback(api, plan, notice)
    return true
  }
  if (result.stage === 'settings' && result.code === 'transport') {
    const readback = await verifyProviderWrite(api, {
      provider: plan.provider,
      ns: plan.ns,
      ops: plan.ops,
    })
    if (readback.settings !== 'confirmed') {
      notice(ui('Settings 请求结果未知，且无法确认目标值；为避免重复写入，本次不会自动重试。', 'The Settings result is unknown and the target value could not be confirmed. It will not be retried automatically.'), 'warning')
      return true
    }
    if (plan.credential === undefined) {
      await reportSaveReadback(api, plan, notice)
      return true
    }
    const metadata = await credentialMetadata(api, plan.credential.ref)
    if (metadata === undefined || !metadata.writable
      || (plan.credentialMustBeUnconfigured === true && metadata.configured)) {
      notice(ui('Settings 已回读确认，但 Credential Ref 已不再满足安全写入条件；未写入 Key。', 'Settings were confirmed by readback, but the Credential Ref no longer permits a safe key write. The key was not written.'), 'warning')
      return true
    }
    const credentialResult = await saveProviderConfig(api, {
      ns: plan.ns,
      ops: [],
      expectedRevision: 0,
      credential: plan.credential,
    })
    return finishSave(overlays, api, credentialResult.ok ? credentialResult : {
      ...credentialResult,
      settingsCommitted: true,
    }, plan, notice)
  }
  notice(providerFailureMessage(result.stage, result.code), result.settingsCommitted ? 'warning' : 'error')
  const settingsKnown = result.settingsCommitted || plan.ops.length === 0
  if (result.stage !== 'credential' || plan.credential === undefined || !settingsKnown) return result.settingsCommitted
  const retry = await overlays.confirm(
    ui('只重试 API Key？', 'Retry only the API key?'),
    ui('重试只会向同一个 Ref 再写入同一个值，不会再次提交 Provider Settings。', 'The retry writes the same value to the same Ref and does not resubmit Provider Settings.'),
    ui('重试凭据', 'Retry credential'),
  )
  if (!retry) return true
  const retryMetadata = await credentialMetadata(api, plan.credential.ref)
  if (retryMetadata === undefined || !retryMetadata.writable) {
    notice(ui('无法重新确认该 Credential Ref 可写；未重试 Key。', 'The Credential Ref could not be reconfirmed as writable, so the key was not retried.'), 'warning')
    return true
  }
  const retried = await saveProviderConfig(api, {
    ns: plan.ns,
    ops: [],
    expectedRevision: result.namespace?.revision ?? 0,
    credential: plan.credential,
  })
  if (retried.ok) await reportSaveReadback(api, plan, notice)
  else notice(providerFailureMessage(retried.stage, retried.code), 'error')
  return true
}

async function editProvider(
  overlays: OverlayPrompts,
  api: ProviderApi,
  row: ProviderConfigRow,
  credentialState: 'ready' | 'unavailable',
  options: ProviderManagerOptions,
  openedGeneration?: number,
): Promise<boolean> {
  if (row.namespace === undefined) {
    options.notice(ui('该路由没有官方 Settings 地址，不能在这里编辑。', 'This route has no official Settings address and cannot be edited here.'), 'warning')
    return false
  }
  if (!['llm-pi-ai', 'llm-deepseek'].includes(row.namespace.ns)) {
    options.notice(ui('该 Provider 使用未知配置 schema，请继续使用通用 Settings。', 'This Provider uses an unknown configuration schema; use general Settings.'), 'warning')
    return false
  }
  const draft: Record<string, unknown> = { ...(row.profile ?? {}) }
  const dirty = new Set<string>()
  let models = modelsOf(row.profile)
  let credentialIntent: CredentialIntent | undefined
  const credentialUnavailable = credentialState === 'unavailable'
    || (row.apiKeyEnv !== undefined && row.credential === undefined)
  const protocols = providerProtocolChoices(row.namespace)
  const custom = row.entry.declared === true && row.namespace.ns === 'llm-pi-ai'
  const setField = (key: string, value: unknown): void => {
    dirty.add(key)
    if (value === undefined || value === '') delete draft[key]
    else draft[key] = value
  }
  while (true) {
    const selected = await overlays.select({
      title: providerLabel(row),
      detail: providerDescription(row),
      choices: [
        {
          id: 'credential',
          label: ui('API Key…', 'API key…'),
          description: row.apiKeyEnv === undefined
            ? ui('当前使用 Provider 原生认证；输入 Key 后将建立 Credential Ref', 'Provider-native authentication; entering a key creates a credential reference')
            : row.credential?.configured === true ? ui('已配置；留空保持现状', 'Configured; leave blank to keep it') : ui('未配置', 'Not configured'),
          ...(credentialUnavailable
            ? { disabledReason: ui('无法确认凭据来源与可写性', 'Credential source and writability could not be confirmed') }
            : row.credential?.writable === false
              ? { disabledReason: ui('凭据由外部只读来源管理', 'Credential is managed by a read-only external source') }
              : {}),
        },
        {
          id: 'baseURL',
          label: ui('Base URL…', 'Base URL…'),
          description: safeUrlPreview(stringOf(draft, 'baseURL')),
        },
        ...(custom ? [{
          id: 'displayName',
          label: ui('显示名称…', 'Display name…'),
          description: stringOf(draft, 'displayName') ?? row.entry.provider,
        }, {
          id: 'api',
          label: ui('API 协议…', 'API protocol…'),
          description: stringOf(draft, 'api') ?? ui('未设置', 'Not set'),
          ...(protocols.length === 0 ? { disabledReason: ui('当前 schema 未公布协议选项', 'The current schema exposes no protocol choices') } : {}),
        }] satisfies OverlayChoice[] : []),
        {
          id: 'models',
          label: ui('模型列表…', 'Model list…'),
          description: ui(`${String(models.length)} 个草稿模型`, `${String(models.length)} draft models`),
        },
        { id: 'save', label: ui('保存 Provider', 'Save Provider') },
        ...(row.removable && options.allowDelete === true ? [{
          id: 'delete',
          label: ui('删除用户 Provider…', 'Delete user Provider…'),
          ...(options.protectedProviders?.includes(row.entry.provider) === true
            ? { disabledReason: ui('请先更换当前或默认模型路由', 'Change the current or default model route first') }
            : {}),
        }] satisfies OverlayChoice[] : []),
      ],
    })
    if (selected === undefined) return false
    if (selected.id === 'credential') {
      if (credentialUnavailable) {
        options.notice(ui('无法确认 Credential 元数据；Key 更新已禁用。', 'Credential metadata is unavailable; key updates are disabled.'), 'warning')
        continue
      }
      const endpointChanged = dirty.has('baseURL')
        && stringOf(draft, 'baseURL') !== stringOf(row.profile, 'baseURL')
      if (endpointChanged && row.apiKeyEnv !== undefined) {
        const intent = await chooseCredentialRef(
          overlays,
          api,
          row.entry.provider,
          stringOf(draft, 'baseURL'),
          row.apiKeyEnv,
          false,
          options.notice,
        )
        if (intent !== undefined) credentialIntent = intent
      } else if (row.apiKeyEnv === undefined) {
        const intent = await chooseCredentialRef(
          overlays,
          api,
          row.entry.provider,
          stringOf(draft, 'baseURL'),
          undefined,
          true,
          options.notice,
        )
        if (intent !== undefined) credentialIntent = intent
      } else {
        const metadata = await credentialMetadata(api, row.apiKeyEnv)
        if (metadata === undefined) {
          options.notice(ui('无法确认 Credential Ref 的状态；Key 更新已禁用。', 'The Credential Ref state could not be confirmed; key updates are disabled.'), 'warning')
          continue
        }
        if (!metadata.writable) {
          options.notice(ui('该 Credential Ref 由外部只读来源管理。', 'This Credential Ref is managed by a read-only external source.'), 'warning')
          continue
        }
        const entered = await credentialDraft(overlays, true, options.notice)
        if (entered === undefined) credentialIntent = undefined
        else if (entered !== 'cancelled') {
          credentialIntent = {
            kind: 'write',
            ref: row.apiKeyEnv,
            value: entered,
            requireUnconfigured: false,
          }
        }
      }
      continue
    }
    if (selected.id === 'baseURL') {
      const raw = await overlays.input({
        title: 'Base URL',
        detail: ui('不会自动追加 /v1。包含查询参数的现有地址不会在界面中明文回显。', 'No /v1 suffix is added. Existing query values are not shown in clear text.'),
        ...(stringOf(draft, 'baseURL')?.includes('?') === true ? {} : { initialValue: stringOf(draft, 'baseURL') ?? '' }),
      })
      if (raw === undefined) continue
      if (raw.trim() === '') setField('baseURL', undefined)
      else {
        const checked = normalizeProviderBaseUrl(raw)
        if (checked.ok) setField('baseURL', checked.value)
        else options.notice(checked.message, 'warning')
      }
      continue
    }
    if (selected.id === 'displayName') {
      const value = await overlays.input({ title: ui('Provider 显示名称', 'Provider display name'), initialValue: stringOf(draft, 'displayName') ?? '' })
      if (value !== undefined) setField('displayName', value.trim() === '' ? undefined : value.trim())
      continue
    }
    if (selected.id === 'api') {
      const choice = await overlays.select({
        title: ui('API 协议', 'API protocol'),
        choices: protocols.map(protocol => ({ id: protocol, label: protocol, active: stringOf(draft, 'api') === protocol })),
      })
      if (choice !== undefined) setField('api', choice.id)
      continue
    }
    if (selected.id === 'models') {
      const edited = await editModels(overlays, api, models, () => {
        const baseURL = stringOf(draft, 'baseURL')
        const protocol = stringOf(draft, 'api')
        return {
          settingsNs: row.namespace!.ns,
          ...dirty.has('baseURL') || dirty.has('api') ? {} : { provider: row.entry.provider },
          ...(baseURL === undefined ? {} : { baseURL }),
          ...(protocol === undefined ? {} : { api: protocol }),
          ...(credentialIntent?.kind !== 'write' ? {} : { apiKey: credentialIntent.value }),
        }
      }, options.notice)
      if (edited !== undefined) {
        if (!sameModels(edited, models)) {
          models = [...edited]
          setField('models', models)
        }
      }
      continue
    }
    if (selected.id === 'delete') {
      if (providerStateChanged(options, openedGeneration)) return false
      const confirmed = await overlays.confirm(
        ui(`删除 ${providerLabel(row)}？`, `Delete ${providerLabel(row)}?`),
        ui('只删除可证明属于用户层的 Provider 配置；Credential 保留，历史 Session 不改写。', 'Only the user-owned Provider profile is removed. Its credential is retained and historical sessions are unchanged.'),
        ui('删除 Provider', 'Delete Provider'),
      )
      if (!confirmed) continue
      const protectedProviders = await options.reloadProtectedProviders?.()
      if (protectedProviders === undefined) {
        options.notice(ui('无法重新确认当前与默认路由；未删除 Provider。', 'Current and default routes could not be rechecked; the Provider was not deleted.'), 'warning')
        continue
      }
      if (protectedProviders.includes(row.entry.provider)) {
        options.notice(ui('该 Provider 仍被当前 Session 或默认路由引用；未删除。', 'This Provider is still referenced by the current session or default route and was not deleted.'), 'warning')
        continue
      }
      let latestRow: ProviderConfigRow | undefined
      try {
        latestRow = (await loadProviderConfig(api)).rows.find(candidate => candidate.entry.provider === row.entry.provider)
      } catch {
        options.notice(ui('无法重新确认 Provider 所有权；未删除。', 'Provider ownership could not be rechecked; the Provider was not deleted.'), 'warning')
        continue
      }
      if (latestRow?.removable !== true) {
        options.notice(ui('该 Provider 已不再满足用户层删除条件；未删除。', 'This Provider no longer meets the user-owned deletion requirements and was not deleted.'), 'warning')
        continue
      }
      const result = await removeProviderConfig(api, latestRow)
      if (result.ok) {
        try {
          const verified = (await loadProviderConfig(api)).rows.find(candidate => candidate.entry.provider === row.entry.provider)
          if (verified?.configured === true) {
            options.notice(ui('删除请求已返回，但 Provider 仍存在；请重新读取后再处理。', 'The delete request returned, but the Provider is still present; reload before continuing.'), 'warning')
            return false
          }
        } catch {
          options.notice(ui('删除请求已返回，但无法核实最终状态。', 'The delete request returned, but its final state could not be verified.'), 'warning')
          return true
        }
        const finalProtectedProviders = await options.reloadProtectedProviders?.()
        if (finalProtectedProviders === undefined) {
          options.notice(ui('Provider 配置已移除，但无法再次核实当前与默认路由；最终状态未知，凭据已保留。', 'The Provider profile was removed, but current and default routes could not be rechecked. Final state is unknown and the credential was retained.'), 'warning')
          return true
        }
        if (finalProtectedProviders.includes(row.entry.provider)) {
          options.notice(ui('Provider 配置已移除，但并发变更使当前或默认路由仍引用它；请立即重新选择模型。凭据已保留。', 'The Provider profile was removed, but a concurrent change still references it from the current or default route. Select another model immediately. The credential was retained.'), 'warning')
          return true
        }
        options.notice(ui('Provider 配置已删除并核实；凭据已保留。', 'Provider configuration deletion was verified; credential retained.'), 'success')
      }
      else options.notice(providerFailureMessage(result.stage, result.code), 'error')
      return result.ok
    }
    if (selected.id === 'save') {
      if (providerStateChanged(options, openedGeneration)) return false
      const issue = providerModelsIssue(models)
      if (issue !== undefined) {
        options.notice(issue, 'warning')
        continue
      }
      const endpointChanged = dirty.has('baseURL')
        && stringOf(draft, 'baseURL') !== stringOf(row.profile, 'baseURL')
      if (credentialIntent?.kind === 'write' && endpointChanged
        && row.apiKeyEnv !== undefined && credentialIntent.ref === row.apiKeyEnv) {
        const replacement = await chooseCredentialRef(
          overlays,
          api,
          row.entry.provider,
          stringOf(draft, 'baseURL'),
          row.apiKeyEnv,
          false,
          options.notice,
        )
        if (replacement === undefined) continue
        credentialIntent = replacement
      }
      if (credentialIntent === undefined && endpointChanged && row.apiKeyEnv !== undefined) {
        const reuse = await overlays.confirm(
          ui('在新地址继续使用现有凭据？', 'Reuse the existing credential at the new endpoint?'),
          ui(
            `目标地址：${safeUrlPreview(stringOf(draft, 'baseURL'))}\nCredential Ref：${row.apiKeyEnv}\n只有确认信任该地址后才能继续。`,
            `Endpoint: ${safeUrlPreview(stringOf(draft, 'baseURL'))}\nCredential Ref: ${row.apiKeyEnv}\nContinue only if you trust this endpoint.`,
          ),
          ui('确认复用', 'Confirm reuse'),
        )
        if (!reuse) continue
      }
      if (credentialIntent?.kind === 'reuse'
        && credentialIntent.confirmedEndpoint !== stringOf(draft, 'baseURL')) {
        const reuse = await overlays.confirm(
          ui('在变更后的地址复用 Credential Ref？', 'Reuse Credential Ref at the changed endpoint?'),
          ui(
            `目标地址：${safeUrlPreview(stringOf(draft, 'baseURL'))}\nCredential Ref：${credentialIntent.ref}\n不会读取或覆盖现有 Key。`,
            `Endpoint: ${safeUrlPreview(stringOf(draft, 'baseURL'))}\nCredential Ref: ${credentialIntent.ref}\nThe existing key will not be read or overwritten.`,
          ),
          ui('确认复用', 'Confirm reuse'),
        )
        if (!reuse) continue
        credentialIntent = {
          ...credentialIntent,
          confirmedEndpoint: stringOf(draft, 'baseURL'),
        }
      }
      if (credentialIntent !== undefined) {
        const metadata = await credentialMetadata(api, credentialIntent.ref)
        const valid = metadata !== undefined && (credentialIntent.kind === 'reuse'
          ? metadata.configured
          : metadata.writable && (!credentialIntent.requireUnconfigured || !metadata.configured))
        if (!valid) {
          options.notice(ui('Credential Ref 的最新状态不再满足安全写入条件；未保存。', 'The latest Credential Ref state no longer permits a safe write; nothing was saved.'), 'warning')
          continue
        }
        if (credentialIntent.kind === 'write' && !credentialIntent.requireUnconfigured
          && metadata.configured && dirty.size > 0) {
          options.notice(ui('已配置 Ref 的 Key 更新必须单独保存；请先保存其他 Provider 字段，再重新打开只更新 Key。', 'A key update for a configured Ref must be saved separately. Save the other Provider fields first, then reopen and update only the key.'), 'warning')
          continue
        }
      }
      if (providerStateChanged(options, openedGeneration)) return false
      if (credentialIntent !== undefined
        && (row.apiKeyEnv === undefined || credentialIntent.ref !== row.apiKeyEnv)) {
        setField('apiKeyEnv', credentialIntent.ref)
      }
      const dirtyFields = [...dirty].sort((left, right) => {
        if (left === 'apiKeyEnv' && right !== 'apiKeyEnv') return -1
        if (right === 'apiKeyEnv' && left !== 'apiKeyEnv') return 1
        return 0
      })
      let ops = providerProfileOps(
        row.entry.settingsPath,
        Object.fromEntries(dirtyFields.filter(key => draft[key] !== undefined).map(key => [key, draft[key]])),
        dirtyFields.filter(key => draft[key] === undefined),
      )
      if (ops.length === 0 && !row.configured && row.entry.settingsPath.length > 0) {
        ops = [{ op: 'set', path: [...row.entry.settingsPath], value: {} }]
      }
      const credential = credentialIntent?.kind === 'write'
        ? { ref: credentialIntent.ref, value: credentialIntent.value }
        : undefined
      const result = await saveProviderConfig(api, {
        ns: row.namespace.ns,
        ops,
        expectedRevision: row.namespace.revision,
        ...(credential === undefined ? {} : { credential }),
      })
      const expectedCredentialRef = credentialIntent?.ref ?? row.apiKeyEnv
      return finishSave(overlays, api, result, {
        provider: row.entry.provider,
        ns: row.namespace.ns,
        ops,
        ...(credential === undefined ? {} : { credential }),
        ...(credentialIntent?.kind === 'write' && credentialIntent.requireUnconfigured
          ? { credentialMustBeUnconfigured: true }
          : {}),
        ...(expectedCredentialRef === undefined ? {} : { expectedCredentialRef }),
      }, options.notice)
    }
  }
}

async function createCustomProvider(
  overlays: OverlayPrompts,
  api: ProviderApi,
  options: ProviderManagerOptions,
): Promise<boolean> {
  const openedGeneration = options.stateGeneration?.()
  const snapshot = await loadProviderConfig(api)
  if (providerStateChanged(options, openedGeneration)) return false
  const namespace = snapshot.namespaces.get('llm-pi-ai')
  if (!snapshot.writable || namespace === undefined) {
    options.notice(ui('当前 Harness 没有可写的 llm-pi-ai Settings。', 'This Harness has no writable llm-pi-ai Settings namespace.'), 'warning')
    return false
  }
  const protocols = providerProtocolChoices(namespace)
  if (protocols.length === 0) {
    options.notice(ui('当前 llm-pi-ai schema 没有公布可用协议。', 'The current llm-pi-ai schema exposes no protocol choices.'), 'warning')
    return false
  }
  const existing = new Set(snapshot.rows.map(row => row.entry.provider))
  let provider: string
  while (true) {
    const value = await overlays.input({ title: ui('自定义 Provider ID', 'Custom Provider ID'), placeholder: 'opencode-go', requireText: true })
    if (value === undefined) return false
    provider = value.trim()
    if (validProviderId(provider) && !existing.has(provider)) break
    options.notice(ui('ID 不能为空、不能包含控制字符、不能占用内部菜单 ID，且不能重复。', 'The ID cannot be empty, contain control characters, use the internal menu ID, or duplicate an existing route.'), 'warning')
  }
  const displayName = await overlays.input({ title: ui('显示名称（可选）', 'Display name (optional)'), placeholder: provider })
  if (displayName === undefined) return false
  if (/[\u0000-\u001f\u007f]/u.test(displayName)) {
    options.notice(ui('显示名称不能包含控制字符。', 'The display name cannot contain control characters.'), 'warning')
    return false
  }
  let baseURL: string
  while (true) {
    const raw = await overlays.input({ title: 'Base URL', placeholder: 'https://api.example.com/v1', requireText: true })
    if (raw === undefined) return false
    const checked = normalizeProviderBaseUrl(raw)
    if (checked.ok) {
      baseURL = checked.value
      break
    }
    options.notice(checked.message, 'warning')
  }
  const selectedProtocol = await overlays.select({
    title: ui('API 协议', 'API protocol'),
    choices: protocols.map(protocol => ({ id: protocol, label: protocol })),
  })
  if (selectedProtocol === undefined) return false
  let credentialIntent: CredentialIntent | undefined
  let keyRef: string | undefined
  while (true) {
    const entered = await overlays.input({
      title: ui('Credential Ref（可选）', 'Credential Ref (optional)'),
      detail: ui(
        '这是 Harness 凭据引用名，不是 API Key。留空表示 Provider 原生或无凭据认证。',
        'This is a Harness credential reference, not an API key. Leave blank for Provider-native or keyless authentication.',
      ),
      initialValue: deriveProviderKeyRef(provider),
    })
    if (entered === undefined) return false
    const normalized = entered.trim()
    if (normalized === '') {
      keyRef = undefined
      break
    }
    if (!validProviderCredentialRef(normalized)) {
      options.notice(ui(
        'Credential Ref 必须以下划线或字母开头，且只能包含字母、数字和下划线。',
        'The Credential Ref must start with a letter or underscore and contain only letters, digits, and underscores.',
      ), 'warning')
      continue
    }
    const metadata = await credentialMetadata(api, normalized)
    if (metadata === undefined) {
      options.notice(ui('无法确认 Credential Ref 的状态；为安全起见不允许继续。', 'The Credential Ref state could not be confirmed, so this operation is disabled for safety.'), 'error')
      return false
    }
    if (metadata.configured) {
      const reuse = await overlays.confirm(
        ui('复用已配置的 Credential Ref？', 'Reuse configured Credential Ref?'),
        ui(
          `目标地址：${safeUrlPreview(baseURL)}\nCredential Ref：${normalized}\n不会读取或覆盖现有 Key。`,
          `Endpoint: ${safeUrlPreview(baseURL)}\nCredential Ref: ${normalized}\nThe existing key will not be read or overwritten.`,
        ),
        ui('确认复用', 'Confirm reuse'),
      )
      if (!reuse) continue
      keyRef = normalized
      credentialIntent = { kind: 'reuse', ref: normalized, confirmedEndpoint: baseURL }
      break
    }
    if (!metadata.writable) {
      options.notice(ui('该 Ref 尚未配置且不可写，不能用于此 Provider。', 'This Ref is unconfigured and read-only, so it cannot be used for this Provider.'), 'warning')
      continue
    }
    const key = await credentialDraft(overlays, true, options.notice)
    if (key === 'cancelled') return false
    if (key === undefined) {
      options.notice(ui('新的 Credential Ref 需要 API Key；如无需凭据，请留空 Ref。', 'A new Credential Ref needs an API key. Leave the Ref empty for keyless authentication.'), 'warning')
      continue
    }
    keyRef = normalized
    credentialIntent = { kind: 'write', ref: normalized, value: key, requireUnconfigured: true }
    break
  }
  const models = await editModels(overlays, api, [], () => ({
    settingsNs: namespace.ns,
    baseURL,
    api: selectedProtocol.id,
    ...(credentialIntent?.kind !== 'write' ? {} : { apiKey: credentialIntent.value }),
  }), options.notice)
  if (models === undefined) return false
  const issue = models.length === 0
    ? ui('自定义 Provider 至少需要一个模型。', 'A custom Provider needs at least one model.')
    : providerModelsIssue(models)
  if (issue !== undefined) {
    options.notice(issue, 'warning')
    return false
  }
  const profile = {
    ...(displayName.trim() === '' ? {} : { displayName: displayName.trim() }),
    ...(keyRef === undefined ? {} : { apiKeyEnv: keyRef }),
    api: selectedProtocol.id,
    baseURL,
    models,
  }
  const targetPath = ['providers', provider]
  if (nodeAtPath(rehydrateSchema(namespace.schema), targetPath) === undefined) {
    options.notice(ui('当前 schema 不能创建自定义 Provider。', 'The current schema cannot create a custom Provider.'), 'error')
    return false
  }
  const confirmed = await overlays.confirm(
    ui(`创建 ${displayName.trim() || provider}？`, `Create ${displayName.trim() || provider}?`),
    ui(`${provider} · ${safeUrlPreview(baseURL)} · ${selectedProtocol.id} · ${String(models.length)} 个模型`, `${provider} · ${safeUrlPreview(baseURL)} · ${selectedProtocol.id} · ${String(models.length)} models`),
    ui('创建 Provider', 'Create Provider'),
  )
  if (!confirmed) return false
  if (providerStateChanged(options, openedGeneration)) return false
  if (credentialIntent !== undefined) {
    const metadata = await credentialMetadata(api, credentialIntent.ref)
    const valid = metadata !== undefined && (credentialIntent.kind === 'reuse'
      ? metadata.configured
      : metadata.writable && !metadata.configured)
    if (!valid) {
      options.notice(ui('Credential Ref 的状态在确认后发生变化；未创建 Provider。', 'The Credential Ref state changed after confirmation; the Provider was not created.'), 'warning')
      return false
    }
  }
  const credential = credentialIntent?.kind === 'write'
    ? { ref: credentialIntent.ref, value: credentialIntent.value }
    : undefined
  const ops = [{ op: 'set' as const, path: targetPath, value: profile }]
  const result = await saveProviderConfig(api, {
    ns: namespace.ns,
    ops,
    expectedRevision: namespace.revision,
    ...(credential === undefined ? {} : { credential }),
  })
  return finishSave(overlays, api, result, {
    provider,
    ns: namespace.ns,
    ops,
    ...(credential === undefined ? {} : { credential }),
    ...(credentialIntent?.kind === 'write' ? { credentialMustBeUnconfigured: true } : {}),
    ...(keyRef === undefined ? {} : { expectedCredentialRef: keyRef }),
  }, options.notice)
}

/** Open one shared Provider flow. Each loop re-reads Harness state; no local cache survives it. */
export async function manageProviders(
  overlays: OverlayPrompts,
  api: ProviderApi,
  options: ProviderManagerOptions,
): Promise<ProviderManagerResult> {
  let changed = false
  while (true) {
    const openedGeneration = options.stateGeneration?.()
    let snapshot
    try {
      snapshot = await loadProviderConfig(api)
    } catch (error) {
      options.notice(error instanceof Error ? error.message : providerFailureMessage('load', 'unknown'), 'error')
      return changed ? 'changed' : 'unchanged'
    }
    if (providerStateChanged(options, openedGeneration)) continue
    const selected = await overlays.select({
      title: ui('Provider 管理', 'Provider management'),
      detail: ui('配置与选择分离；保存不会自动修改当前会话或新会话默认模型。', 'Configuration and selection are separate. Saving does not change the current session or the default model.'),
      choices: [
        { id: '__add__', label: ui('添加自定义 Provider…', 'Add custom Provider…'), ...(snapshot.namespaces.has('llm-pi-ai') && snapshot.writable ? {} : { disabledReason: ui('llm-pi-ai 不可写', 'llm-pi-ai is not writable') }) },
        ...snapshot.rows.map(row => ({
          id: row.entry.provider,
          label: providerLabel(row),
          description: providerDescription(row),
          ...(row.namespace === undefined ? { disabledReason: ui('没有 Settings 地址', 'No Settings address') } : {}),
        })),
      ],
    })
    if (selected === undefined) return changed ? 'changed' : 'unchanged'
    if (selected.id === '__add__') {
      changed = await createCustomProvider(overlays, api, options) || changed
      continue
    }
    const row = snapshot.rows.find(candidate => candidate.entry.provider === selected.id)
    if (row === undefined) continue
    changed = await editProvider(overlays, api, row, snapshot.credentialState, options, openedGeneration) || changed
  }
}
