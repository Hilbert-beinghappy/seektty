import { expect, it } from 'vitest'
import { TYPERT as session } from '@deepseek-ai/dsh-api-session-controller/typert'
import { TYPERT as workspace } from '@deepseek-ai/dsh-api-workspace-controller/typert'
import { TYPERT as settings } from '@deepseek-ai/dsh-api-settings-controller/typert'
import { TYPERT as presets } from '@deepseek-ai/dsh-agent-presets/typert'
import { TYPERT as goals } from '@deepseek-ai/dsh-goal/typert'
import { TYPERT as llm } from '@deepseek-ai/dsh-llm/typert'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'

const descriptors = [session, workspace, settings, presets, goals, llm].flatMap(face => face.invocations)
const ref = { id: 'goal', revision: 1 }
const cases = [
  ['session.list', {}], ['session.create', {}], ['session.cancel', { sessionId: 's' }],
  ['session.prompt', { sessionId: 's', content: [{ type: 'text', text: 'fixture' }], mode: 'queue' }],
  ['session.rename', { sessionId: 's', title: 'fixture' }], ['session.fork', { sessionId: 's' }],
  ['session.search', { query: 'fixture' }], ['session.selectModel', { sessionId: 's', provider: 'p', model: 'm' }],
  ['session.attachment', { sessionId: 's', attachmentId: 'a' }],
  ['session.updateQueue', { sessionId: 's', itemId: 'q', action: { kind: 'remove' } }],
  ['workspace.create', { path: '/fixture' }], ['workspace.rename', { workspaceId: 'w', title: 'fixture' }],
  ['workspace.delete', { workspaceId: 'w' }], ['workspace.insertBefore', { workspaceId: 'w' }],
  ['workspace.insertSessionBefore', { workspaceId: 'w', sessionId: 's' }], ['workspace.archiveSession', { sessionId: 's' }],
  ['host.pickDirectory', {}], ['host.listDirectory', {}], ['host.createDirectory', { path: '/fixture', name: 'child' }],
  ['host.openPath', { path: '/fixture' }], ['skill.list', { sessionId: 's' }],
  ['settings.describe', {}], ['settings.openDocument', {}],
  ['settings.update', { ns: 'fixture', patch: {} }], ['settings.replace', { ns: 'fixture', section: {} }],
  ['settings.mutate', { ns: 'fixture', ops: [{ op: 'set', path: ['value'], value: 1 }], expectedRevision: 2 }],
  ['credentials.describe', { refs: ['FIXTURE_KEY'] }], ['credentials.set', { ref: 'FIXTURE_KEY', value: 'fixture-only' }],
  ['credentials.unset', { ref: 'FIXTURE_KEY' }], ['llm.providers', {}], ['llm.models', {}],
  ['llm.discoverModels', { settingsNs: 'llm-pi-ai', provider: 'fixture' }],
  ['agentPreset.list', {}], ['agentPreset.select', { sessionId: 's', agentPreset: 'standard' }],
  ['agentPreset.read', { agentPreset: 'standard' }], ['agentPreset.copy', { from: 'standard', agentPreset: 'fixture-copy' }],
  ['agentPreset.remove', { agentPreset: 'fixture-copy' }], ['agentPreset.openDocument', { agentPreset: 'standard' }],
  ['goal.create', { sessionId: 's', objective: 'fixture' }], ['goal.edit', { sessionId: 's', ref, objective: 'changed' }],
  ...['pause', 'resume', 'complete', 'clear'].map(method => [`goal.${method}`, { sessionId: 's', ref }]),
]

it.each(cases)('%s conforms to the actual installed rc.1 generated Host descriptor', async (method, payload) => {
  let calls = 0
  const gateway = { async invoke({ namespace, method: nativeMethod, args }) {
    calls++
    const descriptor = descriptors.find(d => d.namespace === namespace && d.method === nativeMethod)
    expect(descriptor, `${namespace}/${nativeMethod}`).toBeDefined()
    expect(Object.keys(args).filter(key => !descriptor.parameters.some(p => p.wire === key))).toEqual([])
    for (const parameter of descriptor.parameters) {
      const result = parameter.codec.schema.safeParse(args[parameter.wire])
      expect(result.success, `${namespace}/${nativeMethod}:${parameter.wire}: ${result.error?.message ?? ''}`).toBe(true)
    }
    return namespace === 'goals' ? { id: 'goal', revision: 2 } : {}
  } }
  await dispatchTerminalRequest(gateway, {}, method, payload, 'fixture-request', new AbortController().signal)
  expect(calls).toBeGreaterThan(0)
})
