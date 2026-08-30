import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-api-remotes/node-client'
import type { SubagentListEntry } from '@deepseek-ai/dsh-client-connection/node-client'

/** Feature-detected support result. Unsupported capabilities never synthesize data. */
export type SubagentCapabilityResult<T> =
  | { readonly support: 'supported'; readonly value: T }
  | { readonly support: 'unsupported'; readonly reason: SubagentUnsupportedReason }

export type SubagentUnsupportedReason =
  | 'catalog-unavailable'
  | 'navigation-unavailable'
  | 'session-status-unavailable'

export interface SubagentCatalogDiagnostic {
  readonly id?: SessionId
  readonly reason: 'invalid-entry' | 'unknown-entry-kind'
}

export interface DirectSubagentChild {
  readonly entry: SubagentListEntry
  readonly address?: SubagentAddress
}

/** One authoritative direct-child catalog projection. */
export interface DirectSubagentCatalog {
  readonly parentSessionId: SessionId
  readonly state: 'unrequested' | 'loading' | 'ready' | 'error'
  readonly errorMessage?: string
  readonly parentAvailable?: boolean
  readonly children: readonly DirectSubagentChild[]
  readonly unresolved: readonly SubagentCatalogDiagnostic[]
}

export interface OpenChildResult {
  readonly opened: boolean
  readonly reason?: 'address-absent' | 'address-invalid'
  readonly address?: SubagentAddress
}

export type SubagentContinuation =
  | { readonly state: 'absent'; readonly address?: SubagentAddress }
  | { readonly state: 'available'; readonly address: Extract<SubagentAddress, { mode: 'continuable' }> }
  | { readonly state: 'stale'; readonly address: Extract<SubagentAddress, { mode: 'continuable' }> }
  | { readonly state: 'unknown'; readonly address?: Extract<SubagentAddress, { mode: 'continuable' }> }

export type SubagentPublicStatusEvidence =
  | { readonly kind: 'catalog-activity'; readonly activity: 'running' | 'inactive'; readonly parentSessionId: SessionId }
  | { readonly kind: 'catalog-diagnostic'; readonly reason: 'corrupt' | 'unsupported' | 'unavailable'; readonly parentSessionId: SessionId }
  | { readonly kind: 'session-running'; readonly running: boolean }
  | { readonly kind: 'pending-interaction'; readonly interaction: 'approval' | 'plan-review' | 'question' }
  | { readonly kind: 'completion-notification'; readonly completed: true }

export interface SubagentPublicStatus {
  readonly sessionId: SessionId
  readonly evidence: readonly SubagentPublicStatusEvidence[]
}

/** The only subagent data surface consumed by SeekTTY presentation code. */
export interface SubagentPresentationCapabilities {
  listDirectChildren(
    parentSessionId: SessionId,
    options?: { readonly refresh?: boolean },
  ): Promise<SubagentCapabilityResult<DirectSubagentCatalog>>
  openChild(sessionId: SessionId): SubagentCapabilityResult<OpenChildResult>
  continuation(sessionId: SessionId): SubagentCapabilityResult<SubagentContinuation>
  publicStatusEvidence(sessionId: SessionId): SubagentCapabilityResult<SubagentPublicStatus>
}

interface SnapshotStoreLike {
  getSnapshot(): unknown
}

/** Minimal public Runtime face. Every member is feature-detected at the call site. */
export interface SubagentRuntimeLike {
  readonly list?: SnapshotStoreLike
  refreshSubagents?(parentSessionId: SessionId): Promise<void>
  openSubagent?(address: SubagentAddress): void
  subagentAddress?(sessionId: SessionId): SubagentAddress | undefined
  binding?(sessionId: SessionId): { readonly session?: { getSnapshot?(): unknown } } | undefined
}

function subagentRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function sessionId(value: unknown): SessionId | undefined {
  return typeof value === 'string' && value !== '' ? value as SessionId : undefined
}

function knownAddress(value: unknown, expectedChild?: SessionId): SubagentAddress | undefined {
  const candidate = subagentRecord(value)
  const parentSessionId = sessionId(candidate?.parentSessionId)
  const childSessionId = sessionId(candidate?.childSessionId)
  const mode = candidate?.mode
  if (parentSessionId === undefined || childSessionId === undefined) return undefined
  if (expectedChild !== undefined && childSessionId !== expectedChild) return undefined
  if (mode !== 'one-shot' && mode !== 'continuable') return undefined
  return { parentSessionId, childSessionId, mode }
}

