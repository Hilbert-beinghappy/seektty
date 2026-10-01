import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionController } from '../vendor/client-connection/client/connection.js'

const controllers = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function stream(signal, onOpen, autoOpen, ignoreAbort) {
  const queue = []
  let wake
  let closed = false
  const end = () => { closed = true; wake?.() }
  if (!ignoreAbort) signal.addEventListener('abort', end, { once: true })
  return {
    onOpen, signal, end,
    push: frame => { queue.push(frame); wake?.() },
    async *[Symbol.asyncIterator]() {
      if (autoOpen) onOpen()
      while (!closed) {
        if (queue.length) yield queue.shift()
        else await new Promise(resolve => { wake = resolve })
      }
    },
  }
}
function fixture({ autoOpen = false, ignoreAbort = false, describe } = {}) {
  const channels = []
  const states = []
  const connected = vi.fn()
  const envelopes = vi.fn()
  const open = (_request, signal, onOpen) => {
    const channel = stream(signal, onOpen, autoOpen, ignoreAbort)
    channels.push(channel)
    return channel
  }
  const api = {
    events: { mux: open, host: open },
    host: { describe: describe ?? vi.fn(async () => ({ result: { ok: true, value: { version: 'fixture' } } })) },
  }
  const controller = new ConnectionController(api, { onConnected: connected, onStateChange: state => states.push(state), onMuxEnvelope: envelopes }, {
    streamOpenTimeoutMs: 20, backoffBaseMs: 200, backoffMaxMs: 200,
  })
  controllers.push(controller)
  return { api, controller, channels, states, connected, envelopes }
}
describe('retained carrier readiness and generation ownership', () => {
  it('never connects from describe alone and rejects late onOpen after timeout', async () => {
    const f = fixture({ ignoreAbort: true })
    f.controller.start()
    await vi.advanceTimersByTimeAsync(21)
    expect(f.states).toEqual(['reconnecting'])
    expect(f.connected).not.toHaveBeenCalled()
    for (const channel of f.channels) channel.onOpen()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.connected).not.toHaveBeenCalled()
    f.controller.stop()
    for (const channel of f.channels) channel.end()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.channels).toHaveLength(2)
  })
  it('bounds a stalled describe even when both streams opened', async () => {
    const f = fixture({ autoOpen: true, describe: () => new Promise(() => {}) })
    f.controller.start()
    await vi.advanceTimersByTimeAsync(21)
    expect(f.connected).not.toHaveBeenCalled()
    expect(f.states).toEqual(['reconnecting'])
    expect(f.channels.every(channel => channel.signal.aborted)).toBe(true)
  })
  it('cancels backoff and lets one immediate restart own the new loop', async () => {
    const f = fixture()
    f.controller.start()
    await vi.advanceTimersByTimeAsync(21)
    f.controller.stop()
    f.controller.start()
    f.channels[2].onOpen()
    f.channels[3].onOpen()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.connected).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(500)
    expect(f.channels).toHaveLength(4)
  })
  it('discards frames from an aborted carrier that ignores cancellation', async () => {
    const f = fixture({ autoOpen: true, ignoreAbort: true })
    f.controller.start()
    await vi.advanceTimersByTimeAsync(0)
    const old = f.channels[0]
    f.controller.stop()
    f.controller.start()
    await vi.advanceTimersByTimeAsync(0)
    old.push({ payload: { type: 'fixture-late' } })
    f.channels[2].push({ payload: { type: 'fixture-current' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.envelopes).toHaveBeenCalledTimes(1)
    expect(f.envelopes.mock.calls[0][0].payload.type).toBe('fixture-current')
    for (const channel of f.channels) channel.end()
  })
  it('does not publish a description after a reentrant connected state sink stops it', async () => {
    const f = fixture({ autoOpen: true })
    f.controller.sinks.onStateChange = () => f.controller.stop()
    f.controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.connected).not.toHaveBeenCalled()
    expect(f.channels.every(channel => channel.signal.aborted)).toBe(true)
  })
})
