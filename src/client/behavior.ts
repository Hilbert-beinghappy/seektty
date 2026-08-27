/** Validation helpers for the Harness-owned SeekTTY behavior setting. */

import {
  DEFAULT_TUI_BEHAVIOR,
  MAX_COMPOSER_HISTORY,
  MAX_DIFF_CONTEXT_LINES,
  MAX_TOOL_OUTPUT_LINE_LIMIT,
  MAX_WHEEL_SCROLL_LINES,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiBehaviorSettings,
  type TuiClipboardFallback,
  type TuiDangerConfirmDefault,
  type TuiMouseMode,
  type TuiScrollbarVisibility,
  type TuiSettingsDocument,
  type TuiToolCardDisplay,
} from '@deepseek-ai/dsh-tui-protocol'
import { sanitizeKeyBindings } from './keymap.ts'
import { ui } from './locale.ts'

const TOOL_CARDS = new Set<TuiToolCardDisplay>(['collapsed', 'expanded', 'hidden'])
const CLIPBOARD_FALLBACK = new Set<TuiClipboardFallback>(['auto', 'osc52', 'off'])
const DANGER_CONFIRM = new Set<TuiDangerConfirmDefault>(['cancel', 'confirm'])
const MOUSE_MODE = new Set<TuiMouseMode>(['full', 'native'])
const SCROLLBAR_VISIBILITY = new Set<TuiScrollbarVisibility>(['always', 'hidden'])

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? value as Readonly<Record<string, unknown>> : {}
}

function toolCardsOf(value: unknown): TuiToolCardDisplay {
  return typeof value === 'string' && TOOL_CARDS.has(value as TuiToolCardDisplay)
    ? value as TuiToolCardDisplay
    : DEFAULT_TUI_BEHAVIOR.toolCards
}

function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function historyLimitOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_TUI_BEHAVIOR.composerHistoryLimit
  }
  return Math.min(MAX_COMPOSER_HISTORY, Math.floor(value))
}

function toolOutputLineLimitOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit
  }
  return Math.min(MAX_TOOL_OUTPUT_LINE_LIMIT, Math.floor(value))
}

function clipboardFallbackOf(value: unknown): TuiClipboardFallback {
  return typeof value === 'string' && CLIPBOARD_FALLBACK.has(value as TuiClipboardFallback)
    ? value as TuiClipboardFallback
    : DEFAULT_TUI_BEHAVIOR.clipboardFallback
}

function diffContextLinesOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_TUI_BEHAVIOR.diffContextLines
  }
  return Math.min(MAX_DIFF_CONTEXT_LINES, Math.floor(value))
}

function dangerConfirmDefaultOf(value: unknown): TuiDangerConfirmDefault {
  return typeof value === 'string' && DANGER_CONFIRM.has(value as TuiDangerConfirmDefault)
    ? value as TuiDangerConfirmDefault
    : DEFAULT_TUI_BEHAVIOR.dangerConfirmDefault
}

function mouseModeOf(value: unknown): TuiMouseMode {
  return typeof value === 'string' && MOUSE_MODE.has(value as TuiMouseMode)
    ? value as TuiMouseMode
    : DEFAULT_TUI_BEHAVIOR.mouseMode
}

function scrollbarVisibilityOf(value: unknown): TuiScrollbarVisibility {
  return typeof value === 'string' && SCROLLBAR_VISIBILITY.has(value as TuiScrollbarVisibility)
    ? value as TuiScrollbarVisibility
    : DEFAULT_TUI_BEHAVIOR.scrollbarVisibility
}

function wheelScrollLinesOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TUI_BEHAVIOR.wheelScrollLines
  }
  return Math.min(MAX_WHEEL_SCROLL_LINES, Math.max(1, Math.floor(value)))
}

/**
 * Find the behavior descriptor registered by the Host bridge.
 * @param documents - redacted Harness Settings descriptors.
 * @returns the SeekTTY behavior descriptor.
 */
export function behaviorSettings(
  documents: readonly TuiSettingsDocument[],
): TuiSettingsDocument {
  const document = documents.find(candidate =>
    candidate.namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE)
  if (document === undefined) {
    throw new Error(ui(
      `Harness 未注册设置 ${TUI_BEHAVIOR_SETTINGS_NAMESPACE}`,
      `Harness did not register settings ${TUI_BEHAVIOR_SETTINGS_NAMESPACE}`,
    ))
  }
  return document
}

/**
 * Coerce one stored document into complete, bounded behavior settings.
 * @param value - raw Settings value, possibly partial or legacy.
 * @returns validated behavior settings.
 */
export function normalizeBehavior(value: unknown): TuiBehaviorSettings {
  const record = recordOf(value)
  return {
    toolCards: toolCardsOf(record.toolCards),
    showReasoning: booleanOf(record.showReasoning, DEFAULT_TUI_BEHAVIOR.showReasoning),
    desktopNotifications: booleanOf(
      record.desktopNotifications,
      DEFAULT_TUI_BEHAVIOR.desktopNotifications,
    ),
    followTerminalTitle: booleanOf(
      record.followTerminalTitle,
      DEFAULT_TUI_BEHAVIOR.followTerminalTitle,
    ),
    composerHistoryLimit: historyLimitOf(record.composerHistoryLimit),
    statusElapsed: booleanOf(record.statusElapsed, DEFAULT_TUI_BEHAVIOR.statusElapsed),
    clipboardFallback: clipboardFallbackOf(record.clipboardFallback),
    toolOutputLineLimit: toolOutputLineLimitOf(record.toolOutputLineLimit),
    diffContextLines: diffContextLinesOf(record.diffContextLines),
    dangerConfirmDefault: dangerConfirmDefaultOf(record.dangerConfirmDefault),
    mouseMode: mouseModeOf(record.mouseMode),
    scrollbarVisibility: scrollbarVisibilityOf(record.scrollbarVisibility),
    copyOnSelect: booleanOf(record.copyOnSelect, DEFAULT_TUI_BEHAVIOR.copyOnSelect),
    wheelScrollLines: wheelScrollLinesOf(record.wheelScrollLines),
    wheelAcceleration: booleanOf(record.wheelAcceleration, DEFAULT_TUI_BEHAVIOR.wheelAcceleration),
    keyBindings: sanitizeKeyBindings(record.keyBindings),
  }
}

/**
 * Read and normalize the complete behavior value.
 * @param document - behavior descriptor returned by Harness Settings.
 * @returns validated behavior settings.
 */
export function behaviorFromSettings(document: TuiSettingsDocument): TuiBehaviorSettings {
  return normalizeBehavior(document.value)
}

/** Mutable current behavior; every live path must read {@link LiveBehavior.get}. */
export interface LiveBehavior {
  get(): TuiBehaviorSettings
  apply(next: TuiBehaviorSettings): TuiBehaviorSettings
}

/**
 * Hold one replaceable behavior snapshot for the running Surface.
 * Settings marked `applies: live` replace the whole object.
 */
export function createLiveBehavior(initial: TuiBehaviorSettings): LiveBehavior {
  let current = initial
  return {
    get: () => current,
    apply: (next) => {
      current = next
      return current
    },
  }
}
