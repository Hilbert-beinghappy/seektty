import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
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
import { OverlayQueue, type OverlayNavigation } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

const ESCAPE = '\u001B'
const ENTER = '\r'
const UP = '\u001B[A'
const DOWN = '\u001B[B'

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

function liveOverlays(): {
  readonly overlays: OverlayQueue
  component(): Component & { handleInput(data: string): void }
} {
  let mounted: Component | undefined
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide: vi.fn() } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
    terminal: { rows: 24, cols: 80 },
  } as unknown as TUI
  return {
    overlays: new OverlayQueue(tui),
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted as Component & { handleInput(data: string): void }
    },
  }
}

function host(
  overlays: Partial<OverlayQueue> & Partial<OverlayNavigation>,
  transcript: Partial<Transcript>,
): TuiActionHost {
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

function questionOverlays(
  select: OverlayQueue['select'],
  extra: Partial<OverlayQueue> = {},
): Partial<OverlayQueue> {
  const overlays: Partial<OverlayQueue> = { select, ...extra }
  overlays.navigate = async (run) => {
    await run({
      select: overlays.select!,
      multiSelect: overlays.multiSelect ?? (async () => undefined),
      multilineInput: overlays.multilineInput ?? (async () => undefined),
      input: async () => undefined,
      secretInput: async () => undefined,
      secretTransaction: async () => undefined,
      detail: async () => undefined,
      confirm: async () => false,
      progress: async () => undefined,
      selectPage: async () => undefined,
      replaceSelectPage: () => undefined,
      updateChoices: () => undefined,
      back: () => undefined,
      finish: () => undefined,
      signal: new AbortController().signal,
    } as OverlayNavigation<never>)
    return undefined
  }
  return overlays
}

function liveQuestionHarness(wait: PendingWait<'question'>): {
  readonly hide: ReturnType<typeof vi.fn>
  readonly answerQuestion: ReturnType<typeof vi.fn>
  readonly cancelQuestion: ReturnType<typeof vi.fn>
  component(): Component & { handleInput(data: string): void }
  plain(): string
} {
  let mounted: Component | undefined
  const hide = vi.fn()
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
    terminal: { rows: 24, cols: 80 },
  } as unknown as TUI
  const overlays = new OverlayQueue(tui)
  const snapshot = { pending: [wait] } as unknown as ConversationSnapshot
  const answerQuestion = vi.fn(async () => undefined)
  const cancelQuestion = vi.fn(async () => undefined)
  const capabilities = {
    active: () => ({ session: { getSnapshot: () => snapshot } }),
    answerQuestion,
    cancelQuestion,
  } as unknown as HarnessTuiCapabilities
  const actions = new TuiActions(capabilities, host(overlays, { followLatest: vi.fn() }))
  actions.syncPending(snapshot)
  return {
    hide,
    answerQuestion,
    cancelQuestion,
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted as Component & { handleInput(data: string): void }
    },
    plain: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted.render(90).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
    },
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
  overlays: Partial<OverlayQueue> & Partial<OverlayNavigation>,
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
    const actions = new TuiActions(capabilities, host(questionOverlays(select), { followLatest }))

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
    const { actions, answerQuestion, cancelQuestion } = pendingActions(wait, questionOverlays(select))

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
    const { actions, answerQuestion, cancelQuestion } = pendingActions(wait, questionOverlays(select))

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

  it('shows the pending shell command inside the approval overlay', async () => {
    const approval = {
      key: 'approval:shell',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: {
        toolName: 'shell',
        callId: 'call-shell',
        approvalId: 'appr-1',
        reason: '需要执行命令',
      },
    } as unknown as PendingWait<'approval'>
    const snapshot = {
      pending: [approval],
      runningCalls: [{
        callId: 'call-shell',
        name: 'shell',
        argsRaw: '{"command":"ls"}',
        callView: { card: 'terminal', title: 'ls -la src' },
      }],
    } as unknown as ConversationSnapshot
    const followLatest = vi.fn()
    const answerApproval = vi.fn(async () => undefined)
    const finish = vi.fn()
    const detail = vi.fn(async () => undefined)
    const selectPage = vi.fn(async (
      request: { detail?: string; initialChoiceId?: string; choices: readonly { id: string }[] },
      onSelect: (choice: { id: string; label: string }) => Promise<void>,
    ) => {
      expect(request.detail).toContain('$ ls -la src')
      expect(request.initialChoiceId).toBe('reject')
      expect(request.choices.map(choice => choice.id)).toEqual(['allow', 'reject'])
      await onSelect({ id: 'reject', label: '拒绝' })
    })
    const active = {
      session: { getSnapshot: () => snapshot },
    } as unknown as TuiActiveSession
    const capabilities = {
      active: () => active,
      answerApproval,
    } as unknown as HarnessTuiCapabilities
    const actions = new TuiActions(capabilities, host({ selectPage, detail, finish }, { followLatest }))

    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(selectPage).toHaveBeenCalledOnce()
    expect(detail).not.toHaveBeenCalled()
    expect(answerApproval).toHaveBeenCalledWith(approval, 'rejected')
  })

  it('opens full arguments as a child page and keeps the approval selector', async () => {
    const approval = {
      key: 'approval:long',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: {
        toolName: 'shell',
        callId: 'call-long',
        approvalId: 'appr-2',
        reason: '需要执行命令',
      },
    } as unknown as PendingWait<'approval'>
    const longCommand = `printf '${'x'.repeat(1_300)}'`
    const snapshot = {
      pending: [approval],
      runningCalls: [{
        callId: 'call-long',
        name: 'shell',
        argsRaw: JSON.stringify({ command: longCommand }),
        callView: { card: 'terminal', title: longCommand },
      }],
    } as unknown as ConversationSnapshot
    const answerApproval = vi.fn(async () => undefined)
    const finish = vi.fn()
    const detail = vi.fn(async () => undefined)
    const selectPage = vi.fn(async (
      request: { initialChoiceId?: string; choices: readonly { id: string }[] },
      onSelect: (choice: { id: string; label: string }) => Promise<void>,
    ) => {
      expect(request.initialChoiceId).toBe('reject')
      expect(request.choices.map(choice => choice.id)).toEqual(['allow', 'inspect', 'reject'])
      await onSelect({ id: 'inspect', label: '查看完整参数' })
      await onSelect({ id: 'reject', label: '拒绝' })
    })
    const actions = new TuiActions({
      active: () => ({ session: { getSnapshot: () => snapshot } }) as unknown as TuiActiveSession,
      answerApproval,
    } as unknown as HarnessTuiCapabilities, host({ selectPage, detail, finish }, { followLatest: vi.fn() }))

    actions.syncPending(snapshot as ConversationSnapshot)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(selectPage).toHaveBeenCalledOnce()
    expect(detail).toHaveBeenCalledOnce()
    expect(answerApproval).toHaveBeenCalledWith(approval, 'rejected')
  })

  it('cancels the whole batch when Escape is confirmed', async () => {
    const wait = questionBatch(2)
    const select = vi.fn(async (request: { title: string }) => {
      if (request.title.includes('1/2')) return { id: 'option:选项1', label: '选项1' }
      if (request.title.includes('2/2')) return undefined
      return { id: 'cancel', label: '取消全部' }
    })
    const { actions, answerQuestion, cancelQuestion } = pendingActions(wait, questionOverlays(select))

    actions.syncPending({ pending: [wait] } as unknown as ConversationSnapshot)
    await vi.waitFor(() => { expect(cancelQuestion).toHaveBeenCalledOnce() })

    expect(cancelQuestion).toHaveBeenCalledWith(wait)
    expect(answerQuestion).not.toHaveBeenCalled()
  })

  it('defaults to reject and submits rejected when Escape closes the root page', async () => {
    const approval = {
      key: 'approval:root-esc',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: {
        toolName: 'shell',
        callId: 'call-esc',
        approvalId: 'appr-esc',
        reason: '需要执行命令',
      },
    } as unknown as PendingWait<'approval'>
    const snapshot = {
      pending: [approval],
      runningCalls: [{
        callId: 'call-esc',
        name: 'shell',
        argsRaw: '{"command":"ls"}',
        callView: { card: 'terminal', title: 'ls -la src' },
      }],
    } as unknown as ConversationSnapshot
    const answerApproval = vi.fn(async () => undefined)
    const live = liveOverlays()
    const actions = new TuiActions({
      active: () => ({ session: { getSnapshot: () => snapshot } }) as unknown as TuiActiveSession,
      answerApproval,
    } as unknown as HarnessTuiCapabilities, host(live.overlays, { followLatest: vi.fn() }))

    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('工具审批') })
    expect(plain(live.component().render(80))).toContain('拒绝')

    live.component().handleInput(ESCAPE)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(answerApproval).toHaveBeenCalledWith(approval, 'rejected')
  })

  it('returns from argument detail onto the same selector with inspect still selected', async () => {
    const approval = {
      key: 'approval:inspect',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: {
        toolName: 'shell',
        callId: 'call-inspect',
        approvalId: 'appr-inspect',
        reason: '需要执行命令',
      },
    } as unknown as PendingWait<'approval'>
    const longCommand = `printf '${'x'.repeat(1_300)}'`
    const snapshot = {
      pending: [approval],
      runningCalls: [{
        callId: 'call-inspect',
        name: 'shell',
        argsRaw: JSON.stringify({ command: longCommand }),
        callView: { card: 'terminal', title: longCommand },
      }],
    } as unknown as ConversationSnapshot
    const answerApproval = vi.fn(async () => undefined)
    const live = liveOverlays()
    const actions = new TuiActions({
      active: () => ({ session: { getSnapshot: () => snapshot } }) as unknown as TuiActiveSession,
      answerApproval,
    } as unknown as HarnessTuiCapabilities, host(live.overlays, { followLatest: vi.fn() }))

    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('查看完整参数') })

    live.component().handleInput(UP)
    live.component().handleInput(ENTER)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('完整参数') })

    live.component().handleInput(ESCAPE)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('工具审批') })

    live.component().handleInput(ENTER)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('完整参数') })
    expect(answerApproval).not.toHaveBeenCalled()

    live.component().handleInput(ESCAPE)
    await vi.waitFor(() => { expect(plain(live.component().render(80))).toContain('工具审批') })
    live.component().handleInput(DOWN)
    live.component().handleInput(ENTER)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(answerApproval).toHaveBeenCalledWith(approval, 'rejected')
  })

  it('asks to cancel a question batch on the same navigator', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/actions.ts'), 'utf8')
    expect(source).toMatch(/private async confirmQuestionEscape\(\s*overlays: OverlayPrompts/)
    expect(source).toMatch(/const selected = await overlays\.select\(\{/)
    expect(source).not.toMatch(/this\.host\.overlays\.select\(\{\s*title: ui\('取消这批问题？'/)
  })

  it('keeps multi-select checks when continuing after Escape', async () => {
    const wait = {
      key: 'question:multi',
      kind: 'question',
      sessionId: 'session' as SessionId,
      payload: {
        questions: [{
          id: 'q1',
          header: '问题',
          question: '选择多项',
          options: [{ label: 'Alpha' }, { label: 'Bravo' }],
          multiSelect: true,
        }],
      },
    } as unknown as PendingWait<'question'>
    const harness = liveQuestionHarness(wait)
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/Alpha/)
    })
    harness.component().handleInput(' ')
    expect(harness.plain()).toContain('[x]')
    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/取消这批问题|Cancel this question batch/)
    })
    expect(harness.hide).not.toHaveBeenCalled()
    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/Alpha/)
    })
    expect(harness.plain()).toContain('[x]')
    expect(harness.plain()).not.toMatch(/取消这批问题|Cancel this question batch/)
    expect(harness.hide).not.toHaveBeenCalled()
    expect(harness.answerQuestion).not.toHaveBeenCalled()
    expect(harness.cancelQuestion).not.toHaveBeenCalled()
  })

  it('keeps unsubmitted custom text when continuing after Escape', async () => {
    const wait = {
      key: 'question:custom',
      kind: 'question',
      sessionId: 'session' as SessionId,
      payload: {
        questions: [{
          id: 'q1',
          header: '问题',
          question: '请说明',
          options: [{ label: '现成选项' }],
          multiSelect: false,
        }],
      },
    } as unknown as PendingWait<'question'>
    const harness = liveQuestionHarness(wait)
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/现成选项/)
    })
    harness.component().handleInput('\u001B[B')
    harness.component().handleInput('\r')
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/请说明/)
      expect(harness.plain()).toMatch(/Ctrl\+Enter/)
    })
    harness.component().handleInput('draft-answer')
    expect(harness.plain()).toContain('draft-answer')
    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(harness.plain()).toMatch(/取消这批问题|Cancel this question batch/)
    })
    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(harness.plain()).toContain('draft-answer')
    })
    expect(harness.plain()).toMatch(/Ctrl\+Enter/)
    expect(harness.hide).not.toHaveBeenCalled()
    expect(harness.answerQuestion).not.toHaveBeenCalled()
  })
})
