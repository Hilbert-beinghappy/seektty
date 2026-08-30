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
  readonly source?: 'catalog' | 'direct-address'
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
  subscribePublicStatus?(
    sessionId: SessionId,
    listener: (status: SubagentPublicStatus) => void,
  ): SubagentCapabilityResult<() => void>
}

interface SnapshotStoreLike {
  getSnapshot(): unknown
  subscribe?(listener: () => void): () => void
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

function statusEvidence(
  runtime: SubagentRuntimeLike,
  childSessionId: SessionId,
): SubagentCapabilityResult<SubagentPublicStatus> {
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
        evidence.push({ kind: 'catalog-diagnostic', reason: matching.entry.reason, parentSessionId })
      } else {
        evidence.push({ kind: 'catalog-activity', activity: matching.entry.activity, parentSessionId })
      }
      break
    }
  }
  return { support: 'supported', value: { sessionId: childSessionId, evidence } }
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
      if (typeof runtime.list?.getSnapshot !== 'function') {
        return { support: 'unsupported', reason: 'catalog-unavailable' }
      }
      if (options.refresh === true && typeof runtime.refreshSubagents === 'function') {
        await runtime.refreshSubagents(parentSessionId)
      }
      const snapshot = runtimeSnapshot(runtime)
      if (subagentRecord(snapshot?.subagentsByParent) === undefined) {
        if (typeof runtime.subagentAddress !== 'function') {
          return { support: 'unsupported', reason: 'catalog-unavailable' }
        }
        const children: DirectSubagentChild[] = []
        for (const [rawSessionId, rawSummary] of Object.entries(subagentRecord(snapshot?.byId) ?? {})) {
          const childSessionId = sessionId(rawSessionId)
          if (childSessionId === undefined) continue
          const resolved = addressFor(runtime, childSessionId)
          if (resolved.state !== 'ready' || resolved.address.parentSessionId !== parentSessionId) continue
          const summary = subagentRecord(rawSummary)
          const label = typeof summary?.displayTitle === 'string'
            ? summary.displayTitle
            : typeof summary?.title === 'string' ? summary.title : childSessionId
          children.push({
            entry: {
              kind: 'child',
              id: childSessionId,
              activity: summary?.running === true ? 'running' : 'inactive',
              hasChildren: false,
              ...(resolved.address.mode === 'continuable'
                ? { mode: 'continuable', label }
                : { mode: 'one-shot', label }),
            },
            address: resolved.address,
          })
        }
        return {
          support: 'supported',
          value: {
            parentSessionId,
            state: 'ready',
            children,
            unresolved: [],
            source: 'direct-address',
          },
        }
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
      return statusEvidence(runtime, childSessionId)
    },

    subscribePublicStatus(childSessionId, listener) {
      if (typeof runtime.list?.subscribe !== 'function') {
        return { support: 'unsupported', reason: 'session-status-unavailable' }
      }
      const notify = (): void => {
        const next = statusEvidence(runtime, childSessionId)
        if (next.support === 'supported') listener(next.value)
      }
      const dispose = runtime.list.subscribe(notify)
      notify()
      return { support: 'supported', value: dispose }
    },
  }
}

export type AgentChildrenState = 'unrequested' | 'loading' | 'loaded' | 'error' | 'unsupported'
export type AgentDetailState = 'unloaded' | 'summaryLoading' | 'summaryReady' | 'viewOpen' | 'viewError'
export type AgentLifecycle = 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'cancelled' | 'unknown' | 'unavailable'
export type AgentContinuationState = 'unknown' | 'absent' | 'available' | 'stale'
export type SubagentFallbackMode = 'tree' | 'direct-list' | 'generic-tool'

export type SubagentLifecycleEvidence = SubagentPublicStatusEvidence
  | { readonly kind: 'terminal'; readonly status: 'completed' | 'failed' | 'cancelled' }
  | { readonly kind: 'partial-result'; readonly present: true }
  | { readonly kind: 'api-error'; readonly message?: string }
  | { readonly kind: 'creation-returned'; readonly created: true }

export interface DerivedAgentLifecycle {
  readonly lifecycle: AgentLifecycle
  readonly partial: boolean
  readonly apiError: boolean
}

export interface AgentOriginLabel {
  readonly sessionId: SessionId
  readonly label: string
  readonly source: 'catalog' | 'current-session-context'
  readonly breadcrumb: readonly SessionId[]
}

export interface RootAgentAggregate {
  readonly discovered: number
  readonly running: number
  readonly waiting: number
  readonly failed: number
  readonly partial: number
  readonly activityPreview: readonly AgentOriginLabel[]
}

