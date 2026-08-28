/** Pure theme validation, color conversion, and palette generation. */

import {
  DEFAULT_TUI_CODE_THEME,
  MAX_CUSTOM_THEMES,
  MAX_TEXTMATE_RULES,
  type TuiCodeThemeId,
  type TuiAppearanceSettings,
  type TuiCustomTheme,
  type TuiSyntaxThemeColors,
  type TuiTextMateRule,
  type TuiThemeId,
  type TuiThemeSource,
  type TuiThemeTone,
  type TuiThemeUiColors,
  type TuiTokenFontStyle,
} from '@deepseek-ai/dsh-tui-protocol'
import { ui } from './locale.ts'

interface Rgb {
  readonly red: number
  readonly green: number
  readonly blue: number
}

interface Rgba extends Rgb {
  readonly alpha: number
}

interface Oklab {
  readonly lightness: number
  readonly a: number
  readonly b: number
}

interface Oklch {
  readonly lightness: number
  readonly chroma: number
  readonly hue: number
}

/** Resolved built-in or custom theme consumed by terminal renderers. */
export interface ResolvedTuiTheme {
  readonly id: TuiThemeId
  readonly name: string
  readonly tone: TuiThemeTone
  readonly syntaxTone: TuiThemeTone
  readonly source: 'builtin' | TuiThemeSource
  readonly colors: TuiThemeUiColors
  readonly syntax: TuiSyntaxThemeColors
  readonly tokenColors: readonly TuiTextMateRule[]
}

/** Dark/light generated candidates plus the automatically recommended direction. */
export interface GeneratedThemeCandidates {
  readonly dark: TuiCustomTheme
  readonly light: TuiCustomTheme
  readonly recommended: TuiThemeTone
}

const UI_COLOR_KEYS = [
  'text', 'muted', 'border', 'brand', 'accent', 'success', 'warning', 'danger',
  'canvas', 'surface', 'selection',
] as const satisfies readonly (keyof TuiThemeUiColors)[]

const SYNTAX_COLOR_KEYS = [
  'background', 'foreground', 'comment', 'keyword', 'string', 'number',
  'constant', 'function', 'type', 'variable', 'property', 'parameter',
  'operator', 'punctuation', 'tag', 'attribute', 'regexp',
] as const satisfies readonly (keyof TuiSyntaxThemeColors)[]

const BUILT_IN_DARK: ResolvedTuiTheme = Object.freeze({
  id: 'dark',
  get name() {
    return ui('DeepSeek 暗色', 'DeepSeek dark')
  },
  tone: 'dark',
  syntaxTone: 'dark',
  source: 'builtin',
  colors: {
    text: '#DDE2EE', muted: '#8993AA', border: '#34415F', brand: '#6682FF', accent: '#91A7FF',
    success: '#42C99A', warning: '#E5AA59', danger: '#F0717F', canvas: '#090E1B',
    surface: '#111827', selection: '#1D2B52',
  },
  syntax: {
    background: '#111827', foreground: '#DDE2EE', comment: '#8993AA', keyword: '#91A7FF',
    string: '#42C99A', number: '#E5AA59', constant: '#F0717F', function: '#7F9BFF',
    type: '#73D0FF', variable: '#DDE2EE', property: '#B4C2FF', parameter: '#E8ECF5',
    operator: '#91A7FF', punctuation: '#8993AA', tag: '#6682FF', attribute: '#E5AA59',
    regexp: '#F0717F',
  },
  tokenColors: [],
})

const BUILT_IN_LIGHT: ResolvedTuiTheme = Object.freeze({
  id: 'light',
  get name() {
    return ui('DeepSeek 亮色', 'DeepSeek light')
  },
  tone: 'light',
  syntaxTone: 'light',
  source: 'builtin',
  colors: {
    text: '#1D2433', muted: '#667085', border: '#C6D0E7', brand: '#3156D8', accent: '#415FC9',
    success: '#137A58', warning: '#925700', danger: '#C2384E', canvas: '#F6F8FD',
    surface: '#FFFFFF', selection: '#E2E9FF',
  },
  syntax: {
    background: '#FFFFFF', foreground: '#1D2433', comment: '#667085', keyword: '#3156D8',
    string: '#137A58', number: '#925700', constant: '#C2384E', function: '#415FC9',
    type: '#006A8E', variable: '#1D2433', property: '#3F55A8', parameter: '#313B50',
    operator: '#3156D8', punctuation: '#667085', tag: '#3156D8', attribute: '#925700',
    regexp: '#C2384E',
  },
  tokenColors: [],
})

