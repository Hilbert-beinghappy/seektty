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
      yield { type: 'baseline', value: { projections: { fixture: { asOfSeq: -1, values: { inbox: { 'next-turn': items.map(item => item.message), 'next-step': [] } } } } } }
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

it('keeps newer sequenced inbox control when an older follow baseline arrives', async () => {
  const { sessionV4Fixture } = await import('./helpers/session-v4-fixture.ts')
  const f = sessionV4Fixture()
  const ctx = new Context()
  const store = new SessionStore(ctx)
  store.create(f.id)
  const gate = Promise.withResolvers<void>()
  const next = { id: 'new', content: [{ type: 'text', text: 'newer queue' }] }
  const old = { id: 'old', content: [{ type: 'text', text: 'older queue' }] }
  const waitForAbort = (signal: AbortSignal) => new Promise<void>(resolve => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
  const follow: import('@deepseek-ai/dsh-api-session-controller').SessionController['follow'] = async function* (_request, signal) {
    await gate.promise
    yield { ...f.snapshot, records: [], projections: { asOfSeq: 1, values: { inbox: { 'next-turn': [old], 'next-step': [] } } } }
    await waitForAbort(signal)
  }
  const control: import('@deepseek-ai/dsh-api-session-controller').SessionController['control'] = async function* (signal) {
    yield { type: 'baseline', value: { projections: { [f.id]: { asOfSeq: 2, values: { inbox: { 'next-turn': [next], 'next-step': [] } } } } } }
    gate.resolve()
    await waitForAbort(signal)
  }
  ctx.provide('sessionController')
  ctx.set('sessionController', { follow, control })
  const api = new NativeTerminalApi(ctx)
  const abort = new AbortController()
  const stream = api.openMux({}, abort.signal)[Symbol.asyncIterator]()
  let pending: unknown[] = []
  try {
    for (let i = 0; i < 4; i++) {
      const frame = (await stream.next()).value?.payload
      if (frame?.type === 'session/subscribed') pending = []
      if (frame?.type === 'session/queue') pending = frame.items
    }
    expect(pending).toEqual([{ id: 'new', placement: 'queued', message: next }])
  } finally { abort.abort(); await stream.return?.(); await ctx.fiber.dispose() }
})
