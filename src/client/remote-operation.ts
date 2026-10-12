/** Transient UI operations, tested against published dsh 0.2.0-rc.2 Remote results. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export function remoteValue<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw result.error
  return result.value
}

/** Bounds even a carrier that ignores abort; abandoned results cannot update UI state. */
export class RemoteOperationScope {
  private readonly pending = new Set<AbortController>()
  private closed = false

  cancel(): void {
    for (const controller of this.pending) controller.abort(new Error('Operation cancelled'))
    this.pending.clear()
  }

  dispose(): void { this.closed = true; this.cancel() }

  async run<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (this.closed) throw new Error('Controller disposed')
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid operation deadline')
    const controller = new AbortController()
    this.pending.add(controller)
    const abort = () => controller.abort(signal?.reason ?? new Error('Operation cancelled'))
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
      return await new Promise<T>((resolve, reject) => {
        onAbort = () => reject(controller.signal.reason)
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) { onAbort(); return }
        timer = setTimeout(() => controller.abort(new Error('Operation timed out')), timeoutMs)
        Promise.resolve().then(() => {
          controller.signal.throwIfAborted()
          return work(controller.signal)
        }).then(value => {
          if (!controller.signal.aborted) resolve(value)
        }, reject)
      })
    } finally {
      clearTimeout(timer)
      if (onAbort) controller.signal.removeEventListener('abort', onAbort)
      signal?.removeEventListener('abort', abort)
      this.pending.delete(controller)
    }
  }
}
