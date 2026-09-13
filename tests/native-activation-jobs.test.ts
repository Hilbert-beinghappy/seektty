import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionSeq, SessionStore } from '@deepseek-ai/dsh-session'
import { LlmAttemptId } from '@deepseek-ai/dsh-llm/brand'
import { expect, it } from 'vitest'
import { NativeTerminalApi } from '../src/host/api-compat.ts'
import { NativeAssistantStream } from '../src/client/native-assistant-stream.ts'
import { SessionManager } from '../vendor/client-runtime/client/sessions/manager.js'

it.each([[true, 'baseline'], [false, 'baseline'], [true, 'updated'], [false, 'updated'], [true, 'empty'], [false, 'empty']] as const)('preserves the latest jobs with control-first=%s and %s snapshot', async (controlFirst, mode) => {
  const ctx = new Context()
  const store = new SessionStore(ctx)
  const session = store.create(SessionId('review-session'))
  const gate = Promise.withResolvers<void>()
  const jobs = [{ id: 'running-build', kind: 'bash', label: 'build', status: 'running', startedAt: 1 }]
  const latestJobs = mode === 'empty' ? [] : [{ ...jobs[0]!, id: 'new-build' }]
  const waitForAbort = (signal: AbortSignal) => new Promise<void>(resolve => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
  ctx.provide('sessionController')
  ctx.set('sessionController', {
    async *follow(_request: unknown, signal: AbortSignal) {
      if (controlFirst) await gate.promise
      yield { type: 'snapshot', header: session.header, cursor: -1, records: [], hasMore: false, projections: { asOfSeq: -1, values: {} } }
      if (!controlFirst) gate.resolve()
      await waitForAbort(signal)
    },
    async *control(signal: AbortSignal) {
      if (!controlFirst) await gate.promise
      yield { type: 'baseline', value: { queues: {}, jobs: { 'review-session': jobs }, projections: {} } }
      if (mode !== 'baseline') yield { type: 'jobs', sessionId: 'review-session', jobs: latestJobs }
      if (controlFirst) gate.resolve()
      await waitForAbort(signal)
    },
  })
  const api = new NativeTerminalApi(ctx)
  const manager = new SessionManager(api, ctx.remote, undefined, undefined, undefined)
  const abort = new AbortController()
  const stream = api.openMux({}, abort.signal)[Symbol.asyncIterator]()
  try {
    for (let i = 0; i < ((controlFirst ? 3 : 2) + (mode === 'baseline' ? 0 : 1)); i++) manager.handleMuxEnvelope((await stream.next()).value!)
    expect(manager.getListSnapshot().jobsBySession[SessionId('review-session')]).toEqual(mode === 'empty' ? undefined : mode === 'baseline' ? jobs : latestJobs)
  } finally {
    abort.abort()
    await stream.return?.()
    await ctx.fiber.dispose()
  }
})

it('shows a new activation whose official assistant revision starts again at one', () => {
  const stream = new NativeAssistantStream()
  const first = LlmAttemptId('first-activation')
  stream.accept({ type: 'start', attemptId: first, revision: 1, startedAfterSeq: -1, turn: 1, step: 1 })
  stream.accept({ type: 'chunk', attemptId: first, revision: 2, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'first' } })
  stream.accept({ type: 'end', attemptId: first, revision: 3, index: 1, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 9 } })
  stream.settle(9)
  const second = LlmAttemptId('second-activation')
  stream.accept({ type: 'start', attemptId: second, revision: 1, startedAfterSeq: SessionSeq(9), turn: 2, step: 1 })
  stream.accept({ type: 'chunk', attemptId: second, revision: 2, index: 0, time: 2, chunk: { type: 'text-delta', index: 0, text: 'second' } })
  expect(stream.snapshot()?.blocks).toEqual([{ kind: 'text', text: 'second' }])
})
