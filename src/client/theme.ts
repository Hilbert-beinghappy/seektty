/** Dynamic DeepSeek palette for the complete terminal frame. */

import {
  visibleWidth,
  type EditorTheme,
  type MarkdownTheme,
} from '@mariozechner/pi-tui'
import { BUILT_IN_THEMES, resolveHoverStyle, type ResolvedTuiTheme } from './theme-config.ts'
import { DEFAULT_TUI_BACKGROUND_MODE, type TuiBackgroundMode } from '@deepseek-ai/dsh-tui-protocol'
import { ui } from './locale.ts'
import { readableCanvas } from './canvas-foreground.ts'

const RESET = '\u001B[0m'
const ESC = 0x1B
const CSI = 0x9B
const ST = 0x9C
const OSC = 0x9D
const CONTROL_STRING_INTRODUCERS = new Set([0x50, 0x58, 0x5D, 0x5E, 0x5F])
const C1_CONTROL_STRING_INTRODUCERS = new Set([0x90, 0x98, OSC, 0x9E, 0x9F])
const SGR_PARAMETERS = /^[0-9;:]*$/u

/** ANSI foreground capability used by the semantic DeepSeek palette. */
export type TerminalColorLevel = 0 | 1 | 2 | 3

interface SemanticColor {
  readonly rgb: readonly [red: number, green: number, blue: number]
}

interface ThemePalette {
  readonly text: SemanticColor
  readonly brand: SemanticColor
  readonly accent: SemanticColor
  readonly pulse: readonly SemanticColor[]
  readonly muted: SemanticColor
  readonly border: SemanticColor
  readonly success: SemanticColor
  readonly warning: SemanticColor
  readonly danger: SemanticColor
  readonly canvas: SemanticColor
  readonly surface: SemanticColor
  readonly hover: SemanticColor
  readonly hoverUnderline: boolean
  readonly selection: SemanticColor
  readonly codeBackground: SemanticColor
  readonly codeForeground: SemanticColor
}

function semanticColor(value: string): SemanticColor {
  const match = /^#([0-9A-Fa-f]{6})$/u.exec(value)
  if (match === null) throw new Error(ui(`主题颜色 ${JSON.stringify(value)} 无效`, `Theme color ${JSON.stringify(value)} is invalid`))
  const digits = match[1] ?? ''
  return {
    rgb: [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ],
  }
}

function mixColor(left: SemanticColor, right: SemanticColor, amount: number): SemanticColor {
  const value = (index: number): number => Math.round(
    (left.rgb[index] ?? 0) + ((right.rgb[index] ?? 0) - (left.rgb[index] ?? 0)) * amount,
  )
  return { rgb: [value(0), value(1), value(2)] }
}

function runtimePalette(theme: ResolvedTuiTheme): ThemePalette {
  const hover = resolveHoverStyle(theme.colors)
  const brand = semanticColor(theme.colors.brand)
  const accent = semanticColor(theme.colors.accent)
  const border = semanticColor(theme.colors.border)
  const pulse = [
    border,
    mixColor(border, brand, 0.3),
    mixColor(border, brand, 0.62),
    brand,
    accent,
    brand,
    mixColor(border, brand, 0.62),
    mixColor(border, brand, 0.3),
  ]
  return {
    text: semanticColor(theme.colors.text),
    brand,
    accent,
    pulse,
    muted: semanticColor(theme.colors.muted),
    border,
    success: semanticColor(theme.colors.success),
    warning: semanticColor(theme.colors.warning),
    danger: semanticColor(theme.colors.danger),
    canvas: semanticColor(theme.colors.canvas),
    surface: semanticColor(theme.colors.surface),
    hover: semanticColor(hover.background),
    hoverUnderline: hover.underline,
    selection: semanticColor(theme.colors.selection),
    codeBackground: semanticColor(theme.syntax.background),
    codeForeground: semanticColor(theme.syntax.foreground),
  }
}

let selectedTheme: ResolvedTuiTheme = BUILT_IN_THEMES.dark
let backgroundMode: TuiBackgroundMode = DEFAULT_TUI_BACKGROUND_MODE
let palette = runtimePalette(selectedTheme)
const hoverUnderlineByLevel = new Map<TerminalColorLevel, boolean>()
let codeHighlighter: ((code: string, lang?: string) => string[]) | undefined

function controlStringEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 0x07 || code === ST) return index + 1
    if (code === ESC && text.charCodeAt(index + 1) === 0x5C) return index + 2
  }
  return text.length
}

function csiEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0x40 && code <= 0x7E) return index + 1
  }
  return text.length
}

/**
 * Escape untrusted terminal text while retaining harmless SGR foreground/style sequences.
 *
 * OSC, DCS, APC, PM, SOS, non-SGR CSI, two-byte ESC commands, carriage returns,
 * and remaining C0/C1 controls are removed before text reaches pi-tui. Unterminated
 * terminal strings consume the remainder rather than exposing an ambiguous suffix.
 * @param text - terminal-bound text from Harness, extensions, files, or user metadata.
 * @returns text safe to compose into a terminal frame.
 */
export function escapeTerminalText(text: string): string {
  let escaped = ''
  for (let index = 0; index < text.length;) {
    const code = text.charCodeAt(index)
    if (code === ESC) {
      const next = text.charCodeAt(index + 1)
      if (next === 0x5B) {
        const end = csiEnd(text, index + 2)
        const final = text.charCodeAt(end - 1)
        const parameters = text.slice(index + 2, Math.max(index + 2, end - 1))
        if (final === 0x6D && SGR_PARAMETERS.test(parameters)) escaped += text.slice(index, end)
        index = end
        continue
      }
      if (CONTROL_STRING_INTRODUCERS.has(next)) {
        index = controlStringEnd(text, index + 2)
        continue
      }
      if (next >= 0x20 && next <= 0x2F) {
        let end = index + 2
        while (text.charCodeAt(end) >= 0x20 && text.charCodeAt(end) <= 0x2F) end += 1
        if (text.charCodeAt(end) >= 0x30 && text.charCodeAt(end) <= 0x7E) end += 1
        index = end
        continue
      }
      index += Number.isNaN(next) ? 1 : 2
      continue
    }
    if (code === CSI) {
      index = csiEnd(text, index + 1)
      continue
    }
    if (C1_CONTROL_STRING_INTRODUCERS.has(code)) {
      index = controlStringEnd(text, index + 1)
      continue
    }
    if ((code >= 0x00 && code <= 0x1F && code !== 0x09 && code !== 0x0A)
      || (code >= 0x7F && code <= 0x9F)) {
      index += 1
      continue
    }
    escaped += text.charAt(index)
    index += 1
  }
  return escaped
}

/**
 * Detect terminal foreground-color depth without changing the terminal background.
 * @param env - environment to inspect; injectable for platform-neutral tests.
 * @returns 0 for plain text, 1 for ANSI-16, 2 for xterm-256, or 3 for truecolor.
 */
export function terminalColorLevel(env: Readonly<NodeJS.ProcessEnv> = process.env): TerminalColorLevel {
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') return 0
  const term = env.TERM?.toLowerCase() ?? ''
  const colorTerm = env.COLORTERM?.toLowerCase() ?? ''
  const program = env.TERM_PROGRAM?.toLowerCase() ?? ''
  if (colorTerm === 'truecolor' || colorTerm === '24bit'
    || term.includes('truecolor') || term.includes('24bit') || term.endsWith('-direct')
    || env.WT_SESSION !== undefined
    || ['iterm.app', 'wezterm', 'hyper', 'vscode'].includes(program)) return 3
  if (term.includes('256color') || program === 'apple_terminal') return 2
  return 1
}

function rgb(red: number, green: number, blue: number): SemanticColor {
  return { rgb: [red, green, blue] }
}

const ANSI_COLORS: readonly SemanticColor[] = [
  rgb(0, 0, 0), rgb(205, 49, 49), rgb(13, 188, 121), rgb(229, 229, 16),
  rgb(36, 114, 200), rgb(188, 63, 188), rgb(17, 168, 205), rgb(229, 229, 229),
  rgb(102, 102, 102), rgb(241, 76, 76), rgb(35, 209, 139), rgb(245, 245, 67),
  rgb(59, 142, 234), rgb(214, 112, 214), rgb(41, 184, 219), rgb(255, 255, 255),
]

function xtermColors(): readonly SemanticColor[] {
  const output = [...ANSI_COLORS]
  const levels = [0, 95, 135, 175, 215, 255]
  for (const red of levels) {
    for (const green of levels) {
      for (const blue of levels) output.push(rgb(red, green, blue))
    }
  }
  for (let index = 0; index < 24; index += 1) {
    const channel = 8 + index * 10
    output.push(rgb(channel, channel, channel))
  }
  return output
}

