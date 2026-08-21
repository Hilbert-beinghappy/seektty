import { describe, expect, it, vi } from 'vitest'
import {
  CLARIFY_API_CHANNEL,
  CLARIFY_PROBE_PROCESS_ID,
  CLARIFY_WIRE_PROTOCOL,
  callClarify,
  isClarifyBusinessError,
  isClarifyProbePresence,
  isClarifyReceiverPresent,
  parseClarifyEcho,
  probeClarifyRemote,
  requireClarifyCompatibleHost,
  requireClarifySixMethodHost,
  type ClarifyRpcCaller,
} from '../src/client/clarify-remote.ts'

function caller(impl: ClarifyRpcCaller): ClarifyRpcCaller {
  return impl
}

const echo = {
  processId: 'p1',
  sessionId: 's1',
  status: 'running',
  contextVersion: 'c',
  modelRouteId: 'r',
  kind: 'await_accept',
  previewVersion: 'pv1',
  draftPreview: 'Preview',
  materialChanges: ['Changed the goal'],
}

function wireOk(value: unknown) {
  return { ok: true as const, value: { protocol: CLARIFY_WIRE_PROTOCOL, ok: true as const, value } }
}

function wireErr(code: string, message: string, category: string) {
  return {
    ok: true as const,
    value: {
      protocol: CLARIFY_WIRE_PROTOCOL,
      ok: false as const,
      error: { code, message, category },
    },
  }
}

