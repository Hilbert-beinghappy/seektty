import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TUI_BEHAVIOR,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '../src/protocol.ts'
import {
  behaviorFromSettings,
  behaviorSettings,
  createLiveBehavior,
  normalizeBehavior,
} from '../src/client/behavior.ts'
import { Transcript } from '../src/client/transcript.ts'

function document(value: unknown): TuiSettingsDocument {
  return {
    namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE,
    schema: {},
    value,
    revision: 1,
    applies: 'live',
    secrets: [],
  }
}

describe('seektty-behavior settings', () => {
  it('fills first-run defaults and rejects unknown or unbounded values', () => {
    expect(normalizeBehavior(undefined)).toEqual(DEFAULT_TUI_BEHAVIOR)
    expect(normalizeBehavior({
      toolCards: 'expanded',
      showReasoning: true,
      desktopNotifications: false,
      followTerminalTitle: false,
      composerHistoryLimit: 0,
      statusElapsed: false,
      clipboardFallback: 'osc52',
    })).toEqual({
      toolCards: 'expanded',
      showReasoning: true,
      desktopNotifications: false,
      followTerminalTitle: false,
      composerHistoryLimit: 0,
      statusElapsed: false,
      clipboardFallback: 'osc52',
      toolOutputLineLimit: 200,
      diffContextLines: 3,
      dangerConfirmDefault: 'cancel',
      mouseMode: 'full',
      hoverFeedback: true,
      scrollbarVisibility: 'always',
      copyOnSelect: true,
      wheelScrollLines: 3,
      wheelAcceleration: true,
      keyBindings: {},
    })
    expect(normalizeBehavior({
      keyBindings: { commandPalette: 'Ctrl+K', submit: 'ctrl+n', mystery: 'ctrl+f' },
    }).keyBindings).toEqual({ commandPalette: 'ctrl+k' })
    expect(normalizeBehavior({
      keyBindings: { commandPalette: 'k', historySearch: 'ctrl+s' },
    }).keyBindings).toEqual({})
    expect(normalizeBehavior({
      toolCards: 'mystery',
      composerHistoryLimit: 99_999,
      clipboardFallback: 'pbcopy',
    })).toMatchObject({
      toolCards: 'collapsed',
      composerHistoryLimit: 10_000,
      clipboardFallback: 'auto',
    })
    expect(normalizeBehavior({
      diffContextLines: 1,
      dangerConfirmDefault: 'confirm',
    })).toMatchObject({
      diffContextLines: 1,
      dangerConfirmDefault: 'confirm',
    })
    expect(normalizeBehavior({
      mouseMode: 'native',
      hoverFeedback: false,
      scrollbarVisibility: 'hidden',
      copyOnSelect: false,
      wheelScrollLines: 1,
      wheelAcceleration: false,
    })).toMatchObject({
      mouseMode: 'native',
      hoverFeedback: false,
      scrollbarVisibility: 'hidden',
      copyOnSelect: false,
      wheelScrollLines: 1,
      wheelAcceleration: false,
    })
    expect(normalizeBehavior({
      mouseMode: 'mystery',
      wheelScrollLines: 99,
    })).toMatchObject({
      mouseMode: 'full',
      wheelScrollLines: 12,
    })
    expect(normalizeBehavior({ wheelScrollLines: 0 }).wheelScrollLines).toBe(1)
  })

  it('reads the registered namespace and applies transcript startup defaults', () => {
    expect(behaviorSettings([document({})]).namespace).toBe(TUI_BEHAVIOR_SETTINGS_NAMESPACE)
    expect(() => behaviorSettings([])).toThrow(TUI_BEHAVIOR_SETTINGS_NAMESPACE)

    const transcript = new Transcript(() => 8)
    const behavior = behaviorFromSettings(document({
      toolCards: 'hidden',
      showReasoning: true,
    }))
    transcript.applyPresentationDefaults(behavior.toolCards, behavior.showReasoning)
    expect(transcript.cycleToolVisibility()).toBe('collapsed')
    expect(transcript.toggleReasoning()).toBe(false)
  })

  it('replaces the whole live behavior object so Settings marked live actually apply', () => {
    const live = createLiveBehavior(DEFAULT_TUI_BEHAVIOR)
    expect(live.get().statusElapsed).toBe(true)
    const next = normalizeBehavior({
      ...DEFAULT_TUI_BEHAVIOR,
      statusElapsed: false,
      desktopNotifications: false,
      followTerminalTitle: false,
      clipboardFallback: 'off',
      composerHistoryLimit: 0,
    })
    expect(live.apply(next)).toBe(live.get())
    expect(live.get()).toEqual(next)
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/surface.ts'), 'utf8')
    expect(source).toMatch(/createLiveBehavior\(/u)
    expect(source).not.toMatch(/initialBehavior\.(statusElapsed|desktopNotifications|followTerminalTitle|clipboardFallback|composerHistoryLimit)/u)
  })
})