export type PermissionOrigin =
  | { readonly state: 'confirmed'; readonly origin: AgentOriginLabel }
  | { readonly state: 'unconfirmed' }

export interface EvidenceRef {
  readonly source: 'catalog' | 'session' | 'trajectory' | 'continuation' | 'diagnostic'
  readonly observedAt: number
  readonly revision?: number
  readonly id?: string
}

export interface AgentNodeView {
  readonly sessionId: SessionId
  readonly parentSessionId?: SessionId
  readonly label?: string
  readonly hasChildren: boolean
  readonly harnessOrder: number
  readonly createdAt?: number
  readonly children: AgentChildrenState
  readonly detail: AgentDetailState
  readonly lifecycle: AgentLifecycle
  readonly continuation: AgentContinuationState
  readonly partial: boolean
  readonly evidence: readonly EvidenceRef[]
  readonly catalogEvidence?: EvidenceRef
  readonly lifecycleEvidence?: EvidenceRef
  readonly continuationEvidence?: EvidenceRef
  readonly childrenEvidence?: EvidenceRef
  readonly partialEvidence?: EvidenceRef
  readonly issue?: 'cycle' | 'cross-root' | 'parent-conflict' | 'diagnostic'
}

export interface AgentTreeState {
  readonly rootSessionId: SessionId
  readonly rootChildren: AgentChildrenState
  readonly rootChildrenEvidence?: EvidenceRef
  readonly nodes: ReadonlyMap<SessionId, AgentNodeView>
  readonly appliedEvidence: ReadonlySet<string>
}

export type AgentTreeEvent =
  | {
    readonly kind: 'catalog'
    readonly rootSessionId: SessionId
    readonly parentSessionId: SessionId
    readonly catalog: DirectSubagentCatalog
    readonly evidence: EvidenceRef
  }
  | {
    readonly kind: 'children-state'
    readonly rootSessionId: SessionId
    readonly sessionId?: SessionId
    readonly state: AgentChildrenState
    readonly evidence: EvidenceRef
  }
  | {
    readonly kind: 'lifecycle'
    readonly rootSessionId: SessionId
    readonly sessionId: SessionId
    readonly lifecycle: AgentLifecycle
    readonly restart?: boolean
    readonly evidence: EvidenceRef
  }
  | {
    readonly kind: 'continuation'
    readonly rootSessionId: SessionId
    readonly sessionId: SessionId
    readonly continuation: AgentContinuationState
    readonly evidence: EvidenceRef
  }
  | {
    readonly kind: 'partial'
    readonly rootSessionId: SessionId
    readonly sessionId: SessionId
    readonly present: boolean
    readonly evidence: EvidenceRef
  }

const TERMINAL_LIFECYCLES = new Set<AgentLifecycle>(['completed', 'failed', 'cancelled'])

/** Conservative lifecycle derivation: creation and API transport errors are never task terminal evidence. */
export function deriveLifecycle(evidence: readonly SubagentLifecycleEvidence[]): DerivedAgentLifecycle {
  const terminal = [...evidence].reverse().find(item => item.kind === 'terminal')
  const partial = evidence.some(item => item.kind === 'partial-result')
  const apiError = evidence.some(item => item.kind === 'api-error')
  if (terminal?.kind === 'terminal') return { lifecycle: terminal.status, partial, apiError }
  if (evidence.some(item => item.kind === 'pending-interaction')) return { lifecycle: 'waiting', partial, apiError }
  const running = [...evidence].reverse().find(item => item.kind === 'session-running')
  if (running?.kind === 'session-running' && running.running) return { lifecycle: 'running', partial, apiError }
  if (evidence.some(item => item.kind === 'completion-notification')) return { lifecycle: 'completed', partial, apiError }
  if (running?.kind === 'session-running') return { lifecycle: 'idle', partial, apiError }
  const catalog = [...evidence].reverse().find(item => item.kind === 'catalog-activity')
  if (catalog?.kind === 'catalog-activity') {
    return { lifecycle: catalog.activity === 'running' ? 'running' : 'idle', partial, apiError }
  }
  if (evidence.some(item => item.kind === 'catalog-diagnostic')) return { lifecycle: 'unavailable', partial, apiError }
  return { lifecycle: 'unknown', partial, apiError }
}

export function subagentFallbackMode(
  result: SubagentCapabilityResult<DirectSubagentCatalog>,
  genericToolAvailable = false,
): SubagentFallbackMode {
  if (result.support === 'supported') return result.value.source === 'direct-address' ? 'direct-list' : 'tree'
  return genericToolAvailable ? 'generic-tool' : 'direct-list'
}

