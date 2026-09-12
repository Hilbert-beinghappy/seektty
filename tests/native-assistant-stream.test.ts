import { describe, expect, it } from 'vitest'
import { LlmAttemptId } from '@deepseek-ai/dsh-llm/brand'
import { AssistantStreamAccumulator } from '@deepseek-ai/dsh-llm/assistant-stream'
import { z } from 'zod'
import { NativeAssistantStream } from '../src/client/native-assistant-stream.ts'

const attemptId = LlmAttemptId('fixture-attempt')
function start() {
  const stream = new NativeAssistantStream()
  stream.accept({ type: 'start', attemptId, revision: 1, startedAfterSeq: -1, turn: 1, step: 2 })
  return stream
}
const chunk = (revision = 2, index = 0) => ({ type: 'chunk' as const, attemptId, revision, index, time: 1,
  chunk: { type: 'text-delta', index: 0, text: 'hello' } })

describe('native transient assistant stream', () => {
  it('deduplicates replay and retains text until its durable event lands', () => {
    const stream = start()
    stream.accept(chunk())
    stream.accept(chunk())
    expect(stream.snapshot()?.blocks).toEqual([{ kind: 'text', text: 'hello' }])
    stream.accept({ type: 'end', attemptId, revision: 3, index: 1,
      outcome: { kind: 'committed', eventType: 'assistant/message', seq: 9 } })
    stream.settle(8)
    expect(stream.snapshot()).not.toBeNull()
    stream.settle(9)
    expect(stream.snapshot()).toBeNull()
  })

  it('rejects missing chunks without consuming the rejected revision', () => {
    const stream = start()
    expect(() => stream.accept(chunk(3, 1))).toThrow('gap')
    const official = new AssistantStreamAccumulator()
    official.push({ time: 1, chunk: { type: 'text-delta', index: 0, text: 'recov' } })
    official.push({ time: 2, chunk: { type: 'text-delta', index: 0, text: 'ered' } })
    stream.baseline({ revision: 3, activeAttempt: { attemptId, startedAfterSeq: -1, turn: 1, step: 2,
      nextIndex: 2, stream: z.array(z.json()).parse(official.snapshot()) } })
    stream.accept(chunk(4, 2))
    expect(stream.snapshot()?.blocks).toEqual([{ kind: 'text', text: 'recoveredhello' }])
  })

  it('does not consume a malformed compact baseline or discard the prior live text', () => {
    const stream = start()
    stream.accept(chunk())
    expect(() => stream.baseline({ revision: 3, activeAttempt: { attemptId, startedAfterSeq: -1,
      turn: 1, step: 2, nextIndex: 1, stream: [{ type: 'text-chunks', time0: 1, index: 0, dt: [], texts: ['invalid', 'missing timestamp'] }] } })).toThrow()
    expect(stream.snapshot()?.blocks).toEqual([{ kind: 'text', text: 'hello' }])
    stream.accept(chunk(3, 1))
    expect(stream.snapshot()?.blocks).toEqual([{ kind: 'text', text: 'hellohello' }])
  })

  it('keeps the newer live projection when a history response arrives late', () => {
    const stream = start()
    stream.accept(chunk())
    const before = stream.snapshot()
    stream.baseline({ revision: 1 })
    stream.baseline({ revision: 2 })
    expect(stream.snapshot()).toBe(before)
  })

  it('replaces a finalized tool block and preserves extensible opaque blocks', () => {
    const stream = start()
    stream.accept({ ...chunk(), chunk: { type: 'block-end', index: 0,
      block: { type: 'tool-call', id: 'call', name: 'bash', arguments: '{"cmd":"pwd"}' } } })
    stream.accept({ ...chunk(3, 1), chunk: { type: 'block-end', index: 1, block: { type: 'file', path: 'result.txt' } } })
    expect(stream.snapshot()?.blocks).toEqual([
      { kind: 'tool-call', callId: 'call', name: 'bash', argsRaw: '{"cmd":"pwd"}' },
      { kind: 'other', block: { type: 'file', path: 'result.txt' } },
    ])
    stream.accept({ type: 'end', attemptId, revision: 4, index: 2, outcome: { kind: 'abandoned' } })
    expect(stream.snapshot()).toBeNull()
  })
})
