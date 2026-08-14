/** Validation helpers for the Harness-owned SeekTTY appearance setting. */

import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiTheme,
} from '@deepseek-ai/dsh-tui-protocol'

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
 * Read a validated theme id from one appearance descriptor.
 * @param document - appearance descriptor returned by Harness Settings.
 * @returns a supported terminal theme id.
 */
export function themeFromAppearance(document: TuiSettingsDocument): TuiTheme {
  if (typeof document.value !== 'object' || document.value === null
    || !('theme' in document.value)) {
    throw new Error('SeekTTY 主题设置缺少 theme 字段')
  }
  const theme = document.value.theme
  if (theme !== 'dark' && theme !== 'light') {
    throw new Error(`SeekTTY 主题 ${JSON.stringify(theme)} 不受支持`)
  }
  return theme
}

/**
 * Persist one theme through the native Harness Settings mutation path.
 * @param settings - same-process redacted Settings bridge.
 * @param document - descriptor whose revision protects this write.
 * @param theme - requested dark or light theme.
 * @returns the updated, validated appearance descriptor.
 */
export async function saveTheme(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  theme: TuiTheme,
): Promise<TuiSettingsDocument> {
  const updated = await settings.mutate(
    TUI_APPEARANCE_SETTINGS_NAMESPACE,
    [{ op: 'set', path: ['theme'], value: theme }],
    document.revision,
  )
  const stored = themeFromAppearance(updated)
  if (stored !== theme) {
    throw new Error(`Harness 保存了意外主题 ${JSON.stringify(stored)}`)
  }
  return updated
}
