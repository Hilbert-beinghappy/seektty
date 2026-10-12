/** Terminal artifacts/Plan/Review views for dsh 0.2.0-rc.2. No local filesystem reads. */
import { posix, win32 } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OverlayPrompts, OverlayChoice, OverlayNavigation } from './overlays.ts'
import type { HostFilePorts, HostFileMethod } from './host-file-controller.ts'
import { strictFileConfinementReason } from './host-file-controller.ts'
import { WorkspaceFileObserver } from './workspace-file-observer.ts'
import { workspaceFileView } from './workspace-file-view.ts'
import { linkedManagementSignal, observeManagement } from './management-lifetime.ts'
import { artifactJson, artifactRecord, persistedPlanDetail, sessionArtifacts, type ArtifactEvent, type SessionArtifact } from './session-artifacts.ts'
import { ui } from './locale.ts'

export interface ArtifactSnapshot {
  readonly sessionId: SessionId
  readonly generation: number
  readonly ready: boolean
  readonly events: readonly ArtifactEvent[]
  readonly projections: Readonly<Record<string, unknown>>
  /** Canonical cwd carried by the Host Session summary; never process.cwd(). */
  readonly hostWorkspacePath?: string
  readonly hasMoreHistory: boolean
}
export interface ArtifactSource {
  getSnapshot(): ArtifactSnapshot
  subscribe(listener: () => void): () => void
}
/** Exactly the workspaceFiles/read range/result vocabulary; owned by the Host execution world. */
export interface ArtifactFileText {
  readonly absolutePath: string
  readonly version: string
  readonly offset: number
  readonly text: string
  readonly lines: number
  readonly eof: boolean
  readonly bytes?: number
}
export interface ArtifactFileReader extends HostFilePorts {}
/** Existing workspaceChanges service contract, routed through an authenticated Host bridge by E. */
export interface ArtifactReviewReader {
  summary(sessionId: SessionId, seq: number): unknown | undefined
  diff(sessionId: SessionId, seq: number, index: number, signal: AbortSignal): Promise<unknown | undefined>
}
export interface ArtifactViewOptions {
  source: ArtifactSource
  files?: ArtifactFileReader
  review?: ArtifactReviewReader
  /** Current composed descriptor/service checks; undefined is unknown, not supported. */
  capability(name: `workspaceFiles/${HostFileMethod}` | 'workspaceChanges/summary' | 'workspaceChanges/diff'): { readonly available: boolean; readonly reason?: string } | undefined
  /** Existing surface open/copy actions, only invoked after an explicit user gesture. */
  links?: { open?(url: string, signal: AbortSignal): Promise<void>; copy?(text: string): void }
  timeoutMs?: number
  readonly strictConfined?: boolean
}
export type ArtifactViewKind = 'files' | 'plan' | 'trajectory' | 'review'
export interface ArtifactPage { readonly content: string; readonly nextOffset?: number; readonly version?: string }

