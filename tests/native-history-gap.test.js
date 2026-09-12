import { expect, it, vi } from 'vitest'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'

it('keeps the successful opening window when its gap repull fails', async () => {
  const history = vi.fn()
    .mockResolvedValueOnce({ result: { ok: true, value: {
      events: [{ event: { type: 'session/title', seq: 0, time: 1, data: { title: 'Retained history' } } }],
      hasMore: false,
      projections: { asOfSeq: 0, values: { title: 'Retained history' } },
      assistantStream: { revision: 0 },
    } } })
    .mockResolvedValueOnce({ result: { ok: false, error: {
      code: 'session-not-found', message: 'Session disappeared during the gap repull',
      details: { sessionId: 'fixture' },
    } } })
  const session = new Session('fixture', { sessions: { history } }, {})
  session.handleMuxEnvelope('subscribed', { type: 'session/subscribed', sessionId: 'fixture', lastSeq: 1 })

  await session.open()

  expect(history).toHaveBeenCalledTimes(2)
  expect(session.getSnapshot()).toMatchObject({ openState: 'open', openError: null })
  expect(session.projections.faceOf('title').getSnapshot()).toBe('Retained history')
})

it.each([true, false])('keeps the new activation across a late history response (empty: %s)', async empty => {
  const pending = Promise.withResolvers()
  const session = new Session('fixture', { sessions: { history: () => pending.promise } }, {})
  const send = frame => session.handleMuxEnvelope('stream', { type: 'session/assistant-stream', sessionId: 'fixture', frame })
  send({ type: 'start', attemptId: 'old', revision: 1, startedAfterSeq: -1, turn: 1, step: 1 })
  send({ type: 'chunk', attemptId: 'old', revision: 2, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'old' } })
  const opening = session.open()
  send({ type: 'start', attemptId: 'new', revision: 1, startedAfterSeq: 9, turn: 2, step: 1 })
  send({ type: 'chunk', attemptId: 'new', revision: 2, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'new' } })
  pending.resolve({ result: { ok: true, value: { events: [], hasMore: false,
    projections: { asOfSeq: -1, values: {} }, assistantStream: { revision: 10,
      ...(empty ? {} : { activeAttempt: { attemptId: 'old', startedAfterSeq: -1, turn: 1, step: 1, nextIndex: 0, stream: [] } }) },
  } } })
  await opening
  expect(session.getSnapshot().partial?.blocks).toEqual([{ kind: 'text', text: 'new' }])
})
