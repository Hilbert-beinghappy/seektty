import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import z from '@deepseek-ai/schemastery'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import type {
  TuiManagementBridge,
  TuiSettingsDocument,
  TuiSettingsPathOp,
} from '../src/protocol.ts'

const ESCAPE = '\u001B'
const ENTER = '\r'

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

function settingsDocument(value = true, revision = 0): TuiSettingsDocument {
  return {
    namespace: 'example',
    schema: z.object({ enabled: z.boolean().default(true) }).toJSON(),
    value: { enabled: value },
    base: { enabled: true },
    user: revision === 0 ? {} : { enabled: value },
    revision,
    applies: 'live',
    secrets: [],
  }
}

function actionHarness(): {
  readonly actions: TuiActions
  readonly overlays: OverlayQueue
  readonly describe: ReturnType<typeof vi.fn>
  readonly mutate: ReturnType<typeof vi.fn>
  readonly hide: ReturnType<typeof vi.fn>
  component(): Component & { handleInput(data: string): void }
} {
  let current = settingsDocument()
  const describe = vi.fn(async () => [current])
  const mutate = vi.fn(async (
    _namespace: string,
    ops: readonly TuiSettingsPathOp[],
    expectedRevision: number,
  ) => {
    expect(expectedRevision).toBe(current.revision)
    const set = ops.find(op => op.op === 'set')
    current = settingsDocument(set?.op === 'set' ? Boolean(set.value) : true, current.revision + 1)
    return current
  })
  const management = {
    settings: { describe, mutate },
  } as unknown as TuiManagementBridge
  const capabilities = {
    managementBridge: () => management,
    active: () => undefined,
  } as unknown as HarnessTuiCapabilities
  let mounted: Component | undefined
  const hide = vi.fn()
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
  } as unknown as TUI
  const overlays = new OverlayQueue(tui)
  const host: TuiActionHost = {
    overlays,
    transcript: {} as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
  return {
    actions: new TuiActions(capabilities, host),
    overlays,
    describe,
    mutate,
    hide,
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted as Component & { handleInput(data: string): void }
    },
  }
}

describe('/settings overlay navigation', () => {
  it('returns field/action → namespace → settings root → composer one level at a time', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('settings', '')

    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('设置')
    })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('设置 · example')
    })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('enabled')
      expect(plain(harness.component().render(90))).toContain('修改值')
    })

    harness.component().handleInput(ESCAPE)
    expect(plain(harness.component().render(90))).toContain('设置 · example')
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('搜索并修改全部功能设置')
    })
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
    expect(harness.mutate).not.toHaveBeenCalled()
  })

  it('keeps the settings root below a directly addressed namespace', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('settings', 'example')

    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('设置 · example')
    })
    harness.component().handleInput(ESCAPE)
    expect(plain(harness.component().render(90))).toContain('搜索并修改全部功能设置')
    harness.component().handleInput(ESCAPE)

    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('refreshes the namespace document after a field mutation', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('settings', '')

    await vi.waitFor(() => { expect(harness.component()).toBeDefined() })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('设置 · example')
    })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('修改值')
    })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('开启')
    })
    harness.component().handleInput(ENTER)

    await vi.waitFor(() => {
      expect(harness.mutate).toHaveBeenCalledWith(
        'example',
        [{ op: 'set', path: ['enabled'], value: true }],
        0,
      )
      expect(harness.describe.mock.calls.length).toBeGreaterThanOrEqual(3)
      expect(plain(harness.component().render(90))).toContain('设置 · example')
    })

    harness.component().handleInput(ESCAPE)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(90))).toContain('搜索并修改全部功能设置')
    })
    harness.component().handleInput(ESCAPE)
    await execution
  })
})