function breadcrumbFor(state: AgentTreeState, sessionId: SessionId): SessionId[] {
  const result: SessionId[] = [sessionId]
  const visited = new Set<SessionId>(result)
  let parent = state.nodes.get(sessionId)?.parentSessionId
  while (parent !== undefined && !visited.has(parent)) {
    result.unshift(parent)
    if (parent === state.rootSessionId) break
    visited.add(parent)
    parent = state.nodes.get(parent)?.parentSessionId
  }
  if (result[0] !== state.rootSessionId) result.unshift(state.rootSessionId)
  return result
}

/** Label provenance is limited to the catalog or the explicitly active child context. */
export function agentOriginLabel(
  state: AgentTreeState,
  sessionId: SessionId,
  currentSessionId?: SessionId,
): AgentOriginLabel | undefined {
  const node = state.nodes.get(sessionId)
  if (node?.label !== undefined) {
    return { sessionId, label: node.label, source: 'catalog', breadcrumb: breadcrumbFor(state, sessionId) }
  }
  if (currentSessionId === sessionId) {
    return { sessionId, label: sessionId, source: 'current-session-context', breadcrumb: breadcrumbFor(state, sessionId) }
  }
  return undefined
}

export function rootAgentAggregate(state: AgentTreeState): RootAgentAggregate {
  const nodes = [...state.nodes.values()]
  const activityPreview = nodes
    .filter(node => node.lifecycle === 'running' || node.lifecycle === 'waiting')
    .map(node => agentOriginLabel(state, node.sessionId))
    .filter((origin): origin is AgentOriginLabel => origin !== undefined)
    .slice(0, 3)
  return {
    discovered: nodes.length,
    running: nodes.filter(node => node.lifecycle === 'running').length,
    waiting: nodes.filter(node => node.lifecycle === 'waiting').length,
    failed: nodes.filter(node => node.lifecycle === 'failed').length,
    partial: nodes.filter(node => node.partial).length,
    activityPreview,
  }
}

export function permissionOrigin(
  state: AgentTreeState,
  ownerSessionId: SessionId | undefined,
  currentSessionId?: SessionId,
): PermissionOrigin {
  if (ownerSessionId === undefined) return { state: 'unconfirmed' }
  const origin = agentOriginLabel(state, ownerSessionId, currentSessionId)
  return origin === undefined ? { state: 'unconfirmed' } : { state: 'confirmed', origin }
}

export function createAgentTreeState(rootSessionId: SessionId): AgentTreeState {
  return {
    rootSessionId,
    rootChildren: 'unrequested',
    nodes: new Map(),
    appliedEvidence: new Set(),
  }
}

function evidenceKey(event: AgentTreeEvent): string {
  const target = event.kind === 'catalog'
    ? event.parentSessionId
    : event.sessionId ?? event.rootSessionId
  const ref = event.evidence
  const detail = event.kind === 'lifecycle'
    ? event.lifecycle
    : event.kind === 'continuation'
      ? event.continuation
      : event.kind === 'partial'
        ? String(event.present)
        : event.kind === 'children-state'
          ? event.state
          : event.catalog.state
  return ref.id ?? [
    event.kind,
    event.rootSessionId,
    target,
    ref.source,
    ref.revision ?? '',
    ref.observedAt,
    detail,
  ].join(':')
}

function appendEvidence(node: AgentNodeView, evidence: EvidenceRef): readonly EvidenceRef[] {
  const key = evidence.id ?? `${evidence.source}:${evidence.revision ?? ''}:${evidence.observedAt}`
  return node.evidence.some(candidate =>
    (candidate.id ?? `${candidate.source}:${candidate.revision ?? ''}:${candidate.observedAt}`) === key)
    ? node.evidence
    : [...node.evidence, evidence]
}

function newerOrEqual(incoming: EvidenceRef, current: EvidenceRef | undefined): boolean {
  if (current === undefined) return true
  if (incoming.revision !== undefined && current.revision !== undefined) {
    return incoming.revision >= current.revision
  }
  if (incoming.revision !== undefined) return true
  if (current.revision !== undefined) return false
  return incoming.observedAt >= current.observedAt
}

function baseNode(sessionId: SessionId): AgentNodeView {
  return {
    sessionId,
    hasChildren: false,
    harnessOrder: Number.MAX_SAFE_INTEGER,
    children: 'unrequested',
    detail: 'unloaded',
    lifecycle: 'unknown',
    continuation: 'unknown',
    partial: false,
    evidence: [],
  }
}