/** Immutable built-in DeepSeek themes. */
export const BUILT_IN_THEMES: Readonly<Record<'dark' | 'light', ResolvedTuiTheme>> = Object.freeze({
  dark: BUILT_IN_DARK,
  light: BUILT_IN_LIGHT,
})

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255))
}

function parseChannel(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1))
    return Number.isFinite(percent) && percent >= 0 && percent <= 100
      ? percent * 2.55
      : undefined
  }
  const channel = Number(trimmed)
  return Number.isFinite(channel) && channel >= 0 && channel <= 255 ? channel : undefined
}

function parseAlpha(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1))
    return Number.isFinite(percent) && percent >= 0 && percent <= 100
      ? percent / 100
      : undefined
  }
  const alpha = Number(trimmed)
  return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : undefined
}

function parseHex(value: string): Rgba | undefined {
  const match = /^#([0-9A-Fa-f]{3,8})$/u.exec(value.trim())
  if (match === null) return undefined
  const digits = match[1] ?? ''
  if (![3, 4, 6, 8].includes(digits.length)) return undefined
  const expanded = digits.length <= 4
    ? [...digits].map(character => `${character}${character}`).join('')
    : digits
  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
  return { red, green, blue, alpha }
}

function parseRgbFunction(value: string): Rgba | undefined {
  const match = /^rgba?\((.*)\)$/iu.exec(value.trim())
  if (match === null) return undefined
  const body = match[1] ?? ''
  const slash = body.split('/')
  if (slash.length > 2) return undefined
  const channelPart = slash[0]?.trim() ?? ''
  const commaSeparated = channelPart.includes(',')
  const channels = commaSeparated
    ? channelPart.split(',').map(part => part.trim())
    : channelPart.split(/\s+/u).filter(Boolean)
  let alphaText = slash[1]?.trim()
  if (commaSeparated && channels.length === 4 && alphaText === undefined) alphaText = channels.pop()
  if (channels.length !== 3) return undefined
  const red = parseChannel(channels[0] ?? '')
  const green = parseChannel(channels[1] ?? '')
  const blue = parseChannel(channels[2] ?? '')
  const alpha = alphaText === undefined ? 1 : parseAlpha(alphaText)
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) return undefined
  return { red, green, blue, alpha }
}

function parseRgba(value: string): Rgba | undefined {
  return parseHex(value) ?? parseRgbFunction(value)
}

function hexOf(rgb: Rgb): string {
  const component = (value: number): string => byte(value).toString(16).padStart(2, '0').toUpperCase()
  return `#${component(rgb.red)}${component(rgb.green)}${component(rgb.blue)}`
}

/**
 * Normalize one opaque HEX or RGB color for durable Settings storage.
 * @param value - user-entered color code.
 * @returns uppercase six-digit HEX.
 */
export function normalizeThemeColor(value: string): string {
  const parsed = parseRgba(value)
  if (parsed === undefined || parsed.alpha !== 1) {
    throw new Error(ui(
      `颜色 ${JSON.stringify(value)} 必须是无透明度的 HEX 或 RGB`,
      `Color ${JSON.stringify(value)} must be opaque HEX or RGB`,
    ))
  }
  return hexOf(parsed)
}

/**
 * Normalize a VS Code color, compositing its optional alpha over an opaque background.
 * @param value - VS Code HEX/RGB color value.
 * @param background - opaque fallback layer used for alpha colors.
 * @returns uppercase six-digit HEX.
 */
