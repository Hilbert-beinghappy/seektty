import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage, createUserMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it, vi } from 'vitest'
import { ConversationEventRegistry, ConversationViewRegistry, ConversationNodeAssembler } from '../vendor/client-runtime/client/index.js'
import { registerConversationNodes } from '../vendor/ui-conversation/client/conversation-nodes/register.js'
import { chatViewDefinition } from '../vendor/ui-conversation/client/conversation-nodes/chat-snapshot-builder.js'
import { nativeProcessSnapshot } from '../vendor/ui-chat-process/snapshot-adapter.js'
import { Transcript } from '../src/client/transcript.ts'
import { normalizeBehavior } from '../src/client/behavior.ts'
import { BehaviorSettingsSchema } from '../src/host/management.ts'
import { Config } from '../src/host/settings/behavior.ts'
import z from '@deepseek-ai/schemastery'
import { workProcessLayout } from '../src/client/work-process-layout.ts'
import { workProcessPolicy } from '../src/client/work-process-display.ts'
import { TuiActions } from '../src/client/actions.ts'
import { TUI_BEHAVIOR_SETTINGS_NAMESPACE } from '../src/protocol.ts'

const text = text => ({ type: 'text', text })
const assistant = value => createAssistantMessage({ content: value, provider: 'synthetic', model: 'synthetic' })
function fixture({ ended = true, reason = 'completed', isError = false, interleaved = false } = {}) {
  const ctx = new Context()
  const events = new ConversationEventRegistry(ctx), views = new ConversationViewRegistry(ctx)
  registerConversationNodes(ctx)
  const assembler = new ConversationNodeAssembler(events, views)
  const callId = ToolCallId('synthetic-display-call')
  const raw = [
    ['turn/start', { turn: 1 }], ['user/message', createUserMessage({ content: [text('input-kept')], source: { kind: 'user' } }), 'append'],
    ['step/start', { turn: 1, step: 1 }],
    ['assistant/message', { turn: 1, step: 1, message: assistant([text('process-message')]) }, 'append'],
    ['tool/call', { turn: 1, step: 1, callId, name: 'bash', arguments: '{"command":"synthetic-task"}' }],
    ['tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, content: [text(isError ? 'error-kept' : 'tool-detail')], isError }) }, 'append'],
    ['step/end', { turn: 1, step: 1 }], ['step/start', { turn: 1, step: 2 }],
    ...(interleaved ? [['user/message', createUserMessage({ content: [text('interleaved-kept')], source: { kind: 'user' } }), 'append']] : []),
    ['assistant/message', { turn: 1, step: 2, message: assistant([{ type: 'reasoning', text: 'reasoning-preview' }, text('final-answer-kept')]) }, 'append'],
    ...(ended ? [['step/end', { turn: 1, step: 2 }], ['turn/end', { turn: 1, reason: { kind: reason, ...(reason === 'aborted' ? { reason: { kind: 'user' } } : {}), ...(reason === 'error' ? { error: { code: 'UNKNOWN', message: 'error-status-kept', details: {} } } : {}) } }]] : []),
  ]
  const inputs = raw.map(([type, data, surfaceOp], seq) => ({ event: { type, data, seq, time: 100 + seq, ...(surfaceOp ? { surfaceOp } : {}) } }))
  assembler.replaceWindow(inputs, false); assembler.flush()
  const chat = assembler.get('chat')
  const snapshot = { sessionId: 'synthetic', chat, partial: null, runningCalls: [], hasMore: false, loadingOlder: false }
  return { ctx, assembler, chat, snapshot, inputs }
}
function plain(lines) { return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') }
it('registers real native Turn/process/group projections in the actual vendored assembler', async () => {
  const f = fixture()
  try {
    const projected = nativeProcessSnapshot(f.chat)
    expect(projected.evidence.get(1)).toMatchObject({ status: 'closed', endReason: 'completed', hasInterleavedInput: false,
      spec: { turn: 1, answerStep: 2, toolCallCount: 1, messageCount: 1 } })
    expect([...projected.groups.values()].flatMap(group => group.members).some(member => member.groupPart === 'reasoning')).toBe(true)
  } finally { await f.ctx.fiber.dispose() }
})
it.each(['compact', 'standard', 'detailed', 'verbose'])('public Transcript %s preserves independent input/final answer and has reachable disclosure', async mode => {
  const f = fixture(); const transcript = new Transcript(() => 100)
  try {
    transcript.applyPresentationDefaults('expanded', false, 200, 3, mode)
    transcript.update(f.snapshot)
    const output = plain(transcript.render(100))
    expect(output).toContain('input-kept'); expect(output).toContain('final-answer-kept')
    if (mode === 'verbose') expect(output).toContain('process-message')
    else {
      expect(output).not.toContain('process-message')
      const control = transcript.processControls().find(row => row.kind === 'turn')
      expect(control).toBeDefined(); expect(transcript.toggleProcess(control.id)).toBe(true)
      expect(transcript.processControls().some(row => row.kind === 'group')).toBe(true)
      const group = transcript.processControls().find(row => row.kind === 'group')
      expect(transcript.toggleProcess(group.id)).toBe(true)
      expect(plain(transcript.render(100))).toContain('process-message')
      expect(transcript.controlHitRegions({ col: 0, row: 0, width: 100, height: 100 }).some(row => row.action.command === 'toggle-process')).toBe(true)
    }
  } finally { transcript.dispose(); await f.ctx.fiber.dispose() }
})
it.each([{ reason: 'error' }, { reason: 'aborted' }, { interleaved: true }, { ended: false }, { isError: true }])('retains failed/live/interleaved evidence: %j', async options => {
  const f = fixture(options)
  try {
    const projected = nativeProcessSnapshot(f.chat), nodes = f.chat.order.map(key => f.chat.nodes.get(key))
    const layout = workProcessLayout(nodes, projected, workProcessPolicy('compact'), new Map(), new Set())
    if (options.isError) expect(layout.entries.some(entry => entry.node?.kind === 'tool-call')).toBe(true)
    else {
      expect(layout.entries.some(entry => entry.node?.kind === 'assistant-step')).toBe(true)
      expect(layout.controls.some(row => row.kind === 'turn')).toBe(false)
      if (options.reason === 'error') expect(layout.entries.some(entry => entry.node?.kind === 'turn-error')).toBe(true)
    }
  } finally { await f.ctx.fiber.dispose() }
})
it('absent/unknown mode preserves legacy defaults through the real serialized schema; aliases require no write', () => {
  const roundtrip = new z(JSON.parse(JSON.stringify(Config)))
  const defaults = Object.fromEntries(Object.entries(roundtrip({})).map(([key, value]) => [key, typeof value?.get === 'function' ? value.get() : value]))
  expect(defaults.workProcessDisplay).toBeUndefined(); expect(normalizeBehavior(defaults).workProcessDisplay).toBeUndefined()
  expect(normalizeBehavior({ workProcessDisplay: 'future-mode' }).workProcessDisplay).toBeUndefined()
  expect(normalizeBehavior({ workProcessDisplay: 'normal' }).workProcessDisplay).toBe('detailed')
  expect(new z(JSON.parse(JSON.stringify(BehaviorSettingsSchema)))({ workProcessDisplay: 'standard' }).workProcessDisplay).toBe('standard')
})
it('public display cycles serialize authoritative CAS writes, unset only this field, and never retry a conflict', async () => {
  let revision = 1, mode
  const mutate = vi.fn(async (_ns, ops, expected) => {
    expect(expected).toBe(revision); revision++
    mode = ops[0].op === 'set' ? ops[0].value : undefined
    return document()
  })
  const document = () => ({ namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE, schema: BehaviorSettingsSchema.toJSON(), value: { toolCards: 'expanded', ...(mode ? { workProcessDisplay: mode } : {}) }, revision, applies: 'live', secrets: [] })
  const capabilities = { managementBridge: () => ({ settings: { describe: async () => [document()], mutate } }) }
  const host = { notice: vi.fn(), applyBehavior: vi.fn(), overlays: {} }
  const actions = new TuiActions(capabilities, host)
  await Promise.all([actions.execute('display', 'cycle'), actions.execute('display', 'cycle')])
  expect(host.notice.mock.calls.filter(row => row[1] === 'error')).toEqual([])
  expect(mode).toBe('standard'); expect(mutate.mock.calls.map(row => row[2])).toEqual([1, 2])
  await actions.execute('display', 'terminal-default')
  expect(mutate.mock.calls.at(-1)[1]).toEqual([{ op: 'unset', path: ['workProcessDisplay'] }])
  mutate.mockRejectedValueOnce(new Error('Synthetic CAS conflict'))
  await actions.execute('display', 'detailed')
  expect(mutate).toHaveBeenCalledTimes(4); expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('Synthetic CAS conflict'), 'error')
})

it.each([false, true])('search reveals process content without changing stored disclosures (native=%s)', async native => {
  const f = fixture(); const transcript = new Transcript(() => 200)
  try {
    transcript.setNativeMode(native)
    transcript.applyPresentationDefaults('expanded', true, 200, 3, 'compact')
    transcript.update(f.snapshot)
    expect(plain(transcript.render(100))).not.toContain('process-message')
    const before = transcript.snapshotPresentation()
    transcript.handleInput('/')
    transcript.handleInput('process-message')
    expect(plain(transcript.render(100))).toContain('process-message')
    expect(transcript.snapshotPresentation().processTurns).toEqual(before.processTurns)
    expect(transcript.snapshotPresentation().processGroups).toEqual(before.processGroups)
    expect(transcript.cancelSearch()).toBe(true)
    expect(plain(transcript.render(100))).not.toContain('process-message')
    const turn = transcript.processControls().find(row => row.kind === 'turn')
    transcript.toggleProcess(turn.id)
    const group = transcript.processControls().find(row => row.kind === 'group')
    transcript.toggleProcess(group.id)
    const opened = transcript.snapshotPresentation()
    transcript.handleInput('/'); transcript.cancelSearch()
    expect(transcript.snapshotPresentation().processTurns).toEqual(opened.processTurns)
    expect(transcript.snapshotPresentation().processGroups).toEqual(opened.processGroups)
    expect(plain(transcript.render(100))).toContain('process-message')
  } finally { transcript.dispose(); await f.ctx.fiber.dispose() }
})
it('retains an unknown native extension inside a folded completed process', async () => {
  const f = fixture()
  try {
    const builder = chatViewDefinition.create()
    const base = f.chat.order.map(key => f.chat.nodes.get(key))
    const tool = base.find(node => node.kind === 'tool-call')
    const extension = { ...tool, key: 'future-process', kind: 'future-process', data: { kind: 'context', seq: tool.anchorSeq, time: 100, context: 'future-evidence-kept' } }
    const chat = builder.replace({ nodes: [...base, extension], timeline: f.chat.timeline })
    const layout = workProcessLayout(chat.order.map(key => chat.nodes.get(key)), nativeProcessSnapshot(chat), workProcessPolicy('compact'), new Map(), new Set())
    expect(layout.entries.some(entry => entry.node === extension)).toBe(true)
  } finally { await f.ctx.fiber.dispose() }
})
it('updates native groups incrementally without reading an unrelated Turn body', async () => {
  const f = fixture()
  try {
    const builder = chatViewDefinition.create()
    const base = f.chat.order.map(key => f.chat.nodes.get(key))
    const clones = Array.from({ length: 1000 }, (_, index) => {
      const turn = index + 2, key = `unrelated-${turn}`
      return { ...base.find(node => node.kind === 'user'), key, anchorSeq: 100 + index,
        location: { kind: 'turn', turn: { turn, status: 'closed', data: new Map() } } }
    })
    let chat = builder.replace({ nodes: [...base, ...clones], timeline: f.chat.timeline })
    const groups = nativeProcessSnapshot(chat).groups
    const get = vi.spyOn(chat.nodes, 'get')
    const source = base.find(node => node.kind === 'tool-call')
    const updated = { ...source, data: { ...source.data, root: { ...source.data.root, content: [text('updated-detail')] } } }
    chat = builder.apply({ upserts: [updated], timeline: f.chat.timeline })
    expect(get.mock.calls.some(([key]) => key.startsWith('unrelated-'))).toBe(false)
    expect(chat.nodes.get(source.key)).toBe(updated)
    expect(nativeProcessSnapshot(chat).groups.size).toBe(groups.size)
    expect(nativeProcessSnapshot(chat).evidence.get(1).spec.answerStep).toBe(2)
  } finally { await f.ctx.fiber.dispose() }
})

it('does not offer an empty process toggle for a sole final answer', async () => {
  const f = fixture()
  try {
    const inputs = f.inputs.filter(({ event }) => event.data?.step !== 1 && event.type !== 'tool/call' && event.type !== 'tool/result')
      .map(input => input.event.type === 'assistant/message' ? { event: { ...input.event, data: { ...input.event.data, message: assistant([text('only-final')]) } } } : input)
    f.assembler.replaceWindow(inputs, false); f.assembler.flush()
    const chat = f.assembler.get('chat')
    const projected = nativeProcessSnapshot(chat)
    expect(projected.evidence.get(1)).toMatchObject({ hasExternalProcess: false, inlineReasoning: false })
    const layout = workProcessLayout(chat.order.map(key => chat.nodes.get(key)), projected, workProcessPolicy('compact'), new Map(), new Set())
    expect(layout.controls).toEqual([])
    expect(layout.entries.some(entry => entry.node?.kind === 'assistant-step')).toBe(true)
  } finally { await f.ctx.fiber.dispose() }
})
it('rejects a stale process overlay selection after the owning Session changes', async () => {
  let owner = 'before'
  const toggleProcess = vi.fn()
  const navigation = { selectPage: async (_options, select) => { owner = 'after'; await select({ id: 'turn:1' }) }, finish: vi.fn(), updateChoices: vi.fn() }
  const capabilities = { active: () => ({ sessionId: owner }), managementState: () => ({ generation: 1 }) }
  const host = { overlays: navigation, transcript: { processControls: () => [{ id: 'turn:1', kind: 'turn', label: 'process', open: false }], toggleProcess }, notice: vi.fn() }
  const actions = new TuiActions(capabilities, host)
  await actions.execute('processes', '')
  expect(toggleProcess).not.toHaveBeenCalled()
  expect(navigation.finish).toHaveBeenCalledOnce()
  expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('Current process view changed'), 'error')
})
