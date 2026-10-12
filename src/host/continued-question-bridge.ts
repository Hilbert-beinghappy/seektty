/** Native continued-question contract gate at the existing authenticated in-process boundary. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { SessionId } from '@deepseek-ai/dsh-session'
import { UserQuestionService } from '@deepseek-ai/dsh-user-questions'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import type { TuiManagementBridge } from '../protocol.ts'
import { continuedQuestionHostGate, nativeContinuedQuestionRemote } from './continued-question-support.ts'

export function createContinuedQuestionPorts(ctx: Context): Pick<TuiManagementBridge, 'continuedQuestions'> {
  const gate = (sessionId: string) => continuedQuestionHostGate(ctx.get('typert')?.local,
    name => ctx.get(name as never), ctx.get('agents'), SessionId(sessionId))
  const native = nativeContinuedQuestionRemote(ctx.typertGateway)
  return { continuedQuestions: { gate, attachWait: async function* (sessionId, callId, signal) {
    const current = gate(sessionId)
    const service = ctx.get('userQuestions')
    const agent = ctx.get('agents')?.get(SessionId(sessionId))
    // A direct same-process business stream: never route an unrelated descriptor by name.
    if (signal.aborted) return
    if (current.liveRoot !== true || !current.methods?.has('userQuestions/answer')
      || !(service instanceof UserQuestionService) || agent === undefined) {
      throw new Error('Native foreground question wait is unavailable')
    }
    yield* service.attachWait(agent, ToolCallId(callId), signal)
  }, remote: { answer: async (agentId, callId, answer) => {
    const current = gate(agentId)
    if (current.liveRoot !== true || current.methods?.has('userQuestions/answer') !== true) {
      throw new Error(current.liveRootReason ?? 'Native continued-question answer contract is unavailable')
    }
    return native.answer(agentId, callId, answer)
  } } } }
}
