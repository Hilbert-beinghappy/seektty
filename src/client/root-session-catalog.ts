import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import type {
  DirectSubagentCatalog,
  SubagentCapabilityResult,
  SubagentPresentationCapabilities,
} from './subagent-presentation.ts'

export interface RootCatalogSession {
  readonly id: SessionId
  readonly parentId?: SessionId
  readonly origin?: 'subagent'
}

export type RootCatalogSupport = 'lineage' | 'direct-query' | 'partial' | 'unsupported'

export type RootCatalogUnresolvedReason =
  | 'missing-parent'
  | 'cycle'
  | 'conflicting-parent'
  | 'query-failed'
  | 'query-unsupported'

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
  readonly source: 'lineage' | 'direct-query'
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
  queriedEdges: ReadonlyMap<SessionId, SessionId> = new Map(),
  queryUnresolved: readonly RootCatalogUnresolved[] = [],
  queried = false,
): RootCatalogResult<T> {
  const byId = new Map(catalog.map(row => [row.id, row]))
  const parentEdges = new Map<SessionId, ParentEvidence>()
  const unresolved: RootCatalogUnresolved[] = [...queryUnresolved]

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

  for (const [childSessionId, parentSessionId] of queriedEdges) {
    if (!byId.has(childSessionId) || !byId.has(parentSessionId)) continue
    const existing = parentEdges.get(childSessionId)
    if (existing !== undefined && existing.parentSessionId !== parentSessionId) {
      parentEdges.delete(childSessionId)
      unresolved.push({ sessionId: childSessionId, parentSessionId, reason: 'conflicting-parent' })
      continue
    }
    parentEdges.set(childSessionId, { parentSessionId, source: existing?.source ?? 'direct-query' })
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
  const successfulQueries = [...parentEdges.values()].some(edge => edge.source === 'direct-query')
  const failedQueries = queryUnresolved.some(row => row.reason === 'query-failed')
  const unsupportedQueries = queryUnresolved.some(row => row.reason === 'query-unsupported')
  const support: RootCatalogSupport = queried
    ? failedQueries
      ? hasLineage || successfulQueries ? 'partial' : 'unsupported'
      : unsupportedQueries
        ? hasLineage ? 'lineage' : 'unsupported'
        : 'direct-query'
    : hasLineage ? 'lineage' : 'unsupported'
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

async function queryDirectEdges<T extends RootCatalogSession>(
  catalog: readonly T[],
  capabilities: SubagentPresentationCapabilities,
  concurrency: number,
): Promise<{
  readonly edges: ReadonlyMap<SessionId, SessionId>
  readonly unresolved: readonly RootCatalogUnresolved[]
}> {
  const edges = new Map<SessionId, SessionId>()
  const conflicts = new Set<SessionId>()
  const unresolved: RootCatalogUnresolved[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < catalog.length) {
      const index = next
      next += 1
      const parent = catalog[index]
      if (parent === undefined) continue
      let result: SubagentCapabilityResult<DirectSubagentCatalog>
      try {
        result = await capabilities.listDirectChildren(parent.id, { refresh: true })
      } catch {
        unresolved.push({ sessionId: parent.id, reason: 'query-failed' })
        continue
      }
      if (result.support === 'unsupported') {
        unresolved.push({ sessionId: parent.id, reason: 'query-unsupported' })
        continue
      }
      if (result.value.state === 'error') {
        unresolved.push({ sessionId: parent.id, reason: 'query-failed' })
        continue
      }
      for (const child of result.value.children) {
        if (child.entry.kind !== 'child') continue
        const existing = edges.get(child.entry.id)
        if (existing !== undefined && existing !== parent.id) {
          edges.delete(child.entry.id)
          conflicts.add(child.entry.id)
          unresolved.push({
            sessionId: child.entry.id,
            parentSessionId: parent.id,
            reason: 'conflicting-parent',
          })
          continue
        }
        if (!conflicts.has(child.entry.id)) edges.set(child.entry.id, parent.id)
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, catalog.length)) },
    worker,
  ))
  return { edges, unresolved }
}

/** Revision-bound async projector with a strict direct-query concurrency cap. */
export class RootSessionCatalogProjector {
  private cachedRevision: string | undefined
  private cachedEvidence: Promise<{
    readonly edges: ReadonlyMap<SessionId, SessionId>
    readonly unresolved: readonly RootCatalogUnresolved[]
  }> | undefined

  async project<T extends RootCatalogSession>(
    catalog: readonly T[],
    lineageRevision: string,
    capabilities: SubagentPresentationCapabilities,
  ): Promise<RootCatalogResult<T>> {
    if (this.cachedRevision === lineageRevision && this.cachedEvidence !== undefined) {
      const evidence = await this.cachedEvidence
      return projectWithEvidence(catalog, lineageRevision, evidence.edges, evidence.unresolved, true)
    }
    const request = queryDirectEdges(catalog, capabilities, 4)
    this.cachedRevision = lineageRevision
    this.cachedEvidence = request
    const evidence = await request
    return projectWithEvidence(catalog, lineageRevision, evidence.edges, evidence.unresolved, true)
  }

  clear(): void {
    this.cachedRevision = undefined
    this.cachedEvidence = undefined
  }
}
