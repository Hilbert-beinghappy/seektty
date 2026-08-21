import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities, TuiDraftAttachment } from '../src/client/capabilities.ts'
import {
  classifyClarifyComposer,
  dispatchComposerSubmit,
  paletteClarifyTransaction,
  type ClarifyComposerTransaction,
  type ComposerSubmitHost,
} from '../src/client/clarify-composer.ts'
import { runClarifyShell } from '../src/client/clarify-shell.ts'
import { CLARIFY_PROBE_PROCESS_ID, CLARIFY_WIRE_PROTOCOL, type ClarifyQuestion, type ClarifyRpcCaller } from '../src/client/clarify-remote.ts'
import { OverlayQueue, type OverlayChoice, type OverlayNavigation, type OverlayQueue as OverlayQueueType } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

const ENTER = '\r'
const SPACE = ' '

const single: ClarifyQuestion = {
  questionId: 'q-goal',
  text: 'What is the main thing you want to accomplish?',
  options: [
    { optionId: 'o-feature', text: 'Add a feature' },
    { optionId: 'o-bugfix', text: 'Fix a bug' },
  ],
  multiple: false,
  allowCustom: true,
}

const multiple: ClarifyQuestion = {
  questionId: 'q-constraints',
  text: 'Which constraints should the draft respect?',
  options: [
    { optionId: 'o-time', text: 'Timeboxed' },
    { optionId: 'o-compat', text: 'Compatibility' },
  ],
  multiple: true,
  allowCustom: false,
}

function echo(status: string, extra: Record<string, unknown> = {}) {
  const question = extra.question as ClarifyQuestion | undefined
  const running = status === 'running'
    ? {
        kind: question === undefined ? 'await_accept' : 'ask',
        previewVersion: question === undefined ? 'preview-ready' : `preview-${question.questionId}`,
        draftPreview: question === undefined ? 'Ready model-generated preview' : `Preview before ${question.questionId}`,
        materialChanges: question === undefined ? ['Prepared the final draft for review'] : [`Updated the draft before ${question.questionId}`],
      }
    : {}
  return {
    processId: 'proc-1',
    sessionId: 'session-1',
    status,
    contextVersion: 'ctx-v1',
    modelRouteId: 'route-v1',
    ...running,
    ...extra,
  }
}

function stubRemote(script: Array<{ endpoint: string; result: unknown } | { endpoint: string; error: { code: string; message: string } }>): {
  readonly rpc: ClarifyRpcCaller
  readonly calls: Array<{ endpoint: string; args: Record<string, unknown> }>
} {
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = []
  const queue = [...script]
  const rpc: ClarifyRpcCaller = async (channel, endpoint, payload) => {
    expect(channel).toBe('/api')
    const args = (payload as { args: Record<string, unknown> }).args
    if (args.processId === CLARIFY_PROBE_PROCESS_ID && (endpoint === 'clarify/fetchDraft' || endpoint === 'clarify/refine')) {
      return {
        ok: true,
        value: {
          protocol: CLARIFY_WIRE_PROTOCOL,
          ok: false,
          error: { code: 'PROCESS_NOT_FOUND', message: `process ${CLARIFY_PROBE_PROCESS_ID} does not exist`, category: 'conflict' },
        },
      }
    }
    calls.push({ endpoint, args })
    const next = queue.shift()
    if (next === undefined) throw new Error(`unexpected ${endpoint}`)
    expect(next.endpoint).toBe(endpoint)
    if ('error' in next) {
      return {
        ok: true,
        value: {
          protocol: CLARIFY_WIRE_PROTOCOL,
          ok: false,
          error: { ...next.error, category: next.error.code === 'INFERENCE_UNAVAILABLE' ? 'retryable' : 'conflict' },
        },
      }
    }
    return { ok: true, value: { protocol: CLARIFY_WIRE_PROTOCOL, ok: true, value: next.result } }
  }
  return { rpc, calls }
}

