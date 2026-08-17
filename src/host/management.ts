/** Same-process Settings, Credentials, Profile, plugin, and marketplace bridge. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ProfilePluginManager } from './profile-plugin-manager.ts'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SettingsConflictError, settingsNamespace, type SettingsDescriptor } from '@deepseek-ai/dsh-settings'
import type {
  TuiManagementBridge,
  TuiMarketplaceSource,
  TuiMarketplaceSources,
  TuiProfileSummary,
  TuiSettingsDocument,
} from '@deepseek-ai/dsh-tui-protocol'
import {
  DEFAULT_TUI_BEHAVIOR,
  DEFAULT_TUI_CODE_THEME,
  DEFAULT_TUI_THEME,
  MAX_COMPOSER_HISTORY,
  MAX_CUSTOM_THEMES,
  MAX_TEXTMATE_RULES,
  MAX_TOOL_OUTPUT_LINE_LIMIT,
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  TuiSettingsConflictError,
} from '@deepseek-ai/dsh-tui-protocol'
import type {} from './marketplace-provider.ts'
import { assertCredentialFreeUrl, PluginMarketplace } from './plugin-marketplace.ts'
import { killHostJob, type HostJobRegistry } from '../client/job-control.ts'

const MARKETPLACE_NAMESPACE = settingsNamespace('tui-plugin-marketplace')
const APPEARANCE_NAMESPACE = settingsNamespace(TUI_APPEARANCE_SETTINGS_NAMESPACE)
const BEHAVIOR_NAMESPACE = settingsNamespace(TUI_BEHAVIOR_SETTINGS_NAMESPACE)
const TUI_BUNDLE = 'seektty'
const NON_TUI_SURFACE_BUNDLES = ['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless'] as const
const NPM_SOURCE: TuiMarketplaceSource = Object.freeze({
  id: 'npm',
  kind: 'npm',
  label: 'npm Registry',
  url: 'https://registry.npmjs.org/',
  enabled: true,
  builtIn: true,
})

const CatalogSourceSchema = z.object({
  id: z.string().required(),
  label: z.string().required(),
  url: z.string().required(),
  enabled: z.boolean().default(true),
  credentialRef: z.string().role('credential-ref').default(''),
})

const MarketplaceSettingsSchema = z.object({
  sources: z.array(CatalogSourceSchema).default([]),
})

const ThemeColorSchema = z.string().pattern(/^#[0-9A-Fa-f]{6}$/u)
const ThemeUiColorsSchema = z.object({
  text: ThemeColorSchema.required(),
  muted: ThemeColorSchema.required(),
  border: ThemeColorSchema.required(),
  brand: ThemeColorSchema.required(),
  accent: ThemeColorSchema.required(),
  success: ThemeColorSchema.required(),
  warning: ThemeColorSchema.required(),
  danger: ThemeColorSchema.required(),
  canvas: ThemeColorSchema.required(),
  surface: ThemeColorSchema.required(),
  selection: ThemeColorSchema.required(),
}).required()
const SyntaxThemeColorsSchema = z.object({
  background: ThemeColorSchema.required(),
  foreground: ThemeColorSchema.required(),
  comment: ThemeColorSchema.required(),
  keyword: ThemeColorSchema.required(),
  string: ThemeColorSchema.required(),
  number: ThemeColorSchema.required(),
  constant: ThemeColorSchema.required(),
  function: ThemeColorSchema.required(),
  type: ThemeColorSchema.required(),
  variable: ThemeColorSchema.required(),
  property: ThemeColorSchema.required(),
  parameter: ThemeColorSchema.required(),
  operator: ThemeColorSchema.required(),
  punctuation: ThemeColorSchema.required(),
  tag: ThemeColorSchema.required(),
  attribute: ThemeColorSchema.required(),
  regexp: ThemeColorSchema.required(),
}).required()
const TextMateRuleSchema = z.object({
  scope: z.array(z.string().min(1).max(256)).min(1).max(64).required(),
  foreground: ThemeColorSchema,
  background: ThemeColorSchema,
  fontStyle: z.array(z.union(['bold', 'italic', 'underline', 'strikethrough'])).max(4),
})
const CustomThemeSchema = z.object({
  id: z.string().pattern(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u).max(48).required(),
  name: z.string().min(1).max(80).pattern(/^[^\u0000-\u001F\u007F-\u009F]+$/u).required(),
  tone: z.union(['dark', 'light']).required(),
  source: z.union(['manual', 'palette', 'vscode']).required(),
  colors: ThemeUiColorsSchema,
  syntax: SyntaxThemeColorsSchema,
  tokenColors: z.array(TextMateRuleSchema).max(MAX_TEXTMATE_RULES).default([]),
})
const AppearanceSettingsSchema = z.object({
  theme: z.string().pattern(/^(?:dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u)
    .default(DEFAULT_TUI_THEME)
    .description('SeekTTY 当前使用的界面主题。'),
  codeTheme: z.string().pattern(/^(?:auto|dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u)
    .default(DEFAULT_TUI_CODE_THEME)
    .description('代码块独立主题；auto 跟随当前界面主题。'),
  customThemes: z.array(CustomThemeSchema).max(MAX_CUSTOM_THEMES).default([])
    .description('SeekTTY 命名自定义主题。'),
})
const BehaviorSettingsSchema = z.object({
  toolCards: z.union(['collapsed', 'expanded', 'hidden'])
    .default(DEFAULT_TUI_BEHAVIOR.toolCards)
    .description('工具卡片默认形态；启动时应用到当前会话。'),
  showReasoning: z.boolean().default(DEFAULT_TUI_BEHAVIOR.showReasoning)
    .description('推理内容默认是否显示。'),
  desktopNotifications: z.boolean().default(DEFAULT_TUI_BEHAVIOR.desktopNotifications)
    .description('回合完成或待审批时发送终端桌面通知。'),
  followTerminalTitle: z.boolean().default(DEFAULT_TUI_BEHAVIOR.followTerminalTitle)
    .description('终端标题跟随当前会话运行状态。'),
  composerHistoryLimit: z.natural().max(MAX_COMPOSER_HISTORY)
    .default(DEFAULT_TUI_BEHAVIOR.composerHistoryLimit)
    .description('输入历史持久化条数；0 表示关闭。'),
  statusElapsed: z.boolean().default(DEFAULT_TUI_BEHAVIOR.statusElapsed)
    .description('状态栏显示当前回合实时耗时。'),
  clipboardFallback: z.union(['auto', 'osc52', 'off'])
    .default(DEFAULT_TUI_BEHAVIOR.clipboardFallback)
    .description('OSC 52 失败后的剪贴板回退命令；auto 按平台探测。'),
  toolOutputLineLimit: z.natural().max(MAX_TOOL_OUTPUT_LINE_LIMIT)
    .default(DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit)
    .description('展开态工具输出单块行数上限；0 表示不折叠。'),
  keyBindings: z.dict(z.string()).default({})
    .description('覆盖默认快捷键；键为绑定 id，值为 Ctrl+P 这类组合。空对象表示使用默认键位。'),
})

interface StoredCatalogSource {
  readonly id: string
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly credentialRef: string
}

interface MarketplaceSettings {
  readonly sources: readonly StoredCatalogSource[]
}

function settingsDocument(descriptor: SettingsDescriptor): TuiSettingsDocument {
  return {
    namespace: descriptor.ns,
    schema: descriptor.schema,
    value: descriptor.value,
    revision: descriptor.revision,
    applies: descriptor.applies,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    secrets: descriptor.secrets ?? [],
  }
}

/**
 * Cache a full Settings describe() so one() and namespaced reads do not reserialize
 * every namespace on the Host event loop.
 * @param load - redacted descriptors from Harness Settings.
 */
