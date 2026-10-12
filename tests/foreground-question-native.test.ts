import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { UserQuestionService, UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-user-questions/remote'
import { expect, it } from 'vitest'
import { NativeInteractions } from '../src/host/native-interactions.ts'
import { createContinuedQuestionPorts } from '../src/host/continued-question-bridge.ts'
import type { MuxFrame, RpcRequest } from '../vendor/api-contract/api/index.js'
import { clientResponseSchema } from '../vendor/api-contract/api/rpc.schema.js'
import { muxFrameSchema } from '../vendor/api-contract/api/events.schema.js'

function fixture() {
  const ctx = new Context()
  const service = new UserQuestionService(ctx)
  const agent = { id: SessionId('synthetic-timed-owner'), ctx } as Agent
  ctx.provide('agents'); ctx.set('agents', { get: () => agent, roots: () => [agent] })
  ctx.provide('typert'); ctx.set('typert', { local: { get: (endpoint: string) => TYPERT_REMOTE.descriptors.find(row => endpoint === `${row.namespace}/${row.method}`) } })
  const interactions = new NativeInteractions()
  const frames: RpcRequest<MuxFrame>[] = []
  interactions.subscribe(frame => { muxFrameSchema.parse(frame.payload); frames.push(frame) })
  ctx.on('user-questions/request', (request, next) => interactions.questions(request, next), { global: true })
  const port = createContinuedQuestionPorts(ctx).continuedQuestions!
  const call = ToolCallId('synthetic-timed-call')
  const ask = (timeout = 30, signal?: AbortSignal) => service.askTimed({ agent, questions: [{ id: 'q', question: 'Choose', options: [{ label: 'A' }] }], ...(signal === undefined ? {} : { signal }) }, call, timeout)
  return { ctx, service, agent, call, ask, frames, port, interactions,
    close: async () => { interactions.dispose(); await ctx.fiber.dispose() } }
}

it('unclaimed real official timeout maps to pending and withdraws the terminal wait with its reason', async () => {
  const f = fixture()
  try {
    await expect(f.ask()).resolves.toEqual({ pending: true, callId: f.call })
    expect(f.frames[0]?.payload).toMatchObject({ type: 'question/requested', wait: { callId: f.call, timed: true } })
    expect(f.frames.at(-1)?.payload).toMatchObject({ type: 'question/resolved', outcome: 'timed-out' })
    const replay: unknown[] = []; f.interactions.replay(f.agent.id, frame => replay.push(frame)); expect(replay).toEqual([])
  } finally { await f.close() }
})

it('native claim holds the Host deadline until exact one-shot Client ASK_TIMED_OUT settlement', async () => {
  const f = fixture(); const signal = new AbortController()
  try {
    const ask = f.ask(30)
    const wait = f.port.attachWait!(f.agent.id, f.call, signal.signal)[Symbol.asyncIterator]()
    const first = await wait.next(); expect(first.done).toBe(false); expect(first.value.remainingMs).toBeGreaterThanOrEqual(0)
    const ended = wait.next()
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(f.frames).toHaveLength(1)
    const response = clientResponseSchema.parse({ type: 'client-response', rpcId: f.frames[0]!.rpcId,
      result: { ok: false, error: { code: 'ASK_TIMED_OUT', message: 'Client countdown expired', details: {} } } })
    expect(f.interactions.respond(response)).toEqual({ accepted: true })
    await expect(ask).resolves.toEqual({ pending: true, callId: f.call })
    await expect(ended).resolves.toMatchObject({ done: true })
    expect(f.interactions.respond(response)).toEqual({ accepted: false, reason: 'not-pending' })
  } finally { signal.abort(); await f.close() }
})

it('disconnect releases the actual wait claim and the expired Host deadline finishes it', async () => {
  const f = fixture(); const signal = new AbortController()
  try {
    const ask = f.ask(20)
    const wait = f.port.attachWait!(f.agent.id, f.call, signal.signal)[Symbol.asyncIterator]()
    await wait.next(); const ended = wait.next()
    await new Promise(resolve => setTimeout(resolve, 30)); signal.abort()
    await expect(ended).resolves.toMatchObject({ done: true })
    await expect(ask).resolves.toEqual({ pending: true, callId: f.call })
    // Continued questions cannot acquire a new foreground claim.
    await expect(f.port.attachWait!(f.agent.id, f.call, new AbortController().signal)[Symbol.asyncIterator]().next()).resolves.toMatchObject({ done: true })
  } finally { await f.close() }
})

it('ordinary questions reject the timeout envelope rather than fabricating a continued result', async () => {
  const f = fixture()
  try {
    const answer = f.interactions.questions({ agent: f.agent, questions: [{ id: 'q', question: '?' }] }, async () => ({ answers: [] }))
    const rpcId = f.frames[0]!.rpcId
    expect(f.interactions.respond({ type: 'client-response', rpcId, result: { ok: false,
      error: { code: 'ASK_TIMED_OUT', message: 'not timed', details: {} } } })).toMatchObject({ accepted: false })
    expect(f.interactions.respond({ type: 'client-response', rpcId, result: { ok: false,
      error: { code: 'cancelled', message: 'cancel', details: {} } } })).toMatchObject({ accepted: true })
    await expect(answer).rejects.toMatchObject({ code: 'ASK_ABORTED' })
  } finally { await f.close() }
})

it('pre-aborted timed signal preserves the native timeout error', async () => {
  const f = fixture(); const signal = new AbortController()
  try {
    signal.abort(new UserQuestionError('expired', 'ASK_TIMED_OUT'))
    await expect(f.interactions.questions({ agent: f.agent, signal: signal.signal, questions: [{ id: 'q', question: '?' }] }, async () => ({ answers: [] }))).rejects.toMatchObject({ code: 'ASK_TIMED_OUT' })
  } finally { await f.close() }
})
