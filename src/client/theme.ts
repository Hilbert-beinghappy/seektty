/** Dynamic DeepSeek palette for the complete terminal frame. */

import {
  visibleWidth,
  type EditorTheme,
  type MarkdownTheme,
} from '@mariozechner/pi-tui'
import { DEFAULT_TUI_THEME, type TuiTheme } from '@deepseek-ai/dsh-tui-protocol'

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
  readonly xterm: number
  readonly ansi: number
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
  readonly selection: SemanticColor
}

const palettes: Readonly<Record<TuiTheme, ThemePalette>> = {
  dark: {
    text: { rgb: [221, 226, 238], xterm: 253, ansi: 97 },
    brand: { rgb: [102, 130, 255], xterm: 69, ansi: 94 },
    accent: { rgb: [145, 167, 255], xterm: 111, ansi: 96 },
    pulse: [
      { rgb: [52, 65, 95], xterm: 60, ansi: 90 },
      { rgb: [70, 87, 139], xterm: 60, ansi: 90 },
      { rgb: [84, 105, 187], xterm: 68, ansi: 94 },
      { rgb: [102, 130, 255], xterm: 69, ansi: 94 },
      { rgb: [145, 167, 255], xterm: 111, ansi: 96 },
      { rgb: [102, 130, 255], xterm: 69, ansi: 94 },
      { rgb: [84, 105, 187], xterm: 68, ansi: 94 },
      { rgb: [70, 87, 139], xterm: 60, ansi: 90 },
    ],
    muted: { rgb: [137, 147, 170], xterm: 102, ansi: 90 },
    border: { rgb: [52, 65, 95], xterm: 60, ansi: 90 },
    success: { rgb: [66, 201, 154], xterm: 78, ansi: 32 },
    warning: { rgb: [229, 170, 89], xterm: 179, ansi: 33 },
    danger: { rgb: [240, 113, 127], xterm: 204, ansi: 91 },
    canvas: { rgb: [9, 14, 27], xterm: 232, ansi: 40 },
    surface: { rgb: [17, 24, 39], xterm: 234, ansi: 100 },
    selection: { rgb: [29, 43, 82], xterm: 17, ansi: 44 },
  },
  light: {
    text: { rgb: [29, 36, 51], xterm: 234, ansi: 30 },
    brand: { rgb: [49, 86, 216], xterm: 62, ansi: 34 },
    accent: { rgb: [65, 95, 201], xterm: 68, ansi: 34 },
    pulse: [
      { rgb: [170, 185, 235], xterm: 189, ansi: 90 },
      { rgb: [133, 156, 232], xterm: 111, ansi: 94 },
      { rgb: [90, 122, 226], xterm: 69, ansi: 94 },
      { rgb: [49, 86, 216], xterm: 62, ansi: 94 },
      { rgb: [65, 95, 201], xterm: 68, ansi: 34 },
      { rgb: [49, 86, 216], xterm: 62, ansi: 94 },
      { rgb: [90, 122, 226], xterm: 69, ansi: 94 },
      { rgb: [133, 156, 232], xterm: 111, ansi: 94 },
    ],
    muted: { rgb: [102, 112, 133], xterm: 60, ansi: 90 },
    border: { rgb: [198, 208, 231], xterm: 146, ansi: 90 },
    success: { rgb: [19, 122, 88], xterm: 29, ansi: 32 },
    warning: { rgb: [146, 87, 0], xterm: 130, ansi: 33 },
    danger: { rgb: [194, 56, 78], xterm: 161, ansi: 31 },
    canvas: { rgb: [246, 248, 253], xterm: 255, ansi: 107 },
    surface: { rgb: [255, 255, 255], xterm: 231, ansi: 47 },
    selection: { rgb: [226, 233, 255], xterm: 189, ansi: 104 },
  },
}

let selectedTheme: TuiTheme = DEFAULT_TUI_THEME

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

function foregroundSequence(entry: SemanticColor, level: TerminalColorLevel): string {
  if (level === 1) return `\u001B[${String(entry.ansi)}m`
  if (level === 2) return `\u001B[38;5;${String(entry.xterm)}m`
  const [red, green, blue] = entry.rgb
  return `\u001B[38;2;${String(red)};${String(green)};${String(blue)}m`
}

function backgroundSequence(entry: SemanticColor, level: TerminalColorLevel): string {
  if (level === 1) return `\u001B[${String(entry.ansi)}m`
  if (level === 2) return `\u001B[48;5;${String(entry.xterm)}m`
  const [red, green, blue] = entry.rgb
  return `\u001B[48;2;${String(red)};${String(green)};${String(blue)}m`
}

function paint(entry: SemanticColor, text: string): string {
  const safeText = escapeTerminalText(text)
  const level = terminalColorLevel()
  if (level === 0) return safeText
  return `${foregroundSequence(entry, level)}${safeText}${RESET}`
}

function layer(background: SemanticColor, text: string): string {
  const level = terminalColorLevel()
  if (level === 0) return text
  const palette = palettes[selectedTheme]
  const prefix = `${backgroundSequence(background, level)}${foregroundSequence(palette.text, level)}`
  const restored = text.replace(/\u001B\[(?:0)?m/gu, `${RESET}${prefix}`)
  return `${prefix}${restored}${RESET}`
}

function ansi(code: number, text: string): string {
  const safeText = escapeTerminalText(text)
  return terminalColorLevel() === 0 ? safeText : `\u001B[${String(code)}m${safeText}${RESET}`
}

/**
 * Switch every dynamic theme function to the requested color scheme.
 * @param theme - supported dark or light terminal theme.
 */
export function setTheme(theme: TuiTheme): void { selectedTheme = theme }

/** Return the color scheme currently used by renderers. */
export function currentTheme(): TuiTheme { return selectedTheme }

/** Product semantic foregrounds; no component owns raw color values. */
export const color = {
  brand: (text: string): string => paint(palettes[selectedTheme].brand, text),
  accent: (text: string): string => paint(palettes[selectedTheme].accent, text),
  pulse: (text: string, frame: number): string => {
    const values = palettes[selectedTheme].pulse
    const index = ((Math.floor(frame) % values.length) + values.length) % values.length
    return paint(values[index] ?? palettes[selectedTheme].brand, text)
  },
  muted: (text: string): string => paint(palettes[selectedTheme].muted, text),
  border: (text: string): string => paint(palettes[selectedTheme].border, text),
  success: (text: string): string => paint(palettes[selectedTheme].success, text),
  warning: (text: string): string => paint(palettes[selectedTheme].warning, text),
  danger: (text: string): string => paint(palettes[selectedTheme].danger, text),
} as const

/** Background layers shared by the full frame, panels, and selected rows. */
export const background = {
  canvas: (text: string): string => layer(palettes[selectedTheme].canvas, text),
  surface: (text: string): string => layer(palettes[selectedTheme].surface, text),
  selection: (text: string): string => layer(palettes[selectedTheme].selection, text),
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

/** Markdown/GFM theme using semantic foregrounds and no forced background. */
export const markdownTheme: MarkdownTheme = {
  heading: color.brand,
  link: text => ansi(4, color.accent(text)),
  linkUrl: color.muted,
  code: color.accent,
  codeBlock: text => text,
  codeBlockBorder: color.muted,
  quote: color.muted,
  quoteBorder: color.brand,
  hr: color.muted,
  listBullet: color.accent,
  bold: text => ansi(1, text),
  italic: text => ansi(3, text),
  strikethrough: text => ansi(9, text),
  underline: text => ansi(4, text),
}
