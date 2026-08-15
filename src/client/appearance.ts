/** Validation helpers for the Harness-owned SeekTTY appearance setting. */

import {
  DEFAULT_TUI_THEME,
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiAppearanceSettings,
  type TuiCustomTheme,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiThemeId,
} from '@deepseek-ai/dsh-tui-protocol'
import {
  normalizeAppearance,
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
    throw new Error(`Harness 未注册设置 ${TUI_APPEARANCE_SETTINGS_NAMESPACE}`)
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
  return resolveTheme(appearance)
}

/**
 * Persist one selected built-in or custom theme.
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
    [{ op: 'set', path: ['theme'], value: theme }],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.theme !== theme) {
    throw new Error(`Harness 保存了意外主题 ${JSON.stringify(stored.theme)}`)
  }
  return updated
}

/**
 * Add or replace a named custom theme and select it in one revision-protected mutation.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param theme - validated custom theme.
 * @returns updated descriptor with the theme active.
 */
export async function saveCustomTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  theme: TuiCustomTheme,
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
      { op: 'set', path: ['theme'], value: selected },
    ],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.theme !== selected || !stored.customThemes.some(candidate => candidate.id === theme.id)) {
    throw new Error(`Harness 未完整保存自定义主题 ${JSON.stringify(theme.name)}`)
  }
  return updated
}

/**
 * Delete one custom theme and atomically leave an active deletion on DeepSeek dark.
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
  if (!appearance.customThemes.some(candidate => candidate.id === id)) throw new Error(`自定义主题 ${JSON.stringify(id)} 不存在`)
  const customThemes = appearance.customThemes.filter(candidate => candidate.id !== id)
  const active: TuiThemeId = appearance.theme === `custom:${id}` ? DEFAULT_TUI_THEME : appearance.theme
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [
      { op: 'set', path: ['customThemes'], value: customThemes },
      ...(active === appearance.theme ? [] : [{ op: 'set' as const, path: ['theme'], value: active }]),
    ],
    document.revision,
  )
  const stored = appearanceFromSettings(updated)
  if (stored.customThemes.some(candidate => candidate.id === id) || stored.theme !== active) {
    throw new Error(`Harness 未完整删除自定义主题 ${JSON.stringify(id)}`)
  }
  return updated
}
