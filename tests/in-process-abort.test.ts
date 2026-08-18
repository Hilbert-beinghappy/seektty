import { describe, expect, it } from 'vitest'
import { abortInProcessCall } from '../src/host/in-process.ts'

describe('in-process abort (task 5.4)', () => {
  it('aborts the handler signal instead of only rejecting the wrapper', async () => {
    const controller = new AbortController()
    let handlerAborted = false
    const pending = abortInProcessCall(async (signal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          handlerAborted = true
          reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
        }, { once: true })
      })
    }, controller.signal)
    controller.abort(new Error('stop'))
    await expect(pending).rejects.toThrow('stop')
    expect(handlerAborted).toBe(true)
  })
})