export function createSettingsDescribeCache(
  load: () => readonly TuiSettingsDocument[],
): {
  describe(namespace?: string): readonly TuiSettingsDocument[]
  one(namespace: string): TuiSettingsDocument
  invalidate(): void
} {
  let cached: readonly TuiSettingsDocument[] | undefined
  const all = (): readonly TuiSettingsDocument[] => {
    cached ??= load()
    return cached
  }
  const one = (namespace: string): TuiSettingsDocument => {
    const document = all().find(row => row.namespace === namespace)
    if (document === undefined) throw new Error(`设置命名空间 ${JSON.stringify(namespace)} 已卸载`)
    return document
  }
  return {
    describe(namespace?: string): readonly TuiSettingsDocument[] {
      if (namespace === undefined) return all()
      return [one(namespace)]
    },
    one,
    invalidate(): void {
      cached = undefined
    },
  }
}

function redactInstallerOutput(value: string): string {
  let redacted = value
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, '$1***@')
    .replace(/(https?:\/\/)[^\s/@]+@/giu, '$1***@')
    .replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)[^\s]+/giu, '$1***')
  for (const [key, secret] of Object.entries(process.env)) {
    if (!/(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/iu.test(key) || secret === undefined || secret.length < 4) continue
    redacted = redacted.replaceAll(secret, '***')
  }
  return redacted
}

