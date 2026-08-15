import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth } from '@mariozechner/pi-tui'
import {
  DEFAULT_TUI_THEME,
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiManagementBridge,
  type TuiSettingsDocument,
} from '../src/protocol.ts'
import { appearanceSettings, saveTheme, themeFromAppearance } from '../src/client/appearance.ts'
import {
  background,
  color,
  currentTheme,
  setTheme,
  surfaceRow,
} from '../src/client/theme.ts'

function appearance(theme: 'dark' | 'light', revision = 0): TuiSettingsDocument {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: {},
    value: { theme },
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
  setTheme(DEFAULT_TUI_THEME)
  vi.unstubAllEnvs()
})

describe('terminal themes', () => {
  it('switches every semantic layer between DeepSeek dark and light palettes', () => {
    enableTruecolor()

    setTheme('dark')
    expect(background.canvas('frame')).toContain('\u001B[48;2;9;14;27m')
    expect(color.brand('brand')).toContain('\u001B[38;2;102;130;255m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;52;65;95m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;145;167;255m')

    setTheme('light')
    expect(currentTheme()).toBe('light')
    expect(background.canvas('frame')).toContain('\u001B[48;2;246;248;253m')
    expect(color.brand('brand')).toContain('\u001B[38;2;49;86;216m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;170;185;235m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;65;95;201m')
  })

  it('restores a panel background after nested foreground resets', () => {
    enableTruecolor()
    setTheme('dark')
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
})

describe('appearance settings', () => {
  it('requires the Harness namespace and validates its selected theme', () => {
    const document = appearance('light')
    expect(appearanceSettings([document])).toBe(document)
    expect(themeFromAppearance(document)).toBe('light')
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
})