const XTERM_COLORS = xtermColors()

function nearestColor(entry: SemanticColor, candidates: readonly SemanticColor[]): number {
  let selected = 0
  let selectedDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (candidate === undefined) continue
    const red = (entry.rgb[0] - candidate.rgb[0]) * 0.3
    const green = (entry.rgb[1] - candidate.rgb[1]) * 0.59
    const blue = (entry.rgb[2] - candidate.rgb[2]) * 0.11
    const distance = red * red + green * green + blue * blue
    if (distance >= selectedDistance) continue
    selected = index
    selectedDistance = distance
  }
  return selected
}

function foregroundSequence(entry: SemanticColor, level: TerminalColorLevel): string {
  if (level === 1) {
    const index = nearestColor(entry, ANSI_COLORS)
    return `\u001B[${String(index < 8 ? 30 + index : 90 + index - 8)}m`
  }
  if (level === 2) return `\u001B[38;5;${String(nearestColor(entry, XTERM_COLORS))}m`
  const [red, green, blue] = entry.rgb
  return `\u001B[38;2;${String(red)};${String(green)};${String(blue)}m`
}

function backgroundSequence(entry: SemanticColor, level: TerminalColorLevel): string {
  if (level === 1) {
    const index = nearestColor(entry, ANSI_COLORS)
    return `\u001B[${String(index < 8 ? 40 + index : 100 + index - 8)}m`
  }
  if (level === 2) return `\u001B[48;5;${String(nearestColor(entry, XTERM_COLORS))}m`
  const [red, green, blue] = entry.rgb
  return `\u001B[48;2;${String(red)};${String(green)};${String(blue)}m`
}

function paint(entry: SemanticColor, text: string): string {
  const safeText = escapeTerminalText(text)
  const level = terminalColorLevel()
  if (level === 0) return safeText
  return `${foregroundSequence(entry, level)}${safeText}${RESET}`
}