function acceptedDraftScript(draft: string) {
  return [
    { endpoint: 'clarify/start', result: echo('running') },
    { endpoint: 'clarify/accept', result: echo('complete') },
    { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft }) },
  ]
}

const acceptChoice = { id: 'accept', label: 'Accept and insert' }
const featureChoice = { id: 'o-feature', label: 'Add a feature' }

function scriptedOverlays(script: {
  select?: Array<OverlayChoice | undefined>
  multiSelect?: Array<readonly OverlayChoice[] | undefined>
  input?: Array<string | undefined>
  confirm?: boolean[]
}): OverlayQueueType {
  const select = [...(script.select ?? [])]
  const multiSelect = [...(script.multiSelect ?? [])]
  const input = [...(script.input ?? [])]
  const confirm = [...(script.confirm ?? [])]
  const prompts = {
    select: async () => select.shift(),
    multiSelect: async () => multiSelect.shift(),
    input: async () => input.shift(),
    multilineInput: async () => input.shift(),
    secretInput: async () => undefined,
    detail: async () => undefined,
    confirm: async () => {
      const next = confirm.shift()
      if (next === undefined) throw new Error('unscripted Clarify confirmation')
      return next
    },
    progress: async (request: { work(report: (chunk: string) => void, signal: AbortSignal): Promise<unknown> }) => (
      request.work(() => undefined, new AbortController().signal)
    ),
  }
  return {
    ...prompts,
    navigate: async (run: (navigation: OverlayNavigation) => Promise<void>) => {
      await run({
        ...prompts,
        selectPage: async () => undefined,
        replaceSelectPage: () => undefined,
        updateChoices: () => undefined,
        back: () => undefined,
        finish: () => undefined,
        signal: new AbortController().signal,
      } as OverlayNavigation)
      return undefined
    },
  } as unknown as OverlayQueueType
}

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

function attachment(mark = 'PNG-BYTES'): TuiDraftAttachment {
  return {
    path: '/tmp/keep.png',
    name: 'keep.png',
    mediaType: 'image/png',
    data: Buffer.from(mark).toString('base64'),
    bytes: mark.length,
  }
}

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24, columns: 80 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

