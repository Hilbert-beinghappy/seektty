import { describe, expect, it, vi } from 'vitest'
import { appearanceFromSettings, saveBackgroundMode, saveCustomTheme, saveTheme } from '../src/client/appearance.ts'
import { BUILT_IN_THEMES, editableTheme } from '../src/client/theme-config.ts'
import { serializeThemeExport, themeForExport } from '../src/client/theme-export.ts'
import { TUI_APPEARANCE_SETTINGS_NAMESPACE, type TuiManagementBridge, type TuiSettingsDocument, type TuiSettingsPathOp } from '../src/protocol.ts'

function state() {
  let current: TuiSettingsDocument = {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE, schema: {}, revision: 7, applies: 'live', secrets: [],
    value: { theme: 'dark', codeTheme: 'auto', backgroundMode: 'terminal', customThemes: [] },
  }
  const mutate = vi.fn(async (_namespace: string, ops: readonly TuiSettingsPathOp[], revision: number) => {
    expect(revision).toBe(current.revision)
    const value = { ...current.value as Record<string, unknown> }
    for (const op of ops) {
      expect(op.op).toBe('set')
      if (op.op === 'set') value[String(op.path[0])] = op.value
    }
    current = { ...current, revision: revision + 1, value }
    return current
  })
  return { current: () => current, mutate, settings: { mutate } as unknown as TuiManagementBridge['settings'] }
}

describe('Harness-owned background mode', () => {
  it('persists just the background field using the current revision', async () => {
    const harness = state()
    const updated = await saveBackgroundMode(harness.settings, harness.current(), 'explicit')
    expect(harness.mutate).toHaveBeenCalledWith(TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['backgroundMode'], value: 'explicit' }], 7)
    expect(appearanceFromSettings(updated)).toEqual({
      theme: 'dark', codeTheme: 'auto', backgroundMode: 'explicit', customThemes: [],
    })
  })

  it('does not alter the source document when persistence fails or returns an unexpected value', async () => {
    const harness = state()
    const before = harness.current()
    harness.mutate.mockRejectedValueOnce(new Error('revision conflict'))
    await expect(saveBackgroundMode(harness.settings, before, 'explicit')).rejects.toThrow('revision conflict')
    expect(harness.current()).toBe(before)
    harness.mutate.mockResolvedValueOnce(before)
    await expect(saveBackgroundMode(harness.settings, before, 'explicit')).rejects.toThrow()
    expect(appearanceFromSettings(before).backgroundMode).toBe('terminal')
  })

  it('keeps mode outside theme selection, custom theme import/save and portable exports', async () => {
    const harness = state()
    await saveTheme(harness.settings, harness.current(), 'light')
    const custom = editableTheme(BUILT_IN_THEMES.dark, 'imported', 'Imported')
    const updated = await saveCustomTheme(harness.settings, harness.current(), custom)
    expect(appearanceFromSettings(updated).backgroundMode).toBe('terminal')
    expect(serializeThemeExport(themeForExport(BUILT_IN_THEMES.dark))).not.toContain('backgroundMode')
    expect(harness.mutate.mock.calls.flatMap(call => call[1]).some(op => op.path[0] === 'backgroundMode')).toBe(false)
  })
})
