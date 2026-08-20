import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { commandOf, paletteFillsEditor, TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import {
  reservedTuiCatalogNames,
  tuiCommands,
  type HarnessTuiCapabilities,
  type TuiCommandCandidate,
} from '../src/client/capabilities.ts'
import {
  buildClarifyAnswer,
  clarifySeedText,
  clarifyTuiCommand,
  mergeClarifyCatalog,
  runClarifyShell,
} from '../src/client/clarify-shell.ts'
import type { ClarifyQuestion, ClarifyRpcCaller } from '../src/client/clarify-remote.ts'
import { helpSectionText } from '../src/client/help.ts'
import type { OverlayChoice, OverlayNavigation, OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

const root = resolve(import.meta.dirname, '..')

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
  return {
    processId: 'proc-1',
    sessionId: 'session-1',
    status,
    contextVersion: 'ctx-v1',
    modelRouteId: 'route-v1',
    ...extra,
  }
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
  readonly reject: (error: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function waitOrAbort(hold: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) {
    await hold
    return
  }
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('connection request aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    hold.then(
      () => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) onAbort()
        else resolve()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
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
    calls.push({ endpoint, args })
    const next = queue.shift()
    if (next === undefined) throw new Error(`unexpected ${endpoint}`)
    expect(next.endpoint).toBe(endpoint)
    if ('error' in next) return { ok: false, error: next.error }
    return { ok: true, value: next.result }
  }
  return { rpc, calls }
}

function overlays(script: {
  select?: Array<OverlayChoice | undefined | 'custom-answer'>
  multiSelect?: Array<readonly OverlayChoice[] | undefined>
  input?: Array<string | undefined>
  confirm?: boolean[]
}, signal: AbortSignal = new AbortController().signal): OverlayQueue & {
  readonly selectTitles: string[]
  readonly selectChoices: OverlayChoice[][]
} {
  const select = [...(script.select ?? [])]
  const multiSelect = [...(script.multiSelect ?? [])]
  const input = [...(script.input ?? [])]
  const confirm = [...(script.confirm ?? [])]
  const selectTitles: string[] = []
  const selectChoices: OverlayChoice[][] = []
  const prompts = {
    select: async (request: { title?: string; choices?: readonly OverlayChoice[] }) => {
      if (request.title !== undefined) selectTitles.push(request.title)
      const choices = request.choices === undefined ? [] : [...request.choices]
      selectChoices.push(choices)
      const next = select.shift()
      if (next === 'custom-answer') {
        return [...choices].reverse().find(choice => /自定义回答|Custom answer/i.test(choice.label))
      }
      return next
    },
    multiSelect: async () => multiSelect.shift(),
    input: async () => input.shift(),
    multilineInput: async () => input.shift(),
    secretInput: async () => undefined,
    detail: async () => undefined,
    confirm: async () => confirm.shift() ?? true,
    progress: async (request: { work(report: (chunk: string) => void, signal: AbortSignal): Promise<unknown> }) => {
      try {
        return await request.work(() => undefined, signal)
      } catch (error) {
        if (signal.aborted) return undefined
        throw error
      }
    },
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
    selectTitles,
    selectChoices,
  } as unknown as OverlayQueue & { readonly selectTitles: string[]; readonly selectChoices: OverlayChoice[][] }
}

function host(overlayQueue: OverlayQueue, composer = ''): TuiActionHost & {
  readonly setEditor: ReturnType<typeof vi.fn<(text: string) => void>>
  readonly composerText: ReturnType<typeof vi.fn<() => string>>
} {
  return {
    overlays: overlayQueue,
    transcript: { followLatest: vi.fn() } as unknown as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn<(text: string) => void>(),
    composerText: vi.fn(() => composer),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

describe('Clarify catalog absence stays zero-diff', () => {
  it('does not register /clarify on the static TUI catalog, help, or reserved names', () => {
    expect(tuiCommands().map(command => command.name)).not.toContain('clarify')
    expect(reservedTuiCatalogNames().has('clarify')).toBe(false)
    expect(commandOf(tuiCommands(), 'clarify')).toBeUndefined()
    expect(helpSectionText('doctor')).not.toContain('/clarify')
    expect(helpSectionText('flows')).not.toContain('/clarify')
    expect(mergeClarifyCatalog(tuiCommands(), false)).toEqual(tuiCommands())
  })

  it('inserts a local /clarify entry only when the Remote is present', () => {
    const merged = mergeClarifyCatalog(tuiCommands(), true)
    const command = commandOf(merged, 'clarify')
    expect(command).toEqual(clarifyTuiCommand())
    expect(command?.behavior).toBe('local')
    expect(command?.source).toBe('TUI')
    expect(merged.map(item => item.name)).toContain('doctor')
    expect(merged.findIndex(item => item.name === 'clarify'))
      .toBeLessThan(merged.findIndex(item => item.name === 'doctor'))
    expect(paletteFillsEditor(command as TuiCommandCandidate)).toBe(false)
  })
})

describe('Clarify answer XOR and seed text', () => {
  it('rejects selectedOptionIds and customText together, empty selection, and wrong cardinality', () => {
    expect(() => buildClarifyAnswer(single, { selectedOptionIds: ['o-feature'], customText: 'also' }))
      .toThrow(/mutually exclusive/i)
    expect(() => buildClarifyAnswer(single, {})).toThrow(/required/i)
    expect(() => buildClarifyAnswer(single, { selectedOptionIds: [] })).toThrow(/empty/i)
    expect(() => buildClarifyAnswer(single, { selectedOptionIds: ['o-feature', 'o-bugfix'] }))
      .toThrow(/exactly one/i)
    expect(() => buildClarifyAnswer(multiple, { selectedOptionIds: [] })).toThrow(/at least one/i)
    expect(() => buildClarifyAnswer(single, { customText: '   ' })).toThrow(/empty/i)
    expect(buildClarifyAnswer(single, { selectedOptionIds: ['o-feature'] }))
      .toEqual({ selectedOptionIds: ['o-feature'] })
    expect(buildClarifyAnswer(single, { customText: 'ship it' })).toEqual({ customText: 'ship it' })
    expect(buildClarifyAnswer(multiple, { selectedOptionIds: ['o-time', 'o-compat'] }))
      .toEqual({ selectedOptionIds: ['o-time', 'o-compat'] })
  })

  it('rejects unknown and duplicate selectedOptionIds before RPC', () => {
    expect(() => buildClarifyAnswer(single, { selectedOptionIds: ['ghost'] }))
      .toThrow(/not in the current question/i)
    expect(() => buildClarifyAnswer(multiple, { selectedOptionIds: ['o-time', 'o-time'] }))
      .toThrow(/unique/i)
    const selected = ['o-time', 'o-compat']
    const built = buildClarifyAnswer(multiple, { selectedOptionIds: selected })
    selected[0] = 'mutated'
    expect(built).toEqual({ selectedOptionIds: ['o-time', 'o-compat'] })
  })

  it('keeps palette composer as seed and uses typed /clarify args after submit clears the composer', () => {
    expect(clarifySeedText('half-written ask', '')).toBe('half-written ask')
    expect(clarifySeedText('', 'some text')).toBe('some text')
    expect(clarifySeedText('/clarify some text', 'some text')).toBe('some text')
    expect(clarifySeedText('', '')).toBe('')
    expect(clarifySeedText('/clarify', '')).toBe('')
    expect(clarifySeedText('/clarify leftover', '')).toBe('')
  })
})

describe('Clarify overlay loop', () => {
  it('walks single, multiple, then fetches draft into the composer only', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/answer', result: echo('running', { question: multiple }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Ready draft' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: 'half-written ask',
      composerText: 'half-written ask',
      writeComposer,
      call: rpc,
      overlays: overlays({
        select: [{ id: 'o-feature', label: 'Add a feature' }],
        multiSelect: [[{ id: 'o-time', label: 'Timeboxed' }, { id: 'o-compat', label: 'Compatibility' }]],
        confirm: [true, true],
      }),
    })
    expect(outcome).toEqual({ kind: 'applied', draft: 'Ready draft' })
    expect(writeComposer).toHaveBeenCalledWith('Ready draft')
    expect(calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'half-written ask' })
    expect(calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-goal',
      selectedOptionIds: ['o-feature'],
    })
    expect(calls[2]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-constraints',
      selectedOptionIds: ['o-time', 'o-compat'],
    })
    expect(calls.map(item => item.endpoint)).not.toContain('session.prompt')
  })

  it('sends customText alone when allowCustom is chosen', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Custom draft' }) },
    ])
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: rpc,
      overlays: overlays({
        select: [{ id: '__custom__', label: 'Custom' }],
        input: ['ship a clarify plugin'],
        confirm: [true],
      }),
    })
    expect(calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-goal',
      customText: 'ship a clarify plugin',
    })
    expect(calls[1]?.args).not.toHaveProperty('selectedOptionIds')
  })

  it('selects an optionId of __custom__ as that option and still reaches custom input', async () => {
    const colliding: ClarifyQuestion = {
      questionId: 'q-sentinel',
      text: 'Which path?',
      options: [
        { optionId: '__custom__', text: 'Looks reserved' },
        { optionId: 'o-other', text: 'Other' },
      ],
      multiple: false,
      allowCustom: true,
    }
    const asOption = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: colliding }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Option draft' }) },
    ])
    const optionPrompts = overlays({
      select: [{ id: '__custom__', label: 'Looks reserved' }],
      confirm: [true],
    })
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: asOption.rpc,
      overlays: optionPrompts,
    })
    const presentedIds = optionPrompts.selectChoices[0]?.map(choice => choice.id) ?? []
    expect(presentedIds).toContain('__custom__')
    expect(presentedIds.some(id => id !== '__custom__' && id !== 'o-other')).toBe(true)
    expect(asOption.calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-sentinel',
      selectedOptionIds: ['__custom__'],
    })
    expect(asOption.calls[1]?.args).not.toHaveProperty('customText')

    const asCustom = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: colliding }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Custom draft' }) },
    ])
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: asCustom.rpc,
      overlays: overlays({
        select: ['custom-answer'],
        input: ['not the reserved option'],
        confirm: [true],
      }),
    })
    expect(asCustom.calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-sentinel',
      customText: 'not the reserved option',
    })
    expect(asCustom.calls[1]?.args).not.toHaveProperty('selectedOptionIds')
  })

  it('uses the same collision-free custom choice in multiple allowCustom', async () => {
    const colliding: ClarifyQuestion = {
      questionId: 'q-multi-sentinel',
      text: 'Which constraints?',
      options: [
        { optionId: '__custom__', text: 'Looks reserved' },
        { optionId: 'o-time', text: 'Timeboxed' },
      ],
      multiple: true,
      allowCustom: true,
    }
    const asOptions = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: colliding }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Multi option draft' }) },
    ])
    const optionPrompts = overlays({
      select: [{ id: 'options', label: 'Choose from options' }],
      multiSelect: [[{ id: '__custom__', label: 'Looks reserved' }]],
      confirm: [true],
    })
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: asOptions.rpc,
      overlays: optionPrompts,
    })
    const modeIds = optionPrompts.selectChoices[0]?.map(choice => choice.id) ?? []
    expect(modeIds).toContain('options')
    expect(modeIds).not.toContain('__custom__')
    expect(asOptions.calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-multi-sentinel',
      selectedOptionIds: ['__custom__'],
    })
    expect(asOptions.calls[1]?.args).not.toHaveProperty('customText')

    const asCustom = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: colliding }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Multi custom draft' }) },
    ])
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: asCustom.rpc,
      overlays: overlays({
        select: ['custom-answer'],
        input: ['custom multi'],
        confirm: [true],
      }),
    })
    expect(asCustom.calls[1]?.args).toEqual({
      processId: 'proc-1',
      questionId: 'q-multi-sentinel',
      customText: 'custom multi',
    })
    expect(asCustom.calls[1]?.args).not.toHaveProperty('selectedOptionIds')
  })

  it('cancels the process when the overlay is dismissed and does not persist the id', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
    ])
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: rpc,
      overlays: overlays({ select: [undefined] }),
    })
    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(calls.at(-1)).toEqual({ endpoint: 'clarify/cancel', args: { processId: 'proc-1' } })
    const again = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single, processId: 'proc-2' }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled', { processId: 'proc-2' }) },
    ])
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: again.rpc,
      overlays: overlays({ select: [undefined] }),
    })
    expect(again.calls[0]?.args).not.toHaveProperty('processId')
    expect(again.calls[1]?.args).toEqual({ processId: 'proc-2' })
  })

  it('shows staleReason and refuses to fetch or reuse old options', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      {
        endpoint: 'clarify/answer',
        result: echo('stale', { staleReason: 'context-changed', question: single }),
      },
      { endpoint: 'clarify/cancel', result: echo('stale', { staleReason: 'context-changed' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({
        select: [
          { id: 'o-feature', label: 'Add a feature' },
          { id: 'abandon', label: '放弃' },
        ],
      }),
    })
    expect(outcome).toEqual({ kind: 'abandoned', staleReason: 'context-changed' })
    expect(writeComposer).not.toHaveBeenCalled()
    expect(calls.map(item => item.endpoint)).not.toContain('clarify/fetchDraft')
  })

  it('lets stale win over a later draft and can restart without reusing the old processId', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      {
        endpoint: 'clarify/fetchDraft',
        result: echo('stale', { staleReason: 'ttl-expired', draft: 'should-not-apply' }),
      },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
      { endpoint: 'clarify/start', result: echo('running', { processId: 'proc-9', question: single }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled', { processId: 'proc-9' }) },
    ])
    const writeComposer = vi.fn()
    await runClarifyShell({
      sessionId: 'session-1',
      seedText: 'seed',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({
        select: [
          { id: 'o-feature', label: 'Add a feature' },
          { id: 'restart', label: '重新开始' },
          undefined,
        ],
      }),
    })
    expect(writeComposer).not.toHaveBeenCalled()
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/answer',
      'clarify/fetchDraft',
      'clarify/cancel',
      'clarify/start',
      'clarify/cancel',
    ])
    expect(calls[3]?.args).toEqual({ processId: 'proc-1' })
    expect(calls[4]?.endpoint).toBe('clarify/start')
    expect(calls[4]?.args).toEqual({ sessionId: 'session-1', seedText: 'seed' })
    expect(calls[4]?.args).not.toEqual(expect.objectContaining({ processId: 'proc-1' }))
  })

  it('cancels the stale process before the second start and swallows cancel errors', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('stale', { staleReason: 'ttl-expired' }) },
      { endpoint: 'clarify/cancel', error: { code: 'PROCESS_NOT_FOUND', message: 'already gone' } },
      { endpoint: 'clarify/start', result: echo('running', { processId: 'proc-2', question: single }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled', { processId: 'proc-2' }) },
    ])
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: 'seed',
      composerText: '',
      writeComposer: vi.fn(),
      call: rpc,
      overlays: overlays({
        select: [
          { id: 'restart', label: '重新开始' },
          undefined,
        ],
      }),
    })
    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/cancel',
      'clarify/start',
      'clarify/cancel',
    ])
    expect(calls[1]?.args).toEqual({ processId: 'proc-1' })
    expect(calls[2]?.args).toEqual({ sessionId: 'session-1', seedText: 'seed' })
    expect(calls[2]?.args).not.toHaveProperty('processId')
  })

  it('asks before overwriting a non-empty composer and never prompts the session', async () => {
    const { rpc } = stubRemote([
      { endpoint: 'clarify/start', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'New draft' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: 'old',
      composerText: 'old composer',
      writeComposer,
      call: rpc,
      overlays: overlays({ confirm: [true, false] }),
    })
    expect(outcome).toEqual({ kind: 'kept-composer', draft: 'New draft' })
    expect(writeComposer).not.toHaveBeenCalled()
  })

  it('rejects duplicate remote options before overlay or answer RPC', async () => {
    const { rpc, calls } = stubRemote([
      {
        endpoint: 'clarify/start',
        result: echo('running', {
          question: {
            ...single,
            options: [
              { optionId: 'dup', text: 'One' },
              { optionId: 'dup', text: 'Two' },
            ],
          },
        }),
      },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
    ])
    const prompts = overlays({})
    await expect(runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: rpc,
      overlays: prompts,
    })).rejects.toThrow(/unique/i)
    expect(prompts.selectTitles).toEqual([])
    expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
  })

  it('rejects unknown and duplicate overlay selections before answer RPC', async () => {
    const unknown = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
    ])
    await expect(runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: unknown.rpc,
      overlays: overlays({ select: [{ id: 'ghost', label: 'Ghost' }] }),
    })).rejects.toThrow(/not in the current question/i)
    expect(unknown.calls.map(item => item.endpoint)).toEqual(['clarify/start', 'clarify/cancel'])

    const duplicated = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: multiple }) },
      { endpoint: 'clarify/cancel', result: echo('cancelled') },
    ])
    await expect(runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer: vi.fn(),
      call: duplicated.rpc,
      overlays: overlays({
        multiSelect: [[{ id: 'o-time', label: 'Timeboxed' }, { id: 'o-time', label: 'Timeboxed' }]],
      }),
    })).rejects.toThrow(/unique/i)
    expect(duplicated.calls.map(item => item.endpoint)).toEqual(['clarify/start', 'clarify/cancel'])
  })

  it('does not open stale restart UI for malformed fetchDraft and cancels best-effort', async () => {
    for (const result of [
      echo('complete'),
      echo('running', { question: single }),
      echo('cancelled'),
    ]) {
      const { rpc, calls } = stubRemote([
        { endpoint: 'clarify/start', result: echo('complete') },
        { endpoint: 'clarify/fetchDraft', result },
        { endpoint: 'clarify/cancel', result: echo('cancelled') },
      ])
      const prompts = overlays({
        select: [{ id: 'restart', label: '重新开始' }],
        confirm: [true],
      })
      const writeComposer = vi.fn()
      await expect(runClarifyShell({
        sessionId: 'session-1',
        seedText: '',
        composerText: '',
        writeComposer,
        call: rpc,
        overlays: prompts,
      })).rejects.toThrow(/fetchDraft|draft/i)
      expect(prompts.selectTitles.some(title => /stale|过期/i.test(title))).toBe(false)
      expect(writeComposer).not.toHaveBeenCalled()
      expect(calls.map(item => item.endpoint)).toEqual([
        'clarify/start',
        'clarify/fetchDraft',
        'clarify/cancel',
      ])
    }
  })

  it('treats stale as dominant when the echo carries a malformed question and leaked draft', async () => {
    const { rpc, calls } = stubRemote([
      {
        endpoint: 'clarify/start',
        result: echo('stale', {
          staleReason: 'ttl-expired',
          question: { questionId: '', options: 'legacy' },
          draft: 'LEAKED-STALE',
        }),
      },
      { endpoint: 'clarify/cancel', result: echo('stale', { staleReason: 'ttl-expired' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({ select: [{ id: 'abandon', label: '放弃' }] }),
    })
    expect(outcome).toEqual({ kind: 'abandoned', staleReason: 'ttl-expired' })
    expect(writeComposer).not.toHaveBeenCalled()
    expect(calls.map(item => item.endpoint)).toEqual(['clarify/start', 'clarify/cancel'])
  })

  it('ignores malformed question and leaked draft on a complete non-fetch echo and still fetchDrafts', async () => {
    const { rpc, calls } = stubRemote([
      {
        endpoint: 'clarify/start',
        result: echo('complete', {
          question: { questionId: '', options: 'legacy' },
          draft: 'LEAKED-COMPLETE',
        }),
      },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'MANDATORY-DRAFT' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({ confirm: [true] }),
    })
    expect(outcome).toEqual({ kind: 'applied', draft: 'MANDATORY-DRAFT' })
    expect(writeComposer).toHaveBeenCalledWith('MANDATORY-DRAFT')
    expect(writeComposer).not.toHaveBeenCalledWith('LEAKED-COMPLETE')
    expect(calls.map(item => item.endpoint)).toEqual(['clarify/start', 'clarify/fetchDraft'])
  })

  it('uses fetchDraft draft and ignores a draft field on start or answer', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single, draft: 'LEAKED-START' }) },
      { endpoint: 'clarify/answer', result: echo('complete', { draft: 'LEAKED-ANSWER' }) },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'REAL-DRAFT' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: '',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({
        select: [{ id: 'o-feature', label: 'Add a feature' }],
        confirm: [true],
      }),
    })
    expect(outcome).toEqual({ kind: 'applied', draft: 'REAL-DRAFT' })
    expect(writeComposer).toHaveBeenCalledWith('REAL-DRAFT')
    expect(writeComposer).not.toHaveBeenCalledWith('LEAKED-START')
    expect(writeComposer).not.toHaveBeenCalledWith('LEAKED-ANSWER')
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/answer',
      'clarify/fetchDraft',
    ])
  })
})

