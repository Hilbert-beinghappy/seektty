/** Central DeepSeek terminal semantic colors with terminal-default backgrounds. */

import type { EditorTheme, MarkdownTheme } from '@mariozechner/pi-tui'

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

const palette = {
  brand: { rgb: [77, 107, 254], xterm: 69, ansi: 94 },
  accent: { rgb: [116, 138, 255], xterm: 105, ansi: 96 },
  muted: { rgb: [137, 145, 168], xterm: 102, ansi: 90 },
  success: { rgb: [42, 166, 118], xterm: 36, ansi: 32 },
  warning: { rgb: [220, 156, 62], xterm: 179, ansi: 33 },
  danger: { rgb: [220, 82, 98], xterm: 168, ansi: 31 },
} as const satisfies Readonly<Record<string, SemanticColor>>

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

function paint(entry: SemanticColor, text: string): string {
  const safeText = escapeTerminalText(text)
  const level = terminalColorLevel()
  if (level === 0) return safeText
  if (level === 1) return `\u001B[${String(entry.ansi)}m${safeText}${RESET}`
  if (level === 2) return `\u001B[38;5;${String(entry.xterm)}m${safeText}${RESET}`
  const [red, green, blue] = entry.rgb
  return `\u001B[38;2;${String(red)};${String(green)};${String(blue)}m${safeText}${RESET}`
}

function ansi(code: number, text: string): string {
  const safeText = escapeTerminalText(text)
  return terminalColorLevel() === 0 ? safeText : `\u001B[${String(code)}m${safeText}${RESET}`
}

/** Product semantic palette; no component owns raw color values. */
export const color = {
  brand: (text: string): string => paint(palette.brand, text),
  accent: (text: string): string => paint(palette.accent, text),
  muted: (text: string): string => paint(palette.muted, text),
  success: (text: string): string => paint(palette.success, text),
  warning: (text: string): string => paint(palette.warning, text),
  danger: (text: string): string => paint(palette.danger, text),
} as const

/** Shared editor/select-list theme used by the main composer and overlays. */
export const editorTheme: EditorTheme = {
  borderColor: color.brand,
  selectList: {
    selectedPrefix: color.brand,
    selectedText: color.accent,
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
