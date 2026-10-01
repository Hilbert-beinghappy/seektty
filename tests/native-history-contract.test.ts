import { Context } from '@deepseek-ai/cordis'
import type { SessionController, SessionFollowFrame, SessionPageRequest } from '@deepseek-ai/dsh-api-session-controller'
import { expect, it, vi } from 'vitest'
import { NativeTerminalApi } from '../src/host/api-compat.ts'
import { sessionV4Fixture } from './helpers/session-v4-fixture.ts'

it('keeps flat V4 errors through snapshot and page and anchors paging at the loaded cursor', async () => {
  const f = sessionV4Fixture()
  const ctx = new Context()
  const follow = vi.fn<SessionController['follow']>(async function* () { yield f.snapshot })
  const page = vi.fn<SessionController['page']>(async () => f.page)
  ctx.provide('sessionController')
  ctx.set('sessionController', { follow, page })
  const api = new NativeTerminalApi(ctx)
  const signal = new AbortController().signal
  try {
    const initial = await api.readHistory({ sessionId: f.id }, false, signal)
    expect(initial).toMatchObject({ events: f.events.map(event => ({ event })), projections: f.snapshot.projections })
    const older = await api.readHistory({ sessionId: f.id, beforeSeq: 1, maxMessages: 20 }, false, signal)
    expect(older).toMatchObject({ events: f.events.map(event => ({ event })) })
    const expected: SessionPageRequest = { address: { kind: 'session', sessionId: f.id }, throughSeq: 1, beforeSeq: 1, maxMessages: 20 }
    expect(page).toHaveBeenCalledExactlyOnceWith(expected, signal)
    expect(follow).toHaveBeenCalledOnce()
  } finally { await ctx.fiber.dispose() }
})

it('rejects a late cancelled snapshot before updating the pagination cursor', async () => {
  const f = sessionV4Fixture()
  const ctx = new Context()
  const gate = Promise.withResolvers<void>()
  const cancelled = new AbortController()
  const signal = new AbortController().signal
  const follow: SessionController['follow'] = async function* (_request, currentSignal) {
    if (currentSignal === cancelled.signal) {
      await gate.promise
      yield { ...f.snapshot, cursor: 90 } satisfies SessionFollowFrame
    } else yield f.snapshot
  }
  const page = vi.fn<SessionController['page']>(async () => f.page)
  ctx.provide('sessionController')
  ctx.set('sessionController', { follow, page })
  const api = new NativeTerminalApi(ctx)
  try {
    const late = api.readHistory({ sessionId: f.id }, false, cancelled.signal)
    await api.readHistory({ sessionId: f.id }, false, signal)
    cancelled.abort(new Error('switched Session'))
    gate.resolve()
    await expect(late).rejects.toThrow('switched Session')
    await api.readHistory({ sessionId: f.id, beforeSeq: 1 }, false, signal)
    expect(page.mock.calls[0]?.[0].throughSeq).toBe(1)
  } finally { gate.resolve(); await ctx.fiber.dispose() }
})