export class ArtifactViewController {
  private readonly pending = new Set<AbortController>()
  private readonly selected = new Map<string, string>()
  private readonly fileObservers = new Set<WorkspaceFileObserver>()
  private readonly stopObserving: () => void
  private disposed = false
  private scope: string
  constructor(private readonly options: ArtifactViewOptions) {
    this.scope = this.scopeOf(options.source.getSnapshot())
    this.stopObserving = options.source.subscribe(() => {
      const snapshot = options.source.getSnapshot()
      const scope = this.scopeOf(snapshot)
      if (!snapshot.ready || scope !== this.scope) {
        for (const controller of this.pending) controller.abort()
        this.scope = scope
      }
    })
  }
  private scopeOf(snapshot: ArtifactSnapshot): string { return `${snapshot.sessionId}:${snapshot.generation}` }
  private snapshot(): ArtifactSnapshot {
    if (this.disposed) throw new Error('Artifact viewer has been disposed')
    const snapshot = this.options.source.getSnapshot()
    if (!snapshot.ready) throw new Error('Session/Host baseline is unavailable; refresh after reconnecting')
    return snapshot
  }
  scopeId(): string { return this.scopeOf(this.snapshot()) }
  stateDetail(): string { return this.snapshot().hasMoreHistory ? 'Only the loaded history window is shown; load older history to see earlier references.' : 'All loaded Session references are shown.' }
  plan(): string { return persistedPlanDetail(this.snapshot().projections) }
  rows(kind: ArtifactViewKind): readonly SessionArtifact[] {
    const rows = sessionArtifacts(this.snapshot().events)
    return rows.filter(row => kind === 'trajectory' || row.kind === 'unknown'
      || kind === 'files' && (row.kind === 'delivery' || row.kind === 'attachment')
      || kind === 'plan' && row.kind === 'plan'
      || kind === 'review' && row.kind === 'changes')
  }
  selection(kind: ArtifactViewKind): string | undefined { return this.selected.get(`${this.snapshot().sessionId}:${kind}`) }
  select(kind: ArtifactViewKind, id: string): void { this.selected.set(`${this.snapshot().sessionId}:${kind}`, id) }
  reason(name: Parameters<ArtifactViewOptions['capability']>[0]): string | undefined {
    if (name.startsWith('workspaceFiles/')) {
      const confinement = strictFileConfinementReason(this.options.strictConfined)
      if (confinement !== undefined) return confinement
    }
    const capability = this.options.capability(name)
    return capability?.available === true ? undefined : capability?.reason ?? `${name} is absent, disabled, or its Host capability is not confirmed`
  }

  linkReason(action: 'open' | 'copy', id: string): string | undefined {
    const row = this.requireRow(id)
    try { safeArtifactUrl(row.url ?? '') } catch (error) { return error instanceof Error ? error.message : String(error) }
    return this.options.links?.[action] === undefined ? `No ${action} action is attached to this terminal surface` : undefined
  }
  async link(action: 'open' | 'copy', id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const row = this.requireRow(id)
    const reason = this.linkReason(action, id)
    if (reason !== undefined) throw new Error(reason)
    const url = safeArtifactUrl(row.url!)
    if (action === 'copy') this.options.links!.copy!(url)
    else await this.run(signal, (inner) => this.options.links!.open!(url, inner))
  }

  async readFile(id: string, parent: AbortSignal, offset = 1, expectedVersion?: string): Promise<ArtifactPage> {
    const row = this.requireRow(id)
    if (row.path === undefined) throw new Error('This is an opaque attachment/reference, not a workspace file path')
    // The path is preserved in Host coordinates. No node:path resolution against local cwd/HOME.
    const path = artifactHostPath(row.path, this.snapshot().hostWorkspacePath)
    const reason = this.reason('workspaceFiles/read')
    if (reason !== undefined || this.options.files === undefined) throw new Error(reason ?? 'No authenticated workspaceFiles reader is attached')
    if (!Number.isSafeInteger(offset) || offset < 1) throw new Error('Invalid file page offset')
    const files = this.options.files
    return this.run(parent, async (signal, snapshot) => {
      const result = await files.read(snapshot.sessionId, path, { offset, limit: 200 }, signal)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const value = result.value
      if (typeof value.text !== 'string' || typeof value.version !== 'string' || typeof value.absolutePath !== 'string'
        || value.offset !== offset || !Number.isSafeInteger(value.lines) || value.lines < 0 || value.lines > 200 || typeof value.eof !== 'boolean'
        || !value.eof && value.lines === 0) throw new Error('Invalid workspaceFiles/read page; the Host read is not confirmed')
      if (expectedVersion !== undefined && value.version !== expectedVersion) throw new Error('File changed between pages; refresh from the first page')
      return { content: value.text, version: value.version, ...(value.eof ? {} : { nextOffset: offset + value.lines }) }
    })
  }

  /** The existing read-only port keeps its manual viewer; complete Host ports enable live observation. */
  canObserveFile(): boolean { return this.options.files?.stat !== undefined }
  observeFile(id: string, signal: AbortSignal): WorkspaceFileObserver {
    const row = this.requireRow(id)
    if (row.path === undefined || this.options.files === undefined) throw new Error('No Host file reference/port is attached')
    const observer = new WorkspaceFileObserver(row.path, { source: this.options.source, files: this.options.files,
      capability: name => this.options.capability(name), ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      ...(this.options.strictConfined === undefined ? {} : { strictConfined: this.options.strictConfined }) }, signal)
    this.fileObservers.add(observer)
    const stop = observer.subscribe(() => { if (observer.getSnapshot().mode === 'closed') { this.fileObservers.delete(observer); stop() } })
    return observer
  }

