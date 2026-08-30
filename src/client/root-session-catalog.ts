import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import type { SubagentPresentationCapabilities } from './subagent-presentation.ts'

export interface RootCatalogSession {
  readonly id: SessionId
  readonly parentId?: SessionId
  readonly origin?: 'subagent'
}

export type RootCatalogSupport = 'lineage' | 'navigation' | 'partial' | 'unsupported'

export type RootCatalogUnresolvedReason =
  | 'missing-parent'
  | 'cycle'
  | 'conflicting-parent'
  | 'navigation-unresolved'
  | 'navigation-unsupported'

export interface RootCatalogUnresolved {
  readonly sessionId: SessionId
  readonly parentSessionId?: SessionId
  readonly reason: RootCatalogUnresolvedReason
}

export interface RootCatalogResult<T extends RootCatalogSession = RootCatalogSession> {
  readonly roots: readonly T[]
  readonly support: RootCatalogSupport
  readonly unresolved: readonly RootCatalogUnresolved[]
  /** Every hidden id has an authoritative Harness parent edge. */
  readonly hidden: readonly SessionId[]
  readonly lineageRevision: string
}

interface ParentEvidence {
  readonly parentSessionId: SessionId
  readonly source: 'lineage' | 'navigation'
}

interface NavigationEvidence {
  readonly edges: ReadonlyMap<SessionId, SessionId>
  readonly unresolved: readonly RootCatalogUnresolved[]
  readonly supported: boolean
}

function uniqueUnresolved(rows: readonly RootCatalogUnresolved[]): RootCatalogUnresolved[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.sessionId}\u0000${row.parentSessionId ?? ''}\u0000${row.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function projectWithEvidence<T extends RootCatalogSession>(
  catalog: readonly T[],
  lineageRevision: string,
  navigation?: NavigationEvidence,
): RootCatalogResult<T> {
  const byId = new Map(catalog.map(row => [row.id, row]))
  const parentEdges = new Map<SessionId, ParentEvidence>()
  const unresolved: RootCatalogUnresolved[] = [...(navigation?.unresolved ?? [])]

  for (const row of catalog) {
    if (row.origin !== 'subagent') continue
    if (row.parentId === undefined || !byId.has(row.parentId)) {
      unresolved.push({
        sessionId: row.id,
        ...(row.parentId === undefined ? {} : { parentSessionId: row.parentId }),
        reason: 'missing-parent',
      })
      continue
    }
    parentEdges.set(row.id, { parentSessionId: row.parentId, source: 'lineage' })
  }

  for (const [childSessionId, parentSessionId] of navigation?.edges ?? []) {
    if (!byId.has(childSessionId)) continue
    if (!byId.has(parentSessionId)) {
      unresolved.push({ sessionId: childSessionId, parentSessionId, reason: 'missing-parent' })
      continue
    }
    const existing = parentEdges.get(childSessionId)
    if (existing !== undefined && existing.parentSessionId !== parentSessionId) {
      parentEdges.delete(childSessionId)
      unresolved.push({ sessionId: childSessionId, parentSessionId, reason: 'conflicting-parent' })
      continue
    }
    parentEdges.set(childSessionId, { parentSessionId, source: existing?.source ?? 'navigation' })
  }

  const invalid = new Set<SessionId>(unresolved
    .filter(row => row.reason === 'conflicting-parent')
    .map(row => row.sessionId))
  for (const start of parentEdges.keys()) {
    const path: SessionId[] = []
    const positions = new Map<SessionId, number>()
    let cursor: SessionId | undefined = start
    while (cursor !== undefined) {
      const cycleStart = positions.get(cursor)
      if (cycleStart !== undefined) {
        for (const member of path.slice(cycleStart)) {
          invalid.add(member)
          unresolved.push({ sessionId: member, reason: 'cycle' })
        }
        break
      }
      positions.set(cursor, path.length)
      path.push(cursor)
      cursor = parentEdges.get(cursor)?.parentSessionId
    }
  }

  const hidden = catalog
    .filter(row => parentEdges.has(row.id) && !invalid.has(row.id))
    .map(row => row.id)
  const hiddenSet = new Set(hidden)
  const hasLineage = [...parentEdges.values()].some(edge => edge.source === 'lineage')
  const hasNavigation = [...parentEdges.values()].some(edge => edge.source === 'navigation')
  const navigationUnresolved = unresolved.some(row => row.reason === 'navigation-unresolved')
  const support: RootCatalogSupport = navigation === undefined
    ? hasLineage ? 'lineage' : 'unsupported'
    : !navigation.supported
      ? hasLineage ? 'lineage' : 'unsupported'
      : navigationUnresolved
        ? hasLineage || hasNavigation ? 'partial' : 'unsupported'
        : hasNavigation ? 'navigation' : hasLineage ? 'lineage' : 'navigation'
  return {
    roots: catalog.filter(row => !hiddenSet.has(row.id)),
    support,
    unresolved: uniqueUnresolved(unresolved),
    hidden,
    lineageRevision,
  }
}

/** Pure root projection using public lineage already present in the catalog. */
export function projectRootSessions<T extends RootCatalogSession>(
  catalog: readonly T[],
  lineageRevision: string,
): RootCatalogResult<T> {
  return projectWithEvidence(catalog, lineageRevision)
}

/** Stable membership/lineage signature used when dsh exposes no catalog revision. */
export function rootCatalogRevision(catalog: readonly RootCatalogSession[]): string {
  return catalog
    .map(row => `${row.id}\u0000${row.parentId ?? ''}\u0000${row.origin ?? ''}`)
    .sort()
    .join('\u0001')
}

function navigationEvidence<T extends RootCatalogSession>(
  catalog: readonly T[],
  capabilities: SubagentPresentationCapabilities,
): NavigationEvidence {
  const edges = new Map<SessionId, SessionId>()
  const unresolved: RootCatalogUnresolved[] = []
  let supported = true
  for (const candidate of catalog) {
    const continuation = capabilities.continuation(candidate.id)
    if (continuation.support === 'unsupported') {
      supported = false
      continue
    }
    const address = continuation.value.address
    if (address !== undefined) {
      edges.set(candidate.id, address.parentSessionId)
    } else if (continuation.value.state === 'unknown') {
      unresolved.push({ sessionId: candidate.id, reason: 'navigation-unresolved' })
    }
  }
  if (!supported && catalog[0] !== undefined) {
    unresolved.push({ sessionId: catalog[0].id, reason: 'navigation-unsupported' })
  }
  return { edges, unresolved, supported }
}

/** Non-blocking projector using only lineage and already-discovered navigation addresses. */
export class RootSessionCatalogProjector {
  async project<T extends RootCatalogSession>(
    catalog: readonly T[],
    lineageRevision: string,
    capabilities: SubagentPresentationCapabilities,
  ): Promise<RootCatalogResult<T>> {
    return projectWithEvidence(catalog, lineageRevision, navigationEvidence(catalog, capabilities))
  }

  clear(): void { /* Projection is state-free; retained for the capability lifecycle contract. */ }
}
