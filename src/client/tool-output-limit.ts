/** Fold one tool-output block to a bounded number of terminal lines. */

import { ui } from './locale.ts'

/**
 * Keep the first `limit` lines and append a remaining-count footer.
 * @param text - one tool-output block.
 * @param limit - line cap; 0 or negative means unlimited.
 */
export function toolOutputLines(text: string): { readonly lines: readonly string[]; readonly eofNewline: boolean } {
  const eofNewline = text.endsWith('\n')
  const body = eofNewline ? text.slice(0, -1) : text
  return { lines: body.split('\n'), eofNewline }
}

export function foldLineBlock(text: string, limit: number): { text: string; omitted: number } {
  if (!Number.isFinite(limit) || limit <= 0) return { text, omitted: 0 }
  const cap = Math.floor(limit)
  const { lines, eofNewline } = toolOutputLines(text)
  if (lines.length <= cap) return { text, omitted: 0 }
  const omitted = lines.length - cap
  const kept = lines.slice(0, cap).join('\n')
  const suffix = eofNewline || omitted > 0 ? '\n' : ''
  return {
    text: `${kept}${suffix}${ui(`还有 ${String(omitted)} 行`, `${String(omitted)} more line(s)`)}`,
    omitted,
  }
}
