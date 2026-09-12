import { describe, expect, it, vi } from 'vitest'
import { dispatchTerminalRequest, type TerminalDomainReads } from '../src/host/native-api-dispatch.ts'

function fixture() {
  const invoke = vi.fn(async (_request: unknown): Promise<unknown> => ({}))
  const reads: TerminalDomainReads = {
    describeHost: vi.fn(async () => ({})), readHistory: vi.fn(async () => ({})),
    readModels: vi.fn(async () => ({})), readWorkspaces: vi.fn(async () => ({})),
  }
  const signal = new AbortController().signal
  return { invoke, reads, signal,
    call: (method: string, payload: unknown) => dispatchTerminalRequest({ invoke }, reads, method, payload, 'prompt-1', signal) }
}

describe('dsh 0.1.5-rc.1 terminal to native Remote contract', () => {
  it('keeps prompt correlation and cancellation on the official Session owner', async () => {
    const f = fixture()
    await f.call('session.prompt', { sessionId: 's1', content: [{ type: 'text', text: 'hello' }], mode: 'queue' })
    expect(f.invoke).toHaveBeenCalledWith({ namespace: 'session', method: 'prompt',
      args: { request: { sessionId: 's1', content: [{ type: 'text', text: 'hello' }], mode: 'queue', requestId: 'prompt-1' } }, signal: f.signal })
    await f.call('session.selectModel', { sessionId: 's1', provider: 'original', model: 'model' })
    expect(f.invoke).toHaveBeenLastCalledWith({ namespace: 'session', method: 'selectModel',
      args: { request: { sessionId: 's1', provider: 'original', model: 'model' } }, signal: f.signal })
  })

  it('passes Settings CAS revisions and preserves refusal identity', async () => {
    const f = fixture()
    const conflict = new Error('revision conflict')
    f.invoke.mockRejectedValueOnce(conflict)
    const payload = { ns: 'tui-appearance', ops: [{ op: 'set', path: ['theme'], value: 'light' }], expectedRevision: 7 }
    await expect(f.call('settings.mutate', payload)).rejects.toBe(conflict)
    expect(f.invoke).toHaveBeenCalledWith({ namespace: 'settings', method: 'mutate', args: payload, signal: f.signal })
  })

  it('maps credentials metadata and void writes without copying a credential value into the result', async () => {
    const f = fixture()
    f.invoke.mockResolvedValueOnce({ EXISTING_KEY: { configured: true, writable: true } })
    await expect(f.call('credentials.describe', { refs: ['EXISTING_KEY'] })).resolves.toEqual({ credentials: { EXISTING_KEY: { configured: true, writable: true } } })
    f.invoke.mockResolvedValueOnce(undefined)
    await expect(f.call('credentials.set', { ref: 'EXISTING_KEY', value: 'fixture-only' })).resolves.toEqual({})
  })

  it('uses the new nested discovery request and preserves an explicit probe key only as input', async () => {
    const f = fixture()
    f.invoke.mockResolvedValueOnce([{ id: 'm' }])
    await expect(f.call('llm.discoverModels', { settingsNs: 'llm-pi-ai', provider: 'p', apiKey: 'fixture-only' })).resolves.toEqual({ models: [{ id: 'm' }] })
    expect(f.invoke).toHaveBeenCalledWith({ namespace: 'llm', method: 'discoverModels',
      args: { settingsNs: 'llm-pi-ai', request: { provider: 'p', apiKey: 'fixture-only' } }, signal: f.signal })
  })

  it('keeps the direct-parent address on subagent cancellation', async () => {
    const f = fixture()
    const payload = { parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable' }
    await f.call('subagent.interrupt', payload)
    expect(f.invoke).toHaveBeenCalledWith({ namespace: 'subagents', method: 'interruptByParent', args: payload, signal: f.signal })
  })

  it('reads the native flattened GoalView revision instead of inventing a nested ref', async () => {
    const f = fixture()
    f.invoke.mockResolvedValueOnce({ id: 'goal', revision: 4, objective: 'task', phase: 'paused' })
    await expect(f.call('goal.pause', { sessionId: 's1', ref: { id: 'goal', revision: 3 } })).resolves.toEqual({ ref: { id: 'goal', revision: 4 } })
  })

  it('does not invoke a Host mutation when the caller has already cancelled', async () => {
    const f = fixture()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(dispatchTerminalRequest({ invoke: f.invoke }, f.reads, 'credentials.unset', { ref: 'KEY' }, 'r', controller.signal)).rejects.toThrow('cancelled')
    expect(f.invoke).not.toHaveBeenCalled()
  })
})
