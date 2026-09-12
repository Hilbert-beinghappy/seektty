import { expect, it } from 'vitest'
import { SessionManager } from '../vendor/client-runtime/client/sessions/manager.js'

it('shows the authoritative preset projection after restoring a session and ignores older hints', () => {
  // This display-only path must not issue a Host call or instantiate a Session.
  const unused = new Proxy({}, { get() { throw new Error('Unexpected Host access') } })
  const manager = new SessionManager(unused, unused, undefined, undefined, unused)
  manager.handleHostEnvelope({ rpcId: 'added', payload: { type: 'host/session-added', sessionId: 'fixture', blank: false } })
  const project = (value, seq) => manager.handleMuxEnvelope({ rpcId: `projection-${seq}`, payload: {
    type: 'session/projection', sessionId: 'fixture', key: 'agentPreset', value, seq,
  } })
  project('standard', 10)
  expect(manager.getListSnapshot().items[0].agentPreset).toBe('standard')
  project('review', 11)
  expect(manager.getListSnapshot().items[0].agentPreset).toBe('review')
  project('standard', 9)
  expect(manager.getListSnapshot().items[0].agentPreset).toBe('review')
})