function sessionExportFilename(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120) || 'session'
  return `dsh-session-${safe}.zip`
}

function validateCatalogSource(source: TuiMarketplaceSource): StoredCatalogSource {
  if (source.builtIn || source.kind !== 'catalog') throw new Error('内置 npm Source 不能写入用户来源')
  if (!/^[a-z][a-z0-9-]*$/.test(source.id) || source.id === NPM_SOURCE.id) {
    throw new Error(`Catalog Source id ${JSON.stringify(source.id)} 必须是唯一的小写 kebab-case`)
  }
  if (source.label.trim() === '' || source.url.trim() === '') throw new Error('Catalog Source 名称和 URL 不能为空')
  assertCredentialFreeUrl(source.url, 'Catalog Source URL')
  if (source.credentialRef !== undefined && source.credentialRef !== '') credentialRef(source.credentialRef)
  return {
    id: source.id,
    label: source.label.trim(),
    url: source.url.trim(),
    enabled: source.enabled,
    credentialRef: source.credentialRef ?? '',
  }
}

function degradedCatalogSource(raw: unknown, index: number, diagnostic: string): TuiMarketplaceSource {
  const record = typeof raw === 'object' && raw !== null ? raw as Partial<StoredCatalogSource> : {}
  const id = typeof record.id === 'string' && record.id.trim() !== '' ? record.id.trim() : `invalid-${String(index)}`
  const label = typeof record.label === 'string' && record.label.trim() !== '' ? record.label.trim() : id
  const url = typeof record.url === 'string' ? record.url : ''
  return {
    id,
    kind: 'catalog',
    label: `${label}（无效）`,
    url,
    enabled: false,
    builtIn: false,
    diagnostic,
  }
}

/**
 * Read stored catalog rows, disabling invalid ones instead of locking the marketplace.
 * @param stored - Settings-persisted catalog rows.
 * @param reservedIds - built-in and Provider source ids that must stay unique.
 */
export function catalogSourcesFromStored(
  stored: readonly unknown[],
  reservedIds: ReadonlySet<string>,
): readonly TuiMarketplaceSource[] {
  const seen = new Set(reservedIds)
  const sources: TuiMarketplaceSource[] = []
  for (const [index, raw] of stored.entries()) {
    const record = typeof raw === 'object' && raw !== null ? raw as Partial<StoredCatalogSource> : {}
    const rawId = typeof record.id === 'string' ? record.id : ''
    if (rawId !== '' && seen.has(rawId)) {
      sources.push(degradedCatalogSource(raw, index, `Catalog Source ${rawId} 与内置或 Provider Source 冲突`))
      continue
    }
    try {
      const storedSource = validateCatalogSource({
        id: typeof record.id === 'string' ? record.id : '',
        kind: 'catalog',
        label: typeof record.label === 'string' ? record.label : '',
        url: typeof record.url === 'string' ? record.url : '',
        enabled: record.enabled !== false,
        ...(typeof record.credentialRef === 'string' && record.credentialRef !== ''
          ? { credentialRef: record.credentialRef }
          : {}),
        builtIn: false,
      })
      if (seen.has(storedSource.id)) {
        sources.push(degradedCatalogSource(raw, index, `Catalog Source ${storedSource.id} 与内置或 Provider Source 冲突`))
        continue
      }
      seen.add(storedSource.id)
      sources.push({
        id: storedSource.id,
        kind: 'catalog',
        label: storedSource.label,
        url: storedSource.url,
        enabled: storedSource.enabled,
        ...(storedSource.credentialRef === '' ? {} : { credentialRef: storedSource.credentialRef }),
        builtIn: false,
      })
    } catch (error) {
      sources.push(degradedCatalogSource(raw, index, error instanceof Error ? error.message : String(error)))
    }
  }
  return sources
}

