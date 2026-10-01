/** Both optional carrier disposal and iterator return must be attempted, even on faults. */
import { observeManagement } from './management-lifetime.ts'

export class HostFileStreamCleanupFailure extends AggregateError {
  readonly cleanupUnconfirmed = true
  constructor(errors: readonly unknown[]) {
    super(errors, `Host watch cleanup is unconfirmed: ${errors.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`)
  }
}
export function hostFileCleanupUnconfirmed(error: unknown): boolean {
  return error !== null && typeof error === 'object' && Reflect.get(error, 'cleanupUnconfirmed') === true
}
export async function closeHostFileStream(stream: AsyncIterable<unknown>, iterator?: AsyncIterator<unknown>, timeoutMs = 10_000): Promise<void> {
  const errors: unknown[] = []
  try {
    if ('dispose' in stream && typeof stream.dispose === 'function') await observeManagement(Promise.resolve(stream.dispose()), AbortSignal.timeout(timeoutMs))
  } catch (error) { errors.push(error) }
  finally {
    try {
      const current = iterator ?? stream[Symbol.asyncIterator]()
      if (current.return !== undefined) await observeManagement(Promise.resolve(current.return()), AbortSignal.timeout(timeoutMs))
    } catch (error) { errors.push(error) }
  }
  if (errors.length !== 0) throw new HostFileStreamCleanupFailure(errors)
}
