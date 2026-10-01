/** Session management for exactly dsh 0.2.0-rc.2, without owning Session persistence. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceArchiveSessionRequest, WorkspaceArchiveValue, WorkspacePinValue } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { SessionCancelValue } from '@deepseek-ai/dsh-api-session-controller/types'
import { linkedManagementSignal, observeManagement } from './management-lifetime.ts'
import type { OverlayChoice, OverlayPrompts } from './overlays.ts'
import { ui } from './locale.ts'

export type SessionFilter = 'active' | 'all' | 'archived'
export interface BrowserSession {
  readonly id: SessionId
  readonly displayTitle: string
  readonly cwd?: string
  readonly updatedAt: number
  /** Missing means unknown, never idle. */
  readonly running?: boolean
}
export interface SessionBrowserSnapshot {
  readonly sessions: readonly BrowserSession[]
  readonly archivedSessionIds: readonly SessionId[]
  readonly pinnedSessionIds: readonly SessionId[]
  /** Flattened official WorkspaceView.sessionIds in Workspace registry order, when supplied. */
  readonly sessionOrder?: readonly SessionId[]
  /** Only a complete current Host baseline is ready. */
  readonly ready: boolean
  readonly generation: number
}
export interface SessionBrowserSource {
  getSnapshot(): SessionBrowserSnapshot
  subscribe(listener: () => void): () => void
}
/** These are existing published Remote signatures, not new Host APIs. */
export interface SessionBrowserRemote {
  archiveSession(request: WorkspaceArchiveSessionRequest): Promise<RemoteResult<WorkspaceArchiveValue>>
  unarchiveSession(request: { readonly sessionId: SessionId }): Promise<RemoteResult<WorkspaceArchiveValue>>
  pinSession(request: { readonly sessionId: SessionId }): Promise<RemoteResult<WorkspacePinValue>>
  unpinSession(request: { readonly sessionId: SessionId }): Promise<RemoteResult<WorkspacePinValue>>
  cancel(request: { readonly sessionId: SessionId }): Promise<RemoteResult<SessionCancelValue>>
}
export interface SessionBrowserOptions {
  source: SessionBrowserSource
  remote: SessionBrowserRemote
  /** Exact names from the current gateway Remote descriptor directory. undefined = undiscovered. */
  methods(): ReadonlySet<string> | undefined
  open(sessionId: SessionId): void
  timeoutMs?: number
}

function accepted<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
function includesReceipt(ids: unknown, id: SessionId, expected: boolean): void {
  if (!Array.isArray(ids) || !ids.every(item => typeof item === 'string') || ids.includes(id) !== expected) {
    throw new Error('Host returned an invalid or unconfirmed mutation receipt; refresh before retrying')
  }
}

/** Owns only UI filter and one pending management operation; every business value comes from the Host. */
export class SessionBrowserController {
  filter: SessionFilter = 'active'
  private pending = false
  constructor(private readonly options: SessionBrowserOptions) {}

