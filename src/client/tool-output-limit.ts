/** Fold one tool-output block to a bounded number of terminal lines. */

import { ui } from './locale.ts'

/**
 * Keep the first `limit` lines and append a remaining-count footer.
 * @param text - one tool-output block.
 * @param limit - line cap; 0 or negative means unlimited.
 */
export function foldLineBlock(text: string, limit: number): { text: string; omitted: number } {
  if (!Number.isFinite(limit) || limit <= 0) return { text, omitted: 0 }
  const cap = Math.floor(limit)
  const lines = text.split('\n')
  if (lines.length <= cap) return { text, omitted: 0 }
  const omitted = lines.length - cap
  return {
    text: `${lines.slice(0, cap).join('\n')}\n${ui(`还有 ${String(omitted)} 行`, `${String(omitted)} more line(s)`)}`,
    omitted,
  }
}
