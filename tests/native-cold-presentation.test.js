import { expect, it, vi } from 'vitest'
import { toolPresenterScope } from '../src/host/tool-presenter-scope.ts'
import { presentToolEvent } from '../src/host/tool-presentation.ts'
import { readSessionConversation, sessionExportSource } from '../src/host/session-export.ts'

function fixture() {
  const scope = { preset: 'selected-after-creation' }
  const dispose = vi.fn()
  const call = { type: 'tool/call', seq: 0, time: 1, data: {
    name: 'write', callId: 'call', arguments: '{"path":"output.txt"}', turn: 1, step: 1,
  } }
  const result = { type: 'tool/result', seq: 1, time: 2, surfaceOp: 'append', data: {
    turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'call' },
      content: [{ type: 'tool-result', content: [{ type: 'text', text: 'written' }], isError: false }],
    },
  } }
  const events = [call, result]
  const meta = { id: 'cold', agentPreset: 'creation-preset' }
  const services = {
    agents: { get: vi.fn(() => undefined) },
    agentPresets: { standingKeyFor: vi.fn(async () => scope) },
  }
  const ctx = {
    get: name => services[name],
    sessionQuery: { observeSession: vi.fn(async () => ({
      header: meta, events, projections: { values: { agentPreset: 'selected-after-creation' } },
      [Symbol.dispose]: dispose,
    })) },
    sessionController: { inspect: vi.fn(async () => ({ meta, events })) },
    tools: { get: vi.fn((_name, selectedScope) => selectedScope === scope ? {
      presentCall: args => ({ card: 'generic', kind: 'edit', locations: [{ path: args.path }] }),
      presentResult: () => ({ card: 'generic', text: 'written' }),
    } : undefined) },
  }
  return { ctx, services, scope, dispose, call, result, events }
}

it('restores produced files and tool cards for a cold session through its recorded preset scope', async () => {
  const f = fixture()
  const signal = new AbortController().signal
  const snapshot = await readSessionConversation(sessionExportSource(f.ctx), 'cold', signal)
  expect(snapshot.producedFiles).toEqual([{ turn: 1, paths: ['output.txt'] }])
  expect(f.services.agentPresets.standingKeyFor).toHaveBeenCalledWith('selected-after-creation')
  expect(f.ctx.sessionQuery.observeSession).toHaveBeenCalledWith('cold', { signal, projectionMode: 'all' })
  expect(f.dispose).toHaveBeenCalledOnce()

  const scope = await toolPresenterScope(f.ctx, 'cold', signal)
  expect(presentToolEvent(f.ctx, f.call, f.events, scope)).toMatchObject({ for: 'call', view: { card: 'generic', kind: 'edit' } })
  expect(presentToolEvent(f.ctx, f.result, f.events, scope)).toEqual({ for: 'result', view: { card: 'generic', text: 'written' } })
})

it('uses an existing live Agent scope without reading or mounting the cold preset', async () => {
  const f = fixture()
  const live = { id: 'cold' }
  f.services.agents.get.mockReturnValue(live)
  expect(await toolPresenterScope(f.ctx, 'cold', new AbortController().signal)).toBe(live)
  expect(f.ctx.sessionQuery.observeSession).not.toHaveBeenCalled()
  expect(f.services.agentPresets.standingKeyFor).not.toHaveBeenCalled()
})

it('retains generic history when the recorded preset is unavailable and releases the observation', async () => {
  const f = fixture()
  f.services.agentPresets.standingKeyFor.mockRejectedValue(new Error('Preset removed'))
  expect(await toolPresenterScope(f.ctx, 'cold', new AbortController().signal)).toBeUndefined()
  expect(f.dispose).toHaveBeenCalledOnce()
})

it('does not swallow cancellation while waiting for a standing preset scope', async () => {
  const f = fixture()
  const abort = new AbortController()
  const reason = new Error('cancelled while mounting')
  f.services.agentPresets.standingKeyFor.mockImplementation(async () => { abort.abort(reason); return f.scope })
  await expect(toolPresenterScope(f.ctx, 'cold', abort.signal)).rejects.toBe(reason)
  expect(f.dispose).toHaveBeenCalledOnce()
})