describe('Clarify start abort does not leave a Host process', () => {
  it('cancels the late start processId once and never answers, fetches, or writes the composer', async () => {
    const hold = deferred<void>()
    const calls: Array<{ endpoint: string; args: Record<string, unknown>; signal?: AbortSignal | undefined }> = []
    const rpc: ClarifyRpcCaller = async (_channel, endpoint, payload, signal) => {
      const args = (payload as { args: Record<string, unknown> }).args
      calls.push({ endpoint, args, signal })
      if (endpoint === 'clarify/start') {
        await waitOrAbort(hold.promise, signal)
        return { ok: true, value: echo('running', { question: single, draft: 'LEAKED-START' }) }
      }
      if (endpoint === 'clarify/cancel') {
        return { ok: true, value: echo('cancelled') }
      }
      throw new Error(`unexpected ${endpoint}`)
    }
    const controller = new AbortController()
    const prompts = overlays({}, controller.signal)
    const writeComposer = vi.fn()
    const pending = runClarifyShell({
      sessionId: 'session-1',
      seedText: 'seed',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: prompts,
    })
    await vi.waitFor(() => {
      expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
    })
    controller.abort()
    await expect(pending).resolves.toEqual({ kind: 'cancelled' })
    expect(calls[0]?.signal).toBeUndefined()
    expect(writeComposer).not.toHaveBeenCalled()
    expect(prompts.selectTitles).toEqual([])
    hold.resolve()
    await vi.waitFor(() => {
      expect(calls.map(item => item.endpoint)).toEqual(['clarify/start', 'clarify/cancel'])
    })
    expect(calls[1]?.args).toEqual({ processId: 'proc-1' })
    expect(calls[1]?.signal).toBeUndefined()
    expect(calls.filter(item => item.endpoint === 'clarify/cancel')).toHaveLength(1)
    expect(calls.map(item => item.endpoint)).not.toContain('clarify/answer')
    expect(calls.map(item => item.endpoint)).not.toContain('clarify/fetchDraft')
  })

  it('swallows a start failure after Esc without cancel, composer write, or unhandled rejection', async () => {
    const hold = deferred<void>()
    const calls: Array<{ endpoint: string }> = []
    const rejections: unknown[] = []
    let startFinished = false
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    const rpc: ClarifyRpcCaller = async (_channel, endpoint, _payload, signal) => {
      calls.push({ endpoint })
      if (endpoint === 'clarify/start') {
        await waitOrAbort(hold.promise, signal)
        startFinished = true
        return { ok: false, error: { code: 'internal', message: 'start boom' } }
      }
      throw new Error(`unexpected ${endpoint}`)
    }
    const controller = new AbortController()
    try {
      const pending = runClarifyShell({
        sessionId: 'session-1',
        seedText: '',
        composerText: '',
        writeComposer: vi.fn(),
        call: rpc,
        overlays: overlays({}, controller.signal),
      })
      await vi.waitFor(() => {
        expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
      })
      controller.abort()
      await expect(pending).resolves.toEqual({ kind: 'cancelled' })
      expect(startFinished).toBe(false)
      hold.resolve()
      await vi.waitFor(() => {
        expect(startFinished).toBe(true)
      })
      expect(calls.map(item => item.endpoint)).toEqual(['clarify/start'])
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      hold.resolve()
    }
  })

  it('leaves a successful start unchanged and still answers after the first question', async () => {
    const { rpc, calls } = stubRemote([
      { endpoint: 'clarify/start', result: echo('running', { question: single }) },
      { endpoint: 'clarify/answer', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Ready draft' }) },
    ])
    const writeComposer = vi.fn()
    const outcome = await runClarifyShell({
      sessionId: 'session-1',
      seedText: 'half-written ask',
      composerText: '',
      writeComposer,
      call: rpc,
      overlays: overlays({
        select: [{ id: 'o-feature', label: 'Add a feature' }],
        confirm: [true],
      }),
    })
    expect(outcome).toEqual({ kind: 'applied', draft: 'Ready draft' })
    expect(writeComposer).toHaveBeenCalledWith('Ready draft')
    expect(calls.map(item => item.endpoint)).toEqual([
      'clarify/start',
      'clarify/answer',
      'clarify/fetchDraft',
    ])
  })
})

describe('Clarify surface wiring and existing doctor boundary', () => {
  it('keeps local /doctor on the Profile manager bridge and does not add a stock doctor', () => {
    const actions = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    const capabilities = readFileSync(resolve(root, 'src/client/capabilities.ts'), 'utf8')
    const shell = readFileSync(resolve(root, 'src/client/clarify-shell.ts'), 'utf8')
    const remote = readFileSync(resolve(root, 'src/client/clarify-remote.ts'), 'utf8')
    expect(actions).toMatch(/managementBridge\(\)\.plugins\.doctor\(\)/u)
    expect(actions).toMatch(/case 'doctor': await this\.doctor\(\)/u)
    expect(actions).not.toMatch(/rpc\.call\([^)]*doctor/u)
    expect(capabilities).toContain("name: 'doctor'")
    expect(`${shell}\n${remote}`).not.toMatch(/session\.prompt\(/u)
    expect(`${shell}\n${remote}`).not.toMatch(/writeFile|mkdirSync|settings\.mutate/u)
    expect(tuiCommands().some(command => command.name === 'doctor')).toBe(true)
  })

  it('executes /clarify through the public RPC face and writes only the composer', async () => {
    const { rpc } = stubRemote([
      { endpoint: 'clarify/start', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Palette draft' }) },
    ])
    const overlayQueue = overlays({ confirm: [true] })
    const actionHost = host(overlayQueue, 'composer seed')
    const capabilities = {
      active: () => ({ sessionId: 'session-1', session: { prompt: vi.fn() } }),
      connectionRpc: () => ({ call: rpc }),
      clarifyRemotePresent: async () => true,
    } as unknown as HarnessTuiCapabilities
    const actions = new TuiActions(capabilities, actionHost)
    await actions.execute('clarify', '')
    expect(actionHost.setEditor).toHaveBeenCalledWith('Palette draft')
    expect(capabilities.active()?.session.prompt).not.toHaveBeenCalled()
  })

  it('warns when a cached /clarify is executed after the Remote disappears', async () => {
    const rpc = vi.fn<ClarifyRpcCaller>(async () => {
      throw new Error('should not call')
    })
    const actionHost = host(overlays({}))
    const actions = new TuiActions({
      active: () => ({ sessionId: 'session-1' }),
      connectionRpc: () => ({ call: rpc }),
      clarifyRemotePresent: async () => false,
    } as unknown as HarnessTuiCapabilities, actionHost)
    await actions.execute('clarify', '')
    expect(rpc).not.toHaveBeenCalled()
    expect(actionHost.setEditor).not.toHaveBeenCalled()
    expect(actionHost.notice).toHaveBeenCalledWith(expect.stringMatching(/Clarify Remote/), 'error')
  })

  it('seeds palette execution from the composer and typed /clarify from args', async () => {
    const palette = stubRemote([
      { endpoint: 'clarify/start', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Palette draft' }) },
    ])
    const paletteHost = host(overlays({ confirm: [true] }), 'half-written ask')
    await new TuiActions({
      active: () => ({ sessionId: 'session-1', session: { prompt: vi.fn() } }),
      connectionRpc: () => ({ call: palette.rpc }),
      clarifyRemotePresent: async () => true,
    } as unknown as HarnessTuiCapabilities, paletteHost).execute('clarify', '')
    expect(palette.calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'half-written ask' })

    const typed = stubRemote([
      { endpoint: 'clarify/start', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Typed draft' }) },
    ])
    const typedHost = host(overlays({ confirm: [true] }), '')
    await new TuiActions({
      active: () => ({ sessionId: 'session-1', session: { prompt: vi.fn() } }),
      connectionRpc: () => ({ call: typed.rpc }),
      clarifyRemotePresent: async () => true,
    } as unknown as HarnessTuiCapabilities, typedHost).execute('clarify', 'some text')
    expect(typed.calls[0]?.args).toEqual({ sessionId: 'session-1', seedText: 'some text' })

    const lone = stubRemote([
      { endpoint: 'clarify/start', result: echo('complete') },
      { endpoint: 'clarify/fetchDraft', result: echo('complete', { draft: 'Empty draft' }) },
    ])
    const loneHost = host(overlays({ confirm: [true] }), '')
    await new TuiActions({
      active: () => ({ sessionId: 'session-1', session: { prompt: vi.fn() } }),
      connectionRpc: () => ({ call: lone.rpc }),
      clarifyRemotePresent: async () => true,
    } as unknown as HarnessTuiCapabilities, loneHost).execute('clarify', '')
    expect(lone.calls[0]?.args).toEqual({ sessionId: 'session-1' })
  })
})