function layer(background: SemanticColor | undefined, text: string, foreground = palette.text): string {
  const level = terminalColorLevel()
  if (level === 0) return text
  const prefix = `${background === undefined ? '\u001B[49m' : backgroundSequence(background, level)}${foregroundSequence(foreground, level)}`
  const restored = text.replace(/\u001B\[(?:0)?m/gu, `${RESET}${prefix}`)
  return `${prefix}${restored}${RESET}`
}

function ansi(code: number, text: string): string {
  const safeText = escapeTerminalText(text)
  return terminalColorLevel() === 0 ? safeText : `\u001B[${String(code)}m${safeText}${RESET}`
}

function hoverLayer(text: string): string {
  const level = terminalColorLevel()
  if (level === 0) return text
  let needsUnderline = hoverUnderlineByLevel.get(level)
  if (needsUnderline === undefined) {
    const hover = backgroundSequence(palette.hover, level)
    // Resolve once per theme/color depth, not for every pointer motion or rendered row.
    needsUnderline = palette.hoverUnderline || [palette.canvas, palette.surface, palette.selection]
      .some(entry => backgroundSequence(entry, level) === hover)
    hoverUnderlineByLevel.set(level, needsUnderline)
  }
  return layer(palette.hover, needsUnderline ? ansi(4, text) : text)
}

/** Styling request for one syntax token or generated preview fragment. */
export interface TerminalTextStyle {
  readonly foreground?: string
  readonly background?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
}

/**
 * Paint untrusted token text using arbitrary theme colors.
 * @param text - raw token content.
 * @param style - foreground/background colors and portable code-token styles.
 * @returns escaped terminal text with capability-aware SGR sequences.
 */
export function styleTerminalText(text: string, style: TerminalTextStyle): string {
  const safeText = escapeTerminalText(text)
  const level = terminalColorLevel()
  if (level === 0 || safeText === '') return safeText
  const sequences: string[] = []
  if (style.foreground !== undefined) sequences.push(foregroundSequence(semanticColor(style.foreground), level))
  if (style.background !== undefined) sequences.push(backgroundSequence(semanticColor(style.background), level))
  if (style.bold === true) sequences.push('\u001B[1m')
  if (style.italic === true) sequences.push('\u001B[3m')
  if (style.underline === true) sequences.push('\u001B[4m')
  if (style.strikethrough === true) sequences.push('\u001B[9m')
  return sequences.length === 0 ? safeText : `${sequences.join('')}${safeText}${RESET}`
}

/**
 * Switch every dynamic renderer to one complete theme definition.
 * @param theme - resolved built-in or custom theme.
 */
export function setTheme(theme: ResolvedTuiTheme): void {
  selectedTheme = theme
  palette = runtimePalette(theme)
  hoverUnderlineByLevel.clear()
}

/** Return the complete theme currently used by renderers. */
export function currentTheme(): ResolvedTuiTheme { return selectedTheme }

/** Independent of theme previews/imports; only the main canvas inherits terminal effects. */
export function setBackgroundMode(mode: TuiBackgroundMode): void { backgroundMode = mode }

let terminalCanvasBackground: string | undefined

/** Actual background reported by the managed terminal, never persisted as a theme. */
export function setTerminalCanvasBackground(color?: string): void { terminalCanvasBackground = color }

/**
 * Connect the asynchronously prepared syntax highlighter to Markdown rendering.
 * @param highlighter - synchronous cached renderer, or undefined during teardown.
 */
export function setCodeHighlighter(highlighter?: (code: string, lang?: string) => string[]): void {
  codeHighlighter = highlighter
}

/**
 * Highlight a code region through the active cached renderer.
 * @param code - raw code text.
 * @param language - optional grammar id or alias.
 * @returns one safely styled entry per source line.
 */
export function highlightCodeLines(code: string, language?: string): string[] {
  return codeHighlighter?.(code, language)
    ?? code.split('\n').map(line => styleTerminalText(line, {
      foreground: selectedTheme.syntax.foreground,
      background: selectedTheme.syntax.background,
    }))
}

/** Product semantic foregrounds; no component owns raw color values. */
export const color = {
  brand: (text: string): string => paint(palette.brand, text),
  accent: (text: string): string => paint(palette.accent, text),
  pulse: (text: string, frame: number): string => {
    const values = palette.pulse
    const index = ((Math.floor(frame) % values.length) + values.length) % values.length
    return paint(values[index] ?? palette.brand, text)
  },
  muted: (text: string): string => paint(palette.muted, text),
  border: (text: string): string => paint(palette.border, text),
  success: (text: string): string => paint(palette.success, text),
  warning: (text: string): string => paint(palette.warning, text),
  danger: (text: string): string => paint(palette.danger, text),
} as const

/** Background layers shared by the full frame, panels, and selected rows. */
export const background = {
  canvas: (text: string): string => {
    const row = layer(backgroundMode === 'explicit' ? palette.canvas : undefined, text)
    if (terminalColorLevel() === 0 || backgroundMode === 'explicit'
      || terminalCanvasBackground?.toLowerCase() === selectedTheme.colors.canvas.toLowerCase()) return row
    return readableCanvas(row, terminalColorLevel() === 3 ? terminalCanvasBackground : undefined)
  },
  surface: (text: string): string => layer(palette.surface, text),
  hover: hoverLayer,
  selection: (text: string): string => layer(palette.selection, text),
  code: (text: string): string => layer(palette.codeBackground, text, palette.codeForeground),
} as const

/**
 * Fill a complete panel row with the active surface background.
 * @param text - trusted, already escaped component output.
 * @param width - target terminal cells.
 * @returns one padded surface row.
 */
export function surfaceRow(text: string, width: number): string {
  return background.surface(`${text}${' '.repeat(Math.max(0, width - visibleWidth(text)))}`)
}

/** Shared editor/select-list theme used by the main composer and overlays. */
export const editorTheme: EditorTheme = {
  borderColor: color.brand,
  selectList: {
    selectedPrefix: color.brand,
    selectedText: background.selection,
    description: color.muted,
    scrollInfo: color.muted,
    noMatch: color.warning,
  },
}

/** Markdown/GFM theme using semantic colors and a continuous code background. */
export const markdownTheme: MarkdownTheme = {
  heading: color.brand,
  link: text => ansi(4, color.accent(text)),
  linkUrl: color.muted,
  code: text => background.code(color.accent(text)),
  codeBlock: background.code,
  codeBlockBorder: color.muted,
  quote: color.muted,
  quoteBorder: color.brand,
  hr: color.muted,
  listBullet: color.accent,
  bold: text => ansi(1, text),
  italic: text => ansi(3, text),
  strikethrough: text => ansi(9, text),
  underline: text => ansi(4, text),
  highlightCode: highlightCodeLines,
}
