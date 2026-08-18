import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot,
  PendingWait,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  questionBatchSummary,
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

  it('summarizes answered and skipped items instead of calling skips answered', () => {
    expect(questionBatchSummary([
      { selected: ['a'] },
      { selected: [] },
      { selected: [], custom: 'note' },
    ])).toContain('已处理 3 项（回答 2 · 跳过 1）')
    expect(questionBatchSummary([{ selected: [] }])).not.toContain('已回答')
  })
})
