import { createHash } from 'node:crypto'
import type { TuiCustomTheme } from '@deepseek-ai/dsh-tui-protocol'

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Hash rendered content only; identity and import metadata must not affect deduplication. */
export function themeFingerprint(theme: TuiCustomTheme): string {
  return createHash('sha256').update(stable({
    tone: theme.tone, colors: theme.colors, syntax: theme.syntax, tokenColors: theme.tokenColors,
  })).digest('hex')
}
