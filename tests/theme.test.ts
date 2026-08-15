import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth } from '@mariozechner/pi-tui'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiCustomTheme,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiThemeId,
} from '../src/protocol.ts'
import {
  appearanceSettings,
  deleteCustomTheme,
  saveCustomTheme,
  saveTheme,
  themeFromAppearance,
} from '../src/client/appearance.ts'
import {
  background,
  color,
  currentTheme,
  setTheme,
  styleTerminalText,
  surfaceRow,
  terminalColorLevel,
} from '../src/client/theme.ts'
import { BUILT_IN_THEMES, editableTheme } from '../src/client/theme-config.ts'

function appearance(
  theme: TuiThemeId,
  revision = 0,
  customThemes: readonly TuiCustomTheme[] = [],
): TuiSettingsDocument {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: {},
    value: { theme, customThemes },
    revision,
    applies: 'live',
    secrets: [],
  }
}

function enableTruecolor(): void {
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
}

afterEach(() => {
  setTheme(BUILT_IN_THEMES.dark)
  vi.unstubAllEnvs()
})

describe('terminal themes', () => {
  it('switches every semantic layer between DeepSeek dark and light palettes', () => {
    enableTruecolor()

    setTheme(BUILT_IN_THEMES.dark)
    expect(background.canvas('frame')).toContain('\u001B[48;2;9;14;27m')
    expect(color.brand('brand')).toContain('\u001B[38;2;102;130;255m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;52;65;95m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;145;167;255m')

    setTheme(BUILT_IN_THEMES.light)
    expect(currentTheme().id).toBe('light')
    expect(background.canvas('frame')).toContain('\u001B[48;2;246;248;253m')
    expect(color.brand('brand')).toContain('\u001B[38;2;49;86;216m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;198;208;231m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;65;95;201m')
  })

  it('restores a panel background after nested foreground resets', () => {
    enableTruecolor()
    setTheme(BUILT_IN_THEMES.dark)
    const surface = background.surface(`before ${color.brand('brand')} after`)
    expect(surface.match(/\u001B\[48;2;17;24;39m/gu)).toHaveLength(2)
    expect(surface.endsWith('\u001B[0m')).toBe(true)
  })

  it('pads panel rows and honors NO_COLOR', () => {
    vi.stubEnv('NO_COLOR', '1')
    const row = surfaceRow('主题', 10)
    expect(row).not.toContain('\u001B[')
    expect(visibleWidth(row)).toBe(10)
  })

  it('quantizes arbitrary theme colors for 256-color and ANSI-16 terminals', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('COLORTERM', undefined)
    vi.stubEnv('TERM_PROGRAM', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    expect(terminalColorLevel()).toBe(2)
    expect(styleTerminalText('token', { foreground: '#6682FF', background: '#111827' }))
      .toMatch(/^\u001B\[38;5;\d+m\u001B\[48;5;\d+mtoken\u001B\[0m$/u)

    vi.stubEnv('TERM', 'xterm')
    expect(terminalColorLevel()).toBe(1)
    expect(styleTerminalText('token', { foreground: '#6682FF', background: '#111827' }))
      .toMatch(/^\u001B\[(?:3|9)\d+m\u001B\[(?:4|10)\d+mtoken\u001B\[0m$/u)
  })
})

describe('appearance settings', () => {
  it('requires the Harness namespace and validates its selected theme', () => {
    const document = appearance('light')
    expect(appearanceSettings([document])).toBe(document)
    expect(themeFromAppearance(document).id).toBe('light')
    expect(themeFromAppearance({ ...document, value: { theme: 'dark' } }).id).toBe('dark')
    expect(() => appearanceSettings([])).toThrow('Harness 未注册设置')
    expect(() => themeFromAppearance({ ...document, value: { theme: 'sepia' } }))
      .toThrow('不受支持')
  })

  it('persists a change through the revision-protected Harness Settings path', async () => {
    const before = appearance('dark', 4)
    const after = appearance('light', 5)
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveTheme(settings, before, 'light')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['theme'], value: 'light' }],
      4,
    )
  })

  it('saves a named theme and selects it in one revision-protected mutation', async () => {
    const theme = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const before = appearance('dark', 2)
    const after = appearance('custom:ocean', 3, [theme])
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveCustomTheme(settings, before, theme)).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['customThemes'], value: [theme] },
        { op: 'set', path: ['theme'], value: 'custom:ocean' },
      ],
      2,
    )
  })

  it('atomically falls back to DeepSeek dark when deleting the active custom theme', async () => {
    const theme = editableTheme(BUILT_IN_THEMES.light, 'paper', 'Paper')
    const before = appearance('custom:paper', 7, [theme])
    const after = appearance('dark', 8)
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(deleteCustomTheme(settings, before, 'paper')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['customThemes'], value: [] },
        { op: 'set', path: ['theme'], value: 'dark' },
      ],
      7,
    )
  })
})