describe('Clarify Remote probe and public RPC wrapper', () => {
  it('probes with fetchDraft then refine and requires both methods', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async (channel, endpoint, payload) => {
      expect(channel).toBe(CLARIFY_API_CHANNEL)
      if (endpoint === 'clarify/fetchDraft') {
        expect(payload).toEqual({ args: { processId: CLARIFY_PROBE_PROCESS_ID } })
        return { ok: false, error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` } }
      }
      expect(endpoint).toBe('clarify/refine')
      expect(payload).toEqual({
        args: { processId: CLARIFY_PROBE_PROCESS_ID, previewVersion: 'probe', feedback: 'probe' },
      })
      return { ok: false, error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` } }
    })
    await expect(probeClarifyRemote(caller(rpc))).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('treats a five-method Host as absent for the catalog probe', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async (_channel, endpoint) => {
      if (endpoint === 'clarify/fetchDraft') {
        return { ok: false, error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` } }
      }
      return { ok: false, error: { code: 'method-unavailable', message: 'no active Remote method exports this endpoint' } }
    })
    await expect(probeClarifyRemote(caller(rpc))).resolves.toBe(false)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it.each(['SESSION_ID_REQUIRED', 'INVALID_ANSWER', 'PROCESS_BUSY'])(
    'does not accept unrelated %s from refine as six-method presence',
    async (code) => {
      const rpc = vi.fn<ClarifyRpcCaller>(async (_channel, endpoint) => {
        if (endpoint === 'clarify/fetchDraft') {
          return { ok: false, error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` } }
        }
        return { ok: false, error: { code, message: `${code}: unrelated validation path` } }
      })
      await expect(probeClarifyRemote(caller(rpc))).resolves.toBe(false)
      await expect(requireClarifySixMethodHost(caller(rpc))).rejects.toThrow(/six-method|refine/i)
    },
  )

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
    expect(isClarifyBusinessError(sessionRequired)).toBe(false)
    expect(isClarifyBusinessError(invalidAnswer)).toBe(false)
    expect(isClarifyBusinessError(busy)).toBe(false)
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

  it('calls start/answer/accept/refine/cancel/fetchDraft through ConnectionHandle.rpc.call shape', async () => {
    const seen: Array<{ endpoint: string; payload: unknown }> = []
    const rpc: ClarifyRpcCaller = async (channel, endpoint, payload) => {
      expect(channel).toBe('/api')
      seen.push({ endpoint, payload })
      return wireOk({
        processId: 'p1',
        sessionId: 's1',
        status: 'running',
        contextVersion: 'ctx',
        modelRouteId: 'route',
        kind: 'await_accept',
        previewVersion: 'pv1',
        draftPreview: 'Preview',
        materialChanges: ['Changed the goal'],
      })
    }
    await callClarify(rpc, 'start', { sessionId: 's1', seedText: 'half' })
    await callClarify(rpc, 'answer', { processId: 'p1', questionId: 'q1', previewVersion: 'pv0', selectedOptionIds: ['o1'] })
    await callClarify(rpc, 'accept', { processId: 'p1', previewVersion: 'pv1' })
    await callClarify(rpc, 'refine', { processId: 'p1', previewVersion: 'pv1', feedback: 'add rollback' })
    await callClarify(rpc, 'cancel', { processId: 'p1' })
    await callClarify(rpc, 'fetchDraft', { processId: 'p1' })
    expect(seen.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/answer',
      'clarify/accept',
      'clarify/refine',
      'clarify/cancel',
      'clarify/fetchDraft',
    ])
    expect(seen[0]?.payload).toEqual({ args: { sessionId: 's1', seedText: 'half' } })
    expect(seen[1]?.payload).toEqual({
      args: { processId: 'p1', questionId: 'q1', previewVersion: 'pv0', selectedOptionIds: ['o1'] },
    })
    expect(seen[2]?.payload).toEqual({ args: { processId: 'p1', previewVersion: 'pv1' } })
    expect(seen[3]?.payload).toEqual({ args: { processId: 'p1', previewVersion: 'pv1', feedback: 'add rollback' } })
  })

  it('refuses an old five-method Host by name instead of treating refine as optional', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => ({
      ok: false,
      error: { code: 'method-unavailable', message: 'no active Remote method exports this endpoint' },
    }))
    await expect(requireClarifySixMethodHost(caller(rpc))).rejects.toThrow(/dsh-plugin-clarify@0\.1\.0|six-method|refine/i)
  })

  it('omits empty optional seed and empty selectedOptionIds from the wire args', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => wireOk({
      processId: 'p1',
      sessionId: 's1',
      status: 'running',
      contextVersion: 'c',
      modelRouteId: 'r',
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
      return wireOk({ processId: 'p1', sessionId: 's1', status: 'complete', contextVersion: 'c', modelRouteId: 'r' })
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
      kind: 'ask',
      previewVersion: 'pv1',
      draftPreview: 'A preview',
      materialChanges: ['Introduced a concrete goal'],
      question,
      draft: 'must-not-be-read-from-running',
    }
    const parsed = parseClarifyEcho(value)
    options.push({ optionId: 'o2', text: 'B' })
    options[0]!.text = 'mutated'
    expect(parsed.question?.options).toEqual([{ optionId: 'o1', text: 'A' }])
    expect(parsed.materialChanges).toEqual(['Introduced a concrete goal'])
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

  it('rejects malformed running preview state instead of guessing a legacy shape', () => {
    const base = {
      processId: 'p1',
      sessionId: 's1',
      status: 'running',
      contextVersion: 'c',
      modelRouteId: 'r',
      kind: 'await_accept',
      previewVersion: 'pv1',
      draftPreview: 'Preview',
      materialChanges: ['Changed the scope'],
    }
    expect(() => parseClarifyEcho({ ...base, kind: undefined })).toThrow(/kind/i)
    expect(() => parseClarifyEcho({ ...base, previewVersion: '' })).toThrow(/previewVersion/i)
    expect(() => parseClarifyEcho({ ...base, materialChanges: [] })).toThrow(/materialChanges/i)
    expect(() => parseClarifyEcho({ ...base, question: {
      questionId: 'q1', text: 'Unexpected?', options: [{ optionId: 'o1', text: 'Yes' }], multiple: false, allowCustom: false,
    } })).toThrow(/must not include a question/i)
    expect(() => parseClarifyEcho({ ...base, kind: 'ask' })).toThrow(/must include a question/i)
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
describe('clarify.wire/1 client contract', () => {
  it('does not treat gateway-faithful ordinary throw (outer internal) as Clarify business', () => {
    const gatewayInternal = {
      ok: false,
      error: { code: 'internal', message: 'process is already inferring', details: {} },
    }
    expect(isClarifyBusinessError(gatewayInternal)).toBe(false)
    expect(isClarifyProbePresence(gatewayInternal)).toBe(false)
  })

  it('accepts v1 missing-route configuration as outer success and throws with that category', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => wireErr(
      'INFERENCE_UNAVAILABLE',
      'inference snapshot is missing its model route',
      'configuration',
    ))
    await expect(callClarify(caller(rpc), 'start', { sessionId: 's1' })).rejects.toMatchObject({
      code: 'INFERENCE_UNAVAILABLE',
      category: 'configuration',
    })
    expect(isClarifyBusinessError(wireErr(
      'INFERENCE_UNAVAILABLE',
      'inference snapshot is missing its model route',
      'configuration',
    ))).toBe(true)
  })

  it('lets catalog presence see an old six-method Host but refuses v1 activation by name', async () => {
    const oldSix: ClarifyRpcCaller = async (_channel, endpoint) => {
      if (endpoint === 'clarify/fetchDraft' || endpoint === 'clarify/refine') {
        return {
          ok: false,
          error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist` },
        }
      }
      throw new Error(`unexpected ${endpoint}`)
    }
    await expect(probeClarifyRemote(caller(oldSix))).resolves.toBe(true)
    await expect(requireClarifyCompatibleHost(caller(oldSix))).rejects.toThrow(/clarify\.wire\/1|compatible|六方法/i)
    await expect(requireClarifySixMethodHost(caller(oldSix))).rejects.toThrow(/clarify\.wire\/1|compatible|六方法/i)
  })

  it('activates only when both fetchDraft and refine are outer-success inner-v1 PROCESS_NOT_FOUND', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async (_channel, endpoint) => {
      expect(['clarify/fetchDraft', 'clarify/refine']).toContain(endpoint)
      return wireErr('PROCESS_NOT_FOUND', `process ${CLARIFY_PROBE_PROCESS_ID} does not exist`, 'conflict')
    })
    await expect(probeClarifyRemote(caller(rpc))).resolves.toBe(true)
    await expect(requireClarifyCompatibleHost(caller(rpc))).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledTimes(4)
  })

  it('refuses a new shell talking to an old bare echo', async () => {
    await expect(callClarify(caller(async () => ({ ok: true, value: echo })), 'start', { sessionId: 's1' }))
      .rejects.toMatchObject({ category: 'protocol' })
  })

  it('refuses a malformed inner wire instead of guessing an echo', async () => {
    await expect(callClarify(caller(async () => ({
      ok: true,
      value: { protocol: 'clarify.wire/2', ok: true, value: echo },
    })), 'start', { sessionId: 's1' })).rejects.toMatchObject({ category: 'protocol' })
    await expect(callClarify(caller(async () => ({
      ok: true,
      value: { protocol: CLARIFY_WIRE_PROTOCOL, ok: false, error: { code: 'PROCESS_BUSY', message: 'busy' } },
    })), 'answer', { processId: 'p1' })).rejects.toMatchObject({ category: 'protocol' })
  })

  it('unwraps v1 success before parseClarifyEcho and keeps draft-only-on-fetchDraft', async () => {
    const value = await callClarify(caller(async () => wireOk(echo)), 'start', { sessionId: 's1' })
    expect(parseClarifyEcho(value)).toMatchObject({ processId: 'p1', status: 'running' })
  })
})
