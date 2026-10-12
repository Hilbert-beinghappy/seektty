import { expect, it, vi } from 'vitest'
import { WorkspaceFileObserver } from '../src/client/workspace-file-observer.ts'
import { closeHostFileStream } from '../src/client/host-file-stream-lifetime.ts'
import { hostFilesFixture, flush, deferred } from './fixtures/host-files.ts'

it('attempts iterator return after throwing optional disposer, records failure and blocks a successor', async () => {
  const f = hostFilesFixture(); let first = true
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }))
  const dispose = vi.fn(() => { throw new Error('fixture stream dispose failed') })
  const stream = { dispose, [Symbol.asyncIterator]: () => ({ next: async () => first ? (first = false, { done: false, value: { kind: 'ready' } }) : new Promise<IteratorResult<unknown>>(() => {}), return: returned }) }
  f.changes.mockResolvedValueOnce(stream)
  const observer = new WorkspaceFileObserver('报告.md', f.options); await flush()
  expect(observer.getSnapshot().mode).toBe('watching')
  f.change({ ready: false }); f.change({ ready: true, generation: 2 }); await flush()
  expect(returned).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1); expect(f.changes).toHaveBeenCalledTimes(1)
  expect(observer.getSnapshot().reason).toContain('fixture stream dispose failed')
  observer.dispose(); await expect(observer.closed()).rejects.toMatchObject({ cleanupUnconfirmed: true }); expect(f.listeners.size).toBe(0)
})
it('late-open throwing disposer still returns the iterator and keeps cleanup unconfirmed', async () => {
  const f = hostFilesFixture(), pending = deferred<AsyncIterable<unknown>>()
  f.changes.mockImplementationOnce(() => pending.promise)
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }))
  const dispose = vi.fn(() => { throw new Error('fixture late disposer failed') })
  const observer = new WorkspaceFileObserver('报告.md', f.options); await flush(); observer.dispose()
  const late = { dispose, [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: returned }) }
  pending.resolve(late); await flush()
  expect(returned).toHaveBeenCalledTimes(1); await expect(observer.closed()).rejects.toMatchObject({ cleanupUnconfirmed: true })
})
it('both throwing cleanup paths are recorded rather than swallowed', async () => {
  const dispose = vi.fn(() => { throw new Error('dispose failure') })
  const returned = vi.fn(async (): Promise<IteratorResult<unknown>> => { throw new Error('return failure') })
  const stream = { dispose, [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: returned }) }
  await expect(closeHostFileStream(stream, undefined, 20)).rejects.toMatchObject({ cleanupUnconfirmed: true, errors: [expect.objectContaining({ message: 'dispose failure' }), expect.objectContaining({ message: 'return failure' })] })
  expect(returned).toHaveBeenCalledTimes(1)
})
it('uncooperative return is bounded and remains an unconfirmed cleanup', async () => {
  const returned = vi.fn(() => new Promise<IteratorResult<unknown>>(() => {}))
  const stream = { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: returned }) }
  // A live timer keeps this test process alive; AbortSignal.timeout itself is unref'ed.
  const keepAlive = setTimeout(() => {}, 100)
  try { await expect(closeHostFileStream(stream, undefined, 10)).rejects.toMatchObject({ cleanupUnconfirmed: true }); expect(returned).toHaveBeenCalledTimes(1) }
  finally { clearTimeout(keepAlive) }
})
