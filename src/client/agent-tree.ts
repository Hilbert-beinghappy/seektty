/** Docked, presentation-only tree for Harness-owned subagent Sessions. */

import { Key, matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable } from '@mariozechner/pi-tui'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  createAgentTreeState,
  deriveLifecycle,
  orderedAgentChildren,
  reduceAgentTree,
  rootAgentAggregate,
  type AgentLifecycle,
  type AgentNodeView,
  type AgentTreeState,
  type DirectSubagentCatalog,
  type SubagentPresentationCapabilities,
} from './subagent-presentation.ts'
import type { CellRect, HitRegion } from './mouse-hit-map.ts'
import { color } from './theme.ts'
import { ui } from './locale.ts'
import { stripCopyDecorations } from './text-selection.ts'

const DEFAULT_VISIBLE_ROWS = 10
const SUMMARY_CACHE_ENTRIES = 128
const SUMMARY_CACHE_BYTES = 2 * 1024 * 1024
const RENDER_COALESCE_MS = 50

export interface AgentTreeSummary {
  readonly text: string
  readonly bytes?: number
}

export interface AgentTreeDockOptions {
  readonly presentation: SubagentPresentationCapabilities
  readonly requestRender: () => void
  readonly loadSummary?: (sessionId: SessionId, signal: AbortSignal) => Promise<AgentTreeSummary | undefined>
  readonly maxVisibleRows?: number
  readonly now?: () => number
  readonly mouseMode?: () => 'full' | 'native'
}

export interface AgentTreeVisibleRow {
  readonly sessionId: SessionId
  readonly depth: number
  readonly selected: boolean
  readonly expanded: boolean
  readonly expandable: boolean
  readonly node: AgentNodeView
  readonly summary?: string
}

export interface AgentTreeInputResult {
  readonly consumed: boolean
  readonly openedSessionId?: SessionId
  readonly collapsed?: boolean
  readonly requestedOpen?: boolean
}

export interface AgentTreePresentationSnapshot {
  readonly rootSessionId?: SessionId
  readonly open: boolean
  readonly focused: boolean
  readonly selectedSessionId?: SessionId
  readonly expandedSessionIds: readonly SessionId[]
  readonly viewportOffset: number
}

interface CachedSummary {
  readonly value?: AgentTreeSummary
  readonly bytes: number
}

interface PaintedRow {
  readonly sessionId: SessionId
  readonly row: number
  readonly chevronWidth: number
}

function evidence(now: number, revision: number, id: string) {
  return { source: 'catalog' as const, observedAt: now, revision, id }
}

function lifecycleGlyph(lifecycle: AgentLifecycle): string {
  switch (lifecycle) {
    case 'running': return color.brand('●')
    case 'waiting': return color.warning('●')
    case 'completed': return color.success('✓')
    case 'failed': return color.danger('×')
    case 'cancelled': return color.muted('–')
    case 'unavailable': return color.danger('!')
    case 'idle': return color.muted('○')
    case 'unknown': return color.muted('·')
  }
}

function fitRow(text: string, width: number): string {
  if (width <= 0) return ''
  const clipped = truncateToWidth(text, width, '…')
  return `${clipped}${' '.repeat(Math.max(0, width - visibleWidth(clipped)))}`
}

/** Resolve the owning root strictly from public continuation addresses. */
export function owningAgentRoot(
  presentation: SubagentPresentationCapabilities,
  sessionId: SessionId,
): SessionId {
  let cursor = sessionId
  const visited = new Set<SessionId>()
  while (!visited.has(cursor)) {
    visited.add(cursor)
    const continuation = presentation.continuation(cursor)
    if (continuation.support !== 'supported') break
    const parent = continuation.value.address?.parentSessionId
    if (parent === undefined) break
    cursor = parent
  }
  return cursor
}

/**
 * Stateful dock controller. All durable Session and Agent state remains owned by
 * Harness; this object stores only ephemeral presentation state and bounded cache.
 */
