import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import * as inProcess from '../src/host/in-process.ts'

it('preserves streamed request bodies and removes the exact in-process route on disposal', async () => {
  const ctx = new Context()
  const fiber = await ctx.plugin(inProcess)
  try {
    const service = ctx.get('connection')
    if (!(service instanceof inProcess.InProcessConnectionService)) throw new Error('missing in-process connection')
    const remove = service.fetch.register({ path: '/api/file.upload', methods: ['POST'], requestBody: 'streaming',
      fetch: async request => new Response(await request.text()) })
    const handler = service.createSharedFetchHandler('/api')
    const url = new URL('http://in-process.invalid/api/file.upload')
    expect(handler.requestBodyMode({ method: 'POST', url })).toBe('streaming')
    expect(await (await handler.fetch(new Request(url, { method: 'POST', body: 'fixture bytes' }))).text()).toBe('fixture bytes')
    expect((await handler.fetch(new Request(url))).status).toBe(404)
    await remove()
    expect((await handler.fetch(new Request(url, { method: 'POST', body: 'late' }))).status).toBe(404)
  } finally { await fiber.dispose() }
})
