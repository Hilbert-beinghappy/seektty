import { afterEach, expect, it, vi } from 'vitest'
import { Notifier } from '../vendor/client-runtime/client/sessions/notifier.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('coalesces Node stream microtasks while synchronous reads stay current', async () => {
  vi.useFakeTimers(); vi.stubGlobal('requestAnimationFrame', undefined)
  let source = '', snapshot = ''
  const rebuild = vi.fn(() => { snapshot = source })
  const notify = vi.fn()
  const n = new Notifier(rebuild); const stop = n.subscribe(notify)
  for (let i = 0; i < 500; i++) { source += '中😀'; n.markFrameDirty(); await Promise.resolve() }
  expect(notify).not.toHaveBeenCalled()
  n.ensureFresh(); expect(snapshot).toBe(source)
  expect(notify).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(16)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(rebuild).toHaveBeenCalledTimes(1)
  stop()
})

it.each(['markDirty', 'notifyNow'])('publishes terminal state immediately via %s and cancels the obsolete frame', async method => {
  vi.useFakeTimers(); vi.stubGlobal('requestAnimationFrame', undefined)
  let state = 'streaming'; const seen = []
  const n = new Notifier(() => {}); const stop = n.subscribe(() => seen.push(state))
  n.markFrameDirty(); state = 'stopped'; n[method]()
  await Promise.resolve(); expect(seen).toEqual(['stopped'])
  await vi.advanceTimersByTimeAsync(32); expect(seen).toEqual(['stopped'])
  expect(vi.getTimerCount()).toBe(0); stop()
})

it('does not deliver an old session notification to a replacement subscriber', async () => {
  vi.useFakeTimers(); vi.stubGlobal('requestAnimationFrame', undefined)
  const old = new Notifier(() => {}), next = new Notifier(() => {})
  const oldListener = vi.fn(), nextListener = vi.fn()
  const stop = old.subscribe(oldListener); old.markFrameDirty(); stop()
  const stopNext = next.subscribe(nextListener); next.markFrameDirty()
  await vi.advanceTimersByTimeAsync(16)
  expect(oldListener).not.toHaveBeenCalled(); expect(nextListener).toHaveBeenCalledTimes(1)
  stopNext()
})

it('preserves browser frame scheduling', () => {
  const raf = vi.fn(); vi.stubGlobal('requestAnimationFrame', raf)
  const n = new Notifier(() => {}), listener = vi.fn(); const stop = n.subscribe(listener)
  n.markFrameDirty(); n.markFrameDirty()
  expect(raf).toHaveBeenCalledTimes(1); expect(listener).not.toHaveBeenCalled()
  raf.mock.calls[0][0](); expect(listener).toHaveBeenCalledTimes(1); stop()
})
