/** Sanitized terminal-text logos for the non-durable welcome page. */

import { readFile, stat } from 'node:fs/promises'
import { visibleWidth } from '@mariozechner/pi-tui'
import logoAsset from '../../assets/seektty-welcome-logo.json' with { type: 'json' }
import { sanitizeColorAnsiText } from '../compat/terminal-logo.ts'
import { color, styleTerminalText } from './theme.ts'
import { resolveHarnessUserPath } from './workspace-path.ts'

export const MAX_WELCOME_LOGO_BYTES = 256 * 1_024
export const MAX_WELCOME_LOGO_COLUMNS = 256
export const MAX_WELCOME_LOGO_ROWS = 120

export interface WelcomeLogo {
  readonly lines: readonly string[]
  readonly width: number
  readonly height: number
}

function validateLines(lines: readonly string[]): WelcomeLogo {
  if (lines.length > MAX_WELCOME_LOGO_ROWS) {
    throw new Error(`Logo exceeds ${String(MAX_WELCOME_LOGO_ROWS)} rows`)
  }
  const width = lines.reduce((maximum, line) => Math.max(maximum, visibleWidth(line)), 0)
  if (width > MAX_WELCOME_LOGO_COLUMNS) {
    throw new Error(`Logo exceeds ${String(MAX_WELCOME_LOGO_COLUMNS)} columns`)
  }
  return { lines, width, height: lines.length }
}

function renderBuiltinLine(mask: string, colorMode: 'original' | 'theme'): string {
  let output = ''
  for (let index = 0; index < mask.length;) {
    const token = mask[index] ?? ' '
    let end = index + 1
    while (mask[end] === token) end += 1
    const text = token === ' ' ? ' '.repeat((end - index) * 2) : '██'.repeat(end - index)
    if (token === ' ') output += text
    else if (colorMode === 'theme') output += color.logoSlot(logoAsset.slots[token as keyof typeof logoAsset.slots] ?? 1, text)
    else output += styleTerminalText(text, {
      foreground: logoAsset.palette[token as keyof typeof logoAsset.palette] ?? '#145AD8',
    })
    index = end
  }
  return output.trimEnd()
}

/** Pre-generated SeekTTY mark. Original mode never changes with the active theme. */
export function builtinWelcomeLogo(
  size: 'large' | 'compact',
  colorMode: 'original' | 'theme',
): WelcomeLogo {
  return validateLines(logoAsset[size].map(line => renderBuiltinLine(line, colorMode)))
}

/** Keep printable Unicode and color-only SGR while dropping every active terminal command. */
export function sanitizeOriginalAnsiLogo(source: string): WelcomeLogo {
  const lines = sanitizeColorAnsiText(source).split('\n')
  if (lines.at(-1) === '') lines.pop()
  return validateLines(lines.map(line => `${line}\u001B[0m`))
}

/** Parse Fastfetch `$[1-9]` foreground placeholders and `$$` literals. */
export function parseThemeIndexedLogo(source: string): WelcomeLogo {
  const lines = source.replace(/\r\n?/gu, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  return validateLines(lines.map((line) => {
    let slot = 1
    let output = ''
    for (let index = 0; index < line.length;) {
      if (line[index] === '$' && line[index + 1] === '$') {
        output += '$'
        index += 2
        continue
      }
      const marker = /^\$\[([1-9])\]/u.exec(line.slice(index))
      if (marker !== null) {
        slot = Number.parseInt(marker[1] ?? '1', 10)
        index += marker[0].length
        continue
      }
      const next = line.indexOf('$', index + 1)
      const end = next === -1 ? line.length : next
      const text = line.slice(index, end).replace(/[\u0000-\u001F\u007F-\u009F]/gu, '')
      output += color.logoSlot(slot, text)
      index = end
    }
    return output
  }))
}

export async function loadWelcomeLogoFile(
  rawPath: string,
  workspacePath: string,
  colorMode: 'original' | 'theme',
): Promise<{ readonly path: string; readonly source: string; readonly logo: WelcomeLogo }> {
  const path = resolveHarnessUserPath(rawPath, workspacePath)
  const metadata = await stat(path)
  if (!metadata.isFile() || metadata.size > MAX_WELCOME_LOGO_BYTES) {
    throw new Error(`Logo must be a UTF-8 file no larger than ${String(MAX_WELCOME_LOGO_BYTES)} bytes`)
  }
  const source = await readFile(path, 'utf8')
  return {
    path,
    source,
    logo: colorMode === 'original' ? sanitizeOriginalAnsiLogo(source) : parseThemeIndexedLogo(source),
  }
}