function actionHost(overlays: OverlayQueueType, composer: { getText(): string; setText(text: string): void }): TuiActionHost & {
  readonly notice: ReturnType<typeof vi.fn<(message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void>>
} {
  return {
    overlays,
    transcript: { followLatest: vi.fn() } as unknown as Transcript,
    notice: vi.fn<(message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void>(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: (text) => { composer.setText(text) },
    composerText: () => composer.getText(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

function surfaceBoundary(options: {
  overlays: OverlayQueueType
  remotePresent?: boolean
  rpc?: ClarifyRpcCaller
  attachments?: TuiDraftAttachment[]
}): {
  readonly composer: PromptEditor
  readonly history: string[]
  readonly sendPrompt: ReturnType<typeof vi.fn<(text: string) => void>>
  readonly dispatchCommand: ReturnType<typeof vi.fn<(line: string) => void>>
  readonly session: { readonly prompt: ReturnType<typeof vi.fn<(content: unknown, mode?: string) => Promise<{ ok: true }>>> }
  readonly attachments: TuiDraftAttachment[]
  readonly clearAttachments: ReturnType<typeof vi.fn>
  readonly host: TuiActionHost & {
    readonly notice: ReturnType<typeof vi.fn<(message: string, tone?: 'info' | 'success' | 'warning' | 'error') => void>>
  }
  readonly actions: TuiActions
  submit(text: string): Promise<void>
  palette(): Promise<void>
} {
  const composer = editor()
  const history: string[] = []
  const sendPrompt = vi.fn<(text: string) => void>()
  const dispatchCommand = vi.fn<(line: string) => void>()
  const session = {
    prompt: vi.fn<(content: unknown, mode?: string) => Promise<{ ok: true }>>(async () => ({ ok: true })),
  }
  const attachments = options.attachments ?? []
  const clearAttachments = vi.fn(() => { attachments.length = 0 })
  const host = actionHost(options.overlays, composer)
  const capabilities = {
    active: () => ({ sessionId: 'session-1', session }),
    connectionRpc: () => (options.rpc === undefined ? undefined : { call: options.rpc }),
    clarifyRemotePresent: async () => options.remotePresent !== false,
    draftAttachments: () => attachments,
    clearAttachments,
  } as unknown as HarnessTuiCapabilities
  const actions = new TuiActions(capabilities, host)
  const submitHost: ComposerSubmitHost = {
    followLatest: () => undefined,
    draftAttachmentCount: () => attachments.length,
    addToHistory: (text) => { history.push(text) },
    clearEditor: () => { composer.setText('') },
    dispatchCommand,
    attachLeadingImage: () => undefined,
    sendPrompt: (text) => {
      sendPrompt(text)
      void session.prompt([{ type: 'text', text }], 'queue')
    },
    runClarify: (transaction) => actions.clarifyComposer(transaction),
  }
  composer.onSubmit = (raw) => {
    void dispatchComposerSubmit(composer.losslessSubmitText(raw), submitHost)
  }

  return {
    composer,
    history,
    sendPrompt,
    dispatchCommand,
    session,
    attachments,
    clearAttachments,
    host,
    actions,
    async submit(text) {
      composer.setText(text)
      expect(composer.getText()).toBe(text)
      composer.handleInput(ENTER)
      await vi.waitFor(() => {
        expect(composer.getText() === '' || host.notice.mock.calls.length > 0 || composer.getText() !== text).toBe(true)
      })
    },
    async palette() {
      await actions.execute('clarify', '')
    },
  }
}

describe('Clarify composer classification at the lossless raw', () => {
  it('treats exact leading /clarify [args] and trailing token/line as local Clarify', () => {
    expect(classifyClarifyComposer('/clarify')).toEqual({
      source: 'leading',
      restoreText: '/clarify',
      seedText: '',
      replaceableText: '',
    })
    expect(classifyClarifyComposer('/clarify some text')).toEqual({
      source: 'leading',
      restoreText: '/clarify some text',
      seedText: 'some text',
      replaceableText: '',
    })
    expect(classifyClarifyComposer('fix the bug /clarify')).toEqual({
      source: 'trailing',
      restoreText: 'fix the bug /clarify',
      seedText: 'fix the bug',
      replaceableText: 'fix the bug',
    })
    expect(classifyClarifyComposer('fix the bug\n/clarify')).toEqual({
      source: 'trailing',
      restoreText: 'fix the bug\n/clarify',
      seedText: 'fix the bug',
      replaceableText: 'fix the bug',
    })
    expect(classifyClarifyComposer('/clarify preserve  interior   spacing')).toMatchObject({
      source: 'leading',
      seedText: 'preserve  interior   spacing',
    })
    expect(classifyClarifyComposer('preserve  interior   spacing /clarify')).toMatchObject({
      source: 'trailing',
      seedText: 'preserve  interior   spacing',
      replaceableText: 'preserve  interior   spacing',
    })
    expect(classifyClarifyComposer('please use /clarify later')).toBeUndefined()
    expect(classifyClarifyComposer('/clarify-me')).toBeUndefined()
    expect(classifyClarifyComposer('hello')).toBeUndefined()
  })

  it('uses the live composer as palette seed and replaceable text', () => {
    expect(paletteClarifyTransaction('half-written ask')).toEqual({
      source: 'palette',
      restoreText: 'half-written ask',
      seedText: 'half-written ask',
      replaceableText: 'half-written ask',
    })
  })
})

describe('Clarify surface dispatch boundary', () => {
  it('classifies leading /clarify through the real editor submit before history or send', async () => {
    const { rpc, calls } = stubRemote(acceptedDraftScript('Leading draft'))
    const boundary = surfaceBoundary({
      rpc,
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true] }),
    })
    await boundary.submit('/clarify some text')
    await vi.waitFor(() => {
      expect(boundary.composer.getText()).toBe('Leading draft')
    })
    expect(boundary.history).toEqual([])
    expect(boundary.sendPrompt).not.toHaveBeenCalled()
    expect(boundary.session.prompt).not.toHaveBeenCalled()
    expect(boundary.dispatchCommand).not.toHaveBeenCalled()
    expect(calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'some text' })
  })

  it('classifies inline and newline trailing /clarify through the real editor submit', async () => {
    const inline = stubRemote(acceptedDraftScript('Inline draft'))
    const inlineBoundary = surfaceBoundary({
      rpc: inline.rpc,
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true, true] }),
    })
    await inlineBoundary.submit('fix the bug /clarify')
    await vi.waitFor(() => {
      expect(inlineBoundary.composer.getText()).toBe('Inline draft')
    })
    expect(inline.calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'fix the bug' })
    expect(inlineBoundary.history).toEqual([])
    expect(inlineBoundary.sendPrompt).not.toHaveBeenCalled()

    const newline = stubRemote(acceptedDraftScript('Newline draft'))
    const newlineBoundary = surfaceBoundary({
      rpc: newline.rpc,
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true, true] }),
    })
    await newlineBoundary.submit('fix the bug\n/clarify')
    await vi.waitFor(() => {
      expect(newlineBoundary.composer.getText()).toBe('Newline draft')
    })
    expect(newline.calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'fix the bug' })
    expect(newlineBoundary.history).toEqual([])
    expect(newlineBoundary.sendPrompt).not.toHaveBeenCalled()
    expect(newlineBoundary.session.prompt).not.toHaveBeenCalled()
  })

  it('seeds palette execution from the current composer without submitting', async () => {
    const { rpc, calls } = stubRemote(acceptedDraftScript('Palette draft'))
    const boundary = surfaceBoundary({
      rpc,
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true, true] }),
    })
    boundary.composer.setText('half-written ask')
    await boundary.palette()
    expect(boundary.composer.getText()).toBe('Palette draft')
    expect(calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'half-written ask' })
    expect(boundary.history).toEqual([])
    expect(boundary.sendPrompt).not.toHaveBeenCalled()
    expect(boundary.session.prompt).not.toHaveBeenCalled()
  })

  it('restores exact text and never sends when the plugin is absent or the catalog is stale', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => {
      throw new Error('should not call')
    })
    const leading = surfaceBoundary({
      rpc,
      remotePresent: false,
      overlays: scriptedOverlays({}),
    })
    await leading.submit('/clarify keep this')
    await vi.waitFor(() => {
      expect(leading.composer.getText()).toBe('/clarify keep this')
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(leading.sendPrompt).not.toHaveBeenCalled()
    expect(leading.history).toEqual([])
    expect(leading.host.notice).toHaveBeenCalledWith(expect.stringMatching(/Clarify Remote/), 'error')

    const trailing = surfaceBoundary({
      rpc,
      remotePresent: false,
      overlays: scriptedOverlays({}),
    })
    await trailing.submit('body stays /clarify')
    await vi.waitFor(() => {
      expect(trailing.composer.getText()).toBe('body stays /clarify')
    })
    expect(trailing.sendPrompt).not.toHaveBeenCalled()
    expect(trailing.history).toEqual([])
  })

  it('restores the exact leading command after Esc and after an RPC error', async () => {
    const cancelled = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
    ])
    const esc = surfaceBoundary({
      rpc: cancelled.rpc,
      overlays: scriptedOverlays({ select: [undefined] }),
    })
    await esc.submit('/clarify exact command')
    await vi.waitFor(() => {
      expect(esc.composer.getText()).toBe('/clarify exact command')
    })
    expect(esc.sendPrompt).not.toHaveBeenCalled()
    expect(esc.history).toEqual([])

    const failed = stubRemote([
      { endpoint: 'clarify/start', error: { code: 'internal', message: 'start boom' } },
    ])
    const error = surfaceBoundary({
      rpc: failed.rpc,
      overlays: scriptedOverlays({}),
    })
    await error.submit('/clarify exact command')
    await vi.waitFor(() => {
      expect(error.composer.getText()).toBe('/clarify exact command')
    })
    expect(error.sendPrompt).not.toHaveBeenCalled()
    expect(error.session.prompt).not.toHaveBeenCalled()
  })

  it('restores outer whitespace that pi-tui removes from the onSubmit callback', async () => {
    const original = '  /clarify exact command  '
    const absent = surfaceBoundary({
      remotePresent: false,
      overlays: scriptedOverlays({}),
    })
    await absent.submit(original)
    await vi.waitFor(() => {
      expect(absent.composer.getText()).toBe(original)
    })
    expect(absent.history).toEqual([])
    expect(absent.sendPrompt).not.toHaveBeenCalled()
    expect(absent.session.prompt).not.toHaveBeenCalled()
  })

  it('restores the full original after declining the legal post-accept overwrite', async () => {
    const declineOverwrite = stubRemote(acceptedDraftScript('Unused draft'))
    const overwrite = surfaceBoundary({
      rpc: declineOverwrite.rpc,
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true, false] }),
    })
    await overwrite.submit('keep the body /clarify')
    await vi.waitFor(() => {
    expect(overwrite.composer.getText()).toBe('keep the body /clarify')
    })
    expect(overwrite.sendPrompt).not.toHaveBeenCalled()
    expect(declineOverwrite.calls.map(item => item.endpoint)).toEqual([
      'clarify/start', 'clarify/accept', 'clarify/fetchDraft',
    ])
  })

  it('writes only the composer on success and leaves attachments byte-identical', async () => {
    const pending = attachment('IDENTICAL-PNG')
    const { rpc } = stubRemote(acceptedDraftScript('Ready draft'))
    const boundary = surfaceBoundary({
      rpc,
      attachments: [pending],
      overlays: scriptedOverlays({ select: [acceptChoice], confirm: [true] }),
    })
    await boundary.submit('/clarify')
    await vi.waitFor(() => {
      expect(boundary.composer.getText()).toBe('Ready draft')
    })
    expect(boundary.attachments).toHaveLength(1)
    expect(boundary.attachments[0]).toBe(pending)
    expect(boundary.attachments[0]?.data).toBe(Buffer.from('IDENTICAL-PNG').toString('base64'))
    expect(boundary.clearAttachments).not.toHaveBeenCalled()
    expect(boundary.sendPrompt).not.toHaveBeenCalled()
    expect(boundary.session.prompt).not.toHaveBeenCalled()
    expect(boundary.history).toEqual([])
  })

  it('still records ordinary prompts and slash commands that are not Clarify', async () => {
    const ordinary = surfaceBoundary({ overlays: scriptedOverlays({}) })
    await ordinary.submit('hello world')
    expect(ordinary.history).toEqual(['hello world'])
    expect(ordinary.sendPrompt).toHaveBeenCalledWith('hello world')
    expect(ordinary.session.prompt).toHaveBeenCalledOnce()

    const slash = surfaceBoundary({ overlays: scriptedOverlays({}) })
    await slash.submit('/help')
    expect(slash.history).toEqual(['/help'])
    expect(slash.dispatchCommand).toHaveBeenCalledWith('/help')
    expect(slash.sendPrompt).not.toHaveBeenCalled()

    const mid = surfaceBoundary({ overlays: scriptedOverlays({}) })
    await mid.submit('please use /clarify later')
    expect(mid.history).toEqual(['please use /clarify later'])
    expect(mid.sendPrompt).toHaveBeenCalledWith('please use /clarify later')
  })
})

