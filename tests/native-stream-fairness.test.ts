import { expect, it } from 'vitest'
import { setImmediate as immediate } from 'node:timers/promises'
import { TerminalStream } from '../src/host/api-compat.ts'

it('yields to input before draining a backlog and preserves every event in order', async () => {
  const q = new TerminalStream<number>()
  for (let i = 0; i < 20000; i++) q.push(i)
  q.close()
  const received: number[] = []
  let seenAtInput = -1
  const input = immediate().then(() => { seenAtInput = received.length })
  for await (const value of q) received.push(value)
  await input
  expect(seenAtInput).toBeGreaterThan(0)
  expect(seenAtInput).toBeLessThanOrEqual(128)
  expect(received).toEqual(Array.from({ length: 20000 }, (_, i) => i))
  expect(q.pending).toBe(0); expect(q.metrics.discarded).toBe(0)
})

it('cancels unread old-session work at the next yield', async () => {
  const q = new TerminalStream<number>()
  for (let i = 0; i < 1000; i++) q.push(i)
  const cancellation = immediate().then(() => q.cancel())
  const received: number[] = []
  for await (const value of q) received.push(value)
  await cancellation
  expect(received.length).toBeLessThanOrEqual(128)
  expect(q.metrics.consumed + q.metrics.discarded).toBe(1000)
  q.push(1001); expect(q.pending).toBe(0)
})

it('drains errors in order and releases unread data on consumer return', async () => {
  const q = new TerminalStream<string>()
  q.push('body'); q.push('approval'); q.push('end'); q.close(new Error('transport failed'))
  const received: string[] = []
  await expect((async () => { for await (const value of q) received.push(value) })()).rejects.toThrow('transport failed')
  expect(received).toEqual(['body', 'approval', 'end'])
  const abandoned = new TerminalStream<number>(); abandoned.push(1); abandoned.push(2)
  for await (const value of abandoned) { expect(value).toBe(1); break }
  expect(abandoned.pending).toBe(0); expect(abandoned.metrics.discarded).toBe(1)
})