export class AgentTreeDock implements Component, Focusable {
  private rootId: SessionId | undefined
  private tree: AgentTreeState | undefined
  private open = false
  private suspended = false
  focused = false
  private selectedId: SessionId | undefined
  private readonly expanded = new Set<SessionId>()
  private composerSnapshot: string | undefined
  private revision = 0
  private rootToken = 0
  private viewportOffset = 0
  private readonly inflight = new Map<string, { readonly token: number; readonly controller: AbortController; readonly promise: Promise<void> }>()
  private readonly summaries = new Map<SessionId, CachedSummary>()
  private readonly statusSubscriptions = new Map<SessionId, () => void>()
  private summaryBytes = 0
  private renderTimer: ReturnType<typeof setTimeout> | undefined
  private paintedRows: readonly PaintedRow[] = []
  private paintedText: readonly string[] = []
  private textSelection: { readonly startRow: number; readonly endRow: number } | undefined

  constructor(private readonly options: AgentTreeDockOptions) {}

  invalidate(): void { /* render derives directly from current presentation state */ }

  owningRootId(): SessionId | undefined { return this.rootId }

  isOpen(): boolean { return this.open }

  isFocused(): boolean { return this.focused }

  suspend(): void {
    this.suspended = true
    this.cancelInflight()
    this.clearStatusSubscriptions()
    this.scheduleRender()
  }

  resume(): void {
    this.suspended = false
    this.scheduleRender()
  }

  /** Show the default collapsed entry without querying children. */
  showCollapsedRoot(owningRootId: SessionId, selectedSessionId?: SessionId): void {
    if (this.rootId === owningRootId) {
      if (selectedSessionId !== undefined) this.selectedId = selectedSessionId
      return
    }
    this.cancelInflight()
    this.clearStatusSubscriptions()
    this.rootToken += 1
    this.rootId = owningRootId
    this.tree = createAgentTreeState(owningRootId)
    this.open = false
    this.focused = false
    this.selectedId = selectedSessionId
    this.expanded.clear()
    this.expanded.add(owningRootId)
    this.viewportOffset = 0
    this.composerSnapshot = undefined
    this.scheduleRender()
  }

  /** Idempotently open the owning root tree, or only focus an already-open tree. */
  openOrFocus(owningRootId: SessionId, selectedSessionId?: SessionId, composerSnapshot?: string): void {
    const focusOnly = this.rootId === owningRootId && this.open
    if (this.rootId !== owningRootId) {
      this.cancelInflight()
      this.clearStatusSubscriptions()
      this.rootToken += 1
      this.rootId = owningRootId
      this.tree = createAgentTreeState(owningRootId)
      this.expanded.clear()
      this.expanded.add(owningRootId)
      this.viewportOffset = 0
      this.composerSnapshot = composerSnapshot
    } else if (this.composerSnapshot === undefined && composerSnapshot !== undefined) {
      this.composerSnapshot = composerSnapshot
    }
    this.open = true
    this.focused = true
    if (selectedSessionId !== undefined && selectedSessionId !== owningRootId) this.selectedId = selectedSessionId
    this.scheduleRender()
    if (!focusOnly) void this.loadChildren(owningRootId, this.rootToken, true)
  }

  /** Collapse to the stable one-line bar without discarding the composer snapshot. */
  collapse(): void {
    this.open = false
    this.focused = false
    this.cancelInflight()
    this.clearStatusSubscriptions()
    this.scheduleRender()
  }

  blur(): void {
    this.focused = false
    this.scheduleRender()
  }

  focus(): void {
    if (this.rootId === undefined) return
    this.focused = true
    this.scheduleRender()
  }

  selectedNode(): AgentNodeView | undefined {
    return this.selectedId === undefined ? undefined : this.tree?.nodes.get(this.selectedId)
  }

