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