export function normalizeThemeColorOn(value: string, background: string): string {
  const parsed = parseRgba(value)
  if (parsed === undefined) {
    throw new Error(ui(
      `颜色 ${JSON.stringify(value)} 不是有效的 HEX 或 RGB`,
      `Color ${JSON.stringify(value)} is not valid HEX or RGB`,
    ))
  }
  if (parsed.alpha === 1) return hexOf(parsed)
  const base = rgbOf(normalizeThemeColor(background))
  return hexOf({
    red: parsed.red * parsed.alpha + base.red * (1 - parsed.alpha),
    green: parsed.green * parsed.alpha + base.green * (1 - parsed.alpha),
    blue: parsed.blue * parsed.alpha + base.blue * (1 - parsed.alpha),
  })
}

function rgbOf(color: string): Rgb {
  const parsed = parseRgba(color)
  if (parsed === undefined) {
    throw new Error(ui(`颜色 ${JSON.stringify(color)} 无效`, `Color ${JSON.stringify(color)} is invalid`))
  }
  return parsed
}

function linearChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function gammaChannel(channel: number): number {
  const value = clamp(channel)
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)
}

function luminance(color: string): number {
  const value = rgbOf(color)
  return 0.2126 * linearChannel(value.red)
    + 0.7152 * linearChannel(value.green)
    + 0.0722 * linearChannel(value.blue)
}

/**
 * WCAG contrast ratio for two opaque colors.
 * @param left - first normalized or parseable color.
 * @param right - second normalized or parseable color.
 * @returns ratio from 1 through 21.
 */
export function themeContrast(left: string, right: string): number {
  const first = luminance(left)
  const second = luminance(right)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function oklabOf(color: string): Oklab {
  const rgb = rgbOf(color)
  const red = linearChannel(rgb.red)
  const green = linearChannel(rgb.green)
  const blue = linearChannel(rgb.blue)
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)
  return {
    lightness: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  }
}

function colorOfOklab(value: Oklab): string {
  const lRoot = value.lightness + 0.3963377774 * value.a + 0.2158037573 * value.b
  const mRoot = value.lightness - 0.1055613458 * value.a - 0.0638541728 * value.b
  const sRoot = value.lightness - 0.0894841775 * value.a - 1.291485548 * value.b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  return hexOf({
    red: gammaChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: gammaChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: gammaChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  })
}

function oklchOf(color: string): Oklch {
  const value = oklabOf(color)
  const hue = Math.atan2(value.b, value.a) * 180 / Math.PI
  return {
    lightness: value.lightness,
    chroma: Math.hypot(value.a, value.b),
    hue: (hue + 360) % 360,
  }
}

function mix(left: string, right: string, amount: number): string {
  const first = oklabOf(left)
  const second = oklabOf(right)
  const ratio = clamp(amount)
  return colorOfOklab({
    lightness: first.lightness + (second.lightness - first.lightness) * ratio,
    a: first.a + (second.a - first.a) * ratio,
    b: first.b + (second.b - first.b) * ratio,
  })
}

function ensureContrast(color: string, background: string, minimum: number): string {
  const normalized = normalizeThemeColor(color)
  if (themeContrast(normalized, background) >= minimum) return normalized
  const targets = ['#000000', '#FFFFFF'] as const
  let best: { readonly color: string; readonly amount: number } | undefined
  for (const target of targets) {
    if (themeContrast(target, background) < minimum) continue
    let low = 0
    let high = 1
    for (let index = 0; index < 18; index += 1) {
      const middle = (low + high) / 2
      if (themeContrast(mix(normalized, target, middle), background) >= minimum) high = middle
      else low = middle
    }
    const candidate = { color: mix(normalized, target, high), amount: high }
    if (best === undefined || candidate.amount < best.amount) best = candidate
  }
  return best?.color ?? (themeContrast('#000000', background) >= themeContrast('#FFFFFF', background)
    ? '#000000'
    : '#FFFFFF')
}

/**
 * Derive a transient interaction style from any interface theme, without changing its saved colors.
 * Oklab keeps the hover between panel and selection; text legibility is no worse than the panel.
 */
