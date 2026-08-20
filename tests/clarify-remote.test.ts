import { describe, expect, it, vi } from 'vitest'
import {
  CLARIFY_API_CHANNEL,
  CLARIFY_PROBE_PROCESS_ID,
  callClarify,
  isClarifyBusinessError,
  isClarifyProbePresence,
  isClarifyReceiverPresent,
  parseClarifyEcho,
  probeClarifyRemote,
  type ClarifyRpcCaller,
} from '../src/client/clarify-remote.ts'

function caller(impl: ClarifyRpcCaller): ClarifyRpcCaller {
  return impl
}

describe('Clarify Remote probe and public RPC wrapper', () => {
  it('probes with fetchDraft and an impossible processId, wrapping args only', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async (channel, endpoint, payload) => {
      expect(channel).toBe(CLARIFY_API_CHANNEL)
      expect(endpoint).toBe('clarify/fetchDraft')
      expect(payload).toEqual({ args: { processId: CLARIFY_PROBE_PROCESS_ID } })
      return { ok: false, error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` } }
    })
    await expect(probeClarifyRemote(caller(rpc))).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('treats gateway-wrapped PROCESS_NOT_FOUND text as presence', async () => {
    const present = isClarifyProbePresence({
      ok: false,
      error: { code: 'internal', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` },
    })
    expect(present).toBe(true)
    expect(isClarifyReceiverPresent({
      ok: false,
      error: { code: 'PROCESS_NOT_FOUND', message: 'PROCESS_NOT_FOUND' },
    })).toBe(true)
    expect(isClarifyProbePresence({
      ok: false,
      error: { code: 'internal', message: 'process other-proc-1 does not exist' },
    })).toBe(false)
  })

  it('does not treat unrelated business errors or a successful echo as probe presence', () => {
    const sessionRequired = { ok: false, error: { code: 'SESSION_ID_REQUIRED', message: 'sessionId is required' } }
    const invalidAnswer = { ok: false, error: { code: 'INVALID_ANSWER', message: 'INVALID_ANSWER' } }
    const busy = { ok: false, error: { code: 'PROCESS_BUSY', message: 'already inferring' } }
    const okEcho = { ok: true, value: { processId: 'should-not-prove-presence' } }
    expect(isClarifyBusinessError(sessionRequired)).toBe(true)
    expect(isClarifyBusinessError(invalidAnswer)).toBe(true)
    expect(isClarifyBusinessError(busy)).toBe(true)
    expect(isClarifyProbePresence(sessionRequired)).toBe(false)
    expect(isClarifyProbePresence(invalidAnswer)).toBe(false)
    expect(isClarifyProbePresence(busy)).toBe(false)
    expect(isClarifyProbePresence(okEcho)).toBe(false)
    expect(isClarifyReceiverPresent(sessionRequired)).toBe(false)
  })

  it('treats transport and endpoint unavailability as absence', async () => {
    expect(isClarifyReceiverPresent({
      ok: false,
      error: { code: 'invocation-unavailable', message: 'no active Remote method exports this endpoint' },
    })).toBe(false)
    expect(isClarifyReceiverPresent({
      ok: false,
      error: { code: 'internal', message: 'connection: no RPC handler for "/api/clarify/fetchDraft"' },
    })).toBe(false)
    await expect(probeClarifyRemote(async () => {
      throw new Error('transport failure for /api/clarify/fetchDraft: HTTP 404')
    })).resolves.toBe(false)
  })

  it('calls start/answer/cancel/fetchDraft through ConnectionHandle.rpc.call shape', async () => {
    const seen: Array<{ endpoint: string; payload: unknown }> = []
    const rpc: ClarifyRpcCaller = async (channel, endpoint, payload) => {
      expect(channel).toBe('/api')
      seen.push({ endpoint, payload })
      return {
        ok: true,
        value: {
          processId: 'p1',
          sessionId: 's1',
          status: 'running',
          contextVersion: 'ctx',
          modelRouteId: 'route',
        },
      }
    }
    await callClarify(rpc, 'start', { sessionId: 's1', seedText: 'half' })
    await callClarify(rpc, 'answer', { processId: 'p1', questionId: 'q1', selectedOptionIds: ['o1'] })
    await callClarify(rpc, 'cancel', { processId: 'p1' })
    await callClarify(rpc, 'fetchDraft', { processId: 'p1' })
    expect(seen.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/answer',
      'clarify/cancel',
      'clarify/fetchDraft',
    ])
    expect(seen[0]?.payload).toEqual({ args: { sessionId: 's1', seedText: 'half' } })
    expect(seen[1]?.payload).toEqual({
      args: { processId: 'p1', questionId: 'q1', selectedOptionIds: ['o1'] },
    })
  })

  it('omits empty optional seed and empty selectedOptionIds from the wire args', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => ({
      ok: true,
      value: { processId: 'p1', sessionId: 's1', status: 'running', contextVersion: 'c', modelRouteId: 'r' },
    }))
    await callClarify(rpc, 'start', { sessionId: 's1', seedText: '' })
    expect(rpc.mock.calls[0]?.[2]).toEqual({ args: { sessionId: 's1' } })
  })

  it('snapshots selectedOptionIds so later caller mutation cannot change an in-flight RPC', async () => {
    const selected = ['o1']
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const seen: unknown[] = []
    const pending = callClarify(async (_channel, _endpoint, payload) => {
      seen.push(payload)
      await held
      return {
        ok: true,
        value: { processId: 'p1', sessionId: 's1', status: 'complete', contextVersion: 'c', modelRouteId: 'r' },
      }
    }, 'answer', { processId: 'p1', questionId: 'q1', selectedOptionIds: selected })
    selected[0] = 'mutated'
    selected.push('extra')
    release()
    await pending
    expect(seen[0]).toEqual({
      args: { processId: 'p1', questionId: 'q1', selectedOptionIds: ['o1'] },
    })
  })

  it('rejects duplicate remote optionIds and copies question options away from the caller', () => {
    const options = [{ optionId: 'o1', text: 'A' }]
    const question = {
      questionId: 'q1',
      text: 'Choose one',
      multiple: false,
      allowCustom: false,
      options,
    }
    const value = {
      processId: 'p1',
      sessionId: 's1',
      status: 'running',
      contextVersion: 'c',
      modelRouteId: 'r',
      question,
      draft: 'must-not-be-read-from-running',
    }
    const parsed = parseClarifyEcho(value)
    options.push({ optionId: 'o2', text: 'B' })
    options[0]!.text = 'mutated'
    expect(parsed.question?.options).toEqual([{ optionId: 'o1', text: 'A' }])
    expect(parsed.draft).toBeUndefined()
    expect(() => parseClarifyEcho({
      ...value,
      question: {
        ...question,
        options: [
          { optionId: 'dup', text: 'One' },
          { optionId: 'dup', text: 'Two' },
        ],
      },
    })).toThrow(/unique/i)
  })

  it('reads draft only from a complete fetchDraft echo', () => {
    const complete = {
      processId: 'p1',
      sessionId: 's1',
      status: 'complete',
      contextVersion: 'c',
      modelRouteId: 'r',
      draft: 'from-answer',
      answer: { draft: 'nested-answer-must-be-ignored' },
    }
    expect(parseClarifyEcho(complete).draft).toBeUndefined()
    expect(parseClarifyEcho(complete, { allowDraft: false }).draft).toBeUndefined()
    expect(parseClarifyEcho(complete, { allowDraft: true }).draft).toBe('from-answer')
    expect(parseClarifyEcho({ ...complete, status: 'stale' }, { allowDraft: true }).draft).toBeUndefined()
  })

  it('lets stale and complete dominate malformed question and leaked draft fields', () => {
    const malformedQuestion = {
      questionId: '',
      text: '',
      multiple: 'legacy',
      options: 'not-an-array',
    }
    const stale = parseClarifyEcho({
      processId: 'p1',
      sessionId: 's1',
      status: 'stale',
      contextVersion: 'c',
      modelRouteId: 'r',
      staleReason: 'ttl-expired',
      question: malformedQuestion,
      draft: 'LEAKED-STALE',
    }, { allowDraft: true })
    expect(stale).toMatchObject({
      processId: 'p1',
      status: 'stale',
      staleReason: 'ttl-expired',
    })
    expect(stale.question).toBeUndefined()
    expect(stale.draft).toBeUndefined()

    const complete = parseClarifyEcho({
      processId: 'p1',
      sessionId: 's1',
      status: 'complete',
      contextVersion: 'c',
      modelRouteId: 'r',
      question: malformedQuestion,
      draft: 'LEAKED-COMPLETE',
    })
    expect(complete.status).toBe('complete')
    expect(complete.question).toBeUndefined()
    expect(complete.draft).toBeUndefined()
  })

  it('rejects empty session binding fields', () => {
    const base = {
      processId: 'p1',
      sessionId: 's1',
      status: 'complete',
      contextVersion: 'c',
      modelRouteId: 'r',
    }
    expect(() => parseClarifyEcho({ ...base, sessionId: '' })).toThrow(/binding/i)
    expect(() => parseClarifyEcho({ ...base, contextVersion: '   ' })).toThrow(/binding/i)
    expect(() => parseClarifyEcho({ ...base, modelRouteId: '' })).toThrow(/binding/i)
  })
})