  rows(filter = this.filter): readonly (BrowserSession & { archived: boolean; pinned: boolean })[] {
    const state = this.options.source.getSnapshot()
    if (!state.ready) throw new Error(ui('会话目录尚未就绪或连接已断开', 'Session directory is not ready or the connection is lost'))
    const archived = new Set(state.archivedSessionIds)
    const pins = new Map(state.pinnedSessionIds.map((id, index) => [id, index]))
    const order = new Map((state.sessionOrder ?? []).map((id, index) => [id, index]))
    return state.sessions.filter(row => filter === 'all' || archived.has(row.id) === (filter === 'archived'))
      .map(row => ({ ...row, archived: archived.has(row.id), pinned: pins.has(row.id) }))
      .sort((a, b) => (pins.get(a.id) ?? Infinity) - (pins.get(b.id) ?? Infinity)
        || (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity)
        || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  }

  reason(method: string): string | undefined {
    if (!this.options.source.getSnapshot().ready) return ui('Host 未连接或目录未就绪', 'Host disconnected or directory not ready')
    const methods = this.options.methods()
    if (methods === undefined) return ui('Host 能力尚未确认', 'Host capabilities have not been discovered')
    return methods.has(method) ? undefined : ui(`当前 Profile 未装配 ${method}`, `The current Profile does not publish ${method}`)
  }

  open(id: SessionId): void {
    const row = this.rows('all').find(row => row.id === id)
    if (row === undefined) throw new Error('Session no longer exists')
    if (row.archived) throw new Error('Restore the archived Session before opening it')
    this.options.open(id)
  }

  async mutate(action: 'archive' | 'restore' | 'pin' | 'unpin', id: SessionId, parent: AbortSignal): Promise<void> {
    parent.throwIfAborted()
    if (this.pending) throw new Error('Another Session management operation is still pending')
    const method = `workspace/${action === 'restore' ? 'unarchiveSession' : `${action}Session`}`
    const reason = this.reason(method)
    if (reason !== undefined) throw new Error(reason)
    const generation = this.options.source.getSnapshot().generation
    const lifetime = linkedManagementSignal(parent, this.options.timeoutMs ?? 10_000)
    const signal = lifetime.signal
    const superseded = new AbortController()
    const unsubscribe = this.options.source.subscribe(() => {
      const state = this.options.source.getSnapshot()
      if (!state.ready || state.generation !== generation) superseded.abort()
    })
    const operationSignal = AbortSignal.any([signal, superseded.signal])
    this.pending = true
    try {
      operationSignal.throwIfAborted()
      const row = this.rows('all').find(row => row.id === id)
      if (row === undefined) throw new Error('Session no longer exists')
      if (action === 'archive') {
        if (row.running === undefined) throw new Error('Session running state is unknown; archive refused')
        if (row.running) {
          const cancelReason = this.reason('session/cancel')
          if (cancelReason !== undefined) throw new Error(cancelReason)
          const receipt = accepted(await observeManagement(this.options.remote.cancel({ sessionId: id }), operationSignal, true))
          if (receipt?.accepted !== true) throw new Error('Stop was not confirmed; archive refused')
          await this.waitIdle(id, operationSignal)
        }
        operationSignal.throwIfAborted()
        const current = this.options.source.getSnapshot()
        const currentRow = current.sessions.find(row => row.id === id)
        if (!current.ready || current.generation !== generation || currentRow?.running !== false) {
          throw new Error('Current Session idle state is unavailable or changed; archive refused')
        }
        const archiveReason = this.reason('workspace/archiveSession')
        if (archiveReason !== undefined) throw new Error(archiveReason)
        // stopActivity deliberately omitted: official true does not await stops. Host retains its all-activity gate.
        const receipt = accepted(await observeManagement(this.options.remote.archiveSession({ sessionId: id }), operationSignal, true))
        includesReceipt(receipt?.archivedSessionIds, id, true)
      } else if (action === 'restore') {
        const receipt = accepted(await observeManagement(this.options.remote.unarchiveSession({ sessionId: id }), operationSignal, true))
        includesReceipt(receipt?.archivedSessionIds, id, false)
      } else {
        const receipt = accepted(await observeManagement(this.options.remote[action === 'pin' ? 'pinSession' : 'unpinSession']({ sessionId: id }), operationSignal, true))
        includesReceipt(receipt?.pinnedSessionIds, id, action === 'pin')
      }
    } finally { this.pending = false; unsubscribe(); lifetime.dispose() }
  }

  private waitIdle(id: SessionId, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = (): void => {}
      let finished = false
      const finish = (error?: Error): void => {
        if (finished) return
        finished = true
        unsubscribe(); signal.removeEventListener('abort', cancelled)
        if (error !== undefined) reject(error); else resolve()
      }
      const cancelled = (): void => finish(new Error('Stop completion was not observed; archive refused'))
      const check = (): void => {
        const state = this.options.source.getSnapshot()
        const row = state.sessions.find(row => row.id === id)
        if (!state.ready || row === undefined || row.running === undefined) finish(new Error('Session state became unavailable; archive refused'))
        else if (row.running === false) finish()
      }
      unsubscribe = this.options.source.subscribe(check)
      if (finished) { unsubscribe(); return }
      signal.addEventListener('abort', cancelled, { once: true })
      if (signal.aborted) cancelled(); else check()
    })
  }
}

/** Terminal-reachable /sessions dispatcher; the integrator supplies the existing overlay surface. */
export async function sessionBrowserCommand(controller: SessionBrowserController, args: string, overlays: OverlayPrompts): Promise<void> {
  const filter = args.trim() || controller.filter
  if (filter !== 'active' && filter !== 'all' && filter !== 'archived') throw new Error('Usage: /sessions [active|all|archived]')
  controller.filter = filter
  const choices = (): OverlayChoice[] => controller.rows().map(row => ({
    id: row.id, label: `${row.pinned ? '★ ' : ''}${row.displayTitle}`,
    description: `${row.archived ? ui('已归档', 'Archived') : row.running === true ? ui('运行中', 'Running') : row.running === false ? ui('空闲', 'Idle') : ui('状态未知', 'Unknown state')} · ${row.cwd ?? ''}`,
  }))
  const selected = await overlays.select({ title: ui(`会话 · ${filter}`, `Sessions · ${filter}`), choices: choices(), refreshChoices: async () => ({ choices: choices() }) })
  if (selected === undefined) return
  const row = controller.rows().find(row => row.id === selected.id)
  if (row === undefined) throw new Error('Session disappeared; refresh the directory')
  const actions: OverlayChoice[] = [
    { id: 'open', label: ui('打开', 'Open'), ...(row.archived ? { disabledReason: ui('先恢复归档会话', 'Restore this Session first') } : {}) },
    { id: row.archived ? 'restore' : 'archive', label: row.archived ? ui('恢复', 'Restore') : ui('归档', 'Archive'), ...disabled(controller.reason(`workspace/${row.archived ? 'unarchiveSession' : 'archiveSession'}`)) },
    { id: row.pinned ? 'unpin' : 'pin', label: row.pinned ? ui('取消置顶', 'Unpin') : ui('置顶', 'Pin'), ...disabled(controller.reason(`workspace/${row.pinned ? 'unpinSession' : 'pinSession'}`)) },
  ]
  const action = await overlays.select({ title: row.displayTitle, choices: actions })
  if (action === undefined || action.disabledReason !== undefined) return
  if (action.id === 'open') { controller.open(row.id); return }
  if (action.id !== 'archive' && action.id !== 'restore' && action.id !== 'pin' && action.id !== 'unpin') return
  if (action.id === 'archive' && !await overlays.confirm(ui('归档会话？', 'Archive Session?'), ui('日志会保留。运行中的回合须确认停止；其他活动仍可能阻止归档。', 'The log is retained. A running turn must stop; other active work may still prevent archiving.'), ui('归档', 'Archive'))) return
  const mutation = action.id
  await overlays.progress({ title: action.label, work: async (_report, signal) => controller.mutate(mutation, row.id, signal) })
}
function disabled(reason: string | undefined): { disabledReason?: string } { return reason === undefined ? {} : { disabledReason: reason } }