  async reviewSummary(id: string, parent: AbortSignal): Promise<ArtifactPage> {
    const row = this.requireRow(id)
    if (row.kind !== 'changes') throw new Error('This reference is not a workspace/changes announcement')
    const reason = this.reason('workspaceChanges/summary')
    if (reason !== undefined || this.options.review === undefined) throw new Error(reason ?? 'No authenticated Review bridge is attached')
    const review = this.options.review
    return this.run(parent, async (_signal, snapshot) => {
      const value = artifactRecord(review.summary(snapshot.sessionId, row.seq))
      if (value === undefined) throw new Error('Review is no longer retained on this Host (disposed Session, cold history, or recorder absent)')
      if (!Array.isArray(value.files) || value.turn !== row.turn || !Number.isSafeInteger(value.total)
        || value.files.some(file => !validChangedFile(file))) throw new Error('Invalid Review summary from Host')
      return { content: artifactJson(value) }
    })
  }

  async reviewDiff(id: string, index: number, parent: AbortSignal): Promise<ArtifactPage> {
    const row = this.requireRow(id)
    if (row.kind !== 'changes') throw new Error('This reference is not a Review announcement')
    const reason = this.reason('workspaceChanges/diff')
    if (reason !== undefined || this.options.review === undefined) throw new Error(reason ?? 'No authenticated Review bridge is attached')
    if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid Review file index')
    const review = this.options.review
    return this.run(parent, async (signal, snapshot) => {
      const summary = artifactRecord(review.summary(snapshot.sessionId, row.seq))
      if (!Array.isArray(summary?.files) || summary.turn !== row.turn || !validChangedFile(summary.files[index])) throw new Error('Review file is unavailable; refresh the summary')
      const value = artifactRecord(await review.diff(snapshot.sessionId, row.seq, index, signal))
      if (value === undefined) throw new Error('Review comparison is no longer retained on this Host')
      if (typeof value.path !== 'string' || typeof value.display !== 'string' || value.path !== artifactRecord(summary.files[index])?.path) throw new Error('Invalid Review comparison')
      if (value.kind === 'binary' || value.kind === 'oversized') return { content: `${value.display}: ${value.kind}; Host provides no text comparison.` }
      if (value.kind !== 'text' || typeof value.before !== 'boolean' || typeof value.after !== 'boolean' || typeof value.coarse !== 'boolean'
        || !Array.isArray(value.hunks) || value.hunks.some(hunk => !validHunk(hunk))) throw new Error('Invalid Review comparison')
      return { content: `${value.display}${value.coarse ? ' · coarse comparison' : ''}\n\n${value.hunks.map(hunk => {
        const item = artifactRecord(hunk)!
        return `@@ -${item.oldStart},${item.oldLines} +${item.newStart},${item.newLines} @@\n${(item.lines as string[]).join('\n')}`
      }).join('\n\n')}` }
    })
  }

  private requireRow(id: string): SessionArtifact {
    const row = sessionArtifacts(this.snapshot().events).find(row => row.id === id)
    if (row === undefined) throw new Error('Reference is no longer in the current Session window; refresh')
    return row
  }
  private async run<T>(parent: AbortSignal, work: (signal: AbortSignal, snapshot: ArtifactSnapshot) => Promise<T>): Promise<T> {
    parent.throwIfAborted()
    const snapshot = this.snapshot()
    const controller = new AbortController()
    this.pending.add(controller)
    const lifetime = linkedManagementSignal(AbortSignal.any([parent, controller.signal]), this.options.timeoutMs ?? 10_000)
    try {
      const value = await observeManagement(work(lifetime.signal, snapshot), lifetime.signal)
      if (this.disposed || !this.options.source.getSnapshot().ready || this.scopeOf(this.options.source.getSnapshot()) !== this.scopeOf(snapshot)) throw new Error('Session/Host changed; stale artifact read discarded')
      return value
    } finally { lifetime.dispose(); this.pending.delete(controller) }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopObserving()
    for (const observer of this.fileObservers) observer.dispose()
    this.fileObservers.clear()
    for (const controller of this.pending) controller.abort()
    this.pending.clear()
  }
}
export function artifactHostPath(path: string, hostWorkspacePath?: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(path)) throw new Error('File reference contains control characters')
  if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)) return path
  if (hostWorkspacePath === undefined || !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(hostWorkspacePath)) throw new Error('Relative file reference requires the authoritative Host workspace path')
  return (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(hostWorkspacePath) ? win32 : posix).resolve(hostWorkspacePath, path)
}

