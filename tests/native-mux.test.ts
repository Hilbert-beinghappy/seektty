import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { NativeTerminalApi } from '../src/host/api-compat.ts'

it.each([true, false])('retains a queue when control precedes subscribed: %s', async controlFirst => {
  const ctx = new Context()
  const store = new SessionStore(ctx)
  const session = store.create(SessionId('fixture'))
  const gate = Promise.withResolvers<void>()
  const items = [{ id: 'queued', placement: 'queued', message: { id: 'queued', content: [{ type: 'text', text: 'pending' }] } }]
  const waitForAbort = (signal: AbortSignal) => new Promise<void>(resolve => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
  ctx.provide('sessionController')
  ctx.set('sessionController', {
    async *follow(_request: unknown, signal: AbortSignal) {
      if (controlFirst) await gate.promise
      yield { type: 'snapshot', header: session.header, cursor: -1, records: [], hasMore: false, projections: { asOfSeq: -1, values: {} } }
      if (!controlFirst) gate.resolve()
      await waitForAbort(signal)
    },
    async *control(signal: AbortSignal) {
      if (!controlFirst) await gate.promise
      yield { type: 'baseline', value: { queues: { fixture: items }, jobs: {}, projections: {} } }
      if (controlFirst) gate.resolve()
      await waitForAbort(signal)
    },
  })
  const api = new NativeTerminalApi(ctx)
  const abort = new AbortController()
  const stream = api.openMux({}, abort.signal)[Symbol.asyncIterator]()
  let pending: unknown[] = []
  let subscribed = false
  try {
    for (let i = 0; i < (controlFirst ? 3 : 2); i++) {
      const frame = (await stream.next()).value?.payload
      if (frame?.type === 'session/subscribed') { subscribed = true; pending = [] }
      if (frame?.type === 'session/queue') pending = frame.items
    }
    expect(subscribed).toBe(true)
    expect(pending).toEqual(items)
  } finally {
    abort.abort()
    await stream.return?.()
    await ctx.fiber.dispose()
  }
})