  scrollBy(lines: number): void {
    if (!this.open || lines === 0) return
    const total = this.allRows().length
    const capacity = Math.max(1, this.options.maxVisibleRows ?? DEFAULT_VISIBLE_ROWS)
    this.viewportOffset = Math.max(0, Math.min(Math.max(0, total - capacity), this.viewportOffset - Math.trunc(lines)))
    this.scheduleRender()
  }

  node(sessionId: SessionId): AgentNodeView | undefined { return this.tree?.nodes.get(sessionId) }

  snapshotPresentation(): AgentTreePresentationSnapshot {
    return {
      ...(this.rootId === undefined ? {} : { rootSessionId: this.rootId }),
      open: this.open,
      focused: this.focused,
      ...(this.selectedId === undefined ? {} : { selectedSessionId: this.selectedId }),
      expandedSessionIds: [...this.expanded],
      viewportOffset: this.viewportOffset,
    }
  }

  restorePresentation(snapshot: AgentTreePresentationSnapshot): boolean {
    if (snapshot.rootSessionId === undefined || snapshot.rootSessionId !== this.rootId) return false
    this.open = snapshot.open
    this.focused = snapshot.focused
    this.selectedId = snapshot.selectedSessionId
    this.expanded.clear()
    for (const sessionId of snapshot.expandedSessionIds) this.expanded.add(sessionId)
    this.viewportOffset = Math.max(0, snapshot.viewportOffset)
    this.scheduleRender()
    return true
  }

  /** Take the exact composer snapshot captured when the dock first opened. */
  restoreComposerSnapshot(): string | undefined {
    const snapshot = this.composerSnapshot
    this.composerSnapshot = undefined
    return snapshot
  }

  /** Re-read only already visible public status evidence; never opens a transcript. */
  refreshVisibleStatus(): void {
    const tree = this.tree
    if (tree === undefined) return
    let next = tree
    for (const row of this.visibleRows()) {
      const status = this.options.presentation.publicStatusEvidence(row.sessionId)
      if (status.support !== 'supported') continue
      const now = this.now()
      const lifecycle = deriveLifecycle(status.value.evidence).lifecycle
      next = reduceAgentTree(next, {
        kind: 'lifecycle',
        rootSessionId: tree.rootSessionId,
        sessionId: row.sessionId,
        lifecycle,
        evidence: { source: 'session', observedAt: now, id: `status:${row.sessionId}:${now}:${lifecycle}` },
      })
    }
    this.tree = next
    this.scheduleRender()
  }

  visibleRows(limit = this.options.maxVisibleRows ?? DEFAULT_VISIBLE_ROWS, loadDetails = true): AgentTreeVisibleRow[] {
    const tree = this.tree
    const root = this.rootId
    if (tree === undefined || root === undefined || !this.open || this.suspended || limit <= 0) return []
    const flattened: Omit<AgentTreeVisibleRow, 'selected'>[] = []
    const append = (parent: SessionId, depth: number): void => {
      for (const node of orderedAgentChildren(tree, parent)) {
        const summary = this.summaries.get(node.sessionId)?.value?.text
        flattened.push({
          sessionId: node.sessionId,
          depth,
          expanded: this.expanded.has(node.sessionId),
          expandable: node.hasChildren,
          node,
          ...(summary === undefined ? {} : { summary }),
        })
        if (node.hasChildren && this.expanded.has(node.sessionId)) append(node.sessionId, depth + 1)
      }
    }
    append(root, 0)
    const selectedIndex = this.selectedId === undefined
      ? -1
      : flattened.findIndex(row => row.sessionId === this.selectedId)
    if (selectedIndex >= 0) {
      const capacity = Math.max(1, limit)
      if (selectedIndex < this.viewportOffset) this.viewportOffset = selectedIndex
      if (selectedIndex >= this.viewportOffset + capacity) this.viewportOffset = selectedIndex - capacity + 1
    }
    const visible = flattened.slice(this.viewportOffset, this.viewportOffset + limit)
      .map(row => ({ ...row, selected: row.sessionId === this.selectedId }))
    if (loadDetails) {
      for (const row of visible) void this.loadSummary(row.sessionId)
      this.syncStatusSubscriptions(visible.map(row => row.sessionId))
    }
    return visible
  }

