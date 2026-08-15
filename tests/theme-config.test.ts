import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEMES,
  editableTheme,
  generateThemeCandidates,
  normalizeAppearance,
  normalizeCustomTheme,
  normalizeThemeColor,
  normalizeThemeColorOn,
  parseThemePalette,
  resolveTheme,
  themeContrast,
  themeContrastWarnings,
  themeIdFromName,
} from '../src/client/theme-config.ts'

describe('theme colors and generated palettes', () => {
  it('normalizes supported opaque HEX/RGB forms', () => {
    expect(normalizeThemeColor('#abc')).toBe('#AABBCC')
    expect(normalizeThemeColor('rgb(10, 20, 30)')).toBe('#0A141E')
    expect(normalizeThemeColor('rgb(100% 0% 0%)')).toBe('#FF0000')
    expect(normalizeThemeColorOn('#FFFFFF80', '#000000')).toBe('#808080')
    expect(() => normalizeThemeColor('rgba(1, 2, 3, .5)')).toThrow('无透明度')
  })

  it('accepts 3–16 unique palette colors and rejects residue or invalid counts', () => {
    expect(parseThemePalette('#000 #fff rgb(102, 130, 255) #000')).toEqual([
      '#000000', '#FFFFFF', '#6682FF',
    ])
    expect(() => parseThemePalette('#000 #fff')).toThrow('3–16')
    expect(() => parseThemePalette('#000 #fff #6682ff surprise')).toThrow('无法识别')
  })

  it('generates dark and light candidates with required text and token contrast', () => {
    const candidates = generateThemeCandidates(
      'ocean',
      'Ocean',
      '#071426 #F4F8FF #6682FF #37C99B #E7AE5B #F0717F',
    )

    for (const [tone, theme] of Object.entries({ dark: candidates.dark, light: candidates.light })) {
      expect(theme.tone).toBe(tone)
      expect(themeContrast(theme.colors.text, theme.colors.canvas)).toBeGreaterThanOrEqual(4.5)
      expect(themeContrast(theme.syntax.foreground, theme.syntax.background)).toBeGreaterThanOrEqual(4.5)
      for (const [role, value] of Object.entries(theme.syntax)) {
        if (role === 'background' || role === 'foreground') continue
        expect(themeContrast(value, theme.syntax.background), role).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('derives stable case-folded ids without exposing non-ASCII names in Settings ids', () => {
    expect(themeIdFromName('DeepSeek Ocean')).toBe('deepseek-ocean')
    expect(themeIdFromName('深海')).toMatch(/^theme-[0-9a-f]{8}$/u)
    expect(themeIdFromName('深海')).toBe(themeIdFromName('深海'))
  })
})

describe('durable custom theme validation', () => {
  it('migrates legacy dark/light values and resolves named themes', () => {
    expect(normalizeAppearance({ theme: 'light' })).toEqual({ theme: 'light', customThemes: [] })
    const ocean = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const appearance = normalizeAppearance({ theme: 'custom:ocean', customThemes: [ocean] })
    expect(resolveTheme(appearance).name).toBe('Ocean')
  })

  it('rejects duplicate names case-insensitively, duplicate ids, and dangling selections', () => {
    const first = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const sameName = { ...first, id: 'ocean-two', name: 'oCeAn' }
    const sameId = { ...first, name: 'Another' }
    expect(() => normalizeAppearance({ theme: 'dark', customThemes: [first, sameName] }))
      .toThrow('名称')
    expect(() => normalizeAppearance({ theme: 'dark', customThemes: [first, sameId] }))
      .toThrow('id')
    expect(() => normalizeAppearance({ theme: 'custom:missing', customThemes: [first] }))
      .toThrow('不存在')
    expect(() => normalizeAppearance({
      theme: 'dark',
      customThemes: [{ ...first, name: 'Ocean\nspoof' }],
    })).toThrow('控制字符')
  })

  it('normalizes complete manual and VS Code theme values and rejects unsupported sources', () => {
    const theme = editableTheme(BUILT_IN_THEMES.dark, 'custom', 'Custom')
    const normalized = normalizeCustomTheme({
      ...theme,
      colors: { ...theme.colors, brand: 'rgb(49, 86, 216)' },
      syntax: { ...theme.syntax, keyword: '#abc' },
    })
    expect(normalized.colors.brand).toBe('#3156D8')
    expect(normalized.syntax.keyword).toBe('#AABBCC')
    const imported = normalizeCustomTheme({
      ...theme,
      source: 'vscode',
      tokenColors: [{
        scope: ['comment.line'],
        foreground: '#abc',
        fontStyle: ['italic', 'bold'],
      }],
    })
    expect(imported.tokenColors[0]).toEqual({
      scope: ['comment.line'],
      foreground: '#AABBCC',
      fontStyle: ['italic', 'bold'],
    })
    expect(() => normalizeCustomTheme({ ...theme, source: 'market' })).toThrow('source')
  })

  it('reports low contrast without silently changing manual colors', () => {
    const base = editableTheme(BUILT_IN_THEMES.dark, 'dim', 'Dim')
    const dim = {
      ...base,
      colors: { ...base.colors, text: '#111111', canvas: '#101010' },
      syntax: { ...base.syntax, foreground: '#222222', background: '#202020', keyword: '#212121' },
    }
    const normalized = normalizeCustomTheme(dim)
    expect(normalized.colors.text).toBe('#111111')
    expect(themeContrastWarnings(normalized)).toEqual(expect.arrayContaining([
      expect.stringContaining('4.5:1'),
      expect.stringContaining('代码正文'),
      expect.stringContaining('代码颜色'),
    ]))
  })
})
