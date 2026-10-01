import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { ContinuedQuestionController, continuedQuestionCommand, validateContinuedAnswer, type ContinuedQuestionRemote } from '../src/client/continued-question-view.ts'
import { questionSource, syntheticContinuedProjection, syntheticContinuedAnswer } from './fixtures/continued-questions.ts'
import { deferred, freshSignal, scriptedOverlays, tick } from './fixtures/optional-native-views.ts'
const capability = new Set(['userQuestions/answer'])
const active = syntheticContinuedProjection.active[0]!
function fixture(owner?: string, timeoutMs = 1000) {
  const scope = questionSource(owner); let methods: ReadonlySet<string> | undefined = capability
  const answer = vi.fn<ContinuedQuestionRemote['answer']>(async () => ({ ok: true, value: true }))
  const controller = new ContinuedQuestionController(scope.source, { answer }, () => methods, timeoutMs)
  return { ...scope, answer, controller, methods: (value: ReadonlySet<string> | undefined) => { methods = value } }
}
const select = (f: ReturnType<typeof fixture>) => f.controller.rows()[0]!
afterEach(() => vi.useRealTimers())
describe('continued question recovery', () => {
  it('continued → queued → settled follows native projection, never the true receipt alone', async () => {
    const f = fixture(); const change = vi.fn(); const unsubscribe = f.controller.subscribe(change)
    expect(select(f).status).toBe('continued')
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).resolves.toBe('queued')
    expect(select(f).status).toBe('queued'); expect(select(f).answers).toBeUndefined()
    expect(f.answer).toHaveBeenCalledWith('synthetic-question-owner', 'synthetic-call', syntheticContinuedAnswer)
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('queued')
    f.settle(); expect(select(f).status).toBe('settled'); expect(select(f).answers).toEqual(syntheticContinuedAnswer.answers)
    expect(change).toHaveBeenCalled(); expect(f.answer).toHaveBeenCalledTimes(1)
    unsubscribe(); f.controller.dispose(); expect(f.listeners.size).toBe(0)
  })
  it('admitted native projection before a successful receipt permits settled outcome', async () => {
    const f = fixture(); f.answer.mockImplementationOnce(async () => { f.settle(); return { ok: true, value: true } })
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).resolves.toBe('settled')
  })
  it.each([undefined, new Set<string>()])('unknown/missing published descriptor refuses dispatch: %s', async methods => {
    const f = fixture(); f.methods(methods)
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(); expect(f.answer).not.toHaveBeenCalled()
  })
  it.each([{ liveRoot: undefined }, { liveRoot: false, liveRootReason: 'CALLER_NOT_LIVE' }, { liveRoot: false, liveRootReason: 'DELEGATED_CALLER' }])('exact live root required: %s', async patch => {
    const f = fixture(); f.set(patch)
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(); expect(f.answer).not.toHaveBeenCalled()
  })
  it.each(['open', 'future'])('foreground and unknown states refuse background answer: %s', async state => {
    const f = fixture(); f.set({ projection: { active: [{ ...active, state }], settled: [] } })
    expect(select(f).status).toBe(state === 'open' ? 'open' : 'invalid')
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(); expect(f.answer).not.toHaveBeenCalled()
  })
  it('absent or conflicting projections cannot synthesize a valid question', () => {
    const f = fixture(); f.set({ projection: undefined }); expect(() => f.controller.rows()).toThrow('absent')
    f.set({ projection: { active: [active, active], settled: [] } }); expect(() => f.controller.rows()).toThrow('Conflicting')
    f.set({ projection: { active: [active], settled: [{ callId: active.callId, answers: [] }] } }); expect(() => f.controller.rows()).toThrow('both')
  })
  it('duplicate question IDs and unknown plan-review choices are disabled', async () => {
    const f = fixture(); f.set({ projection: { active: [{ ...active, questions: [active.questions[0], active.questions[0]] }], settled: [] } })
    expect(select(f).status).toBe('invalid')
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(); expect(f.answer).not.toHaveBeenCalled()
    f.set({ projection: { active: [{ ...active, questions: [{ ...active.questions[0], intent: { kind: 'plan-review', approve: 'foreign' } }] }], settled: [] } })
    expect(select(f).status).toBe('invalid')
  })
  it.each(['capability', 'identity', 'projection'])('reentrant observer withdrawal is rechecked before dispatch: %s', async kind => {
    const f = fixture(); let withdrawn = false; f.controller.subscribe(() => {
      if (withdrawn || select(f).status !== 'submitting') return
      withdrawn = true
      if (kind === 'capability') f.methods(undefined)
      else if (kind === 'identity') f.set({ liveRoot: false })
      else f.set({ projection: { active: [{ ...active, state: 'open' }], settled: [] } })
    })
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(); expect(f.answer).not.toHaveBeenCalled()
  })
  it.each([{ generation: 2 }, { sessionId: 'other-owner' }, { projection: { active: [{ ...active, questions: [{ id: 'different', question: 'Changed' }] }], settled: [] } }])('stale selection cannot dispatch: %s', async patch => {
    const f = fixture(); const row = select(f); f.set(patch)
    await expect(f.controller.answer(row, syntheticContinuedAnswer, freshSignal())).rejects.toThrow('stale'); expect(f.answer).not.toHaveBeenCalled()
  })
  it.each(['BAD_ANSWER', 'CALLER_NOT_LIVE', 'DELEGATED_CALLER'])('authentic native non-queue error is displayed and does not claim settlement: %s', async code => {
    const f = fixture(); f.answer.mockRejectedValueOnce(new UserQuestionError('Synthetic rejection', code))
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow(`${code}: Synthetic rejection`)
    expect(select(f).status).toBe('continued')
  })
  it('authentic REPLY_QUEUED prevents duplicate retry and awaits real admission', async () => {
    const f = fixture(); f.answer.mockRejectedValueOnce(new UserQuestionError('Already queued', 'REPLY_QUEUED'))
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('REPLY_QUEUED')
    expect(select(f).status).toBe('queued'); expect(select(f).evidence).toContain('REPLY_QUEUED')
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('queued'); expect(f.answer).toHaveBeenCalledTimes(1)
    f.settle(); expect(select(f).status).toBe('settled')
  })
  it('generic RPC error preserves gateway code, never reconstructs business code from message', async () => {
    const f = fixture(); f.answer.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'REPLY_QUEUED-like wording', {}) })
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('gateway/internal')
    expect(select(f).status).toBe('unknown'); expect(f.controller.answerReason(select(f))).toContain('Do not blindly retry')
  })
  it('false native receipt is not queued or settled', async () => {
    const f = fixture(); f.answer.mockResolvedValueOnce({ ok: true, value: false })
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('no longer continued')
    expect(select(f).status).toBe('continued'); expect(select(f).answers).toBeUndefined()
  })
  it.each(['success', 'error'])('disconnect then reconnect rereads projection and fences late %s', async kind => {
    const f = fixture(); const pending = deferred<RemoteResult<boolean>>(); f.answer.mockReturnValueOnce(pending.promise)
    const work = f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal()); f.set({ ready: false })
    await expect(work).rejects.toThrow('may have completed'); f.set({ ready: true, generation: 2 })
    expect(select(f).status).toBe('unknown')
    if (kind === 'success') pending.resolve({ ok: true, value: true }); else pending.reject(new UserQuestionError('Late rejection', 'BAD_ANSWER'))
    await tick(); expect(select(f).status).toBe('unknown')
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('unknown'); expect(f.answer).toHaveBeenCalledTimes(1)
    f.settle(); expect(select(f).status).toBe('settled'); expect(f.listeners.size).toBe(1)
    f.controller.dispose(); expect(f.listeners.size).toBe(0)
  })
  it('cancelled observation never cancels persisted question or automatically retries', async () => {
    const f = fixture(); const pending = deferred<RemoteResult<boolean>>(); f.answer.mockReturnValueOnce(pending.promise)
    const abort = new AbortController(); const work = f.controller.answer(select(f), syntheticContinuedAnswer, abort.signal); abort.abort()
    await expect(work).rejects.toThrow('may have completed'); expect(select(f).status).toBe('unknown')
    expect(f.source.getSnapshot().projection).toBe(syntheticContinuedProjection)
    pending.resolve({ ok: true, value: true }); await tick(); expect(select(f).status).toBe('unknown'); expect(f.answer).toHaveBeenCalledTimes(1)
  })
  it('disposal aborts only pending UI observation and cleans source subscription', async () => {
    const f = fixture(); const pending = deferred<RemoteResult<boolean>>(); f.answer.mockReturnValueOnce(pending.promise)
    const work = f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal()); f.controller.dispose()
    await expect(work).rejects.toThrow('may have completed'); expect(f.listeners.size).toBe(0)
    pending.resolve({ ok: true, value: true }); await tick(); expect(() => f.controller.rows()).toThrow('disposed')
    expect(f.source.getSnapshot().projection).toBe(syntheticContinuedProjection)
  })
  it('timeout bounds noncooperative answer observation with no retry or fake settlement', async () => {
    vi.useFakeTimers(); const f = fixture(undefined, 25); f.answer.mockReturnValueOnce(new Promise(() => {}))
    const work = f.controller.answer(select(f), syntheticContinuedAnswer, freshSignal()); const check = expect(work).rejects.toThrow('may have completed')
    await vi.advanceTimersByTimeAsync(26); await check
    expect(select(f).status).toBe('unknown'); expect(f.answer).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(1)
  })
  it('pre-aborted request cannot dispatch or leave local pending state', async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort()
    await expect(f.controller.answer(select(f), syntheticContinuedAnswer, abort.signal)).rejects.toThrow()
    expect(select(f).status).toBe('continued'); expect(f.answer).not.toHaveBeenCalled()
  })
  it('two instances isolate same callId by owner; switching back retains its queued safety lock', async () => {
    const a = fixture('owner-a'); const b = fixture('owner-b')
    await a.controller.answer(select(a), syntheticContinuedAnswer, freshSignal())
    expect(select(b).status).toBe('continued'); await b.controller.answer(select(b), syntheticContinuedAnswer, freshSignal())
    expect(a.answer.mock.calls[0]?.[0]).toBe('owner-a'); expect(b.answer.mock.calls[0]?.[0]).toBe('owner-b')
    a.set({ sessionId: 'owner-c', generation: 2 }); expect(select(a).status).toBe('continued')
    a.set({ sessionId: 'owner-a', generation: 3 }); expect(select(a).status).toBe('queued')
  })
  it('a second instance on the same owner relies on the native duplicate gate, not shared UI claims', async () => {
    const a = fixture(); const b = fixture(); await a.controller.answer(select(a), syntheticContinuedAnswer, freshSignal())
    expect(select(b).status).toBe('continued'); b.answer.mockRejectedValueOnce(new UserQuestionError('Already queued', 'REPLY_QUEUED'))
    await expect(b.controller.answer(select(b), syntheticContinuedAnswer, freshSignal())).rejects.toThrow('REPLY_QUEUED')
    expect(select(b).status).toBe('queued')
  })
})
describe('human answer batch and terminal entry', () => {
  it.each([
    { answers: [] }, { answers: [syntheticContinuedAnswer.answers[0]!, syntheticContinuedAnswer.answers[0]!] },
    { answers: [{ id: 'choice', selected: ['foreign'] }, syntheticContinuedAnswer.answers[1]!] },
    { answers: [{ id: 'choice', selected: ['检查', '修复'] }, syntheticContinuedAnswer.answers[1]!] },
    { answers: [{ id: 'choice', selected: ['检查'], custom: 'both' }, syntheticContinuedAnswer.answers[1]!] },
    { answers: [syntheticContinuedAnswer.answers[0]!, { id: 'notes', selected: [], custom: ' ' }] },
  ])('invalid identity/selection batch cannot dispatch: %s', async answer => {
    const f = fixture(); await expect(f.controller.answer(select(f), answer, freshSignal())).rejects.toThrow('BAD_ANSWER'); expect(f.answer).not.toHaveBeenCalled()
  })
  it('explicit multi-select and skip remain human choices', () => {
    const questions = [{ ...active.questions[0]!, multiSelect: true }, active.questions[1]!]
    expect(validateContinuedAnswer(questions, { answers: [{ id: 'choice', selected: ['检查', '修复'] }, { id: 'notes', selected: [] }] }).answers).toHaveLength(2)
  })
  it('terminal entry collects all questions, reviews batch, queues without claiming settled', async () => {
    const f = fixture(); const view = scriptedOverlays(['question:synthetic-call', 'answer', '0', 'custom', undefined], ['Synthetic notes 😀'], [true])
    await continuedQuestionCommand(f.controller, view.overlays)
    expect(f.answer.mock.calls[0]?.[2]).toEqual({ answers: [{ id: 'choice', selected: ['检查'] }, { id: 'notes', selected: [], custom: 'Synthetic notes 😀' }] })
    expect(view.details.some(row => /Reply queued|回复已入队/.test(row.content))).toBe(true)
    expect(view.details.some(row => /projection confirms|投影已确认/.test(row.content))).toBe(false)
  })
  it.each(['page', 'question', 'input', 'decline'])('closing %s does not answer, claim attachWait, or cancel durable question', async kind => {
    const f = fixture(); const selections = kind === 'page' ? [undefined] : kind === 'question' ? ['question:synthetic-call', 'answer', undefined] : ['question:synthetic-call', 'answer', '0', 'custom', undefined]
    const view = scriptedOverlays(selections, [kind === 'input' ? undefined : 'Synthetic notes'], [false])
    await continuedQuestionCommand(f.controller, view.overlays)
    expect(f.answer).not.toHaveBeenCalled(); expect(f.source.getSnapshot().projection).toBe(syntheticContinuedProjection)
    expect(select(f).status).toBe('continued')
  })
  it('terminal multi-select and skip send explicit human choices for the complete batch', async () => {
    const f = fixture(); f.set({ projection: { active: [{ ...active, questions: [{ ...active.questions[0]!, multiSelect: true }, active.questions[1]!] }], settled: [] } })
    const view = scriptedOverlays(['question:synthetic-call', 'answer', 'multiple', 'skip', undefined], [], [true])
    view.overlays.multiSelect = async request => request.choices
    await continuedQuestionCommand(f.controller, view.overlays)
    expect(f.answer.mock.calls[0]?.[2]).toEqual({ answers: [{ id: 'choice', selected: ['检查', '修复'] }, { id: 'notes', selected: [] }] })
  })
  it('terminal permission failure shows native error and holds unknown outcome without retry', async () => {
    const f = fixture(); f.answer.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Permission denied', {}) })
    const view = scriptedOverlays(['question:synthetic-call', 'answer', 'skip', 'skip', undefined], [], [true])
    await continuedQuestionCommand(f.controller, view.overlays)
    expect(view.details.some(row => row.content.includes('gateway/internal: Permission denied'))).toBe(true)
    expect(select(f).status).toBe('unknown'); expect(f.answer).toHaveBeenCalledTimes(1)
  })
  it('record/refresh show native evidence and the foreground gate without dispatch', async () => {
    const f = fixture(); f.set({ projection: { active: [{ ...active, state: 'open' }], settled: [] } })
    const view = scriptedOverlays(['refresh', 'question:synthetic-call', 'record', undefined]); await continuedQuestionCommand(f.controller, view.overlays)
    expect(view.details[0]?.content).toContain('open'); expect(view.selects[2]?.choices.find(row => row.id === 'answer')?.disabledReason).toContain('Foreground')
    expect(f.answer).not.toHaveBeenCalled()
  })
  it('refresh selection is stable by call identity when rows reorder', async () => {
    const f = fixture(); const other = { ...active, callId: 'second-call', questions: [{ id: 'second', question: 'Second question' }] }
    f.set({ projection: { active: [active, other], settled: [] } })
    const view = scriptedOverlays([]); let step = 0
    view.overlays.select = async request => {
      view.selects.push(request)
      if (step++ === 0) { f.set({ projection: { active: [other, active], settled: [] } }); await request.refreshChoices?.(); return request.choices.find(row => row.id === 'question:synthetic-call') }
      if (step === 2) return request.choices.find(row => row.id === 'record')
      return undefined
    }
    await continuedQuestionCommand(f.controller, view.overlays)
    expect(view.details[0]?.content).toContain('synthetic-call'); expect(view.details[0]?.content).not.toContain('second-call'); expect(f.answer).not.toHaveBeenCalled()
  })
})
