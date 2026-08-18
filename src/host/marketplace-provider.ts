/** Host registry for replaceable TUI plugin-marketplace discovery Providers. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { TuiMarketplaceSource } from '@deepseek-ai/dsh-tui-protocol'
import { ui } from '../client/locale.ts'
import { assertCredentialFreeUrl } from './plugin-marketplace.ts'

const PROVIDER_KIND = /^[a-z][a-z0-9-]*$/u
const SOURCE_ID = /^[a-z][a-z0-9-]*$/u
const RESERVED_KINDS = new Set(['npm', 'catalog'])
const RESERVED_SOURCE_IDS = new Set(['npm'])
const MAX_PROVIDER_RESULTS = 12

/** One read-only discovery source contributed by a Provider Bundle. */
export interface TuiMarketplaceProviderSource {
  readonly id: string
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly credentialRef?: string
}

/** One installable spec discovered by a Provider and awaiting core validation. */
export interface TuiMarketplaceDiscovery {
  readonly spec: string
  readonly name?: string
  readonly description?: string
  readonly publisher?: string
}

/** Replaceable discovery Provider registered by a Harness Bundle. */
export interface TuiMarketplaceProvider {
  /** Unique kebab-case source kind. The built-in `npm` and `catalog` kinds are reserved. */
  readonly kind: string
  /** Stable read-only sources exposed by this Provider. */
  readonly sources: readonly TuiMarketplaceProviderSource[]
  /** Search one source and return pnpm-installable specs for core Bundle validation. */
  search(
    query: string,
    source: TuiMarketplaceSource,
    signal?: AbortSignal,
  ): Promise<readonly TuiMarketplaceDiscovery[]>
}

interface RegisteredProvider {
  readonly provider: TuiMarketplaceProvider
  readonly sources: readonly TuiMarketplaceSource[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-owned extension registry for TUI marketplace discovery sources. */
    tuiMarketplaceProviders: TuiMarketplaceProviderRegistry
  }
}

function optionalText(value: unknown, field: string, subject: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new TypeError(ui(
      `${subject} 的 ${field} 必须是字符串`,
      `${field} of ${subject} must be a string`,
    ))
  }
  const text = value.trim()
  return text === '' ? undefined : text
}

function normalizeSource(kind: string, source: TuiMarketplaceProviderSource): TuiMarketplaceSource {
  if (!SOURCE_ID.test(source.id) || RESERVED_SOURCE_IDS.has(source.id)) {
    throw new Error(ui(
      `Source Provider ${kind} 的 Source id ${JSON.stringify(source.id)} 必须是非保留的小写 kebab-case`,
      `Source id ${JSON.stringify(source.id)} of Source Provider ${kind} must be a non-reserved lowercase kebab-case value`,
    ))
  }
  const label = source.label.trim()
  const url = source.url.trim()
  if (label === '' || url === '') {
    throw new Error(ui(
      `Source Provider ${kind} 的 Source 名称和 URL 不能为空`,
      `Source name and URL of Source Provider ${kind} cannot be empty`,
    ))
  }
  assertCredentialFreeUrl(url, ui(`Source Provider ${kind} 的 URL`, `URL of Source Provider ${kind}`))
  const credentialRef = optionalText(source.credentialRef, 'credentialRef', `Source Provider ${kind}`)
  return Object.freeze({
    id: source.id,
    kind,
    label,
    url,
    enabled: source.enabled,
    ...(credentialRef === undefined ? {} : { credentialRef }),
    builtIn: true,
  })
}

function normalizeDiscovery(value: TuiMarketplaceDiscovery, kind: string): TuiMarketplaceDiscovery {
  const spec = optionalText(value.spec, 'spec', `Source Provider ${kind}`)
  if (spec === undefined) {
    throw new Error(ui(
      `Source Provider ${kind} 返回了空插件 spec`,
      `Source Provider ${kind} returned an empty plugin spec`,
    ))
  }
  assertCredentialFreeUrl(spec, ui(`Source Provider ${kind} 的插件 spec`, `plugin spec of Source Provider ${kind}`))
  const name = optionalText(value.name, 'name', `Source Provider ${kind}`)
  const description = optionalText(value.description, 'description', `Source Provider ${kind}`)
  const publisher = optionalText(value.publisher, 'publisher', `Source Provider ${kind}`)
  return Object.freeze({
    spec,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(publisher === undefined ? {} : { publisher }),
  })
}