export function resolveHoverStyle(colors: TuiThemeUiColors): { readonly background: string; readonly underline: boolean } {
  const background = ensureContrast(
    mix(colors.surface, colors.selection, 0.5),
    colors.text,
    Math.min(4.5, themeContrast(colors.text, colors.surface)),
  )
  const hover = oklabOf(background)
  const underline = [colors.canvas, colors.surface, colors.selection].some(color => {
    const other = oklabOf(color)
    // A small perceptual separation needs a non-color cue, including monochrome custom palettes.
    return Math.hypot(hover.lightness - other.lightness, hover.a - other.a, hover.b - other.b) < 0.025
  })
  return { background, underline }
}

function hueDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 360
  return Math.min(distance, 360 - distance)
}

function statusColor(
  colors: readonly string[],
  targetHue: number,
  fallback: string,
  background: string,
): string {
  const candidate = colors
    .map(color => ({ color, value: oklchOf(color) }))
    .filter(entry => entry.value.chroma >= 0.035)
    .sort((left, right) => hueDistance(left.value.hue, targetHue) - hueDistance(right.value.hue, targetHue))[0]
  const selected = candidate !== undefined && hueDistance(candidate.value.hue, targetHue) <= 75
    ? candidate.color
    : fallback
  return ensureContrast(selected, background, 3)
}

function accentColors(colors: readonly string[], background: string, foreground: string): string[] {
  const selected = colors
    .filter(color => color !== background && color !== foreground)
    .map(color => ({ color, value: oklchOf(color), contrast: themeContrast(color, background) }))
    .sort((left, right) => (right.value.chroma * Math.min(right.contrast, 7))
      - (left.value.chroma * Math.min(left.contrast, 7)))
    .map(entry => ensureContrast(entry.color, background, 3))
  const fallbacks = ['#6682FF', '#42C99A', '#E5AA59', '#F0717F', '#73D0FF']
    .map(color => ensureContrast(color, background, 3))
  return [...new Set([...selected, ...fallbacks])]
}

function generatedSyntax(
  background: string,
  foreground: string,
  muted: string,
  accents: readonly string[],
): TuiSyntaxThemeColors {
  const value = (index: number): string => accents[index % accents.length] ?? foreground
  return {
    background,
    foreground,
    comment: ensureContrast(muted, background, 3),
    keyword: value(0),
    string: value(1),
    number: value(2),
    constant: value(3),
    function: value(4),
    type: value(5),
    variable: foreground,
    property: value(6),
    parameter: mix(foreground, value(0), 0.18),
    operator: value(0),
    punctuation: ensureContrast(muted, background, 3),
    tag: value(3),
    attribute: value(2),
    regexp: value(4),
  }
}

function candidateTheme(
  id: string,
  name: string,
  colors: readonly string[],
  tone: TuiThemeTone,
): { readonly theme: TuiCustomTheme; readonly score: number } {
  const ordered = [...colors].sort((left, right) => luminance(left) - luminance(right))
  const canvas = tone === 'dark' ? ordered[0] ?? '#000000' : ordered.at(-1) ?? '#FFFFFF'
  const remaining = ordered.filter(color => color !== canvas)
  const rawText = remaining.sort((left, right) => themeContrast(right, canvas) - themeContrast(left, canvas))[0]
    ?? (tone === 'dark' ? '#FFFFFF' : '#000000')
  const text = ensureContrast(rawText, canvas, 4.5)
  const accents = accentColors(colors, canvas, text)
  const brand = accents[0] ?? text
  const brandHue = oklchOf(brand).hue
  const accent = accents.find(color => hueDistance(oklchOf(color).hue, brandHue) >= 35) ?? accents[1] ?? brand
  const surface = mix(canvas, text, tone === 'dark' ? 0.075 : 0.045)
  const selection = mix(canvas, brand, tone === 'dark' ? 0.28 : 0.18)
  const muted = ensureContrast(mix(text, canvas, 0.42), canvas, 3)
  const border = ensureContrast(mix(text, canvas, 0.68), canvas, 1.5)
  const success = statusColor(colors, 150, '#2FBF8F', canvas)
  const warning = statusColor(colors, 75, '#D99B3D', canvas)
  const danger = statusColor(colors, 20, '#E66476', canvas)
  const syntaxAccents = accentColors(colors, surface, text)
  const theme: TuiCustomTheme = {
    id,
    name,
    tone,
    source: 'palette',
    colors: { text, muted, border, brand, accent, success, warning, danger, canvas, surface, selection },
    syntax: generatedSyntax(surface, text, muted, syntaxAccents),
    tokenColors: [],
  }
  const paletteContrast = colors.reduce((sum, color) => sum + themeContrast(color, canvas), 0) / colors.length
  return { theme, score: themeContrast(text, canvas) * 2 + themeContrast(brand, canvas) + paletteContrast }
}

