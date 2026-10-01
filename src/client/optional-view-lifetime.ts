/** Observation lifetime shared by optional rc.2 domain views. No domain state is owned here. */
import { linkedManagementSignal, observeManagement } from './management-lifetime.ts'
import type { OverlayPrompts } from './overlays.ts'
export interface OptionalViewScope { readonly sessionId: string; readonly generation: number; readonly ready: boolean }
export interface OptionalViewSource {
  getSnapshot(): OptionalViewScope
  subscribe(listener: () => void): () => void
}
export class OptionalViewLifetime {
  private pending = false
  constructor(readonly source: OptionalViewSource, private readonly timeoutMs = 15_000) {}
  scope(): OptionalViewScope {
    const state = this.source.getSnapshot()
    if (!state.ready || !state.sessionId) throw new Error('Host disconnected or Session scope unavailable')
    return state
  }
  key(): string { const state = this.scope(); return JSON.stringify([state.generation, state.sessionId]) }
  async run<T>(parent: AbortSignal, work: (signal: AbortSignal) => Promise<T>, dispatched = false): Promise<T> {
    parent.throwIfAborted()
    if (this.pending) throw new Error('Another domain operation is pending')
    const key = this.key()
    const reset = new AbortController()
    const bounded = linkedManagementSignal(parent, this.timeoutMs)
    const check = (): void => {
      const state = this.source.getSnapshot()
      if (!state.ready || JSON.stringify([state.generation, state.sessionId]) !== key) reset.abort()
    }
    const unsubscribe = this.source.subscribe(check)
    const signal = AbortSignal.any([bounded.signal, reset.signal])
    this.pending = true
    try {
      check(); signal.throwIfAborted()
      const value = await observeManagement(work(signal), signal, dispatched)
      check(); signal.throwIfAborted()
      return value
    } finally { this.pending = false; unsubscribe(); bounded.dispose() }
  }
}
export function endpointReason(source: OptionalViewSource, methods: ReadonlySet<string> | undefined, endpoint: string): string | undefined {
  if (!source.getSnapshot().ready) return 'Host disconnected or directory not ready'
  if (methods === undefined) return 'Host capabilities have not been discovered'
  return methods.has(endpoint) ? undefined : `Current Profile does not publish ${endpoint}`
}
export async function domainProgress<T>(overlays: OverlayPrompts, title: string, work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  try { return await overlays.progress({ title, work: (_report, signal) => work(signal) }) }
  catch (error) { await overlays.detail({ title, content: error instanceof Error ? error.message : String(error) }); return undefined }
}

/** Surface scope-loss and capability errors through the existing terminal overlay. */
export async function domainCommand(overlays: OverlayPrompts, title: string, work: () => Promise<void>): Promise<void> {
  try { await work() } catch (error) { await overlays.detail({ title, content: error instanceof Error ? error.message : String(error) }) }
}