/** Cordis service that owns Provider identity, lifecycle, sources, and dispatch. */
export class TuiMarketplaceProviderRegistry extends Service {
  private readonly providers = new Map<string, RegisteredProvider>()
  private readonly sourceIds = new Set<string>()

  constructor(ctx: Context) {
    super(ctx, 'tuiMarketplaceProviders')
  }

  /**
   * Register one Provider for the calling Bundle's lifecycle.
   * @param provider - discovery Provider and its read-only sources.
   * @returns disposer that unregisters the Provider and all of its sources.
   */
  register(provider: TuiMarketplaceProvider): () => void {
    const kind = provider.kind.trim()
    if (!PROVIDER_KIND.test(kind) || RESERVED_KINDS.has(kind)) {
      throw new Error(ui(
        `Source Provider kind ${JSON.stringify(provider.kind)} 必须是非保留的小写 kebab-case`,
        `Source Provider kind ${JSON.stringify(provider.kind)} must be a non-reserved lowercase kebab-case value`,
      ))
    }
    if (this.providers.has(kind)) {
      throw new Error(ui(`Source Provider ${kind} 已注册`, `Source Provider ${kind} is already registered`))
    }
    if (provider.sources.length === 0) {
      throw new Error(ui(
        `Source Provider ${kind} 必须至少声明一个 Source`,
        `Source Provider ${kind} must declare at least one Source`,
      ))
    }
    const sources = provider.sources.map(source => normalizeSource(kind, source))
    const ids = new Set<string>()
    for (const source of sources) {
      if (ids.has(source.id)) {
        throw new Error(ui(
          `Source Provider ${kind} 重复声明 Source ${source.id}`,
          `Source Provider ${kind} declared Source ${source.id} more than once`,
        ))
      }
      if (this.sourceIds.has(source.id)) {
        throw new Error(ui(
          `Marketplace Source ${source.id} 已由其他 Provider 注册`,
          `Marketplace Source ${source.id} is already registered by another Provider`,
        ))
      }
      ids.add(source.id)
    }
    const registered = Object.freeze({ provider, sources: Object.freeze(sources) })
    const dispose = this.ctx.effect(function* (this: TuiMarketplaceProviderRegistry) {
      this.providers.set(kind, registered)
      for (const id of ids) this.sourceIds.add(id)
      yield () => {
        this.providers.delete(kind)
        for (const id of ids) this.sourceIds.delete(id)
      }
    }.bind(this), `tuiMarketplaceProviders.register(${kind})`)
    return () => void dispose()
  }

  /**
   * Return every Provider-owned read-only source in deterministic registration order.
   * @returns normalized source descriptors owned by active Providers.
   */
  sources(): readonly TuiMarketplaceSource[] {
    return [...this.providers.values()].flatMap(provider => provider.sources)
  }

  /**
   * Dispatch a search to the Provider that owns `source.kind`.
   * @param query - user search text.
   * @param source - registered Provider-owned source to query.
   * @param signal - optional caller cancellation boundary.
   * @returns bounded, normalized installable specs awaiting core validation.
   */
  async search(
    query: string,
    source: TuiMarketplaceSource,
    signal?: AbortSignal,
  ): Promise<readonly TuiMarketplaceDiscovery[]> {
    const registered = this.providers.get(source.kind)
    if (registered === undefined) {
      throw new Error(ui(
        `Source Provider ${JSON.stringify(source.kind)} 未注册或已卸载`,
        `Source Provider ${JSON.stringify(source.kind)} is not registered or has been unloaded`,
      ))
    }
    if (!registered.sources.some(candidate => candidate.id === source.id)) {
      throw new Error(ui(
        `Source ${JSON.stringify(source.id)} 不属于 Provider ${source.kind}`,
        `Source ${JSON.stringify(source.id)} does not belong to Provider ${source.kind}`,
      ))
    }
    const results = await registered.provider.search(query, source, signal)
    return results.slice(0, MAX_PROVIDER_RESULTS).map(result => normalizeDiscovery(result, source.kind))
  }
}

export default TuiMarketplaceProviderRegistry
