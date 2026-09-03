import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth } from '@mariozechner/pi-tui'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiAppearanceSettings,
  type TuiCustomTheme,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiThemeId,
} from '../src/protocol.ts'
import {
  appearanceSettings,
  deleteCustomTheme,
  saveCodeTheme,
  saveCustomTheme,
  saveTheme,
  themeFromAppearance,
} from '../src/client/appearance.ts'
import {
  background,
  color,
  currentTheme,
  interaction,
  setBackgroundMode,
  setTerminalCanvasBackground,
  setTheme,
  statusColor,
  styleTerminalText,
  surfaceRow,
  terminalColorLevel,
  renderingColorLevel,
} from '../src/client/theme.ts'
import { BUILT_IN_THEMES, editableTheme, themeContrast } from '../src/client/theme-config.ts'

function appearance(
  theme: TuiThemeId,
  revision = 0,
  customThemes: readonly TuiCustomTheme[] = [],
  codeTheme: TuiAppearanceSettings['codeTheme'] = 'auto',
): TuiSettingsDocument {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: {},
    value: { theme, codeTheme, customThemes },
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
  setBackgroundMode('theme')
  setTerminalCanvasBackground(undefined)
  vi.unstubAllEnvs()
})

describe('terminal themes', () => {
  it.each([
    {}, { TERM: 'xterm-256color' }, { TERM: 'tmux-256color', TMUX: '/tmp/tmux' },
    { TERM: 'tmux-256color', TMUX: '/tmp/tmux', WT_SESSION: 'inherited' },
    { TERM: 'xterm', COLORTERM: 'truecolor' },
  ])('preserves exact foregrounds only in experimental mode for %j', env => {
    for (const key of ['NO_COLOR', 'TERM', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION', 'TMUX']) vi.stubEnv(key, undefined)
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    const detected = terminalColorLevel()
    setBackgroundMode('explicit')
    const old = color.brand('brand')
    setBackgroundMode('foreground')
    expect(terminalColorLevel()).toBe(detected)
    expect(renderingColorLevel()).toBe(3)
    for (const theme of [BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light]) {
      setTheme(theme)
      for (const knownBackground of [undefined, '#ffffff', '#000000']) {
        setTerminalCanvasBackground(knownBackground)
        const row = background.canvas(`body ${color.brand('brand')} ${color.muted('muted')} ${color.accent('accent')} ${color.success('success')} ${color.warning('warning')} ${color.danger('danger')} ${interaction.hover('hover')} ${statusColor.running('running')} ${statusColor.waiting('waiting')} ${statusColor.failed('failed')}`)
        for (const [word, hex] of Object.entries({
          body: theme.colors.text, brand: theme.colors.brand, muted: theme.colors.muted,
          accent: theme.colors.accent, success: theme.colors.success, warning: theme.colors.warning,
          danger: theme.colors.danger, hover: theme.colors.brand,
          running: theme.tone === 'dark' ? '#22d3ee' : '#0c6478',
          waiting: theme.tone === 'dark' ? '#facc15' : '#854d0e',
          failed: theme.tone === 'dark' ? '#f87171' : '#b91c1c',
        })) expect(foregroundAt(row, word)).toBe(hex.toLowerCase())
        expect(row).toContain('\u001B[49m')
        expect(row).not.toContain('\u001B[48;')
      }
    }
    setTheme(BUILT_IN_THEMES.dark)
    setBackgroundMode('explicit')
    expect(renderingColorLevel()).toBe(detected)
    expect(color.brand('brand')).toBe(old)
  })

  it.each([{ NO_COLOR: '' }, { TERM: 'dumb' }])('does not override disabled colors: %j', env => {
    enableTruecolor()
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    setBackgroundMode('foreground')
    expect(renderingColorLevel()).toBe(0)
    expect(background.canvas(color.brand('plain'))).toBe('plain')
    expect(styleTerminalText('code', { foreground: '#123456', background: '#654321' })).toBe('code')
  })

  // Evaluate the effective foreground at text, not just the presence of an
  // earlier escape that a nested Markdown token could override.
  function foregroundAt(row: string, text: string): string | undefined {
    const prefix = row.slice(0, row.indexOf(text))
    const match = [...prefix.matchAll(/\u001B\[(39|38;2;(\d+);(\d+);(\d+))m/gu)].at(-1)
    if (match?.[1] === '39') return undefined
    if (match === undefined) throw new Error('missing foreground')
    return `#${match.slice(2).map(value => Number(value).toString(16).padStart(2, '0')).join('')}`
  }

  it.each([['dark', '#ffffff'], ['light', '#000000']] as const)(
    'adapts cached %s text to a known mismatched terminal background %s', (theme, terminalBackground) => {
      enableTruecolor()
      setTheme(BUILT_IN_THEMES[theme])
      setBackgroundMode('terminal')
      const cached = `body ${color.muted('muted')} ${color.brand('heading')} ${color.danger('error')} ${color.accent('link')} ${statusColor.running('running')} ${statusColor.waiting('waiting')} ${statusColor.failed('failed')}`
      setTerminalCanvasBackground(terminalBackground)
      const row = background.canvas(cached)
      for (const word of ['body', 'muted', 'heading', 'error', 'link', 'running', 'waiting', 'failed']) {
        const actual = foregroundAt(row, word)
        expect(actual).toBeDefined()
        expect(themeContrast(actual!, terminalBackground)).toBeGreaterThanOrEqual(4.5)
      }
      expect(visibleWidth(row)).toBe(visibleWidth(cached))
      expect(currentTheme()).toBe(BUILT_IN_THEMES[theme])
      // Repaint the same cached row when the background becomes unknown.
      setTerminalCanvasBackground(undefined)
      for (const word of ['body', 'muted', 'heading', 'error', 'link', 'running', 'waiting', 'failed']) {
        expect(foregroundAt(background.canvas(cached), word)).toBeUndefined()
      }
    },
  )

  it.each(['theme', 'terminal'] as const)('uses terminal foregrounds for unknown %s backgrounds, preserving explicit islands', mode => {
    enableTruecolor()
    setBackgroundMode(mode)
    const inherited = [
      background.surface('panel'), interaction.hover('hover'), background.code('code'),
      statusColor.running('running'), statusColor.waiting('waiting'), statusColor.failed('failed'),
    ]
    const islands = [background.selection('selection')]
    const row = background.canvas(`body ${color.muted('muted')} \u001B[1mbold\u001B[0m ${inherited.join(' ')} ${islands.join(' ')} tail`)
    for (const word of ['body', 'muted', 'bold', 'panel', 'hover', 'code', 'running', 'waiting', 'failed', 'tail']) expect(foregroundAt(row, word)).toBeUndefined()
    for (const [index, word] of ['selection'].entries()) {
      expect(foregroundAt(row, word)).toBe(foregroundAt(islands[index]!, word))
    }
    expect(row).toContain('\u001B[1mbold')
    expect(row.replace(/\u001B\[[0-9;:]*m/gu, '')).toBe('body muted bold panel hover code running waiting failed selection tail')
  })

  it('keeps saved theme colors for explicit fill and confirmed matching theme backgrounds', () => {
    enableTruecolor()
    setBackgroundMode('explicit')
    const row = background.canvas(`body ${color.muted('muted')}`)
    expect(foregroundAt(row, 'body')?.toLowerCase()).toBe(BUILT_IN_THEMES.dark.colors.text.toLowerCase())
    setBackgroundMode('theme')
    setTerminalCanvasBackground(BUILT_IN_THEMES.dark.colors.canvas)
    expect(foregroundAt(background.canvas('body'), 'body')).toBe(foregroundAt(row, 'body'))
  })

  it('handles combined, indexed and colon SGR foregrounds without changing text or geometry', () => {
    enableTruecolor()
    setBackgroundMode('terminal')
    const row = background.canvas('\u001B[1;38;5;255mindexed\u001B[38:2::255:255:255mcolon\u001B[48;2;0;0;0mcode\u001B[49mtail')
    for (const word of ['indexed', 'colon', 'tail']) expect(foregroundAt(row, word)).toBeUndefined()
    expect(row).toContain('\u001B[38:2::255:255:255mcode')
    expect(visibleWidth(row)).toBe('indexedcoloncodetail'.length)
  })

  it('switches every semantic layer between DeepSeek dark and light palettes', () => {
    enableTruecolor()
    setBackgroundMode('explicit')

    setTheme(BUILT_IN_THEMES.dark)
    expect(background.canvas('frame')).toContain('\u001B[48;2;9;14;27m')
    expect(interaction.hover('option')).not.toBe(background.surface('option'))
    expect(interaction.hover('option')).not.toBe(background.selection('option'))
    expect(color.brand('brand')).toContain('\u001B[38;2;102;130;255m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;52;65;95m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;145;167;255m')
    expect(statusColor.running('运行')).toContain('\u001B[38;2;34;211;238m')
    expect(statusColor.waiting('等待')).toContain('\u001B[38;2;250;204;21m')
    expect(statusColor.failed('失败')).toContain('\u001B[38;2;248;113;113m')

    setTheme(BUILT_IN_THEMES.light)
    expect(currentTheme().id).toBe('light')
    expect(background.canvas('frame')).toContain('\u001B[48;2;246;248;253m')
    expect(interaction.hover('option')).not.toBe(background.surface('option'))
    expect(interaction.hover('option')).not.toBe(background.selection('option'))
    expect(color.brand('brand')).toContain('\u001B[38;2;49;86;216m')
    expect(color.pulse('◆', 0)).toContain('\u001B[38;2;198;208;231m')
    expect(color.pulse('◆', 4)).toContain('\u001B[38;2;65;95;201m')
    expect(statusColor.running('运行')).toContain('\u001B[38;2;12;100;120m')
    expect(statusColor.waiting('等待')).toContain('\u001B[38;2;133;77;14m')
    expect(statusColor.failed('失败')).toContain('\u001B[38;2;185;28;28m')
    for (const [painted, text] of [
      [statusColor.running('运行'), '运行'],
      [statusColor.waiting('等待'), '等待'],
      [statusColor.failed('失败'), '失败'],
    ] as const) {
      const foreground = foregroundAt(painted, text)
      expect(foreground).toBeDefined()
      expect(themeContrast(foreground!, BUILT_IN_THEMES.light.colors.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(themeContrast(foreground!, BUILT_IN_THEMES.light.colors.selection)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['theme', 'terminal', 'explicit'] as const)('restores the %s panel background after nested foreground resets', mode => {
    enableTruecolor()
    setTheme(BUILT_IN_THEMES.dark)
    setBackgroundMode(mode)
    const surface = background.surface(`before ${color.brand('brand')} after`)
    const expected = mode === 'explicit' ? '\u001B[48;2;17;24;39m' : '\u001B[49m'
    expect(surface.split(expected)).toHaveLength(3)
    expect(surface.endsWith('\u001B[0m')).toBe(true)
  })

  it('pads panel rows and honors NO_COLOR', () => {
    vi.stubEnv('NO_COLOR', '1')
    const row = surfaceRow('主题', 10)
    expect(row).not.toContain('\u001B[')
    expect(visibleWidth(row)).toBe(10)
  })

  it('renders hover as an ANSI-16 foreground without decoration or background', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm')
    vi.stubEnv('COLORTERM', undefined)
    vi.stubEnv('TERM_PROGRAM', undefined)
    vi.stubEnv('WT_SESSION', undefined)
    const hovered = interaction.hover('option')
    expect(hovered).toMatch(/^\u001B\[(?:3|9)\d+moption\u001B\[0m$/u)
    expect(hovered).not.toMatch(/\u001B\[(?:1|4|(?:4|10)\d|48;)/u)
    expect(visibleWidth(hovered)).toBe(6)
  })

  it('switches foreground-only hover with custom themes without changing their definitions', () => {
    enableTruecolor()
    const base = editableTheme(BUILT_IN_THEMES.dark, 'mono', 'Monochrome')
    const mono = { ...base, colors: { ...base.colors, brand: '#123456', surface: '#111111', selection: '#111111' } }
    const saved = structuredClone(mono)
    setTheme(themeFromAppearance(appearance('custom:mono', 0, [mono])))
    expect(interaction.hover('option')).toContain('\u001B[38;2;18;52;86m')
    expect(interaction.hover('option')).not.toMatch(/\u001B\[(?:1|4|48;)/u)
    expect(mono).toEqual(saved)
    setTheme(BUILT_IN_THEMES.dark)
    expect(interaction.hover('option')).toContain('\u001B[38;2;102;130;255m')
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
    expect(themeFromAppearance(document).syntax).toEqual(BUILT_IN_THEMES.light.syntax)
    expect(themeFromAppearance({ ...document, value: { theme: 'dark' } }).id).toBe('dark')
    expect(() => appearanceSettings([])).toThrow('Harness 未注册设置')
    expect(() => themeFromAppearance({ ...document, value: { theme: 'sepia' } }))
      .toThrow('不受支持')
  })

  it('inherits a light code surface by default and preserves explicit compatibility fill', () => {
    enableTruecolor()
    setTheme(themeFromAppearance(appearance('light')))

    expect(background.canvas('interface')).toContain('\u001B[49m')
    expect(background.code('const answer = 42')).toContain('\u001B[49m')
    expect(background.code('const answer = 42')).not.toContain('\u001B[48;')
    expect(background.code('const answer = 42')).toContain('\u001B[38;2;29;36;51m')
    setBackgroundMode('explicit')
    expect(background.code('const answer = 42')).toContain('\u001B[48;2;255;255;255m')
  })

  it('persists a change through the revision-protected Harness Settings path', async () => {
    const before = appearance('dark', 4)
    const after = appearance('light', 5)
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveTheme(settings, before, 'light')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['theme'], value: 'light' },
        { op: 'set', path: ['codeTheme'], value: 'auto' },
      ],
      4,
    )
  })

  it('persists an independent code theme without changing the interface theme', async () => {
    const before = appearance('light', 4)
    const after = appearance('light', 5, [], 'light')
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveCodeTheme(settings, before, 'light')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['codeTheme'], value: 'light' }],
      4,
    )
  })

  it('saves a named theme and selects it in one revision-protected mutation', async () => {
    const theme = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const before = appearance('dark', 2)
    const after = appearance('custom:ocean', 3, [theme], 'custom:ocean')
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveCustomTheme(settings, before, theme)).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['customThemes'], value: [theme] },
        { op: 'set', path: ['theme'], value: 'custom:ocean' },
        { op: 'set', path: ['codeTheme'], value: 'custom:ocean' },
      ],
      2,
    )
  })

  it('atomically falls back to DeepSeek dark when deleting the active custom theme', async () => {
    const theme = editableTheme(BUILT_IN_THEMES.light, 'paper', 'Paper')
    const before = appearance('custom:paper', 7, [theme], 'custom:paper')
    const after = appearance('dark', 8)
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(deleteCustomTheme(settings, before, 'paper')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['customThemes'], value: [] },
        { op: 'set', path: ['theme'], value: 'dark' },
        { op: 'set', path: ['codeTheme'], value: 'auto' },
      ],
      7,
    )
  })

  it('keeps the interface and restores automatic code matching when deleting a code-only theme', async () => {
    const theme = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const before = appearance('light', 7, [theme], 'custom:ocean')
    const after = appearance('light', 8)
    const mutate = vi.fn().mockResolvedValue(after)
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(deleteCustomTheme(settings, before, 'ocean')).resolves.toEqual(after)
    expect(mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['customThemes'], value: [] },
        { op: 'set', path: ['codeTheme'], value: 'auto' },
      ],
      7,
    )
  })
})
