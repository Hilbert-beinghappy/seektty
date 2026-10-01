import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { TYPERT as presets } from '@deepseek-ai/dsh-agent-preset-registry/typert'
import commands from '@deepseek-ai/dsh-commands/remote'
import { agentPresetListValueSchema, agentPresetReadValueSchema } from '../vendor/api-contract/api/agent-presets.schema.js'
import { toolDefinition } from '../vendor/ui-conversation/client/conversation-nodes/tool.js'
import { compactionDefinition } from '../vendor/ui-conversation/client/conversation-nodes/compaction.js'
import { ProjectionValueStore } from '../vendor/client-runtime/client/sessions/projection-store.js'
import { apply as registry } from '../vendor/typert-registry/client/index.js'
import { apply as gateway } from '../vendor/api-gateway/client/index.js'
import { sessionV4Fixture } from './helpers/session-v4-fixture.ts'

it('accepts native published preset roster and document without invented flags', () => {
  const roster = { presets: [{ id: 'standard', isDefault: true, name: 'Standard' }] }
  const document = { agentPreset: 'standard', content: '- name: fixture\n' }
  for (const [method, value, terminalSchema] of [
    ['list', roster, agentPresetListValueSchema], ['read', document, agentPresetReadValueSchema],
  ]) {
    const descriptor = presets.invocations.find(item => item.namespace === 'agentPresets' && item.method === method)
    expect(descriptor.result.create().parse(value)).toEqual(value)
    expect(terminalSchema.parse(value)).toEqual(value)
  }
  expect(agentPresetListValueSchema.safeParse({ presets: [{ id: '', isDefault: true }] }).success).toBe(false)
})
it.each([true, false])('renders published flat V4 tool content and isError=%s', isError => {
  const f = sessionV4Fixture(isError)
  const match = { event: f.events[1], location: { kind: 'none' } }
  const state = toolDefinition.update({ state: { root: { name: 'write', argsRaw: '{}', subCalls: [] }, children: new Map(), parents: new Map() } }, match)
  expect(state.root.content).toEqual(f.events[1].data.message.content)
  expect(state.root.isError).toBe(isError)
})
it('correlates the published compact-checkpoint source rather than the retired plugin wrapper', () => {
  const event = { type: 'user/message', seq: 4, time: 1, surfaceOp: 'replace',
    data: { id: 'compact', role: 'user', content: [{ type: 'text', text: 'summary' }], source: { kind: 'compact-checkpoint', compactionId: 'compact-1' } } }
  expect(compactionDefinition.match(event)).toEqual({ id: 'compact-1', role: 'update' })
  expect(compactionDefinition.match({ ...event, data: { ...event.data, source: { kind: 'plugin', plugin: 'compact', compactionId: 'compact-1' } } })).toBeNull()
  expect(compactionDefinition.match({ ...event, data: { ...event.data, source: { ...event.data.source, sourceCommandId: 'manual' } } })).toBeNull()
})
it('keeps sequenced projection cuts authoritative while leaving future domain values opaque', () => {
  const store = new ProjectionValueStore()
  store.seed({ asOfSeq: 4, values: { agentPreset: 'standard', future: { opaque: true } } })
  store.apply('agentPreset', 'review', 5)
  store.seed({ asOfSeq: 3, values: { agentPreset: 'stale' } })
  expect(store.get('agentPreset')).toBe('review')
  expect(store.get('future')).toEqual({ opaque: true })
  store.truncate(4)
  store.seed({ asOfSeq: 4, values: { agentPreset: 'recovered' } })
  expect(store.get('agentPreset')).toBe('recovered')
})
it.each(['invocation', 'parameter-source', 'result-codec'])('rejects unknown %s before any RPC write', async fault => {
  const ctx = new Context()
  registry(ctx)
  const call = vi.fn()
  ctx.provide('connection')
  ctx.set('connection', { rpc: { call } })
  gateway(ctx)
  const descriptor = commands.descriptors[0]
  const changed = fault === 'invocation' ? { ...descriptor, invocation: { kind: 'future' } }
    : fault === 'parameter-source' ? { ...descriptor, parameters: descriptor.parameters.map((p, index) => index === 0 ? { ...p, source: 'future' } : p) }
    : { ...descriptor, result: { ...descriptor.result, mode: 'future' } }
  try {
    await expect(ctx.remote.$mount({ ...commands, descriptors: [changed] })).rejects.toThrow(/unknown|strict/u)
    expect(ctx.get('remote.commands')).toBeUndefined()
    expect(call).not.toHaveBeenCalled()
    await ctx.remote.$mount(commands)
    expect(typeof ctx.remote.commands.execute).toBe('function')
  } finally {
    await ctx.fiber.dispose()
  }
})
it('validates generated successful write replies instead of treating malformed results as success', async () => {
  const ctx = new Context()
  registry(ctx)
  const call = vi.fn(async () => ({ ok: true, value: { unexpected: true } }))
  ctx.provide('connection')
  ctx.set('connection', { rpc: { call } })
  gateway(ctx)
  try {
    await ctx.remote.$mount(commands)
    const result = await ctx.remote.commands.execute('fixture', '/plan', [])
    expect(result.ok).toBe(false)
    expect(result.error.message).toContain('rejected')
  } finally {
    await ctx.fiber.dispose()
  }
})