/**
 * Parse a whitespace/comma separated HEX/RGB palette.
 * @param input - pasted palette text.
 * @returns 3 through 16 unique normalized colors.
 */
export function parseThemePalette(input: string): readonly string[] {
  const matches = input.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)/giu) ?? []
  const colors = [...new Set(matches.map(normalizeThemeColor))]
  const residue = matches.reduce((value, match) => value.replace(match, ' '), input)
    .replace(/[\s,;|]+/gu, '')
  if (residue !== '') {
    throw new Error(ui(
      `无法识别的配色内容 ${JSON.stringify(residue.slice(0, 40))}`,
      `Unrecognized palette text ${JSON.stringify(residue.slice(0, 40))}`,
    ))
  }
  if (colors.length < 3 || colors.length > 16) {
    throw new Error(ui('配色需要 3–16 个不重复的 HEX/RGB 颜色', 'A palette requires 3–16 unique HEX/RGB colors'))
  }
  return colors
}

/**
 * Generate both contrast directions from an unlabelled color palette.
 * @param id - stable custom-theme id.
 * @param name - user-visible theme name.
 * @param input - pasted palette text.
 * @returns dark/light candidates and the higher-scoring recommendation.
 */
export function generateThemeCandidates(id: string, name: string, input: string): GeneratedThemeCandidates {
  const colors = parseThemePalette(input)
  const dark = candidateTheme(id, name, colors, 'dark')
  const light = candidateTheme(id, name, colors, 'light')
  return {
    dark: dark.theme,
    light: light.theme,
    recommended: dark.score >= light.score ? 'dark' : 'light',
  }
}

/**
 * Create a stable ASCII id from a user-visible theme name.
 * @param name - display name.
 * @returns lowercase slug or deterministic hash fallback.
 */
