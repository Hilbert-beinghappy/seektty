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
import { TuiSettingsConflictError } from '@deepseek-ai/dsh-tui-protocol'
import type {} from './marketplace-provider.ts'
import { assertCredentialFreeUrl, PluginMarketplace } from './plugin-marketplace.ts'

const MARKETPLACE_NAMESPACE = settingsNamespace('tui-plugin-marketplace')
const TUI_BUNDLE = 'deepseek-tui'
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
  const marketplace = new PluginMarketplace({
    cwd,
    resolveCredential: async ref => (await credentials.resolve(credentialRef(ref)))?.value,
    ...(providers === undefined ? {} : { providers }),
  })

  const describe = (): readonly TuiSettingsDocument[] =>
    settings.describe({ redactSecrets: true }).map(settingsDocument)
  const one = (namespace: string): TuiSettingsDocument => {
    const document = describe().find(row => row.namespace === namespace)
    if (document === undefined) throw new Error(`设置命名空间 ${JSON.stringify(namespace)} 已卸载`)
    return document
  }
  const sourceSnapshot = (): TuiMarketplaceSources => {
    const document = one(MARKETPLACE_NAMESPACE)
    const value = document.value as MarketplaceSettings
    const stored = value.sources.map(source => validateCatalogSource({
      id: source.id,
      kind: 'catalog',
      label: source.label,
      url: source.url,
      enabled: source.enabled,
      ...(source.credentialRef === '' ? {} : { credentialRef: source.credentialRef }),
      builtIn: false,
    }))
    const providerSources = providers?.sources() ?? []
    const sourceIds = new Set([NPM_SOURCE.id, ...providerSources.map(source => source.id)])
    for (const source of stored) {
      if (sourceIds.has(source.id)) throw new Error(`Catalog Source ${source.id} 与内置或 Provider Source 冲突`)
      sourceIds.add(source.id)
    }
    return {
      revision: document.revision,
      sources: [
        NPM_SOURCE,
        ...providerSources,
        ...stored.map(source => ({
          id: source.id,
          kind: 'catalog' as const,
          label: source.label,
          url: source.url,
          enabled: source.enabled,
          ...(source.credentialRef === '' ? {} : { credentialRef: source.credentialRef }),
          builtIn: false,
        })),
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
      describe: () => Promise.resolve(describe()),
      mutate: async (namespace, ops, expectedRevision) => {
        await mutateSettings(settings, namespace, ops, expectedRevision)
        return one(namespace)
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
  }
}
