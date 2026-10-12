/** Exact rc.2 timed-question mount/Agent gate, composed by E at the authenticated carrier boundary. */
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InvocationDescriptor, TypertCodec, TypertLocalRegistry } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import type { ContinuedQuestionRemote } from '../client/continued-question-view.ts'
export interface ContinuedQuestionHostGate {
  readonly methods: ReadonlySet<string> | undefined
  readonly liveRoot: boolean | undefined
  readonly liveRootReason?: string
}
const answerIdentity = '@deepseek-ai/dsh-user-questions#userQuestions/answer'
/** Published rc.2 unary contract. Diagnostic source positions are not invocation identity. */
function nativeAnswerDescriptor(descriptor: InvocationDescriptor | undefined): boolean {
  if (descriptor === undefined || descriptor.id !== answerIdentity || descriptor.namespace !== 'userQuestions'
    || descriptor.service !== 'userQuestions' || descriptor.method !== 'answer'
    || (descriptor.implementation ?? descriptor.method) !== 'answer' || descriptor.mode !== undefined
    || descriptor.invocation.kind !== 'direct' || descriptor.cancellation !== undefined || descriptor.uplink !== undefined
    || descriptor.scope?.context !== 'agent' || descriptor.scope.wire !== 'agentId' || descriptor.parameters.length !== 3) return false
  const contract = [
    ['agent', 'agentId', 'lookup', 'agent', '@deepseek-ai/dsh-session/types#SessionId'],
    ['callId', 'callId', 'json', undefined, '@deepseek-ai/dsh-llm/brand#ToolCallId'],
    ['answer', 'answer', 'json', undefined, '@deepseek-ai/dsh-user-questions/types#AskUserQuestionAnswer'],
  ] as const
  if (!descriptor.parameters.every((parameter, index) => {
    const expected = contract[index]!
    return parameter.name === expected[0] && parameter.wire === expected[1] && parameter.source === expected[2]
      && parameter.lookup === expected[3] && parameter.acceptsUndefined === undefined
      && strictCodec(parameter.codec, expected[4])
  }) || !strictCodec(descriptor.result, `${answerIdentity}:result`)) return false
  // Check the declared strict boundaries before exposing a write capability. These are inert wire values.
  try {
    const invalidIds = [undefined, null, 0, true, [], {}]
    return boundaryMatches(descriptor.parameters[0]!.codec, ['synthetic-owner'], invalidIds)
      && boundaryMatches(descriptor.parameters[1]!.codec, ['synthetic-call'], invalidIds)
      && boundaryMatches(descriptor.parameters[2]!.codec, [{ answers: [] }, { answers: [{ id: 'synthetic', selected: ['one'], custom: 'text' }] }],
        [undefined, null, {}, { answers: 'bad' }, { answers: [{ id: 1, selected: [] }] }, { answers: [{ id: 'synthetic', selected: 'bad' }] }, { answers: [{ id: 'synthetic', selected: [], custom: false }] }])
      && boundaryMatches(descriptor.result, [true, false], [undefined, null, 0, 1, 'true', [], {}, { success: true }])
  } catch { return false }
}
function strictCodec(codec: TypertCodec, typeSymbol: string): boolean {
  return codec.mode === 'strict' && codec.typeSymbol === typeSymbol && typeof codec.create === 'function'
    && codec.decode === undefined && codec.encode === undefined
}
function boundaryMatches(codec: TypertCodec, valid: readonly unknown[], invalid: readonly unknown[]): boolean {
  if (codec.mode !== 'strict') return false
  const schema = codec.create()
  for (const value of valid) if (JSON.stringify(schema.parse(value)) !== JSON.stringify(value)) return false
  for (const value of invalid) {
    try { schema.parse(value); return false } catch { /* native strict boundary rejection */ }
  }
  return true
}
export function continuedQuestionHostGate(
  local: Pick<TypertLocalRegistry, 'get'> | undefined,
  service: (key: string) => unknown,
  agents: Pick<AgentRegistry, 'get' | 'roots'> | undefined,
  selectedSessionId: SessionId,
): ContinuedQuestionHostGate {
  const methods = local === undefined ? undefined : new Set<string>()
  const descriptor = local?.get('userQuestions/answer')
  if (nativeAnswerDescriptor(descriptor)) {
    const receiver = service('userQuestions')
    if (typeof receiver === 'object' && receiver !== null && typeof Reflect.get(receiver, 'answer') === 'function') methods?.add('userQuestions/answer')
  }
  if (agents === undefined) return { methods, liveRoot: undefined, liveRootReason: 'Exact live root Agent registry is unavailable' }
  const agent = agents.get(selectedSessionId)
  if (agent === undefined) return { methods, liveRoot: false, liveRootReason: 'CALLER_NOT_LIVE: selected Session has no exact live Agent; this view does not resume one' }
  if (!agents.roots().includes(agent)) return { methods, liveRoot: false, liveRootReason: 'DELEGATED_CALLER: selected Agent is owned by another live Agent' }
  return { methods, liveRoot: true }
}
/** Uses only the published answer invocation; attachWait is intentionally not claimed by this background view. */
export function nativeContinuedQuestionRemote(gateway: Pick<TypertGateway, 'invoke'>): ContinuedQuestionRemote {
  return { answer: async (agentId, callId, answer) => {
    const value = await gateway.invoke({ namespace: 'userQuestions', method: 'answer', args: { agentId, callId, answer } })
    if (typeof value !== 'boolean') throw new Error('Native answer returned an unknown receipt')
    return { ok: true, value }
  } }
}
