/** Fold one tool-output block to a bounded number of terminal lines. */

import { ui } from './locale.ts'

/**
 * Keep a bounded head and tail, with an exact omitted-line marker between them.
 * Tail text (including Host retrieval notices) stays ordinary, untrusted text:
 * this function neither recognizes spill references nor grants recovery actions.
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
  const cap = Math.max(1, Math.floor(limit))
  const { lines, eofNewline } = toolOutputLines(text)
  if (lines.length <= cap) return { text, omitted: 0 }
  const omitted = lines.length - cap
  const tailCount = Math.max(1, Math.floor(cap / 2))
  const headCount = cap - tailCount
  const marker = ui(`… 省略中间 ${String(omitted)} 行 …`, `… ${String(omitted)} middle line(s) omitted …`)
  return {
    text: [...lines.slice(0, headCount), marker, ...lines.slice(-tailCount)].join('\n') + (eofNewline ? '\n' : ''),
    omitted,
  }
}