function tuiProfile(summary: TuiProfileSummary): TuiProfileSummary {
  if (!summary.compatible || summary.bundles.includes(TUI_BUNDLE)) return summary
  return {
    ...summary,
    compatible: false,
    diagnostic: 'Profile 未组合 TUI Surface；可以复制为新的 TUI Profile，但不能由 deepseek 直接启动',
  }
}

async function mutateSettings(
  settings: Context['settings'],
  namespace: string,
  ops: Parameters<Context['settings']['mutate']>[1],
  expectedRevision: number,
): Promise<void> {
  try {
    await settings.mutate(settingsNamespace(namespace), ops, expectedRevision)
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      throw new TuiSettingsConflictError(namespace, error.expected, error.actual)
    }
    throw error
  }
}

/**
 * Build the terminal's direct Host management face. Durable changes still go
 * through Harness services; returned Settings descriptors are always redacted.
 * @param ctx - assembled Host Context.
 * @param cwd - workspace base for local marketplace specs and Catalog files.
 * @returns structural bridge passed across the dynamic Surface boundary.
 */
export function createTuiManagementBridge(ctx: Context, cwd: string): TuiManagementBridge {
  const manager: ProfilePluginManager | undefined = ctx.profilePluginManager
  const providers = ctx.get('tuiMarketplaceProviders')
  const settings = ctx.settings
  const credentials = ctx.credentials
  if (manager === undefined) {
    throw new Error('tui-runner: Settings、Credentials 或 Profile Plugin Manager 未装配')
  }
  settings.register(MARKETPLACE_NAMESPACE, MarketplaceSettingsSchema, { applies: 'live' })
  settings.register(APPEARANCE_NAMESPACE, AppearanceSettingsSchema, { applies: 'live' })
  settings.register(BEHAVIOR_NAMESPACE, BehaviorSettingsSchema, { applies: 'live' })
  const marketplace = new PluginMarketplace({
    cwd,
    resolveCredential: async ref => (await credentials.resolve(credentialRef(ref)))?.value,
    ...(providers === undefined ? {} : { providers }),
  })

  const documents = createSettingsDescribeCache(
    () => settings.describe({ redactSecrets: true }).map(settingsDocument),
  )
  const sourceSnapshot = (): TuiMarketplaceSources => {
    const document = documents.one(MARKETPLACE_NAMESPACE)
    const value = document.value as MarketplaceSettings
    const stored = catalogSourcesFromStored(
      value.sources,
      new Set([NPM_SOURCE.id, ...(providers?.sources() ?? []).map(source => source.id)]),
    )
    return {
      revision: document.revision,
      sources: [
        NPM_SOURCE,
        ...(providers?.sources() ?? []),
        ...stored,
      ],
    }
  }

  return {
    sessionExport: {
      download: async (sessionId, includeDescendants, signal) => {
        const apiProxy = ctx.get('apiProxy')
        if (apiProxy === undefined) throw new Error('Harness Session Export 服务未装配')
        const request: Parameters<typeof apiProxy.downloads.sessionLog>[0] = {
          sessionId: sessionId as Parameters<typeof apiProxy.downloads.sessionLog>[0]['sessionId'],
          ...(includeDescendants ? { includeDescendants: true } : {}),
        }
        const response = await apiProxy.downloads.sessionLog(request, signal ?? new AbortController().signal)
        if (!response.ok) {
          const detail = (await response.text()).trim().slice(0, 1_000)
          throw new Error(`Harness Session Export 失败（HTTP ${String(response.status)}）${detail === '' ? '' : `：${detail}`}`)
        }
        if (response.body === null) throw new Error('Harness Session Export 返回了空响应体')
        const rawLength = response.headers.get('content-length')
        const contentLength = rawLength === null ? undefined : Number.parseInt(rawLength, 10)
        return {
          suggestedFilename: sessionExportFilename(sessionId),
          mediaType: response.headers.get('content-type') ?? 'application/zip',
          ...(contentLength === undefined || !Number.isSafeInteger(contentLength) || contentLength < 0
            ? {}
            : { contentLength }),
          stream: response.body,
        }
      },
    },
    settings: {
      describe: namespace => Promise.resolve(documents.describe(namespace)),
      mutate: async (namespace, ops, expectedRevision) => {
        await mutateSettings(settings, namespace, ops, expectedRevision)
        documents.invalidate()
        return documents.one(namespace)
      },
      credentialInfo: ref => credentials.describe(credentialRef(ref)),
      setCredential: async (ref, value) => {
        await credentials.set(credentialRef(ref), value)
        return credentials.describe(credentialRef(ref))
      },
      unsetCredential: async (ref) => {
        await credentials.unset(credentialRef(ref))
        return credentials.describe(credentialRef(ref))
      },
    },
    profiles: {
      list: () => Promise.resolve(manager.listProfiles().map(tuiProfile)),
      create: (name, copyFrom) => Promise.resolve(tuiProfile(manager.createProfile(name, copyFrom, {
        addBundles: [TUI_BUNDLE],
        removeBundles: NON_TUI_SURFACE_BUNDLES,
      }))),
    },
    plugins: {
      snapshot: () => Promise.resolve(manager.snapshot()),
      run: async (args, options = {}) => {
        const output = options.onOutput
        const result = await manager.run(args, {
          ...options.signal === undefined ? {} : { signal: options.signal },
        })
        const stdout = redactInstallerOutput(result.stdout)
        const stderr = redactInstallerOutput(result.stderr)
        if (output !== undefined) {
          if (stdout !== '') output('stdout', stdout)
          if (stderr !== '') output('stderr', stderr)
        }
        return {
          exitCode: result.exitCode,
          stdout,
          stderr,
          warnings: result.warnings,
          changed: result.changed,
          restartRequired: result.restartRequired,
          snapshot: result.snapshot,
        }
      },
      reorder: bundles => Promise.resolve(manager.reorderBundles(bundles)),
      doctor: () => Promise.resolve(manager.doctor()),
      sources: () => Promise.resolve(sourceSnapshot()),
      saveSources: async (sources, expectedRevision) => {
        const catalog = sources.filter(source => !source.builtIn).map(validateCatalogSource)
        if (new Set(catalog.map(source => source.id)).size !== catalog.length) throw new Error('Catalog Source id 不能重复')
        const reserved = new Set([NPM_SOURCE.id, ...(providers?.sources() ?? []).map(source => source.id)])
        const conflict = catalog.find(source => reserved.has(source.id))
        if (conflict !== undefined) throw new Error(`Catalog Source ${conflict.id} 与内置或 Provider Source 冲突`)
        await mutateSettings(settings, MARKETPLACE_NAMESPACE, [{ op: 'set', path: ['sources'], value: catalog }], expectedRevision)
        documents.invalidate()
        return sourceSnapshot()
      },
      search: async (query, signal) => {
        const sources = sourceSnapshot().sources
        return marketplace.search(query, sources, signal)
      },
      inspect: async (spec, signal) => {
        const sources = sourceSnapshot().sources
        return marketplace.inspect(spec, sources, signal)
      },
    },
    jobs: {
      kill: id => Promise.resolve(killHostJob(ctx.get('jobs') as HostJobRegistry | undefined, id)),
    },
  }
}