export function themeIdFromName(name: string): string {
  const slug = name.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
    .replace(/-+$/gu, '')
  if (slug !== '') return slug
  let hash = 2166136261
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `theme-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function recordOf(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(ui(`${label} 必须是对象`, `${label} must be an object`))
  }
  return value as Readonly<Record<string, unknown>>
}

function stringOf(record: Readonly<Record<string, unknown>>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(ui(`${label}.${key} 必须是字符串`, `${label}.${key} must be a string`))
  }
  return value
}

function colorRecord<T extends string>(
  value: unknown,
  keys: readonly T[],
  label: string,
): Record<T, string> {
  const record = recordOf(value, label)
  return Object.fromEntries(keys.map(key => [key, normalizeThemeColor(stringOf(record, key, label))])) as Record<T, string>
}

const TOKEN_FONT_STYLES = new Set<TuiTokenFontStyle>(['bold', 'italic', 'underline', 'strikethrough'])

function textMateRules(value: unknown): readonly TuiTextMateRule[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_TEXTMATE_RULES) {
    throw new Error(ui(
      `customThemes[].tokenColors 最多包含 ${String(MAX_TEXTMATE_RULES)} 条规则`,
      `customThemes[].tokenColors can contain at most ${String(MAX_TEXTMATE_RULES)} rules`,
    ))
  }
  return value.map((entry, index): TuiTextMateRule => {
    const label = `customThemes[].tokenColors[${String(index)}]`
    const record = recordOf(entry, label)
    if (!Array.isArray(record.scope) || record.scope.length === 0 || record.scope.length > 64) {
      throw new Error(ui(
        `${label}.scope 必须包含 1–64 个 TextMate scope`,
        `${label}.scope must contain 1–64 TextMate scopes`,
      ))
    }
    const scope = [...new Set(record.scope.map((item) => {
      if (typeof item !== 'string' || item === '' || item.length > 256 || /[\u0000-\u001F\u007F-\u009F]/u.test(item)) {
        throw new Error(ui(`${label}.scope 包含无效值`, `${label}.scope contains an invalid value`))
      }
      return item
    }))]
    const foreground = record.foreground === undefined
      ? undefined
      : normalizeThemeColor(stringOf(record, 'foreground', label))
    const background = record.background === undefined
      ? undefined
      : normalizeThemeColor(stringOf(record, 'background', label))
    let fontStyle: readonly TuiTokenFontStyle[] | undefined
    if (record.fontStyle !== undefined) {
      if (!Array.isArray(record.fontStyle)) {
        throw new Error(ui(`${label}.fontStyle 必须是数组`, `${label}.fontStyle must be an array`))
      }
      fontStyle = [...new Set(record.fontStyle.map((style) => {
        if (typeof style !== 'string' || !TOKEN_FONT_STYLES.has(style as TuiTokenFontStyle)) {
          throw new Error(ui(`${label}.fontStyle 包含不支持的样式`, `${label}.fontStyle contains an unsupported style`))
        }
        return style as TuiTokenFontStyle
      }))]
    }
    if (foreground === undefined && background === undefined && fontStyle === undefined) {
      throw new Error(ui(`${label} 没有颜色或代码字体样式`, `${label} has no color or code font style`))
    }
    return {
      scope,
      ...(foreground === undefined ? {} : { foreground }),
      ...(background === undefined ? {} : { background }),
      ...(fontStyle === undefined ? {} : { fontStyle }),
    }
  })
}

/**
 * Validate and normalize one custom theme crossing the Settings boundary.
 * @param value - untrusted durable value.
 * @returns normalized custom theme.
 */
export function normalizeCustomTheme(value: unknown): TuiCustomTheme {
  const record = recordOf(value, 'customThemes[]')
  const id = stringOf(record, 'id', 'customThemes[]')
  const name = stringOf(record, 'name', 'customThemes[]').trim()
  const tone = stringOf(record, 'tone', 'customThemes[]')
  const source = stringOf(record, 'source', 'customThemes[]')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u.test(id)) {
    throw new Error(ui(`自定义主题 id ${JSON.stringify(id)} 无效`, `Custom theme id ${JSON.stringify(id)} is invalid`))
  }
  if (name === '' || name.length > 80) {
    throw new Error(ui('自定义主题名称必须为 1–80 个字符', 'Custom theme name must contain 1–80 characters'))
  }
  if (/[\u0000-\u001F\u007F-\u009F]/u.test(name)) {
    throw new Error(ui('自定义主题名称不能包含终端控制字符', 'Custom theme name cannot contain terminal control characters'))
  }
  if (tone !== 'dark' && tone !== 'light') {
    throw new Error(ui(`自定义主题 tone ${JSON.stringify(tone)} 无效`, `Custom theme tone ${JSON.stringify(tone)} is invalid`))
  }
  if (source !== 'manual' && source !== 'palette' && source !== 'vscode') {
    throw new Error(ui(
      `自定义主题 source ${JSON.stringify(source)} 无效`,
      `Custom theme source ${JSON.stringify(source)} is invalid`,
    ))
  }
  return {
    id,
    name,
    tone,
    source,
    colors: colorRecord(record.colors, UI_COLOR_KEYS, 'customThemes[].colors') as unknown as TuiThemeUiColors,
    syntax: colorRecord(record.syntax, SYNTAX_COLOR_KEYS, 'customThemes[].syntax') as unknown as TuiSyntaxThemeColors,
    tokenColors: textMateRules(record.tokenColors),
  }
}

/**
 * Validate one complete appearance value, accepting legacy values without customThemes.
 * @param value - untrusted Harness Settings value.
 * @returns normalized appearance settings.
 */
export function normalizeAppearance(value: unknown): TuiAppearanceSettings {
  const record = recordOf(value, 'SeekTTY appearance')
  const rawTheme = stringOf(record, 'theme', 'SeekTTY appearance')
  if (!/^(?:dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawTheme)) {
    throw new Error(ui(
      `SeekTTY 主题 ${JSON.stringify(rawTheme)} 不受支持`,
      `SeekTTY theme ${JSON.stringify(rawTheme)} is not supported`,
    ))
  }
  const rawThemes = record.customThemes ?? []
  if (!Array.isArray(rawThemes) || rawThemes.length > MAX_CUSTOM_THEMES) {
    throw new Error(ui(
      `SeekTTY 最多保存 ${String(MAX_CUSTOM_THEMES)} 个自定义主题`,
      `SeekTTY can store at most ${String(MAX_CUSTOM_THEMES)} custom themes`,
    ))
  }
  const customThemes = rawThemes.map(normalizeCustomTheme)
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const theme of customThemes) {
    const foldedName = theme.name.toLowerCase()
    if (ids.has(theme.id)) {
      throw new Error(ui(
        `自定义主题 id ${JSON.stringify(theme.id)} 重复`,
        `Custom theme id ${JSON.stringify(theme.id)} is duplicated`,
      ))
    }
    if (names.has(foldedName)) {
      throw new Error(ui(
        `自定义主题名称 ${JSON.stringify(theme.name)} 重复`,
        `Custom theme name ${JSON.stringify(theme.name)} is duplicated`,
      ))
    }
    ids.add(theme.id)
    names.add(foldedName)
  }
  const theme = rawTheme as TuiThemeId
  if (theme.startsWith('custom:') && !ids.has(theme.slice('custom:'.length))) {
    throw new Error(ui(
      `当前自定义主题 ${JSON.stringify(theme)} 不存在`,
      `The current custom theme ${JSON.stringify(theme)} does not exist`,
    ))
  }
  const rawCodeTheme = record.codeTheme === undefined
    ? DEFAULT_TUI_CODE_THEME
    : stringOf(record, 'codeTheme', 'SeekTTY appearance')
  if (!/^(?:auto|dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawCodeTheme)) {
    throw new Error(ui(
      `SeekTTY 代码主题 ${JSON.stringify(rawCodeTheme)} 不受支持`,
      `SeekTTY code theme ${JSON.stringify(rawCodeTheme)} is not supported`,
    ))
  }
  const codeTheme = rawCodeTheme as TuiCodeThemeId
  if (codeTheme.startsWith('custom:') && !ids.has(codeTheme.slice('custom:'.length))) {
    throw new Error(ui(
      `当前自定义代码主题 ${JSON.stringify(codeTheme)} 不存在`,
      `The current custom code theme ${JSON.stringify(codeTheme)} does not exist`,
    ))
  }
  return { theme, codeTheme, customThemes }
}

/**
 * Resolve the active or requested theme definition.
 * @param appearance - validated appearance value.
 * @param requested - optional selection override.
 * @returns complete renderer-ready theme.
 */
export function resolveTheme(
  appearance: TuiAppearanceSettings,
  requested: TuiThemeId = appearance.theme,
): ResolvedTuiTheme {
  if (requested === 'dark' || requested === 'light') return BUILT_IN_THEMES[requested]
  const id = requested.slice('custom:'.length)
  const theme = appearance.customThemes.find(candidate => candidate.id === id)
  if (theme === undefined) {
    throw new Error(ui(`自定义主题 ${JSON.stringify(id)} 不存在`, `Custom theme ${JSON.stringify(id)} does not exist`))
  }
  return { ...theme, id: requested, syntaxTone: theme.tone }
}

/**
 * Resolve the independent code theme, including automatic interface-theme pairing.
 * @param appearance - validated appearance value.
 * @param requested - optional code-theme override.
 * @param interfaceTheme - interface selection used when requested is auto.
 * @returns complete source theme whose syntax fields should render code regions.
 */
export function resolveCodeTheme(
  appearance: TuiAppearanceSettings,
  requested: TuiCodeThemeId = appearance.codeTheme,
  interfaceTheme: TuiThemeId = appearance.theme,
): ResolvedTuiTheme {
  const selected = requested === 'auto' ? interfaceTheme : requested
  return resolveTheme(appearance, selected)
}

/**
 * Combine interface colors with an independently resolved code theme.
 * @param interfaceTheme - source of terminal chrome colors.
 * @param codeTheme - source of syntax colors and TextMate rules.
 * @returns renderer-ready theme containing both selections.
 */
export function composeResolvedTheme(
  interfaceTheme: ResolvedTuiTheme,
  codeTheme: ResolvedTuiTheme,
): ResolvedTuiTheme {
  return {
    ...interfaceTheme,
    syntaxTone: codeTheme.syntaxTone,
    syntax: codeTheme.syntax,
    tokenColors: codeTheme.tokenColors,
  }
}

/**
 * Resolve the active interface and code selections into one renderer value.
 * @param appearance - validated appearance value.
 * @returns renderer-ready theme with independent interface and code colors.
 */
export function resolveAppearanceTheme(appearance: TuiAppearanceSettings): ResolvedTuiTheme {
  return composeResolvedTheme(resolveTheme(appearance), resolveCodeTheme(appearance))
}

/**
 * Report legibility concerns without silently altering manual colors.
 * @param theme - complete theme to inspect.
 * @returns concise warnings shown before applying.
 */
export function themeContrastWarnings(theme: ResolvedTuiTheme | TuiCustomTheme): readonly string[] {
  const warnings: string[] = []
  if (themeContrast(theme.colors.text, theme.colors.canvas) < 4.5) {
    warnings.push(ui('正文与画布对比度低于 4.5:1', 'Text-to-canvas contrast is below 4.5:1'))
  }
  if (themeContrast(theme.colors.muted, theme.colors.canvas) < 3) {
    warnings.push(ui('弱化文字与画布对比度低于 3:1', 'Muted-text-to-canvas contrast is below 3:1'))
  }
  if (themeContrast(theme.syntax.foreground, theme.syntax.background) < 4.5) {
    warnings.push(ui('代码正文与代码背景对比度低于 4.5:1', 'Code-text-to-background contrast is below 4.5:1'))
  }
  const lowTokens = SYNTAX_COLOR_KEYS
    .filter(key => key !== 'background' && key !== 'foreground')
    .filter(key => themeContrast(theme.syntax[key], theme.syntax.background) < 3)
  if (lowTokens.length > 0) {
    warnings.push(ui(`代码颜色对比度偏低：${lowTokens.join('、')}`, `Low code-color contrast: ${lowTokens.join(', ')}`))
  }
  const lowImported = theme.tokenColors.filter(rule => rule.foreground !== undefined
    && themeContrast(rule.foreground, rule.background ?? theme.syntax.background) < 3).length
  if (lowImported > 0) {
    warnings.push(ui(
      `${String(lowImported)} 条导入的 TextMate 规则对比度低于 3:1`,
      `${String(lowImported)} imported TextMate rule(s) have contrast below 3:1`,
    ))
  }
  return warnings
}

/**
 * Copy a built-in or custom resolved theme into an editable custom definition.
 * @param theme - source theme.
 * @param id - new custom id.
 * @param name - new display name.
 * @returns independent manual theme value.
 */
export function editableTheme(theme: ResolvedTuiTheme, id: string, name: string): TuiCustomTheme {
  return {
    id,
    name,
    tone: theme.tone,
    source: theme.source === 'vscode' ? 'vscode' : 'manual',
    colors: { ...theme.colors },
    syntax: { ...theme.syntax },
    tokenColors: theme.tokenColors.map(rule => ({
      ...rule,
      scope: [...rule.scope],
      ...(rule.fontStyle === undefined ? {} : { fontStyle: [...rule.fontStyle] }),
    })),
  }
}