function parseEntry(value: unknown):
  | { readonly entry: SubagentListEntry }
  | { readonly diagnostic: SubagentCatalogDiagnostic } {
  const candidate = subagentRecord(value)
  const id = sessionId(candidate?.id)
  if (candidate === undefined || id === undefined) {
    return { diagnostic: { ...(id === undefined ? {} : { id }), reason: 'invalid-entry' } }
  }
  if (candidate.kind === 'diagnostic') {
    const reason = candidate.reason
    if (reason !== 'corrupt' && reason !== 'unsupported' && reason !== 'unavailable') {
      return { diagnostic: { id, reason: 'invalid-entry' } }
    }
    return { entry: { kind: 'diagnostic', id, reason } }
  }
  if (candidate.kind !== 'child') {
    return { diagnostic: { id, reason: 'unknown-entry-kind' } }
  }
  const activity = candidate.activity
  const mode = candidate.mode
  if ((activity !== 'running' && activity !== 'inactive')
    || (mode !== 'one-shot' && mode !== 'continuable')
    || typeof candidate.hasChildren !== 'boolean'
    || (mode === 'continuable' && typeof candidate.label !== 'string')) {
    return { diagnostic: { id, reason: 'invalid-entry' } }
  }
  if (mode === 'continuable') {
    return {
      entry: {
        kind: 'child',
        id,
        activity,
        hasChildren: candidate.hasChildren,
        mode,
        label: candidate.label as string,
      },
    }
  }
  return {
    entry: {
      kind: 'child',
      id,
      activity,
      hasChildren: candidate.hasChildren,
      mode,
      ...(typeof candidate.label === 'string' ? { label: candidate.label } : {}),
    },
  }
}

function runtimeSnapshot(runtime: SubagentRuntimeLike): Readonly<Record<string, unknown>> | undefined {
  return typeof runtime.list?.getSnapshot === 'function'
    ? subagentRecord(runtime.list.getSnapshot())
    : undefined
}

function catalogRecord(
  snapshot: Readonly<Record<string, unknown>> | undefined,
  parentSessionId: SessionId,
): Readonly<Record<string, unknown>> | undefined {
  return subagentRecord(subagentRecord(snapshot?.subagentsByParent)?.[parentSessionId])
}

function addressFor(runtime: SubagentRuntimeLike, childSessionId: SessionId):
  | { readonly state: 'absent' }
  | { readonly state: 'invalid' }
  | { readonly state: 'ready'; readonly address: SubagentAddress } {
  if (typeof runtime.subagentAddress !== 'function') return { state: 'absent' }
  const raw = runtime.subagentAddress(childSessionId)
  if (raw === undefined) return { state: 'absent' }
  const address = knownAddress(raw, childSessionId)
  return address === undefined ? { state: 'invalid' } : { state: 'ready', address }
}

function parentAvailability(runtime: SubagentRuntimeLike, address: SubagentAddress): boolean | undefined {
  const binding = typeof runtime.binding === 'function' ? runtime.binding(address.childSessionId) : undefined
  const conversation = subagentRecord(binding?.session?.getSnapshot?.())
  const childState = subagentRecord(conversation?.subagent)
  if (typeof childState?.parentAvailable === 'boolean') return childState.parentAvailable
  const catalog = catalogRecord(runtimeSnapshot(runtime), address.parentSessionId)
  return typeof catalog?.parentAvailable === 'boolean' ? catalog.parentAvailable : undefined
}

/**
 * Adapt the current public dsh Runtime without reading Session files or inferring
 * relationships from tool names. Unknown future fields are deliberately omitted.
 */
