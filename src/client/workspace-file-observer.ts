/** One open terminal file page owns one native Host watch generation. No polling/local watch. */
import { observeManagement } from './management-lifetime.ts'
import { closeHostFileStream, hostFileCleanupUnconfirmed } from './host-file-stream-lifetime.ts'
import { HostFileController, hostFileScopeKey, type HostFileOptions, type HostFileText } from './host-file-controller.ts'

export interface WorkspaceFileViewState {
  readonly mode: 'starting' | 'watching' | 'manual' | 'disconnected' | 'closed'
  readonly loading: boolean
  readonly stale: boolean
  readonly page?: HostFileText | undefined
  readonly reason?: string | undefined
  readonly error?: string | undefined
}
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined }
export class WorkspaceFileObserver {
  private readonly files: HostFileController
  private readonly listeners = new Set<() => void>()
  private readonly owner: string
  private readonly unsubscribe: () => void
  private state: WorkspaceFileViewState = { mode: 'starting', loading: false, stale: true }
  private generation = 0
  private readonly lifetime = new AbortController()
  private watch: AbortController | undefined
  private read: AbortController | undefined
  private activeWatch: Promise<void> = Promise.resolve()
  private restart: Promise<void> = Promise.resolve()
  private revision = 0
  private observedVersion: string | undefined
  private watchedPath: string | undefined
  private draining = false
  private requested = false
  private disposed = false
  private cleanupFailure: unknown
  private key = ''
  private ready = false
  private readonly timeoutMs: number
  constructor(readonly path: string, private readonly options: HostFileOptions, parent?: AbortSignal) {
    this.files = new HostFileController(options)
    this.owner = options.source.getSnapshot().sessionId
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.unsubscribe = options.source.subscribe(() => this.sync())
    if (parent !== undefined) { parent.addEventListener('abort', this.close, { once: true }); this.lifetime.signal.addEventListener('abort', () => parent.removeEventListener('abort', this.close), { once: true }) }
    if (parent?.aborted) this.dispose(); else this.sync()
  }
  private readonly close = () => { this.dispose() }
  getSnapshot(): WorkspaceFileViewState { return this.state }
  refreshReason(): string | undefined {
    const reason = this.files.reason('stat') ?? this.files.reason('read')
    if (reason !== undefined) return reason
    try { this.files.path(this.path); return undefined } catch (error) { return message(error) }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private publish(state: WorkspaceFileViewState): void {
    if (this.disposed && state.mode !== 'closed') return
    this.state = state
    for (const listener of this.listeners) listener()
  }
  private sync(): void {
    if (this.disposed) return
    const scope = this.options.source.getSnapshot()
    if (scope.sessionId !== this.owner) { this.dispose(); return }
    const key = hostFileScopeKey(scope)
    if (this.key === key && this.ready === scope.ready) return
    this.key = key; this.ready = scope.ready
    const generation = ++this.generation
    this.observedVersion = undefined
    this.watchedPath = undefined
    this.revision++; this.requested = false
    this.watch?.abort(); this.read?.abort()
    this.publish({ ...this.state, mode: scope.ready ? 'starting' : 'disconnected', loading: false, stale: true,
      ...(scope.ready ? { reason: 'Initializing Host file observation', error: undefined } : { reason: 'Host disconnected; reconnect will reread from start', error: undefined }) })
    this.restart = this.restart.then(async () => {
      await this.activeWatch
      if (this.disposed || generation !== this.generation || !this.ready) return
      if (this.cleanupFailure !== undefined) throw this.cleanupFailure
      this.watch = new AbortController()
      this.activeWatch = this.follow(generation, this.watch)
    }).catch(error => { if (generation === this.generation && !this.disposed) this.publish({ ...this.state, mode: 'manual', reason: `Watch cleanup failed: ${message(error)}; reopen the viewer`, loading: false, stale: true }) })
  }
  private current(generation: number): boolean { return !this.disposed && generation === this.generation && this.options.source.getSnapshot().ready }
  private async follow(generation: number, controller: AbortController): Promise<void> {
    let iterator: AsyncIterator<unknown> | undefined
    let stream: AsyncIterable<unknown> | undefined
    let opening = false
    let openResolved = false
    let initialized = false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const reason = this.files.reason('changes')
      if (reason !== undefined) {
        this.publish({ ...this.state, mode: 'manual', reason: `${reason}; manual refresh available` })
        this.requestRefresh()
        return
      }
      const path = this.files.path(this.path)
      timer = setTimeout(() => controller.abort(new Error('Host watcher did not confirm ready')), this.timeoutMs)
      // Reuse the reported canonical path for watch and content requests. This is a path
      // reference, not a pinned OS handle: a late ancestor replacement can still rebind it.
      // Metadata may resolve before ready; no content read may.
      const identity = await this.files.stat(path, controller.signal)
      if (!this.current(generation)) return
      this.watchedPath = identity.absolutePath
      opening = true
      const opened = this.options.files.changes!(this.options.source.getSnapshot().sessionId, identity.absolutePath, controller.signal).then(async value => {
        openResolved = true
        if (controller.signal.aborted) {
          try {
            await closeHostFileStream(value, undefined, this.timeoutMs)
            this.cleanupFailure = undefined
          } catch (error) { this.cleanupFailure = error }
        }
        return value
      }, error => { openResolved = true; throw error })
      stream = await observeManagement(opened, controller.signal)
      iterator = stream[Symbol.asyncIterator]()
      for (;;) {
        const next = await observeManagement(iterator.next(), controller.signal)
        if (!this.current(generation)) break
        const currentReason = this.files.reason('changes')
        if (currentReason !== undefined) throw new Error(currentReason)
        if (next.done) throw new Error('Host watch ended; refresh manually or reopen')
        const frame = record(next.value)
        if (!initialized) {
          if (frame?.kind !== 'ready') throw new Error('Host watch did not begin with ready')
          initialized = true; clearTimeout(timer); timer = undefined
          this.publish({ ...this.state, mode: 'watching', reason: undefined, error: undefined })
          this.requestRefresh()
          continue
        }
        if (frame?.kind !== 'change') throw new Error('Invalid Host watch frame')
        const change = record(frame.change)
        if (typeof change?.absolutePath !== 'string' || (typeof change.version !== 'string' || change.version.length === 0) && change.absent !== true) throw new Error('Invalid Host file invalidation')
        // Resolve aliases using the successful Host stat/read identity, never local realpath.
        const identity = this.watchedPath
        if (identity !== undefined && change.absolutePath !== identity) throw new Error('Host watch invalidation belongs to another file')
        this.files.path(change.absolutePath)
        if (change.absent === true) {
          this.observedVersion = undefined
          this.revision++; this.requested = false; this.read?.abort()
          this.publish({ ...this.state, page: undefined, loading: false, stale: true, error: 'workspace-file/not-found: Host observed this file was removed' })
        } else if (this.observedVersion !== change.version) {
          this.observedVersion = change.version as string
          if (this.state.page?.version !== change.version || this.state.stale) this.requestRefresh()
        }
      }
    } catch (error) {
      if (hostFileCleanupUnconfirmed(error)) this.cleanupFailure = error
      if (this.current(generation)) {
        this.publish({ ...this.state, mode: 'manual', reason: `${message(controller.signal.reason ?? error)}; manual refresh available`, stale: true })
        if (!initialized) this.requestRefresh()
      }
    } finally {
      clearTimeout(timer)
      controller.abort()
      if (opening && !openResolved) this.cleanupFailure = new Error('Host watch opening outcome is unknown; no successor watch will be opened until cleanup is confirmed')
      if (stream !== undefined) {
        try { await closeHostFileStream(stream, iterator, this.timeoutMs) }
        catch (error) { this.cleanupFailure = error; if (this.current(generation)) this.publish({ ...this.state, mode: 'manual', reason: `Host watch cleanup is unconfirmed: ${message(error)}; reopen the viewer`, stale: true }) }
      }
    }
  }
  private requestRefresh(): void {
    if (this.disposed || !this.ready) return
    this.revision++; this.requested = true; this.read?.abort()
    if (!this.draining) void this.drain()
  }
  private async drain(): Promise<void> {
    this.draining = true
    try {
      while (this.requested && !this.disposed && this.ready) {
        this.requested = false
        const revision = this.revision, generation = this.generation
        const controller = new AbortController(); this.read = controller
        this.publish({ ...this.state, loading: true, stale: true, error: undefined })
        try {
          const stat = await this.files.stat(this.watchedPath ?? this.path, controller.signal)
          const page = await this.files.read(stat.absolutePath, controller.signal, {}, stat.version)
          if (this.current(generation) && revision === this.revision) this.publish({ ...this.state, page, loading: false, stale: false, error: undefined })
        } catch (error) {
          if (this.current(generation) && revision === this.revision) this.publish({ ...this.state, loading: false, stale: true, error: message(error) })
        }
      }
    } finally { this.draining = false }
  }
  /** Explicit user action; no automatic retries on errors or unknown responses. */
  refresh(): void { this.requestRefresh() }
  async nextPage(): Promise<void> {
    const page = this.state.page
    if (page === undefined || page.eof || this.state.stale || this.state.loading || this.disposed) return
    const revision = ++this.revision, generation = this.generation
    this.read?.abort()
    const controller = new AbortController(); this.read = controller
    this.publish({ ...this.state, loading: true })
    try {
      const next = await this.files.read(page.absolutePath, controller.signal, { offset: page.offset + page.lines }, page.version)
      if (this.current(generation) && revision === this.revision) this.publish({ ...this.state, page: next, loading: false, error: undefined })
    } catch (error) { if (this.current(generation) && revision === this.revision) this.publish({ ...this.state, loading: false, stale: true, error: message(error) }) }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.generation++; this.revision++
    this.unsubscribe(); this.lifetime.abort(); this.watch?.abort(); this.read?.abort(); this.files.dispose()
    this.publish({ ...this.state, mode: 'closed', loading: false, stale: true })
    this.listeners.clear()
  }
  /** Join native cleanup before the surface owner destroys its carrier. */
  async closed(): Promise<void> { await this.restart; await this.activeWatch; if (this.cleanupFailure !== undefined) throw this.cleanupFailure }
}
function message(error: unknown): string {
  const code = record(error)?.code
  const detail = error instanceof Error ? error.message : String(error)
  return typeof code === 'string' ? `${code}: ${detail}` : detail
}
