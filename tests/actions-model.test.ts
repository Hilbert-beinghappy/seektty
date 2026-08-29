import { describe, expect, it, vi } from 'vitest'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities, TuiModelOption } from '../src/client/capabilities.ts'
import type {
  OverlayChoice,
  OverlayNavigation,
  OverlayPrompts,
  SelectOverlayRequest,
} from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

function prompts(select: OverlayPrompts['select']): OverlayPrompts {
  return {
    select,
    input: async () => undefined,
    multilineInput: async () => undefined,
    secretInput: async () => undefined,
    secretTransaction: async () => undefined,
    multiSelect: async () => undefined,
    detail: async () => undefined,
    confirm: async () => false,
    progress: async () => undefined,
  }
}

function actionHost(overlays: OverlayPrompts | OverlayNavigation): TuiActionHost {
  return {
    overlays: overlays as TuiActionHost['overlays'],
    transcript: { followLatest: vi.fn() } as unknown as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyAppearance: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

function option(overrides: Partial<TuiModelOption> = {}): TuiModelOption {
  return {
    id: 'deepseek\u0000v4',
    label: 'DeepSeek V4',
    description: 'DeepSeek',
    selection: { provider: 'deepseek', model: 'v4' },
    efforts: [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
      { id: 'max', name: 'Maximum' },
    ],
    defaultEffort: 'high',
    current: false,
    ...overrides,
  }
}

describe('separate model and reasoning controls', () => {
  it('changes the model without opening or writing a reasoning selection', async () => {
    const target = option()
    const select = vi.fn(async () => undefined)
    const navigation = {
      ...prompts(select),
      signal: new AbortController().signal,
      selectPage: vi.fn(async (request: SelectOverlayRequest, onSelect: (choice: OverlayChoice) => void | Promise<void>) => {
        const choice = request.choices.find(candidate => candidate.id === target.id)
        if (choice !== undefined) await onSelect(choice)
      }),
      replaceSelectPage: vi.fn(),
      updateChoices: vi.fn(),
      back: vi.fn(),
      finish: vi.fn(),
    } satisfies OverlayNavigation
    const selectModel = vi.fn(async () => undefined)
    const capabilities = {
      listModels: async () => ({ options: [target], failures: [], routable: true }),
      selectModel,
    } as unknown as HarnessTuiCapabilities
    const host = actionHost(navigation)

    await new TuiActions(capabilities, host).execute('model', '')

    expect(select).not.toHaveBeenCalled()
    expect(selectModel).toHaveBeenCalledExactlyOnceWith({ provider: 'deepseek', model: 'v4' })
    expect(host.refreshHeader).toHaveBeenCalledOnce()
  })

  it('changes only the current route reasoning effort and marks the active choice', async () => {
    const current = option({ current: true, currentEffort: 'high' })
    let request: SelectOverlayRequest | undefined
    const overlays = prompts(vi.fn(async (value: SelectOverlayRequest) => {
      request = value
      return { id: 'max', label: 'Maximum' }
    }))
    const selectModel = vi.fn(async () => undefined)
    const capabilities = {
      listModels: async () => ({ options: [current], failures: [], routable: true }),
      selectModel,
    } as unknown as HarnessTuiCapabilities
    const host = actionHost(overlays)

    await new TuiActions(capabilities, host).execute('effort', '')

    expect(request?.title).toContain('推理强度')
    expect(request?.choices.find(choice => choice.id === 'high')?.label).toContain('当前')
    expect(selectModel).toHaveBeenCalledExactlyOnceWith({
      provider: 'deepseek', model: 'v4', reasoningEffort: 'max',
    })
    expect(host.refreshHeader).toHaveBeenCalledOnce()
  })

  it('does not reopen model selection when the current route has no adjustable effort', async () => {
    const select = vi.fn(async () => undefined)
    const selectModel = vi.fn(async () => undefined)
    const capabilities = {
      listModels: async () => ({
        options: [option({ current: true, efforts: [] })], failures: [], routable: true,
      }),
      selectModel,
    } as unknown as HarnessTuiCapabilities
    const host = actionHost(prompts(select))

    await new TuiActions(capabilities, host).execute('effort', '')

    expect(select).not.toHaveBeenCalled()
    expect(selectModel).not.toHaveBeenCalled()
    expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('不提供可调推理强度'), 'info')
  })
})
