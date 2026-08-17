import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot,
  PendingWait,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  TuiActions,
  type TuiActionHost,
} from '../src/client/actions.ts'
import type {
  HarnessTuiCapabilities,
  TuiActiveSession,
} from '../src/client/capabilities.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

function host(overlays: Partial<OverlayQueue>, transcript: Partial<Transcript>): TuiActionHost {
  return {
    overlays: overlays as OverlayQueue,
    transcript: transcript as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

function questionBatch(count: number): PendingWait<'question'> {
  return {
    key: 'question:batch',
    kind: 'question',
    sessionId: 'session' as SessionId,
    payload: {
      questions: Array.from({ length: count }, (_, index) => ({
        id: `q${String(index + 1)}`,
        header: '问题',
        question: `第 ${String(index + 1)} 题`,
        options: [{ label: `选项${String(index + 1)}` }],
        multiSelect: false,
      })),
    },
  } as unknown as PendingWait<'question'>
}

function pendingActions(
  wait: PendingWait<'question'>,
  overlays: Partial<OverlayQueue>,
): {
  readonly actions: TuiActions
  readonly answerQuestion: ReturnType<typeof vi.fn>
  readonly cancelQuestion: ReturnType<typeof vi.fn>
} {
  const snapshot = { pending: [wait] } as unknown as ConversationSnapshot
  const answerQuestion = vi.fn(async () => undefined)
  const cancelQuestion = vi.fn(async () => undefined)
  const active = {
    session: { getSnapshot: () => snapshot },
  } as unknown as TuiActiveSession
  const capabilities = {
    active: () => active,
    answerQuestion,
    cancelQuestion,
  } as unknown as HarnessTuiCapabilities
  const actions = new TuiActions(capabilities, host(overlays, { followLatest: vi.fn() }))
  return { actions, answerQuestion, cancelQuestion }
}

describe('pending interaction continuation', () => {
  it('returns to the latest transcript before submitting a selected answer', async () => {
    const question = {
      key: 'question:package',
      kind: 'question',
      sessionId: 'session' as SessionId,
      payload: {
        questions: [{
          id: 'which_pkg',
          header: '确认文件',
          question: '您指的是哪个 package.json？',
          options: [{ label: 'visualtex-src 根目录 (Recommended)' }],
          multiSelect: false,
        }],
      },
    } as unknown as PendingWait<'question'>
    const snapshot = { pending: [question] } as unknown as ConversationSnapshot
    const followLatest = vi.fn()
    const answerQuestion = vi.fn(async () => undefined)
    const select = vi.fn(async () => ({
      id: 'option:visualtex-src 根目录 (Recommended)',
      label: 'visualtex-src 根目录 (Recommended)',
    }))
    const active = {
      session: { getSnapshot: () => snapshot },
    } as unknown as TuiActiveSession
    const capabilities = {
      active: () => active,
      answerQuestion,
      cancelQuestion: vi.fn(),
    } as unknown as HarnessTuiCapabilities
    const actions = new TuiActions(capabilities, host({ select }, { followLatest }))

    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(answerQuestion).toHaveBeenCalledOnce() })

    expect(followLatest).toHaveBeenCalledOnce()
    expect(followLatest.mock.invocationCallOrder[0])
      .toBeLessThan(answerQuestion.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY)
    expect(answerQuestion).toHaveBeenCalledWith(question, {
      answers: [{ id: 'which_pkg', selected: ['visualtex-src 根目录 (Recommended)'] }],
    })
  })

  it('asks before discarding a batch when Escape is pressed mid-question', async () => {
    const wait = questionBatch(3)
    const seenTitles: string[] = []
    const select = vi.fn(async (request: { title: string; detail?: string }) => {
      seenTitles.push(request.title)
      if (request.title.includes('1/3')) return { id: 'option:选项1', label: '选项1' }
      if (request.title.includes('2/3')) return { id: 'option:选项2', label: '选项2' }
      if (request.title.includes('取消')) {
        expect(request.detail).toContain('2/3')
        return { id: 'continue', label: '继续作答' }
      }
      const thirdShows = seenTitles.filter(title => title.includes('3/3')).length
      if (thirdShows === 1) return undefined
      return { id: 'option:选项3', label: '选项3' }
    })
    const { actions, answerQuestion, cancelQuestion } = pendingActions(wait, { select })

    actions.syncPending({ pending: [wait] } as unknown as ConversationSnapshot)
    await vi.waitFor(() => { expect(answerQuestion).toHaveBeenCalledOnce() })

    expect(cancelQuestion).not.toHaveBeenCalled()
    expect(seenTitles.some(title => title.includes('取消'))).toBe(true)
    expect(answerQuestion).toHaveBeenCalledWith(wait, {
      answers: [
        { id: 'q1', selected: ['选项1'] },
        { id: 'q2', selected: ['选项2'] },
        { id: 'q3', selected: ['选项3'] },
      ],
    })
  })

  it('can skip only the current question after Escape', async () => {
    const wait = questionBatch(2)
    const select = vi.fn(async (request: { title: string }) => {
      if (request.title.includes('1/2')) return undefined
      if (request.title.includes('取消')) return { id: 'skip', label: '仅跳过本题' }
      return { id: 'option:选项2', label: '选项2' }
    })
    const { actions, answerQuestion, cancelQuestion } = pendingActions(wait, { select })

    actions.syncPending({ pending: [wait] } as unknown as ConversationSnapshot)
    await vi.waitFor(() => { expect(answerQuestion).toHaveBeenCalledOnce() })

    expect(cancelQuestion).not.toHaveBeenCalled()
    expect(answerQuestion).toHaveBeenCalledWith(wait, {
      answers: [
        { id: 'q1', selected: [] },
        { id: 'q2', selected: ['选项2'] },
      ],
    })
  })
})