  render(width: number): string[] {
    this.paintedRows = []
    this.paintedText = []
    if (this.rootId === undefined || this.suspended || width <= 0) return []
    const aggregate = this.tree === undefined ? undefined : rootAgentAggregate(this.tree)
    const total = aggregate?.discovered ?? 0
    const activity = aggregate === undefined || aggregate.running + aggregate.waiting === 0
      ? ''
      : ui(` · 运行 ${aggregate.running} · 等待 ${aggregate.waiting}`, ` · running ${aggregate.running} · waiting ${aggregate.waiting}`)
    const clickHint = this.options.mouseMode?.() === 'native'
      ? ' · /subagents'
      : ui(' · 点击展开 · /subagents', ' · click to expand · /subagents')
    const bar = `${this.open ? '▾' : '▸'} ${ui('子 Agent', 'Subagents')} ${total.toLocaleString('en-US')}${activity}${this.open ? '' : clickHint}`
    if (!this.open) {
      const collapsed = fitRow(this.focused ? color.brand(bar) : color.muted(bar), width)
      this.paintedText = [stripCopyDecorations(collapsed)]
      return [collapsed]
    }
    const rows = this.visibleRows()
    const rendered = [fitRow(this.focused ? color.brand(bar) : color.muted(bar), width)]
    for (const [index, row] of rows.entries()) {
      const indent = '  '.repeat(row.depth + 1)
      const chevron = row.expandable ? row.expanded ? '▾' : '▸' : ' '
      const label = row.node.label ?? row.sessionId
      const continuation = row.node.continuation === 'available' ? ui('可继续', 'continuable') : undefined
      const suffix = [row.summary, continuation].filter(Boolean).join(' · ')
      const marker = row.selected ? color.brand('❯') : ' '
      rendered.push(fitRow(`${marker}${indent}${chevron} ${lifecycleGlyph(row.node.lifecycle)} ${label}${suffix === '' ? '' : ` · ${suffix}`}`, width))
      this.paintedRows = [...this.paintedRows, {
        sessionId: row.sessionId,
        row: index + 1,
        chevronWidth: visibleWidth(`${marker}${indent}${chevron}`),
      }]
    }
    if (rows.length === 0) {
      const state = this.tree?.rootChildren
      rendered.push(fitRow(state === 'loading' || state === 'unrequested'
        ? ui('  正在读取子 Agent…', '  Loading subagents…')
        : state === 'error'
          ? ui('  子 Agent 目录暂不可用', '  Subagent catalog unavailable')
          : ui('  当前没有子 Agent', '  No subagents yet'), width))
    }
    this.paintedText = rendered.map(stripCopyDecorations)
    return rendered
  }

  /** Full-mode hit regions only. Native mode deliberately returns none. */
  hitRegions(rect: CellRect, mouseMode: 'full' | 'native'): readonly HitRegion[] {
    if (mouseMode === 'native' || this.suspended || rect.height <= 0 || rect.width <= 0 || this.rootId === undefined) return []
    const regions: HitRegion[] = [{
      id: `agent-tree:entry:${this.rootId}`,
      rect: { col: rect.col, row: rect.row, width: rect.width, height: 1 },
      zIndex: 30,
      role: 'button',
      enabled: true,
      activation: 'direct',
      hover: 'highlight',
      action: { kind: 'agent-tree', command: 'bar', sessionId: this.rootId },
    }]
    for (const painted of this.paintedRows) {
      if (painted.row >= rect.height) continue
      regions.push({
        id: `agent:${painted.sessionId}`,
        rect: { col: rect.col, row: rect.row + painted.row, width: rect.width, height: 1 },
        zIndex: 30,
        role: 'text',
        enabled: true,
        activation: 'select',
        hover: 'highlight',
        action: { kind: 'agent-tree', command: 'row', sessionId: painted.sessionId },
      })
      const chevron = this.tree?.nodes.get(painted.sessionId)?.hasChildren === true
      if (chevron) regions.push({
        id: `agent:${painted.sessionId}:chevron`,
        rect: { col: rect.col, row: rect.row + painted.row, width: Math.min(rect.width, painted.chevronWidth + 1), height: 1 },
        zIndex: 31,
        role: 'button',
        enabled: true,
        activation: 'direct',
        hover: 'highlight',
        action: { kind: 'agent-tree', command: 'chevron', sessionId: painted.sessionId },
      })
    }
    return regions
  }

