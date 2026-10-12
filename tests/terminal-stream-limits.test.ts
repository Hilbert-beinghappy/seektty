import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { NativeTerminalApi, TerminalStream, TerminalStreamOverflowError } from '../src/host/api-compat.ts'

it('preserves FIFO while releasing consumed buffer capacity', async () => {
  const queue = new TerminalStream<number>({ maxItems: 2, maxBytes: 8 })
  const reader = queue[Symbol.asyncIterator]()
  for (let i = 0; i < 500; i += 2) {
    queue.push(i); queue.push(i + 1)
    expect((await reader.next()).value).toBe(i)
    expect((await reader.next()).value).toBe(i + 1)
  }
  queue.close()
  expect((await reader.next()).done).toBe(true)
})
it('fails and discards the whole pending generation on count overflow', async () => {
  const overflow = vi.fn()
  const queue = new TerminalStream<number>({ maxItems: 2, onOverflow: overflow })
  queue.push(1); queue.push(2); queue.push(3); queue.push(4)
  expect(overflow).toHaveBeenCalledOnce()
  await expect(queue[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(TerminalStreamOverflowError)
})
it('limits UTF8 bytes as well as the number of frames', async () => {
  const value = '\u6c49\u6c49'
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
  const queue = new TerminalStream<string>({ maxBytes: bytes })
  queue.push(value)
  const reader = queue[Symbol.asyncIterator]()
  expect((await reader.next()).value).toBe(value)
  queue.push(value + 'x')
  await expect(reader.next()).rejects.toMatchObject({ code: 'TERMINAL_STREAM_OVERFLOW' })
})
it('releases a waiting consumer on abort and fences late producer writes', async () => {
  const queue = new TerminalStream<number>()
  const reader = queue[Symbol.asyncIterator]()
  const pending = reader.next()
  queue.close(); queue.push(1)
  expect((await pending).done).toBe(true)
})
it('refuses a second consumer and closes on consumer return', async () => {
  const queue = new TerminalStream<number>()
  queue.push(1)
  const first = queue[Symbol.asyncIterator]()
  expect((await first.next()).value).toBe(1)
  await expect(queue[Symbol.asyncIterator]().next()).rejects.toThrow('one consumer')
  await first.return(undefined)
  queue.push(2)
  expect((await first.next()).done).toBe(true)
})
it('an actual host-stream storm aborts producers and fails the connection for resync', async () => {
  const ctx = new Context()
  let stopped = false
  let observed: AbortSignal | undefined
  ctx.provide('workspaceController')
  ctx.set('workspaceController', {
    async *follow(signal: AbortSignal) {
      observed = signal
      try {
        yield { type: 'baseline', value: {} }
        if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      } finally { stopped = true }
    },
  } as never)
  const api = new NativeTerminalApi(ctx)
  try {
    const reader = api.openHost({}, new AbortController().signal, () => {
      for (let i = 0; i < 1100; i++) ctx.emit('api-session/status', 'storm' as never, true)
    })[Symbol.asyncIterator]()
    await expect(reader.next()).rejects.toMatchObject({ code: 'TERMINAL_STREAM_OVERFLOW' })
    expect(observed?.aborted).toBe(true)
    expect(stopped).toBe(true)
  } finally { await ctx.fiber.dispose() }
})
