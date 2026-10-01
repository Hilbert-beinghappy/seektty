/** Bounded UI lifetime around Host work. Cancellation never authorizes a later mutation. */
export class ManagementInterrupted extends Error {
  constructor(readonly dispatched: boolean, reason = 'Operation cancelled or superseded') {
    super(dispatched ? `${reason}; the dispatched Host operation may have completed. Refresh before retrying.` : reason)
    this.name = 'ManagementInterrupted'
  }
}

/** Race only UI observation; underlying unary writes remain Host-owned and are never retried. */
export async function observeManagement<T>(work: Promise<T>, signal: AbortSignal, dispatched = false): Promise<T> {
  if (signal.aborted) {
    // A unary may have synchronously triggered reset before returning its promise.
    // Observe its rejection even though this UI no longer owns its outcome.
    void work.catch(() => {})
    throw new ManagementInterrupted(dispatched)
  }
  let stop: (() => void) | undefined
  const interrupted = new Promise<never>((_, reject) => {
    stop = () => reject(new ManagementInterrupted(dispatched))
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    const value = await Promise.race([work, interrupted])
    if (signal.aborted) throw new ManagementInterrupted(dispatched)
    return value
  } finally {
    if (stop !== undefined) signal.removeEventListener('abort', stop)
  }
}

export function linkedManagementSignal(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController()
  const stop = (): void => controller.abort(parent.reason)
  parent.addEventListener('abort', stop, { once: true })
  if (parent.aborted) stop()
  const timer = setTimeout(() => controller.abort(new Error('Host operation timed out')), timeoutMs)
  return {
    signal: controller.signal,
    dispose: () => { clearTimeout(timer); parent.removeEventListener('abort', stop) },
  }
}