  handleClick(command: 'bar' | 'row' | 'chevron', sessionId: SessionId, count: number): AgentTreeInputResult {
    this.textSelection = undefined
    if (command === 'bar') {
      if (this.open) this.collapse()
      else return { consumed: true, requestedOpen: true }
      return { consumed: true, collapsed: true }
    }
    this.focused = true
    this.select(sessionId)
    if (command === 'chevron') {
      this.toggle(sessionId)
      return { consumed: true }
    }
    return count >= 2 ? { consumed: true, openedSessionId: sessionId } : { consumed: true }
  }

  handleInput(data: string): AgentTreeInputResult {
    if (!this.open || !this.focused) return { consumed: false }
    if (matchesKey(data, Key.escape)) {
      this.collapse()
      return { consumed: true, collapsed: true }
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      const rows = this.allRows()
      if (rows.length === 0) return { consumed: true }
      const current = this.selectedId === undefined ? -1 : rows.findIndex(row => row.sessionId === this.selectedId)
      const delta = matchesKey(data, Key.up) ? -1 : 1
      const index = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + delta))
      this.select(rows[index]?.sessionId)
      return { consumed: true }
    }
    if (matchesKey(data, Key.right)) {
      const node = this.selectedNode()
      if (node?.hasChildren === true) this.expand(node.sessionId)
      return { consumed: true }
    }
    if (matchesKey(data, Key.left)) {
      const node = this.selectedNode()
      if (node !== undefined && this.expanded.delete(node.sessionId)) {
        this.cancelDescendantRequests(node.sessionId)
        this.syncStatusSubscriptions(this.visibleRows(Number.MAX_SAFE_INTEGER, false).map(row => row.sessionId))
        this.scheduleRender()
      } else if (node?.parentSessionId !== undefined && node.parentSessionId !== this.rootId) {
        this.select(node.parentSessionId)
      }
      return { consumed: true }
    }
    if (matchesKey(data, Key.enter) || data === '\r' || data === '\n') {
      return this.selectedId === undefined
        ? { consumed: true }
        : { consumed: true, openedSessionId: this.selectedId }
    }
    return { consumed: false }
  }

  selectText(rect: CellRect, origin: { readonly row: number }, focus: { readonly row: number }): void {
    if (!this.open || this.paintedText.length === 0) return
    const local = (row: number): number => Math.max(0, Math.min(this.paintedText.length - 1, row - rect.row))
    const first = local(origin.row)
    const last = local(focus.row)
    this.textSelection = { startRow: Math.min(first, last), endRow: Math.max(first, last) }
    this.scheduleRender()
  }

  copySelectionText(): string {
    const selection = this.textSelection
    if (selection === undefined) return ''
    return this.paintedText.slice(selection.startRow, selection.endRow + 1).map(line => line.trimEnd()).join('\n')
  }

  dispose(): void {
    this.cancelInflight()
    this.clearStatusSubscriptions()
    if (this.renderTimer !== undefined) clearTimeout(this.renderTimer)
    this.renderTimer = undefined
  }

  private allRows(): AgentTreeVisibleRow[] {
    const oldOffset = this.viewportOffset
    this.viewportOffset = 0
    const rows = this.visibleRows(Number.MAX_SAFE_INTEGER, false)
    this.viewportOffset = oldOffset
    return rows
  }

  private select(sessionId: SessionId | undefined): void {
    if (sessionId === undefined) return
    this.selectedId = sessionId
    this.scheduleRender()
  }

  private toggle(sessionId: SessionId): void {
    if (this.expanded.has(sessionId)) {
      this.expanded.delete(sessionId)
      this.cancelDescendantRequests(sessionId)
      this.syncStatusSubscriptions(this.visibleRows(Number.MAX_SAFE_INTEGER, false).map(row => row.sessionId))
      this.scheduleRender()
    } else {
      this.expand(sessionId)
    }
  }

  private expand(sessionId: SessionId): void {
    this.expanded.add(sessionId)
    this.scheduleRender()
    void this.loadChildren(sessionId, this.rootToken, true)
  }

  async loadChildren(parentSessionId: SessionId, requestToken = this.rootToken, refresh = false): Promise<void> {
    const root = this.rootId
    if (root === undefined || this.tree === undefined || requestToken !== this.rootToken) return
    const requestRevision = this.revision + 1
    const key = `${root}:${parentSessionId}:${requestRevision}`
    const existing = [...this.inflight.entries()].find(([candidate]) => candidate.startsWith(`${root}:${parentSessionId}:`))?.[1]
    if (existing !== undefined) return existing.promise
    this.revision = requestRevision
    const token = this.rootToken
    const controller = new AbortController()
    const loadingEvidence = evidence(this.now(), requestRevision, `children:${root}:${parentSessionId}:${requestRevision}:loading`)
    this.tree = reduceAgentTree(this.tree, {
      kind: 'children-state', rootSessionId: root,
      ...(parentSessionId === root ? {} : { sessionId: parentSessionId }),
      state: 'loading', evidence: loadingEvidence,
    })
    this.scheduleRender()
    const promise = this.options.presentation.listDirectChildren(parentSessionId, { refresh })
      .then((result) => {
        if (controller.signal.aborted || token !== this.rootToken || root !== this.rootId || this.tree === undefined) return
        if (result.support === 'unsupported') {
          this.tree = reduceAgentTree(this.tree, {
            kind: 'children-state', rootSessionId: root,
            ...(parentSessionId === root ? {} : { sessionId: parentSessionId }),
            state: 'unsupported',
            evidence: evidence(this.now(), requestRevision, `children:${root}:${parentSessionId}:${requestRevision}:unsupported`),
          })
          this.scheduleRender()
          return
        }
        const catalog: DirectSubagentCatalog = result.value
        this.tree = reduceAgentTree(this.tree, {
          kind: 'catalog', rootSessionId: root, parentSessionId, catalog,
          evidence: evidence(this.now(), requestRevision, `catalog:${root}:${parentSessionId}:${requestRevision}`),
        })
        if (this.selectedId === undefined) this.selectedId = orderedAgentChildren(this.tree, root)[0]?.sessionId
        this.refreshVisibleStatus()
      }, () => {
        if (controller.signal.aborted || token !== this.rootToken || root !== this.rootId || this.tree === undefined) return
        this.tree = reduceAgentTree(this.tree, {
          kind: 'children-state', rootSessionId: root,
          ...(parentSessionId === root ? {} : { sessionId: parentSessionId }),
          state: 'error',
          evidence: evidence(this.now(), requestRevision, `children:${root}:${parentSessionId}:${requestRevision}:error`),
        })
        this.scheduleRender()
      })
      .finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, { token, controller, promise })
    return promise
  }

  async loadSummary(sessionId: SessionId): Promise<void> {
    if (this.options.loadSummary === undefined || this.summaries.has(sessionId)) return
    const key = `summary:${sessionId}`
    if (this.inflight.has(key)) return this.inflight.get(key)?.promise
    const token = this.rootToken
    const controller = new AbortController()
    const promise = this.options.loadSummary(sessionId, controller.signal).then((value) => {
      if (controller.signal.aborted || token !== this.rootToken) return
      const bytes = value?.bytes ?? (value === undefined ? 0 : Buffer.byteLength(value.text, 'utf8'))
      this.putSummary(sessionId, value === undefined ? { bytes } : { value, bytes })
      this.scheduleRender()
    }, () => undefined).finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, { token, controller, promise })
    return promise
  }

  private putSummary(sessionId: SessionId, cached: CachedSummary): void {
    const previous = this.summaries.get(sessionId)
    if (previous !== undefined) this.summaryBytes -= previous.bytes
    this.summaries.delete(sessionId)
    this.summaries.set(sessionId, cached)
    this.summaryBytes += cached.bytes
    while (this.summaries.size > SUMMARY_CACHE_ENTRIES || this.summaryBytes > SUMMARY_CACHE_BYTES) {
      const oldest = this.summaries.entries().next().value as [SessionId, CachedSummary] | undefined
      if (oldest === undefined) break
      this.summaries.delete(oldest[0])
      this.summaryBytes -= oldest[1].bytes
    }
  }

  private cancelDescendantRequests(sessionId: SessionId): void {
    const descendants = new Set<SessionId>([sessionId])
    let changed = true
    while (changed) {
      changed = false
      for (const node of this.tree?.nodes.values() ?? []) {
        if (node.parentSessionId !== undefined && descendants.has(node.parentSessionId) && !descendants.has(node.sessionId)) {
          descendants.add(node.sessionId)
          changed = true
        }
      }
    }
    for (const [key, request] of this.inflight) {
      if ([...descendants].some(id => key.includes(`:${id}:`) || key === `summary:${id}`)) {
        request.controller.abort()
        this.inflight.delete(key)
      }
    }
  }

  private cancelInflight(): void {
    for (const request of this.inflight.values()) request.controller.abort()
    this.inflight.clear()
  }

  subscribePublicStatus(sessionId: SessionId): void {
    if (!this.open || this.suspended || this.statusSubscriptions.has(sessionId)) return
    const subscribe = this.options.presentation.subscribePublicStatus
    if (subscribe === undefined) return
    this.statusSubscriptions.set(sessionId, () => undefined)
    const result = subscribe(sessionId, (status) => {
      const tree = this.tree
      if (!this.open || tree === undefined || !this.statusSubscriptions.has(sessionId)) return
      const now = this.now()
      const lifecycle = deriveLifecycle(status.evidence).lifecycle
      this.tree = reduceAgentTree(tree, {
        kind: 'lifecycle', rootSessionId: tree.rootSessionId, sessionId,
        lifecycle,
        evidence: { source: 'session', observedAt: now, id: `subscription:${sessionId}:${now}:${lifecycle}` },
      })
      this.scheduleRender()
    })
    if (result.support === 'supported') this.statusSubscriptions.set(sessionId, result.value)
    else this.statusSubscriptions.delete(sessionId)
  }

  private syncStatusSubscriptions(visible: readonly SessionId[]): void {
    const wanted = new Set(visible)
    for (const [sessionId, dispose] of this.statusSubscriptions) {
      if (wanted.has(sessionId)) continue
      dispose()
      this.statusSubscriptions.delete(sessionId)
    }
    for (const sessionId of wanted) this.subscribePublicStatus(sessionId)
  }

  private clearStatusSubscriptions(): void {
    for (const dispose of this.statusSubscriptions.values()) dispose()
    this.statusSubscriptions.clear()
  }

  private now(): number { return this.options.now?.() ?? Date.now() }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) return
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined
      this.options.requestRender()
    }, RENDER_COALESCE_MS)
    this.renderTimer.unref?.()
  }
}
