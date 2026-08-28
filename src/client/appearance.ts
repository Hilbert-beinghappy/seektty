/** Validation helpers for the Harness-owned SeekTTY appearance setting. */

import {
  DEFAULT_TUI_THEME,
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiAppearanceSettings,
  type TuiBackgroundMode,
  type TuiCodeThemeId,
  type TuiCustomTheme,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiThemeId,
} from '@deepseek-ai/dsh-tui-protocol'
import { ui } from './locale.ts'
import {
  normalizeAppearance,
  normalizeBackgroundMode,
  resolveAppearanceTheme,
  resolveTheme,
  type ResolvedTuiTheme,
} from './theme-config.ts'

/**
 * Find the appearance descriptor registered by the Host bridge.
 * @param documents - redacted Harness Settings descriptors.
 * @returns the SeekTTY appearance descriptor.
 */
export function appearanceSettings(
  documents: readonly TuiSettingsDocument[],
): TuiSettingsDocument {
  const document = documents.find(candidate =>
    candidate.namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE)
  if (document === undefined) {
    throw new Error(ui(
      `Harness 未注册设置 ${TUI_APPEARANCE_SETTINGS_NAMESPACE}`,
      `Harness did not register settings ${TUI_APPEARANCE_SETTINGS_NAMESPACE}`,
    ))
  }
  return document
}

/**
 * Read and normalize the complete appearance value.
 * @param document - appearance descriptor returned by Harness Settings.
 * @returns validated appearance settings.
 */
export function appearanceFromSettings(document: TuiSettingsDocument): TuiAppearanceSettings {
  return normalizeAppearance(document.value)
}

/**
 * Resolve the active renderer theme from one appearance descriptor.
 * @param document - appearance descriptor returned by Harness Settings.
 * @returns complete built-in or custom theme.
 */
export function themeFromAppearance(document: TuiSettingsDocument): ResolvedTuiTheme {
  const appearance = appearanceFromSettings(document)
  return resolveAppearanceTheme(appearance)
}

/**
 * Persist one complete interface theme and restore automatic matching for code regions.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param theme - requested theme id.
 * @returns the updated, validated appearance descriptor.
 */
export async function saveTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  theme: TuiThemeId,
): Promise<TuiSettingsDocument> {
  resolveTheme(appearanceFromSettings(document), theme)
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [
      { op: 'set', path: ['theme'], value: theme },
      { op: 'set', path: ['codeTheme'], value: 'auto' },
    ],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.theme !== theme || stored.codeTheme !== 'auto') {
    throw new Error(ui(
      `Harness 保存了意外主题 ${JSON.stringify(stored.theme)}`,
      `Harness saved an unexpected theme ${JSON.stringify(stored.theme)}`,
    ))
  }
  return updated
}

/**
 * Persist one independent code-theme selection.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param codeTheme - requested automatic, built-in, or named code theme.
 * @returns the updated, validated appearance descriptor.
 */
export async function saveCodeTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  codeTheme: TuiCodeThemeId,
): Promise<TuiSettingsDocument> {
  const appearance = appearanceFromSettings(document)
  if (codeTheme !== 'auto') resolveTheme(appearance, codeTheme)
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [{ op: 'set', path: ['codeTheme'], value: codeTheme }],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.codeTheme !== codeTheme) {
    throw new Error(ui(
      `Harness 保存了意外代码主题 ${JSON.stringify(stored.codeTheme)}`,
      `Harness saved an unexpected code theme ${JSON.stringify(stored.codeTheme)}`,
    ))
  }
  return updated
}

/** Persist only the canvas policy; imported/exported themes do not own it. */
export async function saveBackgroundMode(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  mode: TuiBackgroundMode,
): Promise<TuiSettingsDocument> {
  const value = normalizeBackgroundMode(mode)
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [{ op: 'set', path: ['backgroundMode'], value }],
    document.revision,
  )
  if (appearanceFromSettings(updated).backgroundMode !== value) {
    throw new Error(ui('Harness 未保存所选背景模式', 'Harness did not save the selected background mode'))
  }
  return updated
}

/** Which active selection receives a newly saved custom theme. */
export type CustomThemeActivation = 'both' | 'code'

/**
 * Add or replace a named custom theme and activate it for the requested surfaces.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param theme - validated custom theme.
 * @param activation - select the theme for both interface and code, or code only.
 * @returns updated descriptor with the theme active.
 */
export async function saveCustomTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  theme: TuiCustomTheme,
  activation: CustomThemeActivation = 'both',
): Promise<TuiSettingsDocument> {
  const appearance = appearanceFromSettings(document)
  const customThemes = appearance.customThemes.some(candidate => candidate.id === theme.id)
    ? appearance.customThemes.map(candidate => candidate.id === theme.id ? theme : candidate)
    : [...appearance.customThemes, theme]
  const selected: TuiThemeId = `custom:${theme.id}`
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [
      { op: 'set', path: ['customThemes'], value: customThemes },
      ...(activation === 'both' ? [{ op: 'set' as const, path: ['theme'], value: selected }] : []),
      { op: 'set', path: ['codeTheme'], value: selected },
    ],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  const expectedTheme = activation === 'both' ? selected : appearance.theme
  if (stored.theme !== expectedTheme
    || stored.codeTheme !== selected
    || !stored.customThemes.some(candidate => candidate.id === theme.id)) {
    throw new Error(ui(
      `Harness 未完整保存自定义主题 ${JSON.stringify(theme.name)}`,
      `Harness did not fully save custom theme ${JSON.stringify(theme.name)}`,
    ))
  }
  return updated
}

/**
 * Delete one custom theme and atomically repair any active interface or code selection.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param id - custom theme id without the custom prefix.
 * @returns updated appearance descriptor.
 */
export async function deleteCustomTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  id: string,
): Promise<TuiSettingsDocument> {
  const appearance = appearanceFromSettings(document)
  if (!appearance.customThemes.some(candidate => candidate.id === id)) {
    throw new Error(ui(
      `自定义主题 ${JSON.stringify(id)} 不存在`,
      `Custom theme ${JSON.stringify(id)} does not exist`,
    ))
  }
  const customThemes = appearance.customThemes.filter(candidate => candidate.id !== id)
  const selected: TuiThemeId = `custom:${id}`
  const active: TuiThemeId = appearance.theme === selected ? DEFAULT_TUI_THEME : appearance.theme
  const activeCode: TuiCodeThemeId = appearance.codeTheme === selected ? 'auto' : appearance.codeTheme
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [
      { op: 'set', path: ['customThemes'], value: customThemes },
      ...(active === appearance.theme ? [] : [{ op: 'set' as const, path: ['theme'], value: active }]),
      ...(activeCode === appearance.codeTheme ? [] : [{ op: 'set' as const, path: ['codeTheme'], value: activeCode }]),
    ],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.customThemes.some(candidate => candidate.id === id)
    || stored.theme !== active
    || stored.codeTheme !== activeCode) {
    throw new Error(ui(
      `Harness 未完整删除自定义主题 ${JSON.stringify(id)}`,
      `Harness did not fully delete custom theme ${JSON.stringify(id)}`,
    ))
  }
  return updated
}
