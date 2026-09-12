import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { NativeTerminalApi } from '../src/host/api-compat.ts'

it.each(['openHost', 'openMux'])('%s rejects an already cancelled signal before starting readers', async method => {
  const ctx = new Context()
  const api = new NativeTerminalApi(ctx)
  const abort = new AbortController()
  const reason = new Error('cancelled before connection')
  abort.abort(reason)
  try {
    const stream = api[method]({}, abort.signal)[Symbol.asyncIterator]()
    await expect(stream.next()).rejects.toBe(reason)
  } finally {
    await ctx.fiber.dispose()
  }
})
