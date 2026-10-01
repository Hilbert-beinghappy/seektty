import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { ToolCallId, type UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import { UserQuestionService, UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-user-questions/remote'
import { TYPERT } from '@deepseek-ai/dsh-user-questions/typert'
import { Remote, TypertRemoteService, type InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { TypertRegistry, type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { continuedQuestionHostGate, nativeContinuedQuestionRemote } from '../src/host/continued-question-support.ts'
import { ContinuedQuestionController } from '../src/client/continued-question-view.ts'
import { questionSource, syntheticContinuedAnswer, syntheticContinuedProjection } from './fixtures/continued-questions.ts'
import { freshSignal, tick } from './fixtures/optional-native-views.ts'
const descriptor = TYPERT_REMOTE.descriptors.find(row => row.method === 'answer')!
// Generated /typert intentionally exports unknown. Assert its public contribution envelope at runtime.
function hostContribution(value: unknown): TypertContribution {
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'package') !== '@deepseek-ai/dsh-user-questions'
    || Reflect.get(value, 'face') !== 'host' || !Array.isArray(Reflect.get(value, 'invocations'))
    || !Array.isArray(Reflect.get(value, 'schemas'))) throw new Error('Published question Host contribution is malformed')
  return value as TypertContribution
}
const publishedHost = hostContribution(TYPERT)
const local = { get: (endpoint: string) => endpoint === 'userQuestions/answer' ? descriptor : undefined }
// Opaque identity for boundary fixtures. No model runtime or Agent factory is started.
const opaqueAgent = { id: SessionId('synthetic-owner') } as Agent
const agents = { get: () => opaqueAgent, roots: () => [opaqueAgent] }
const unrelated: InvocationDescriptor = { ...descriptor, service: 'unrelatedFileService', implementation: 'unlinkArtifacts' }
const invalidDescriptors: readonly InvocationDescriptor[] = [
  unrelated,
  { ...descriptor, service: 'unrelatedFileService' },
  { ...descriptor, implementation: 'unlinkArtifacts' },
  { ...descriptor, id: '@unrelated/plugin#userQuestions/answer' },
  { ...descriptor, namespace: 'unrelated' },
  { ...descriptor, method: 'unlinkArtifacts' },
  { ...descriptor, invocation: { kind: 'context', context: 'agent', wire: 'agentId', codec: descriptor.parameters[0]!.codec } },
  { ...descriptor, scope: { context: 'session', wire: 'agentId' } },
  { ...descriptor, mode: 'stream' },
  { ...descriptor, cancellation: { parameter: 'signal' } },
  { ...descriptor, uplink: { codec: descriptor.result } },
  { ...descriptor, parameters: descriptor.parameters.slice(0, 1) },
  { ...descriptor, parameters: [...descriptor.parameters, descriptor.parameters[2]!] },
  { ...descriptor, parameters: [descriptor.parameters[0]!, descriptor.parameters[2]!, descriptor.parameters[1]!] },
  ...descriptor.parameters.flatMap((parameter, index) => [
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, name: 'wrong' } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, wire: 'wrong' } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, source: parameter.source === 'json' ? 'lookup' as const : 'json' as const } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, lookup: 'unrelated' } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, acceptsUndefined: true as const } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, codec: { mode: 'src-json' as const } } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index ? { ...parameter, codec: { mode: 'strict' as const, typeSymbol: 'unknown', create: () => ({ parse: (value: unknown) => value }) } } : row) },
    { ...descriptor, parameters: descriptor.parameters.map((row, i) => i === index && row.codec.mode === 'strict' ? { ...parameter, codec: { ...row.codec, create: () => ({ parse: (value: unknown) => value }) } } : row) },
  ]),
  { ...descriptor, result: { mode: 'src-json' } },
  { ...descriptor, result: { mode: 'strict', typeSymbol: 'unknown', create: () => ({ parse: (value: unknown) => value }) } },
  { ...descriptor, result: descriptor.result.mode === 'strict' ? { ...descriptor.result, create: () => ({ parse: (value: unknown) => value }) } : descriptor.result },
]
it.each(invalidDescriptors)('rejects altered native invocation contract before receiver lookup: %j', changed => {
  const service = vi.fn(() => ({ answer() { return true }, unlinkArtifacts() { return true } }))
  expect(continuedQuestionHostGate({ get: () => changed }, service, agents, opaqueAgent.id).methods).toEqual(new Set())
  expect(service).not.toHaveBeenCalled()
})
it('accepts the real published Host contribution and its explicit equivalent answer member', () => {
  expect(publishedHost.package).toBe('@deepseek-ai/dsh-user-questions')
  expect(publishedHost.face).toBe('host')
  const official = publishedHost.invocations.find(row => row.method === 'answer')!
  const service = vi.fn(() => ({ answer() { return true } }))
  for (const row of [official, { ...official, implementation: 'answer' }]) {
    expect(continuedQuestionHostGate({ get: () => row }, service, agents, opaqueAgent.id).methods).toEqual(new Set(['userQuestions/answer']))
  }
  expect(service.mock.calls).toEqual([['userQuestions'], ['userQuestions']])
})
it('real Context/Registry/Gateway foreign-method counterexample cannot reach a write through the continued view', async () => {
  const ctx = new Context()
  const registry = new TypertRegistry(ctx)
  const original = publishedHost.invocations.find(row => row.method === 'answer')!
  const alienDescriptor = { ...original, service: 'unrelatedFileService', implementation: 'unlinkArtifacts' }
  let writes = 0
  class Alien extends TypertRemoteService {
    constructor() { super(ctx, 'unrelatedFileService', { namespace: 'userQuestions' }) }
    @Remote('answer')
    unlinkArtifacts(_agent: unknown, _callId: unknown, _answer: unknown): boolean { writes++; return true }
  }
  const alien = new Alien()
  registry.register({ ...publishedHost, invocations: [alienDescriptor] })
  registry.lookups.register('agent', { parameter: 'agent', wire: 'agentId', hostTypeSymbol: 'Agent',
    wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: () => opaqueAgent })
  const gateway = new TypertGatewayService(ctx, {})
  const receiver = vi.fn((key: string) => key === 'unrelatedFileService' ? alien : undefined)
  const invoke = vi.spyOn(gateway, 'invoke')
  const scope = questionSource(opaqueAgent.id)
  const controller = new ContinuedQuestionController(scope.source, nativeContinuedQuestionRemote(gateway),
    () => continuedQuestionHostGate(registry.local, receiver, agents, opaqueAgent.id).methods)
  try {
    expect(registry.local.get('userQuestions/answer')).toMatchObject(alienDescriptor)
    // Negative control: the original review's harmless foreign method is genuinely callable via this Gateway.
    await nativeContinuedQuestionRemote(gateway).answer(opaqueAgent.id, ToolCallId('synthetic-call'), syntheticContinuedAnswer)
    expect(writes).toBe(1)
    writes = 0; invoke.mockClear()
    expect(continuedQuestionHostGate(registry.local, receiver, agents, opaqueAgent.id).methods).toEqual(new Set())
    await expect(controller.answer(controller.rows()[0]!, syntheticContinuedAnswer, freshSignal())).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
    expect(receiver).not.toHaveBeenCalled()
    expect(writes).toBe(0)
  } finally { controller.dispose(); await ctx.fiber.dispose() }
})
it('published rc.2 answer/attachWait descriptors retain exact Agent lookup, wire codecs and foreground stream lifetime', () => {
  expect(TYPERT_REMOTE.package).toBe('@deepseek-ai/dsh-user-questions')
  expect(TYPERT_REMOTE.descriptors.map(row => row.method)).toEqual(['answer', 'attachWait'])
  expect(descriptor).toMatchObject({ namespace: 'userQuestions', service: 'userQuestions', invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, sourceLocation: { file: 'packages/interaction/user-questions/src/index.ts', line: 165 } })
  expect(descriptor.parameters.map(row => [row.name, row.wire, row.source])).toEqual([['agent', 'agentId', 'lookup'], ['callId', 'callId', 'json'], ['answer', 'answer', 'json']])
  expect(descriptor.parameters[0]?.lookup).toBe('agent')
  const answerCodec = descriptor.parameters[2]!.codec; const receiptCodec = descriptor.result
  if (answerCodec.mode !== 'strict' || receiptCodec.mode !== 'strict') throw new Error('Published answer codecs must be strict')
  answerCodec.create().parse(syntheticContinuedAnswer)
  expect(() => answerCodec.create().parse({ answers: [{ id: 'choice', selected: 'wrong' }] })).toThrow()
  expect(receiptCodec.create().parse(true)).toBe(true); expect(receiptCodec.create().parse(false)).toBe(false)
  expect(() => receiptCodec.create().parse({ success: true })).toThrow()
  const wait = TYPERT_REMOTE.descriptors.find(row => row.method === 'attachWait')!
  expect(wait).toMatchObject({ mode: 'stream', cancellation: { parameter: 'signal' }, scope: { context: 'agent', wire: 'agentId' }, sourceLocation: { line: 216 } })
  const waitCodec = wait.result; if (waitCodec.mode !== 'strict') throw new Error('Published wait codec must be strict')
  expect(waitCodec.create().parse({ remainingMs: 10 })).toEqual({ remainingMs: 10 })
  expect(descriptor.cancellation).toBeUndefined()
})
it('mount gate requires actual descriptor plus callable receiver and exact registry root identity', () => {
  const agents = { get: () => opaqueAgent, roots: () => [opaqueAgent] }
  const service = () => ({ answer() {} })
  expect(continuedQuestionHostGate(local, service, agents, opaqueAgent.id)).toMatchObject({ methods: new Set(['userQuestions/answer']), liveRoot: true })
  expect(continuedQuestionHostGate(undefined, service, agents, opaqueAgent.id).methods).toBeUndefined()
  expect(continuedQuestionHostGate({ get: () => undefined }, service, agents, opaqueAgent.id).methods).toEqual(new Set())
  expect(continuedQuestionHostGate(local, () => undefined, agents, opaqueAgent.id).methods).toEqual(new Set())
  expect(continuedQuestionHostGate(local, () => ({ attachWait() {} }), agents, opaqueAgent.id).methods).toEqual(new Set())
  expect(continuedQuestionHostGate(local, service, undefined, opaqueAgent.id).liveRoot).toBeUndefined()
  expect(continuedQuestionHostGate(local, service, { get: () => undefined, roots: () => [] }, opaqueAgent.id).liveRootReason).toContain('CALLER_NOT_LIVE')
  expect(continuedQuestionHostGate(local, service, { get: () => opaqueAgent, roots: () => [{ ...opaqueAgent }] }, opaqueAgent.id).liveRootReason).toContain('DELEGATED_CALLER')
  expect(continuedQuestionHostGate({ get: () => ({ ...descriptor, scope: { context: 'agent', wire: 'wrong' } }) }, service, agents, opaqueAgent.id).methods).toEqual(new Set())
})
it('adapter invokes only answer with official args and preserves genuine errors; no attachWait claim', async () => {
  const invoke = vi.fn<TypertGateway['invoke']>(async () => true)
  const remote = nativeContinuedQuestionRemote({ invoke })
  expect(await remote.answer(opaqueAgent.id, ToolCallId('synthetic-call'), syntheticContinuedAnswer)).toEqual({ ok: true, value: true })
  expect(invoke.mock.calls[0]?.[0]).toEqual({ namespace: 'userQuestions', method: 'answer', args: { agentId: opaqueAgent.id, callId: 'synthetic-call', answer: syntheticContinuedAnswer } })
  const native = new UserQuestionError('Synthetic bad batch', 'BAD_ANSWER'); invoke.mockRejectedValueOnce(native)
  await expect(remote.answer(opaqueAgent.id, ToolCallId('synthetic-call'), syntheticContinuedAnswer)).rejects.toBe(native)
  invoke.mockResolvedValueOnce('unknown'); await expect(remote.answer(opaqueAgent.id, ToolCallId('synthetic-call'), syntheticContinuedAnswer)).rejects.toThrow('unknown receipt')
  expect(invoke.mock.calls.every(([request]) => request.method === 'answer' && request.signal === undefined)).toBe(true)
})
it('actual official question service + projection keeps steer queued until synthetic Session admits user/message', async () => {
  const ctx = new Context(); const sessions = new SessionStore(ctx); const projections = new SessionProjectionRegistry(ctx)
  const service = new UserQuestionService(ctx); await tick()
  const session = sessions.create(SessionId('synthetic-native-question-owner'))
  const queued: UserMessage[] = []
  // Minimal service caller only: exact registered object, real in-memory Session, and inert inbox/steer.
  // This does not claim an authenticated carrier or a real Agent loop.
  const unsupported = (): never => { throw new Error('Unexpected fixture Agent operation') }
  const caller: Agent = { id: session.id, session, options: {}, ctx, status: 'idle',
    inbox: { nextTurn: queued, nextStep: [], clear: unsupported, append: unsupported, prepend: unsupported, replace: unsupported, remove: unsupported, splice: unsupported },
    cancel: unsupported, whenIdle: unsupported, runMaintenance: unsupported, send: unsupported, followup: unsupported, inject: unsupported,
    steer: (message: UserMessage) => { queued.push(message) },
  }
  let root = true; let current: Agent | undefined = caller
  ctx.provide('agents'); ctx.set('agents', { get: () => current, roots: () => root ? [caller] : [] })
  try {
    const callId = ToolCallId('synthetic-call'); const questions = syntheticContinuedProjection.active[0]!.questions
    session.append('tool/ptc-dispatch', { rootCallId: ToolCallId('synthetic-parent'), parentCallId: ToolCallId('synthetic-parent'), subCallId: callId, name: 'ask_user_question', arguments: { questions }, isError: false, content: [{ type: 'text', text: '{"pending":true}' }] })
    const scope = questionSource(session.id)
    scope.set({ projection: projections.snapshot(session).values.userQuestions })
    expect(scope.source.getSnapshot().projection).toMatchObject({ active: [{ state: 'continued' }], settled: [] })
    expect(() => service.answer(caller, callId, { answers: [] })).toThrowError(expect.objectContaining({ code: 'BAD_ANSWER' }))
    const answer = vi.fn(async (_agentId: SessionId, call: ToolCallId, batch: typeof syntheticContinuedAnswer) => ({ ok: true as const, value: service.answer(caller, call, batch) }))
    const controller = new ContinuedQuestionController(scope.source, { answer }, () => new Set(['userQuestions/answer']))
    await expect(controller.answer(controller.rows()[0]!, syntheticContinuedAnswer, freshSignal())).resolves.toBe('queued')
    expect(queued).toHaveLength(1); expect(queued[0]?.source).toMatchObject({ kind: 'user-question-reply', callId })
    expect(projections.snapshot(session).values.userQuestions).toMatchObject({ active: [{ state: 'continued' }], settled: [] })
    expect(() => service.answer(caller, callId, syntheticContinuedAnswer)).toThrowError(expect.objectContaining({ code: 'REPLY_QUEUED' }))
    session.append('user/message', queued.shift()!, { surfaceOp: 'append' })
    scope.set({ projection: projections.snapshot(session).values.userQuestions })
    expect(controller.rows()[0]?.status).toBe('settled'); expect(controller.rows()[0]?.answers).toEqual(syntheticContinuedAnswer.answers)
    expect(service.answer(caller, callId, syntheticContinuedAnswer)).toBe(false)
    root = false; expect(() => service.answer(caller, callId, syntheticContinuedAnswer)).toThrowError(expect.objectContaining({ code: 'DELEGATED_CALLER' }))
    root = true; current = { ...caller }; expect(() => service.answer(caller, callId, syntheticContinuedAnswer)).toThrowError(expect.objectContaining({ code: 'CALLER_NOT_LIVE' }))
    controller.dispose(); expect(scope.listeners.size).toBe(0)
  } finally { await ctx.fiber.dispose() }
})
