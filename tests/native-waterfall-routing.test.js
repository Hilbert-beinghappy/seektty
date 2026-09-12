import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { NativeTerminalApi } from '../src/host/api-compat.ts'

it('answers local questions before an earlier generic Gateway waterfall listener', async () => {
  const ctx = new Context()
  new SessionStore(ctx)
  const agent = { id: 'fixture' }
  ctx.provide('agents')
  ctx.set('agents', { get: () => agent })
  ctx.provide('sessionController')
  ctx.set('sessionController', {
    async *control(signal) {
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    },
  })
  const gateway = vi.fn(async () => ({ answers: [] }))
  ctx.on('user-questions/request', gateway)
  const api = new NativeTerminalApi(ctx)
  const abort = new AbortController()
  const stream = api.openMux({}, abort.signal)[Symbol.asyncIterator]()
  try {
    const nextFrame = stream.next()
    const answer = ctx.waterfall('user-questions/request', { agent,
      questions: [{ id: 'choice', question: 'Choose', options: [{ label: 'Blue' }] }],
    }, gateway)
    const envelope = (await nextFrame).value
    expect(envelope.payload.type).toBe('question/requested')
    expect(gateway).not.toHaveBeenCalled()
    const receipt = await api.respond({ type: 'client-response', rpcId: envelope.rpcId, result: { ok: true,
      value: { sessionId: 'fixture', answer: { answers: [{ id: 'choice', selected: ['Blue'] }] } },
    } })
    expect(receipt).toEqual({ accepted: true })
    await expect(answer).resolves.toEqual({ answers: [{ id: 'choice', selected: ['Blue'] }] })
  } finally {
    abort.abort()
    await stream.return()
    await ctx.fiber.dispose()
  }
})