function mergeLifecycle(
  node: AgentNodeView,
  lifecycle: AgentLifecycle,
  evidence: EvidenceRef,
  restart = false,
): AgentNodeView {
  const history = appendEvidence(node, evidence)
  if (!newerOrEqual(evidence, node.lifecycleEvidence)) return { ...node, evidence: history }
  if (TERMINAL_LIFECYCLES.has(node.lifecycle)
    && !TERMINAL_LIFECYCLES.has(lifecycle)
    && !restart) {
    return { ...node, evidence: history }
  }
  return { ...node, lifecycle, lifecycleEvidence: evidence, evidence: history }
}

function mergeContinuation(
  node: AgentNodeView,
  continuation: AgentContinuationState,
  evidence: EvidenceRef,
): AgentNodeView {
  const history = appendEvidence(node, evidence)
  return newerOrEqual(evidence, node.continuationEvidence)
    ? { ...node, continuation, continuationEvidence: evidence, evidence: history }
    : { ...node, evidence: history }
}

function mergeChildren(
  node: AgentNodeView,
  children: AgentChildrenState,
  evidence: EvidenceRef,
): AgentNodeView {
  const history = appendEvidence(node, evidence)
  return newerOrEqual(evidence, node.childrenEvidence)
    ? { ...node, children, childrenEvidence: evidence, evidence: history }
    : { ...node, evidence: history }
}

function unavailable(node: AgentNodeView, issue: NonNullable<AgentNodeView['issue']>, evidence: EvidenceRef): AgentNodeView {
  const history = appendEvidence(node, evidence)
  if (!newerOrEqual(evidence, node.lifecycleEvidence)) return { ...node, evidence: history }
  return {
    ...node,
    lifecycle: 'unavailable',
    lifecycleEvidence: evidence,
    issue,
    evidence: history,
  }
}

function cycleMembers(nodes: ReadonlyMap<SessionId, AgentNodeView>, start: SessionId): SessionId[] {
  const path: SessionId[] = []
  const positions = new Map<SessionId, number>()
  let cursor: SessionId | undefined = start
  while (cursor !== undefined) {
    const cycleStart = positions.get(cursor)
    if (cycleStart !== undefined) return path.slice(cycleStart)
    positions.set(cursor, path.length)
    path.push(cursor)
    cursor = nodes.get(cursor)?.parentSessionId
  }
  return []
}

function catalogLifecycle(entry: Extract<SubagentListEntry, { kind: 'child' }>): AgentLifecycle {
  return entry.activity === 'running' ? 'running' : 'unknown'
}

function catalogContinuation(entry: Extract<SubagentListEntry, { kind: 'child' }>): AgentContinuationState {
  return entry.mode === 'one-shot' ? 'absent' : 'unknown'
}