export function safeArtifactUrl(value: string): string {
  if (/[\u0000-\u0020\u007f]/u.test(value)) throw new Error('Presenter URL contains whitespace or control characters')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Presenter URL is invalid') }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' || parsed.username !== '' || parsed.password !== '') throw new Error('Presenter URL requires HTTP(S) without embedded credentials')
  return parsed.href
}

function validChangedFile(value: unknown): boolean {
  const file = artifactRecord(value)
  return file !== undefined && typeof file.path === 'string' && typeof file.display === 'string'
    && Number.isSafeInteger(file.added) && Number.isSafeInteger(file.deleted) && (file.added as number) >= 0 && (file.deleted as number) >= 0
}
function validHunk(value: unknown): boolean {
  const hunk = artifactRecord(value)
  return hunk !== undefined && ['oldStart', 'oldLines', 'newStart', 'newLines'].every(key => Number.isSafeInteger(hunk[key]) && (hunk[key] as number) >= 0)
    && Array.isArray(hunk.lines) && hunk.lines.every(line => typeof line === 'string' && /^[ +\-]/.test(line))
}

/** Integration owns controller lifetime, so display selection survives closing/reopening an overlay. */
export async function artifactViewCommand(controller: ArtifactViewController, kind: ArtifactViewKind, overlays: OverlayPrompts): Promise<void> {
  const choices = (): OverlayChoice[] => [
    ...(kind === 'plan' ? [{ id: '__plan_state__', label: ui('持久计划状态与待办', 'Persisted Plan state and todos') }] : []),
    { id: '__refresh__', label: ui('刷新会话引用', 'Refresh Session references') },
    ...controller.rows(kind).map(row => ({ id: row.id, label: row.title, description: `seq ${row.seq}${row.turn === undefined ? '' : ` · turn ${row.turn}`}` })),
  ]
  for (;;) {
    const scope = controller.scopeId()
    const ensureScope = (): void => { if (controller.scopeId() !== scope) throw new Error('Session/Host changed while the artifact menu was open; reopen the viewer') }
    const selectedId = controller.selection(kind)
    const selected = await overlays.select({ title: kind, detail: controller.stateDetail(), choices: choices(),
      ...(selectedId === undefined ? {} : { initialChoiceId: selectedId }), refreshChoices: async () => ({ choices: choices() }) })
    if (selected === undefined) return
    ensureScope()
    if (selected.id === '__refresh__') continue
    if (selected.id === '__plan_state__') { await overlays.detail({ title: selected.label, content: controller.plan() }); continue }
    controller.select(kind, selected.id)
    const row = controller.rows(kind).find(row => row.id === selected.id)
    if (row === undefined) throw new Error('Reference changed; refresh the viewer')
    if (row.kind === 'link') {
      const action = await overlays.select({ title: row.title, choices: [
        { id: 'record', label: 'View presenter URL' },
        { id: 'copy', label: 'Copy URL', ...disabledReason(controller.linkReason('copy', row.id)) },
        { id: 'open', label: 'Open URL', ...disabledReason(controller.linkReason('open', row.id)) },
      ] })
      if (action === undefined || action.disabledReason !== undefined) continue
      ensureScope()
      if (action.id === 'record') await overlays.detail({ title: row.title, content: row.detail })
      else if (action.id === 'copy' || action.id === 'open') {
        const linkAction = action.id
        await overlays.progress({ title: action.label, work: (_report, signal) => controller.link(linkAction, row.id, signal) })
      }
      continue
    }
    if (row.kind !== 'delivery' && row.kind !== 'changes' && !(row.kind === 'attachment' && row.path !== undefined)) {
      await overlays.detail({ title: row.title, content: row.detail, footer: row.kind === 'attachment' ? 'Opaque Host attachment reference; this view does not download bytes.' : 'Recorded content; approvals are handled by the existing question/approval surface.' })
      continue
    }
    const actions: OverlayChoice[] = [{ id: 'record', label: ui('查看持久记录', 'View durable record') },
      { id: 'read', label: row.kind === 'changes' ? ui('读取官方 Review', 'Read official Review') : ui('读取 Host 文件', 'Read Host file'),
        ...disabledReason(controller.reason(row.kind === 'changes' ? 'workspaceChanges/summary' : 'workspaceFiles/read')
          ?? (row.kind !== 'changes' && controller.canObserveFile() ? controller.reason('workspaceFiles/stat') : undefined)) }]
    const action = await overlays.select({ title: row.title, choices: actions })
    if (action === undefined || action.disabledReason !== undefined) continue
    ensureScope()
    if (action.id === 'record') { await overlays.detail({ title: row.title, content: row.detail }); continue }
    if (action.id !== 'read') continue
    if (row.kind === 'changes') {
      const page = await overlays.progress({ title: row.title, work: (_report, signal) => controller.reviewSummary(row.id, signal) })
      if (page === undefined) continue
      await overlays.detail({ title: row.title, content: page.content })
      const summary = artifactRecord(JSON.parse(page.content))
      const files = Array.isArray(summary?.files) ? summary.files : []
      const file = await overlays.select({ title: 'Review comparisons', choices: files.map((value, index) => ({ id: String(index), label: String(artifactRecord(value)?.display ?? index), ...disabledReason(controller.reason('workspaceChanges/diff')) })) })
      if (file === undefined || file.disabledReason !== undefined) continue
      ensureScope()
      const diff = await overlays.progress({ title: file.label, work: (_report, signal) => controller.reviewDiff(row.id, Number(file.id), signal) })
      if (diff !== undefined) await overlays.detail({ title: file.label, content: diff.content })
    } else {
      if (controller.canObserveFile() && fileNavigation(overlays)) {
        await workspaceFileView(controller.observeFile(row.id, overlays.signal), row.title, overlays)
        continue
      }
      if (controller.canObserveFile() && navigatedFiles(overlays)) {
        await overlays.navigate(async navigation => { await workspaceFileView(controller.observeFile(row.id, navigation.signal), row.title, navigation) })
        continue
      }
      let offset = 1
      let version: string | undefined
      for (;;) {
        const page = await overlays.progress({ title: row.title, work: (_report, signal) => controller.readFile(row.id, signal, offset, version) })
        if (page === undefined) break
        await overlays.detail({ title: `${row.title} · line ${offset}`, content: page.content })
        if (page.nextOffset === undefined) break
        const next = await overlays.select({ title: row.title, choices: [{ id: 'next', label: 'Next page' }, { id: 'refresh', label: 'Refresh from start' }] })
        if (next === undefined) break
        ensureScope()
        offset = next.id === 'refresh' ? 1 : page.nextOffset
        version = next.id === 'refresh' ? undefined : page.version
      }
    }
  }
}
interface NavigatedFiles extends OverlayPrompts { navigate(run: (navigation: OverlayNavigation<void>) => Promise<void>): Promise<void | undefined> }
function navigatedFiles(overlays: OverlayPrompts): overlays is NavigatedFiles { return 'navigate' in overlays && typeof overlays.navigate === 'function' }
function fileNavigation(overlays: OverlayPrompts): overlays is OverlayNavigation<void> {
  return 'selectPage' in overlays && typeof overlays.selectPage === 'function' && 'updateChoices' in overlays && typeof overlays.updateChoices === 'function'
    && 'signal' in overlays && overlays.signal instanceof AbortSignal
}
function disabledReason(reason: string | undefined): { disabledReason?: string } { return reason === undefined ? {} : { disabledReason: reason } }
