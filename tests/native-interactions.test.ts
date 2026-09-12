import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { NativeInteractions } from '../src/host/native-interactions.ts'
import type { RpcRequest, MuxFrame } from '../vendor/api-contract/api/index.js'

function fixture() {
  const interactions = new NativeInteractions()
  const frames: RpcRequest<MuxFrame>[] = []
  interactions.subscribe(frame => frames.push(frame))
  return { interactions, frames, agent: { id: SessionId('root') } }
}

describe('native human interaction bridge', () => {
  it('only accepts the exact approval and rejects cross-session and duplicate answers', async () => {
    const f = fixture()
    const next = vi.fn(async () => 'unavailable' as const)
    const promise = f.interactions.approval({ agent: f.agent, toolName: 'bash' }, next)
    const request = f.frames[0]!
    if (request.payload.type !== 'approval/requested') throw new Error('expected approval')
    const reply = { type: 'client-response' as const, rpcId: request.rpcId, result: { ok: true as const,
      value: { sessionId: 'other', approvalId: request.payload.approvalId, outcome: 'allowed-once' } } }
    expect(f.interactions.respond(reply)).toEqual({ accepted: false, reason: 'bad-response' })
    reply.result.value.sessionId = 'root'
    expect(f.interactions.respond(reply)).toEqual({ accepted: true })
    await expect(promise).resolves.toBe('allowed-once')
    expect(f.interactions.respond(reply)).toEqual({ accepted: false, reason: 'not-pending' })
    expect(next).not.toHaveBeenCalled()
  })

  it('replays the same pending identity and withdraws it on request cancellation', async () => {
    const f = fixture()
    const abort = new AbortController()
    const promise = f.interactions.approval({ agent: f.agent, toolName: 'bash', signal: abort.signal }, async () => 'unavailable')
    const replay: RpcRequest<MuxFrame>[] = []
    f.interactions.replay('root', frame => replay.push(frame))
    expect(replay[0]).toBe(f.frames[0])
    abort.abort()
    await expect(promise).resolves.toBe('cancelled')
    expect(f.frames.at(-1)?.payload).toMatchObject({ type: 'approval/resolved', outcome: 'cancelled' })
  })

  it('validates question option membership and multi-select rules before settlement', async () => {
    const f = fixture()
    const promise = f.interactions.questions({ agent: f.agent, questions: [
      { id: 'q', question: 'Choose', options: [{ label: 'A' }, { label: 'B' }] },
    ] }, async () => ({ answers: [] }))
    const rpcId = f.frames[0]!.rpcId
    const reply = { type: 'client-response' as const, rpcId, result: { ok: true as const,
      value: { sessionId: 'root', answer: { answers: [{ id: 'q', selected: ['A', 'B'] }] } } } }
    expect(f.interactions.respond(reply)).toEqual({ accepted: false, reason: 'bad-response' })
    reply.result.value.answer.answers[0]!.selected = ['unknown']
    expect(f.interactions.respond(reply)).toEqual({ accepted: false, reason: 'bad-response' })
    reply.result.value.answer.answers[0]!.selected = ['A']
    expect(f.interactions.respond(reply)).toEqual({ accepted: true })
    await expect(promise).resolves.toEqual({ answers: [{ id: 'q', selected: ['A'] }] })
  })

  it('delegates when no terminal is listening and cancels pending work on disposal', async () => {
    const interactions = new NativeInteractions()
    const request = { agent: { id: SessionId('root') }, toolName: 'bash' }
    const next = vi.fn(async () => 'unavailable' as const)
    await expect(interactions.approval(request, next)).resolves.toBe('unavailable')
    expect(next).toHaveBeenCalledOnce()
    interactions.subscribe(() => {})
    const pending = interactions.approval(request, next)
    interactions.dispose()
    await expect(pending).resolves.toBe('cancelled')
  })
})