export function createSubagentPresentationCapabilities(
  runtime: SubagentRuntimeLike,
): SubagentPresentationCapabilities {
  return {
    async listDirectChildren(parentSessionId, options = {}) {
      if (typeof runtime.list?.getSnapshot !== 'function'
        || typeof runtime.refreshSubagents !== 'function') {
        return { support: 'unsupported', reason: 'catalog-unavailable' }
      }
      if (options.refresh === true) await runtime.refreshSubagents(parentSessionId)
      const snapshot = runtimeSnapshot(runtime)
      if (subagentRecord(snapshot?.subagentsByParent) === undefined) {
        return { support: 'unsupported', reason: 'catalog-unavailable' }
      }
      const catalog = catalogRecord(snapshot, parentSessionId)
      const rawEntries = Array.isArray(catalog?.entries) ? catalog.entries : []
      const children: DirectSubagentChild[] = []
      const unresolved: SubagentCatalogDiagnostic[] = []
      for (const raw of rawEntries) {
        const parsed = parseEntry(raw)
        if ('diagnostic' in parsed) {
          unresolved.push(parsed.diagnostic)
          continue
        }
        const entry = parsed.entry
        const address = entry.kind === 'child'
          ? knownAddress({ parentSessionId, childSessionId: entry.id, mode: entry.mode }, entry.id)
          : undefined
        children.push({
          entry,
          ...(address === undefined ? {} : { address }),
        })
      }
      return {
        support: 'supported',
        value: {
          parentSessionId,
          state: catalog?.state === 'loading' || catalog?.state === 'ready' || catalog?.state === 'error'
            ? catalog.state
            : 'unrequested',
          ...(typeof subagentRecord(catalog?.error)?.message === 'string'
            ? { errorMessage: subagentRecord(catalog?.error)?.message as string }
            : {}),
          ...(typeof catalog?.parentAvailable === 'boolean' ? { parentAvailable: catalog.parentAvailable } : {}),
          children,
          unresolved,
        },
      }
    },

    openChild(childSessionId) {
      if (typeof runtime.openSubagent !== 'function' || typeof runtime.subagentAddress !== 'function') {
        return { support: 'unsupported', reason: 'navigation-unavailable' }
      }
      const resolved = addressFor(runtime, childSessionId)
      if (resolved.state !== 'ready') {
        return {
          support: 'supported',
          value: { opened: false, reason: resolved.state === 'invalid' ? 'address-invalid' : 'address-absent' },
        }
      }
      runtime.openSubagent(resolved.address)
      return { support: 'supported', value: { opened: true, address: resolved.address } }
    },

    continuation(childSessionId) {
      if (typeof runtime.subagentAddress !== 'function') {
        return { support: 'unsupported', reason: 'navigation-unavailable' }
      }
      const resolved = addressFor(runtime, childSessionId)
      if (resolved.state !== 'ready') {
        return {
          support: 'supported',
          value: resolved.state === 'invalid' ? { state: 'unknown' } : { state: 'absent' },
        }
      }
      const address = resolved.address
      if (address.mode === 'one-shot') return { support: 'supported', value: { state: 'absent', address } }
      const available = parentAvailability(runtime, address)
      if (available === true) return { support: 'supported', value: { state: 'available', address } }
      if (available === false) return { support: 'supported', value: { state: 'stale', address } }
      return { support: 'supported', value: { state: 'unknown', address } }
    },

    publicStatusEvidence(childSessionId) {
      const snapshot = runtimeSnapshot(runtime)
      if (snapshot === undefined) {
        return { support: 'unsupported', reason: 'session-status-unavailable' }
      }
      const evidence: SubagentPublicStatusEvidence[] = []
      const summary = subagentRecord(subagentRecord(snapshot.byId)?.[childSessionId])
      if (typeof summary?.running === 'boolean') {
        evidence.push({ kind: 'session-running', running: summary.running })
      }
      const pending = summary?.pendingInteraction
      if (pending === 'approval' || pending === 'plan-review' || pending === 'question') {
        evidence.push({ kind: 'pending-interaction', interaction: pending })
      }
      if (summary?.completed === true) evidence.push({ kind: 'completion-notification', completed: true })

      const catalogs = subagentRecord(snapshot.subagentsByParent)
      if (catalogs !== undefined) {
        for (const [rawParentId, rawCatalog] of Object.entries(catalogs)) {
          const parentSessionId = sessionId(rawParentId)
          if (parentSessionId === undefined) continue
          const entries = subagentRecord(rawCatalog)?.entries
          if (!Array.isArray(entries)) continue
          const matching = entries.map(parseEntry).find((candidate) =>
            'entry' in candidate && candidate.entry.id === childSessionId)
          if (matching === undefined || !('entry' in matching)) continue
          if (matching.entry.kind === 'diagnostic') {
            evidence.push({
              kind: 'catalog-diagnostic',
              reason: matching.entry.reason,
              parentSessionId,
            })
          } else {
            evidence.push({
              kind: 'catalog-activity',
              activity: matching.entry.activity,
              parentSessionId,
            })
          }
          break
        }
      }
      return { support: 'supported', value: { sessionId: childSessionId, evidence } }
    },
  }
}
