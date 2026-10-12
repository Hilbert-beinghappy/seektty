import { SessionId } from '@deepseek-ai/dsh-session'
import { vi } from 'vitest'
import type { HostFileOptions, HostFileScope, HostFileText } from '../../src/client/host-file-controller.ts'

export function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
export async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve() }
export function hostFilesFixture() {
  let scope: HostFileScope = { sessionId: SessionId('synthetic-owner'), generation: 1, ready: true, hostWorkspacePath: '/synthetic-remote/workspace' }
  const listeners = new Set<() => void>()
  const source = { getSnapshot: () => scope, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const change = (patch: Partial<HostFileScope>) => { scope = { ...scope, ...patch }; for (const listener of [...listeners]) listener() }
  let version = 'opaque-v1', text = 'remote正文\nsecond', eof = true
  const gates = new Map<string, { available: boolean; reason?: string } | undefined>()
  const calls: string[] = [], feeds: ReturnType<typeof feed>[] = []
  function feed(signal: AbortSignal) {
    const queue: IteratorResult<unknown>[] = []
    let waiter: ReturnType<typeof deferred<IteratorResult<unknown>>> | undefined
    let closed = false, returns = 0
    const push = (value: unknown) => { if (closed) return; const next = { done: false as const, value }; if (waiter) { waiter.resolve(next); waiter = undefined } else queue.push(next) }
    const close = () => { closed = true; waiter?.resolve({ done: true, value: undefined }); signal.removeEventListener('abort', close) }
    signal.addEventListener('abort', close, { once: true })
    return { push, get closed() { return closed }, get returns() { return returns }, stream: { [Symbol.asyncIterator]: () => ({ next: async () => { if (closed) return { done: true, value: undefined }; if (queue.length) return queue.shift()!; waiter = deferred<IteratorResult<unknown>>(); return waiter.promise }, return: async () => { returns++; close(); return { done: true, value: undefined } } }) } }
  }
  const stat = vi.fn<NonNullable<HostFileOptions['files']['stat']>>(async (_id, path) => { calls.push('stat'); return { ok: true, value: { absolutePath: path, version, bytes: 25 } } })
  const read = vi.fn<HostFileOptions['files']['read']>(async (_id, path, range) => { calls.push('read'); const value: HostFileText = { absolutePath: path, version, text, offset: range.offset ?? 1, lines: 2, eof }; return { ok: true, value } })
  const readBytes = vi.fn<NonNullable<HostFileOptions['files']['readBytes']>>(async (_id, path, options) => ({ ok: true, value: { absolutePath: path, version, data: new Uint8Array([0, 255]), offset: options.range?.offset ?? 0, eof: true } }))
  const list = vi.fn<NonNullable<HostFileOptions['files']['list']>>(async () => ({ ok: true, value: { path: '', entries: [{ name: '报告.md', type: 'file' }], truncated: false } }))
  const changes = vi.fn<NonNullable<HostFileOptions['files']['changes']>>(async (_id, _path, signal) => { calls.push('watch'); const channel = feed(signal); feeds.push(channel); return channel.stream })
  const options: HostFileOptions = { source, files: { stat, read, readBytes, list, changes }, capability: method => gates.has(method) ? gates.get(method) : { available: true }, timeoutMs: 100 }
  return { options, source, change, gates, stat, read, readBytes, list, changes, feeds, calls, listeners,
    setFile: (nextVersion: string, nextText = text, nextEof = true) => { version = nextVersion; text = nextText; eof = nextEof } }
}
