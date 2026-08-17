import { afterEach, describe, expect, it, vi } from 'vitest'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { applyKeyBindingOverrides, matchesBinding } from '../src/client/keymap.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import {
  DEFAULT_TUI_BEHAVIOR,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiBehaviorSettings,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiSettingsPathOp,
} from '../src/protocol.ts'

afterEach(() => {
  applyKeyBindingOverrides({})
})

function document(value: TuiBehaviorSettings, revision = 0): TuiSettingsDocument {
  return {
    namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE,
    schema: {},
    value,
    revision,
    applies: 'live',
    secrets: [],
  }
}

function actionHarness(initial: TuiBehaviorSettings = DEFAULT_TUI_BEHAVIOR): {
  readonly actions: TuiActions
  readonly host: TuiActionHost
  readonly mutate: ReturnType<typeof vi.fn>
} {
  let current = document(initial)
  const mutate = vi.fn(async (
    _namespace: string,
    ops: readonly TuiSettingsPathOp[],
    expectedRevision: number,
  ): Promise<TuiSettingsDocument> => {
    expect(expectedRevision).toBe(current.revision)
    const value = { ...(current.value as TuiBehaviorSettings) } as Record<string, unknown>
    for (const op of ops) {
      expect(op.path).toHaveLength(1)
      const key = op.path[0]
      if (key === undefined) continue
      if (op.op === 'set') value[key] = op.value
      else delete value[key]
    }
    current = document(value as unknown as TuiBehaviorSettings, current.revision + 1)
    return current
  })
  const settings = {
    describe: vi.fn(async () => [current]),
    mutate,
  } as unknown as TuiManagementBridge['settings']
  const management = { settings } as unknown as TuiManagementBridge
  const capabilities = {
    managementBridge: () => management,
    active: () => undefined,
  } as unknown as HarnessTuiCapabilities
  const host: TuiActionHost = {
    overlays: {} as OverlayQueue,
    transcript: {} as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    applyBehavior: vi.fn((behavior: TuiBehaviorSettings) => {
      applyKeyBindingOverrides(behavior.keyBindings)
    }),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
  return { actions: new TuiActions(capabilities, host), host, mutate }
}

describe('/keymap', () => {
  it('persists a chord override and applies it live', async () => {
    const { actions, host, mutate } = actionHarness()
    await actions.execute('keymap', 'commandPalette Ctrl+K')
    expect(mutate).toHaveBeenCalledWith(
      TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['keyBindings'], value: { commandPalette: 'ctrl+k' } }],
      0,
    )
    expect(host.applyBehavior).toHaveBeenCalled()
    expect(matchesBinding('commandPalette', '\u0010')).toBe(false)
    expect(matchesBinding('commandPalette', '\u000b')).toBe(true)
  })

  it('refuses a chord that another action already owns', async () => {
    const { actions, host, mutate } = actionHarness()
    await actions.execute('keymap', 'commandPalette Ctrl+S')
    expect(mutate).not.toHaveBeenCalled()
    expect(host.applyBehavior).not.toHaveBeenCalled()
    expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('sessions'), 'error')
  })

  it('restores the shipped default for one action', async () => {
    const { actions, mutate } = actionHarness({
      ...DEFAULT_TUI_BEHAVIOR,
      keyBindings: { commandPalette: 'ctrl+k' },
    })
    await actions.execute('keymap', 'commandPalette reset')
    expect(mutate).toHaveBeenCalledWith(
      TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['keyBindings'], value: {} }],
      0,
    )
  })
})
