/** Pure helpers for `/copy pick` and `/copy code`. */

const FENCE = /^```[^\n]*\n([\s\S]*?)^```/mu

/**
 * Return the last fenced code block in one assistant reply.
 * @param text - complete assistant text.
 * @returns the block body without fences, or undefined when none exist.
 */
export function lastFencedCode(text: string): string | undefined {
  let match: RegExpExecArray | null
  let last: string | undefined
  const pattern = new RegExp(FENCE.source, 'gmu')
  while ((match = pattern.exec(text)) !== null) {
    last = match[1]?.replace(/\n$/u, '')
  }
  return last === undefined || last.trim() === '' ? undefined : last
}

/**
 * Build newest-first copy targets from assistant texts.
 * @param entries - seq plus visible text.
 * @returns picker rows with stable ids.
 */
export function copyTargets(
  entries: readonly { readonly id: string; readonly text: string }[],
): readonly { readonly id: string; readonly preview: string; readonly text: string }[] {
  return [...entries].reverse().flatMap((entry) => {
    if (entry.text === '') return []
    return [{
      id: entry.id,
      preview: entry.text.replace(/\s+/gu, ' ').slice(0, 160),
      text: entry.text,
    }]
  })
}