describe('Clarify overlay validation at the real overlay boundary', () => {
  it('reviews the complete draft through the 40-column scroll page before accepting', async () => {
    const live = liveOverlays()
    const preview = [
      'UNIQUE-BEGIN-MARKER: implement the current Session request without inventing scope.',
      ...Array.from({ length: 18 }, (_, index) => `Decision ${String(index + 1)}: preserve this independently reviewable constraint in the final user request.`),
      'UNIQUE-TAIL-MARKER: retain rollback, validation, and no automatic send.',
    ].join('\n')
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { draftPreview: preview }) },
      { endpoint: 'clarify/accept', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: preview }) },
    ])
    const writeComposer = vi.fn()
    const pending = runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: live.overlays,
    })

    await vi.waitFor(() => {
      expect(plain(live.component().render(40))).toMatch(/草稿已可确认|draft is ready/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      const firstPage = plain(live.component().render(40))
      expect(firstPage).toMatch(/完整审阅 Clarify 草稿|Review the full Clarify draft/u)
      expect(firstPage).toContain('UNIQUE-BEGIN-MARKER')
      expect(firstPage).toMatch(/1-12\/\d+ (?:行|lines)/u)
    })

    live.component().handleInput('\u001B[F')
    await vi.waitFor(() => {
      const lastPage = plain(live.component().render(40))
      expect(lastPage).toContain('UNIQUE-TAIL-MARKER')
      expect(lastPage).toMatch(/\d+-\d+\/\d+ (?:行|lines)/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(40))).toMatch(/采用这份完整草稿|Accept this full draft/u)
    })
    live.component().handleInput('\u001B[B')
    live.component().handleInput(ENTER)

    await expect(pending).resolves.toEqual({ kind: 'applied', draft: preview })
    expect(writeComposer).toHaveBeenCalledWith(preview)
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start', 'clarify/accept', 'clarify/fetchDraft',
    ])
  })

  it('keeps an empty multi-select open with localized validation', async () => {
    const live = liveOverlays()
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: multiple }) },
      { endpoint: 'clarify/answer', result: echo('running') },
      { endpoint: 'clarify/accept', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Multi draft' }) },
    ])
    const writeComposer = vi.fn()
    const pending = runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: live.overlays,
    })
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/从选项中选择|Choose from options/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toContain('Timeboxed')
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/请至少选择一项|Select at least one option/u)
    })
    expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
    live.component().handleInput(SPACE)
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/Clarify 草稿|Clarify draft/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/完整审阅 Clarify 草稿|Review the full Clarify draft/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/采用这份完整草稿|Accept this full draft/u)
    })
    live.component().handleInput('\u001B[B')
    live.component().handleInput(ENTER)
    await expect(pending).resolves.toEqual({ kind: 'applied', draft: 'Multi draft' })
    expect(writeComposer).toHaveBeenCalledWith('Multi draft')
    expect(calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-constraints',
      previewVersion: 'preview-q-constraints',
      selectedOptionIds: ['o-time'],
    })
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start', 'clarify/answer', 'clarify/accept', 'clarify/fetchDraft',
    ])
  })

  it('collects a common custom answer through the existing single-line input overlay', async () => {
    const live = liveOverlays()
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/answer', result: echo('running') },
      { endpoint: 'clarify/accept', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Custom draft' }) },
    ])
    const pending = runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: rpc,
      overlays: live.overlays,
    })
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/自定义回答|Custom answer/u)
    })
    live.component().handleInput('\u001B[B')
    live.component().handleInput('\u001B[B')
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      const rendered = plain(live.component().render(80))
      expect(rendered).toMatch(/Enter 确认|Enter confirm/u)
      expect(rendered).not.toMatch(/Enter 换行|Enter newline/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/请输入内容|Enter a value/u)
    })
    expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
    live.component().handleInput('ship a clarify plugin')
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/Clarify 草稿|Clarify draft/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/完整审阅 Clarify 草稿|Review the full Clarify draft/u)
    })
    live.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(live.component().render(80))).toMatch(/采用这份完整草稿|Accept this full draft/u)
    })
    live.component().handleInput('\u001B[B')
    live.component().handleInput(ENTER)
    await expect(pending).resolves.toEqual({ kind: 'applied', draft: 'Custom draft' })
    expect(calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-goal',
      previewVersion: 'preview-q-goal',
      customText: 'ship a clarify plugin',
    })
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start', 'clarify/answer', 'clarify/accept', 'clarify/fetchDraft',
    ])
  })
})
