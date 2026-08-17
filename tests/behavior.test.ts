import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TUI_BEHAVIOR,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '../src/protocol.ts'
import {
  behaviorFromSettings,
  behaviorSettings,
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
    })
    expect(normalizeBehavior({
      toolCards: 'mystery',
      composerHistoryLimit: 99_999,
      clipboardFallback: 'pbcopy',
    })).toMatchObject({
      toolCards: 'collapsed',
      composerHistoryLimit: 10_000,
      clipboardFallback: 'auto',
    })
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
})
