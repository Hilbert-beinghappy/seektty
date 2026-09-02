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
  type ProviderApi,
  type ProviderConfigRow,
  type ProviderModelDraft,
  type ProviderSaveResult,
} from './provider-config.ts'

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

async function freshCredentialRef(
  overlays: OverlayPrompts,
  api: ProviderApi,
  provider: string,
  currentRef: string,
  notice: ProviderManagerOptions['notice'],
): Promise<string | undefined> {
  const conventional = deriveProviderKeyRef(provider)
  const initialValue = conventional === currentRef ? `${conventional}_NEXT` : conventional
  while (true) {
    const entered = await overlays.input({
      title: ui('新的 Credential Ref', 'New Credential Ref'),
      detail: ui(
        '同时修改地址和 Key 时，必须先切换到一个不同、未配置且可写的 Ref，避免旧 Key 被发送到新地址。',
        'Changing the endpoint and key together requires a different, unconfigured, writable Ref so the old key cannot be sent to the new endpoint.',
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
      notice(ui('无法确认该 Credential Ref 的状态；为安全起见不允许切换。', 'The Credential Ref state could not be confirmed, so the switch is disabled for safety.'), 'error')
      return undefined
    }
    if (metadata.configured || !metadata.writable) {
      notice(ui('新的 Credential Ref 必须尚未配置且可写。', 'The new Credential Ref must be unconfigured and writable.'), 'warning')
      continue
    }
    return ref
  }
}

async function finishSave(
  overlays: OverlayPrompts,
  api: ProviderApi,
  result: ProviderSaveResult,
  credential: { readonly ref: string; readonly value: string } | undefined,
  ns: string,
  notice: ProviderManagerOptions['notice'],
): Promise<boolean> {
  if (result.ok) {
    notice(ui('Provider 配置已保存并重新读取。', 'Provider configuration was saved and reloaded.'), 'success')
    return true
  }
  notice(providerFailureMessage(result.stage, result.code), result.settingsCommitted ? 'warning' : 'error')
  if (result.stage !== 'credential' || credential === undefined || !result.settingsCommitted) return result.settingsCommitted
  const retry = await overlays.confirm(
    ui('只重试 API Key？', 'Retry only the API key?'),
    ui('Settings 已经保存；重试不会再次提交 Provider 配置。', 'Settings are already saved; retrying will not submit Provider configuration again.'),
    ui('重试凭据', 'Retry credential'),
  )
  if (!retry) return true
  const retried = await saveProviderConfig(api, {
    ns,
    ops: [],
    expectedRevision: result.namespace?.revision ?? 0,
    credential,
  })
  if (retried.ok) notice(ui('API Key 已保存。', 'API key saved.'), 'success')
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
  let keyValue: string | undefined
  let keyRef = row.apiKeyEnv ?? deriveProviderKeyRef(row.entry.provider)
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
      let targetRef = keyRef
      const endpointChanged = dirty.has('baseURL')
        && stringOf(draft, 'baseURL') !== stringOf(row.profile, 'baseURL')
      if (endpointChanged && row.apiKeyEnv !== undefined) {
        const freshRef = await freshCredentialRef(overlays, api, row.entry.provider, row.apiKeyEnv, options.notice)
        if (freshRef === undefined) continue
        targetRef = freshRef
      } else {
        const metadata = await credentialMetadata(api, targetRef)
        if (metadata === undefined) {
          options.notice(ui('无法确认 Credential Ref 的状态；Key 更新已禁用。', 'The Credential Ref state could not be confirmed; key updates are disabled.'), 'warning')
          continue
        }
        if (!metadata.writable) {
          options.notice(ui('该 Credential Ref 由外部只读来源管理。', 'This Credential Ref is managed by a read-only external source.'), 'warning')
          continue
        }
      }
      const entered = await credentialDraft(overlays, row.credential?.writable !== false, options.notice)
      if (entered !== 'cancelled') {
        keyValue = entered
        if (entered !== undefined) keyRef = targetRef
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
          ...(keyValue === undefined ? {} : { apiKey: keyValue }),
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
      if (keyValue !== undefined && endpointChanged && row.apiKeyEnv !== undefined && keyRef === row.apiKeyEnv) {
        const freshRef = await freshCredentialRef(overlays, api, row.entry.provider, row.apiKeyEnv, options.notice)
        if (freshRef === undefined) continue
        keyRef = freshRef
      }
      if (keyValue === undefined && endpointChanged && row.apiKeyEnv !== undefined) {
        const reuse = await overlays.confirm(
          ui('在新地址继续使用现有凭据？', 'Reuse the existing credential at the new endpoint?'),
          ui(
            `目标地址将改为 ${safeUrlPreview(stringOf(draft, 'baseURL'))}；只有确认信任该地址后才能继续。`,
            `The endpoint will change to ${safeUrlPreview(stringOf(draft, 'baseURL'))}. Continue only if you trust this endpoint.`,
          ),
          ui('确认复用', 'Confirm reuse'),
        )
        if (!reuse) continue
      }
      if (keyValue !== undefined) {
        const metadata = await credentialMetadata(api, keyRef)
        if (metadata === undefined || !metadata.writable
          || (endpointChanged && row.apiKeyEnv !== undefined && keyRef !== row.apiKeyEnv && metadata.configured)) {
          options.notice(ui('Credential Ref 的最新状态不再满足安全写入条件；未保存。', 'The latest Credential Ref state no longer permits a safe write; nothing was saved.'), 'warning')
          continue
        }
      }
      if (providerStateChanged(options, openedGeneration)) return false
      if (keyValue !== undefined && (row.apiKeyEnv === undefined || keyRef !== row.apiKeyEnv)) setField('apiKeyEnv', keyRef)
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
      const credential = keyValue === undefined ? undefined : { ref: keyRef, value: keyValue }
      const result = await saveProviderConfig(api, {
        ns: row.namespace.ns,
        ops,
        expectedRevision: row.namespace.revision,
        ...(credential === undefined ? {} : { credential }),
      })
      return finishSave(overlays, api, result, credential, row.namespace.ns, options.notice)
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
    options.notice(ui('ID 必须以小写字母开头，只能包含小写字母、数字和单个短横线，且不能重复。', 'The ID must start with a lowercase letter, contain only lowercase letters, digits, and single dashes, and be unique.'), 'warning')
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
    if (normalized === '' || validProviderCredentialRef(normalized)) {
      keyRef = normalized === '' ? undefined : normalized
      break
    }
    options.notice(ui(
      'Credential Ref 必须以大写字母开头，且只能包含大写字母、数字和下划线。',
      'The Credential Ref must start with an uppercase letter and contain only uppercase letters, digits, and underscores.',
    ), 'warning')
  }
  let keyDraft: string | undefined
  if (keyRef !== undefined) {
    let credential
    try {
      const response = await api.credentials.describe({ refs: [keyRef] })
      if (!response.result.ok) {
        options.notice(providerFailureMessage('load', 'credential-describe-failed'), 'error')
        return false
      }
      credential = response.result.value.credentials[keyRef]
    } catch {
      options.notice(providerFailureMessage('load', 'credential-describe-failed'), 'error')
      return false
    }
    if (credential?.writable === false) {
      options.notice(ui(
        `Credential ${keyRef} 由外部来源管理；将保留该 Ref，不写入 Key。`,
        `Credential ${keyRef} is externally managed. Its Ref will be saved without writing a key.`,
      ), 'info')
    } else {
      const entered = await credentialDraft(overlays, true, options.notice)
      if (entered === 'cancelled') return false
      keyDraft = entered
    }
  }
  const models = await editModels(overlays, api, [], () => ({
    settingsNs: namespace.ns,
    baseURL,
    api: selectedProtocol.id,
    ...(keyDraft === undefined ? {} : { apiKey: keyDraft }),
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
  const credential = keyDraft === undefined || keyRef === undefined ? undefined : { ref: keyRef, value: keyDraft }
  const result = await saveProviderConfig(api, {
    ns: namespace.ns,
    ops: [{ op: 'set', path: targetPath, value: profile }],
    expectedRevision: namespace.revision,
    ...(credential === undefined ? {} : { credential }),
  })
  return finishSave(overlays, api, result, credential, namespace.ns, options.notice)
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
