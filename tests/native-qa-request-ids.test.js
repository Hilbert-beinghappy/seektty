import { expect, it, vi } from 'vitest'
import { AbstractApiClient } from '../vendor/api-contract/fetch/client.js'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'

it('mints a new prompt request ID per explicit send and does not retry a failed transport', async () => {
  const requests = []
  class RecordingClient extends AbstractApiClient {
    async doFetch(_url, options) {
      const request = JSON.parse(options.body)
      requests.push(request)
      if (requests.length === 1) throw new Error('fixture transport unavailable')
      return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { accepted: true } } })
    }
  }
  const api = new RecordingClient()
  const payload = { sessionId: 'qa-request', mode: 'queue', content: [{ type: 'text', text: 'fixture prompt' }] }
  await expect(api.sessions.prompt(payload)).rejects.toThrow('fixture transport unavailable')
  expect(requests).toHaveLength(1)
  await expect(api.sessions.prompt(payload)).resolves.toMatchObject({ result: { ok: true } })
  expect(requests).toHaveLength(2)
  expect(requests[0].rpcId).not.toBe(requests[1].rpcId)
})

it('reconnect resync reloads history without replaying the accepted user prompt', async () => {
  const history = vi.fn(async () => ({ result: { ok: true, value: {
    events: [], hasMore: false, projections: { asOfSeq: -1, values: {} }, assistantStream: { revision: 0 },
  } } }))
  const prompt = vi.fn(async () => ({ result: { ok: true, value: { accepted: true } } }))
  const session = new Session('qa-reconnect', { sessions: { history, prompt } }, {})
  await session.open()
  await session.prompt([{ type: 'text', text: 'fixture prompt' }], 'queue')
  await session.resync()
  expect(history).toHaveBeenCalledTimes(2)
  expect(prompt).toHaveBeenCalledTimes(1)
})