/** Pure stable-id reducer. It never creates or mutates Harness Session state. */
export function reduceAgentTree(state: AgentTreeState, event: AgentTreeEvent): AgentTreeState {
  const key = evidenceKey(event)
  if (state.appliedEvidence.has(key)) return state
  const appliedEvidence = new Set(state.appliedEvidence)
  appliedEvidence.add(key)
  const nodes = new Map(state.nodes)

  if (event.rootSessionId !== state.rootSessionId) {
    const sessionIds: SessionId[] = []
    if (event.kind === 'catalog') {
      sessionIds.push(...event.catalog.children.map(child => child.entry.id))
    } else if (event.sessionId !== undefined) {
      sessionIds.push(event.sessionId)
    }
    for (const sessionId of sessionIds) {
      nodes.set(sessionId, unavailable(nodes.get(sessionId) ?? baseNode(sessionId), 'cross-root', event.evidence))
    }
    return { ...state, nodes, appliedEvidence }
  }

  if (event.kind === 'children-state') {
    if (event.sessionId === undefined) {
      return newerOrEqual(event.evidence, state.rootChildrenEvidence)
        ? { ...state, rootChildren: event.state, rootChildrenEvidence: event.evidence, appliedEvidence }
        : { ...state, appliedEvidence }
    }
    nodes.set(event.sessionId, mergeChildren(
      nodes.get(event.sessionId) ?? baseNode(event.sessionId),
      event.state,
      event.evidence,
    ))
    return { ...state, nodes, appliedEvidence }
  }

  if (event.kind === 'lifecycle') {
    nodes.set(event.sessionId, mergeLifecycle(
      nodes.get(event.sessionId) ?? baseNode(event.sessionId),
      event.lifecycle,
      event.evidence,
      event.restart,
    ))
    return { ...state, nodes, appliedEvidence }
  }

  if (event.kind === 'continuation') {
    nodes.set(event.sessionId, mergeContinuation(
      nodes.get(event.sessionId) ?? baseNode(event.sessionId),
      event.continuation,
      event.evidence,
    ))
    return { ...state, nodes, appliedEvidence }
  }

  if (event.kind === 'partial') {
    const current = nodes.get(event.sessionId) ?? baseNode(event.sessionId)
    const history = appendEvidence(current, event.evidence)
    nodes.set(event.sessionId, newerOrEqual(event.evidence, current.partialEvidence)
      ? { ...current, partial: event.present, partialEvidence: event.evidence, evidence: history }
      : { ...current, evidence: history })
    return { ...state, nodes, appliedEvidence }
  }

  const parent = event.parentSessionId
  if (parent === state.rootSessionId) {
    // Root children state lives on the tree root rather than a synthetic node.
  } else {
    const parentNode = nodes.get(parent) ?? baseNode(parent)
    nodes.set(parent, mergeChildren(parentNode, event.catalog.state === 'error'
      ? 'error'
      : event.catalog.state === 'loading'
        ? 'loading'
        : 'loaded', event.evidence))
  }

  for (const [harnessOrder, child] of event.catalog.children.entries()) {
    const entry = child.entry
    const current = nodes.get(entry.id) ?? baseNode(entry.id)
    if (entry.kind === 'diagnostic') {
      nodes.set(entry.id, unavailable({
        ...current,
        parentSessionId: parent,
        harnessOrder,
      }, 'diagnostic', event.evidence))
      continue
    }
    if (entry.id === state.rootSessionId
      || (current.parentSessionId !== undefined && current.parentSessionId !== parent)) {
      nodes.set(entry.id, unavailable(current, 'parent-conflict', event.evidence))
      continue
    }
    const catalogIsCurrent = newerOrEqual(event.evidence, current.catalogEvidence)
    const recovered = catalogIsCurrent && current.issue === 'diagnostic'
      ? (({ issue: _issue, ...rest }) => rest)(current)
      : current
    let next: AgentNodeView = catalogIsCurrent
      ? {
          ...recovered,
          parentSessionId: parent,
          ...(entry.label === undefined ? {} : { label: entry.label }),
          hasChildren: entry.hasChildren,
          harnessOrder,
          catalogEvidence: event.evidence,
          evidence: appendEvidence(recovered, event.evidence),
        }
      : {
          ...recovered,
          ...(recovered.parentSessionId === undefined ? { parentSessionId: parent } : {}),
          evidence: appendEvidence(recovered, event.evidence),
        }
    if (!entry.hasChildren) next = mergeChildren(next, 'loaded', event.evidence)
    next = mergeContinuation(next, catalogContinuation(entry), event.evidence)
    next = mergeLifecycle(next, catalogLifecycle(entry), event.evidence)
    nodes.set(entry.id, next)
  }

  const cycle = cycleMembers(nodes, parent)
  for (const sessionId of cycle) {
    const node = nodes.get(sessionId)
    if (node !== undefined) nodes.set(sessionId, unavailable(node, 'cycle', event.evidence))
  }
  const updateRoot = parent === state.rootSessionId
    && newerOrEqual(event.evidence, state.rootChildrenEvidence)
  const rootChildren: AgentChildrenState = updateRoot
    ? event.catalog.state === 'error'
      ? 'error'
      : event.catalog.state === 'loading'
        ? 'loading'
        : 'loaded'
    : state.rootChildren
  return {
    ...state,
    rootChildren,
    ...(updateRoot ? { rootChildrenEvidence: event.evidence } : {}),
    nodes,
    appliedEvidence,
  }
}

const LIFECYCLE_PRIORITY: Readonly<Record<AgentLifecycle, number>> = {
  running: 0,
  waiting: 1,
  idle: 2,
  completed: 2,
  failed: 2,
  cancelled: 2,
  unknown: 2,
  unavailable: 2,
}

/** Stable sibling order used by tree virtualization and selection. */
export function orderedAgentChildren(
  state: AgentTreeState,
  parentSessionId: SessionId,
): AgentNodeView[] {
  return [...state.nodes.values()]
    .filter(node => node.parentSessionId === parentSessionId)
    .sort((left, right) =>
      LIFECYCLE_PRIORITY[left.lifecycle] - LIFECYCLE_PRIORITY[right.lifecycle]
      || left.harnessOrder - right.harnessOrder
      || (left.createdAt ?? Number.MAX_SAFE_INTEGER) - (right.createdAt ?? Number.MAX_SAFE_INTEGER)
      || left.sessionId.localeCompare(right.sessionId))
}
