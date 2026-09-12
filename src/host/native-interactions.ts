/** In-process terminal answerer for native dsh 0.1.5-rc.1 waterfalls. */
import { randomUUID } from 'node:crypto'
import type { ApprovalOutcome, ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { AskUserQuestionAnswer, AskUserQuestionRequestEvent } from '@deepseek-ai/dsh-user-questions/types'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { RpcId, type ClientResponse, type MuxFrame, type RpcReceipt, type RpcRequest } from '../../vendor/api-contract/api/index.js'
import { approvalRequestIdSchema, approvalResponsePayloadSchema } from '../../vendor/api-contract/api/approvals.schema.js'
import { questionResponsePayloadSchema } from '../../vendor/api-contract/api/questions.schema.js'

type Sink = (request: RpcRequest<MuxFrame>) => void
type ApprovalInput = Omit<ApprovalRequestEvent, 'agent'> & { readonly agent: Pick<ApprovalRequestEvent['agent'], 'id'> }
type QuestionsInput = Omit<AskUserQuestionRequestEvent, 'agent'> & { readonly agent?: Pick<NonNullable<AskUserQuestionRequestEvent['agent']>, 'id'> }
interface Pending {
  readonly request: RpcRequest<MuxFrame>
  readonly reply: (response: ClientResponse) => boolean
  readonly cancel: () => void
}

/** Retains only unresolved human questions; durable policy and audit remain in Harness. */
export class NativeInteractions {
  private readonly pending = new Map<string, Pending>()
  private readonly sinks = new Set<Sink>()
  subscribe(sink: Sink): () => void { this.sinks.add(sink); return () => { this.sinks.delete(sink) } }
  replay(sessionId: string, sink: Sink): void {
    for (const pending of this.pending.values()) {
      if ('sessionId' in pending.request.payload && pending.request.payload.sessionId === sessionId) sink(pending.request)
    }
  }
  private emit(request: RpcRequest<MuxFrame>): void { for (const sink of this.sinks) sink(request) }
  dispose(): void { for (const pending of [...this.pending.values()]) pending.cancel(); this.sinks.clear() }
  respond(response: ClientResponse): RpcReceipt {
    const pending = this.pending.get(response.rpcId)
    if (pending === undefined) return { accepted: false, reason: 'not-pending' }
    return pending.reply(response) ? { accepted: true } : { accepted: false, reason: 'bad-response' }
  }

  approval(request: ApprovalInput, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    if (this.sinks.size === 0) return next()
    if (request.signal?.aborted) return Promise.resolve('cancelled')
    const rpcId = RpcId(randomUUID())
    // This is a terminal interaction identity, not an invented Harness audit record.
    const approvalId = approvalRequestIdSchema.parse(rpcId)
    const sessionId = request.agent.id
    return new Promise(resolve => {
      const finish = (outcome: ApprovalOutcome) => {
        if (!this.pending.delete(rpcId)) return
        request.signal?.removeEventListener('abort', cancel)
        this.emit({ rpcId, payload: { type: 'approval/resolved', sessionId, approvalId, outcome } })
        resolve(outcome)
      }
      const cancel = () => finish('cancelled')
      const envelope: RpcRequest<MuxFrame> = { rpcId, payload: { type: 'approval/requested', sessionId, approvalId,
        toolName: request.toolName, ...(request.callId === undefined ? {} : { callId: request.callId }),
        ...(request.reason === undefined ? {} : { reason: request.reason }) } }
      this.pending.set(rpcId, { request: envelope, cancel, reply: response => {
        if (!response.result.ok) return false
        const value = approvalResponsePayloadSchema.safeParse(response.result.value)
        if (!value.success || value.data.sessionId !== sessionId || value.data.approvalId !== approvalId) return false
        finish(value.data.outcome)
        return true
      } })
      request.signal?.addEventListener('abort', cancel, { once: true })
      this.emit(envelope)
    })
  }

  questions(request: QuestionsInput, next: () => Promise<AskUserQuestionAnswer>): Promise<AskUserQuestionAnswer> {
    if (this.sinks.size === 0 || request.agent === undefined) return next()
    if (request.signal?.aborted) return Promise.reject(new UserQuestionError('Question cancelled', 'ASK_ABORTED'))
    const sessionId = request.agent.id
    const rpcId = RpcId(randomUUID())
    return new Promise((resolve, reject) => {
      const finish = (answer?: AskUserQuestionAnswer) => {
        if (!this.pending.delete(rpcId)) return
        request.signal?.removeEventListener('abort', cancel)
        this.emit({ rpcId, payload: { type: 'question/resolved', sessionId, questionRpcId: rpcId,
          outcome: answer === undefined ? 'cancelled' : 'answered' } })
        if (answer === undefined) reject(new UserQuestionError('Question cancelled', 'ASK_ABORTED'))
        else resolve(answer)
      }
      const cancel = () => finish()
      const envelope: RpcRequest<MuxFrame> = { rpcId, payload: { type: 'question/requested', sessionId, questions: request.questions } }
      this.pending.set(rpcId, { request: envelope, cancel, reply: response => {
        if (!response.result.ok) {
          if (response.result.error.code !== 'cancelled') return false
          cancel(); return true
        }
        const value = questionResponsePayloadSchema.safeParse(response.result.value)
        if (!value.success || value.data.sessionId !== sessionId) return false
        const { answers } = value.data.answer
        if (answers.length !== request.questions.length) return false
        if (!answers.every((answer, index) => {
          const question = request.questions[index]!
          const labels = new Set(question.options?.map(option => option.label) ?? [])
          return answer.id === question.id && new Set(answer.selected).size === answer.selected.length
            && answer.selected.every(label => labels.has(label))
            && (answer.custom === undefined || answer.custom.trim() !== '')
            && (question.multiSelect === true || (answer.selected.length <= 1 && !(answer.custom !== undefined && answer.selected.length > 0)))
        })) return false
        finish({ answers: answers.map(answer => ({ id: answer.id, selected: answer.selected,
          ...(answer.custom === undefined ? {} : { custom: answer.custom }) })) }); return true
      } })
      request.signal?.addEventListener('abort', cancel, { once: true })
      this.emit(envelope)
    })
  }
}
