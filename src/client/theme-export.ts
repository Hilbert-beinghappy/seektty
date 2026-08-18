/** Serialize and exclusively write a portable SeekTTY theme JSON file. */

import { mkdir, open, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TuiCustomTheme } from '@deepseek-ai/dsh-tui-protocol'
import { type ResolvedTuiTheme } from './theme-config.ts'

/**
 * Snapshot one resolved theme as a named custom theme for sharing.
 * @param theme - built-in or custom renderer theme.
 */
export function themeForExport(theme: ResolvedTuiTheme): TuiCustomTheme {
  const id = theme.id.startsWith('custom:') ? theme.id.slice('custom:'.length) : theme.id
  return {
    id,
    name: theme.name,
    tone: theme.tone,
    source: theme.source === 'builtin' ? 'manual' : theme.source,
    colors: { ...theme.colors },
    syntax: { ...theme.syntax },
    tokenColors: theme.tokenColors.map(rule => ({
      ...rule,
      scope: [...rule.scope],
      ...(rule.fontStyle === undefined ? {} : { fontStyle: [...rule.fontStyle] }),
    })),
  }
}

/**
 * Pretty-print one custom theme as UTF-8 JSON with a trailing newline.
 * @param theme - portable theme value.
 */
export function serializeThemeExport(theme: TuiCustomTheme): string {
  return `${JSON.stringify(theme, null, 2)}\n`
}

/**
 * Write theme JSON to a new file; refuse to overwrite an existing path.
 * @param path - destination file.
 * @param text - serialized JSON.
 * @returns written byte count.
 */
export async function writeThemeExport(path: string, text: string): Promise<number> {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'wx')
  let complete = false
  try {
    const bytes = Buffer.byteLength(text, 'utf8')
    await file.write(Buffer.from(text, 'utf8'))
    await file.sync()
    complete = true
    return bytes
  } finally {
    await file.close().catch(() => undefined)
    if (!complete) await unlink(path).catch(() => undefined)
  }
}
