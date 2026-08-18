/** Incremental search over already-rendered transcript lines. */

const ANSI = /\u001B\[[0-9;:]*m/gu

/**
 * Remove SGR sequences so search can match what the user sees.
 * @param value - possibly colorized terminal text.
 * @returns the printable text without SGR.
 */
export function stripAnsi(value: string): string {
  return value.replace(ANSI, '')
}

/**
 * Find rendered lines that contain the query, ignoring color and case.
 * @param lines - full transcript lines before viewport clipping.
 * @param query - user-typed needle; blank queries match nothing.
 * @returns matching line indexes in document order.
 */
export function findLineMatches(lines: readonly string[], query: string): number[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  return lines.flatMap((line, index) =>
    stripAnsi(line).toLowerCase().includes(needle) ? [index] : [])
}

/** One search pass: ordered matches plus a Set for constant-time highlight. */
export interface LineSearchPlan {
  readonly matches: readonly number[]
  readonly hit: ReadonlySet<number>
}

/**
 * Compute match indexes once per query so highlight can use Set lookup.
 * @param lines - full transcript lines before viewport clipping.
 * @param query - user-typed needle; blank queries match nothing.
 */
export function planLineSearch(lines: readonly string[], query: string): LineSearchPlan {
  const matches = findLineMatches(lines, query)
  return { matches, hit: new Set(matches) }
}

/**
 * Move to the next or previous match, wrapping at the ends.
 * @param matches - document-order line indexes.
 * @param current - current line index, which may be absent from matches.
 * @param direction - +1 for next, -1 for previous.
 * @returns the selected line index, or -1 when there are no matches.
 */
export function nextMatchIndex(
  matches: readonly number[],
  current: number,
  direction: 1 | -1,
): number {
  if (matches.length === 0) return -1
  const index = matches.indexOf(current)
  if (index === -1) return matches[0] ?? -1
  const next = (index + direction + matches.length) % matches.length
  return matches[next] ?? -1
}

/**
 * Highlight the first case-insensitive occurrence of the query on a stripped line.
 * @param line - a rendered line, possibly with SGR.
 * @param query - needle already known to occur on this line.
 * @param paint - wrap the matched substring.
 * @returns a stripped line with the first match painted.
 */
export function highlightQuery(
  line: string,
  query: string,
  paint: (matched: string) => string,
): string {
  const plain = stripAnsi(line)
  const needle = query.trim()
  if (needle === '') return plain
  const index = plain.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return plain
  return `${plain.slice(0, index)}${paint(plain.slice(index, index + needle.length))}${plain.slice(index + needle.length)}`
}

/**
 * Scroll so the matched line sits at the top of the viewport when possible.
 * @param lineCount - total rendered lines.
 * @param viewportRows - visible transcript rows.
 * @param lineIndex - document index to reveal.
 * @returns a bottom-origin scrollOffset compatible with Transcript.render.
 */
export function scrollOffsetToReveal(
  lineCount: number,
  viewportRows: number,
  lineIndex: number,
): number {
  const rows = Math.max(1, Math.floor(viewportRows))
  const maxOffset = Math.max(0, lineCount - rows)
  const preferred = lineCount - lineIndex - rows
  return Math.max(0, Math.min(maxOffset, preferred))
}

/**
 * Keep `lineIndex` visible while preferring the top of the document.
 * Compatible with Transcript's bottom-origin scrollOffset.
 */
export function scrollOffsetToContain(
  lineCount: number,
  viewportRows: number,
  lineIndex: number,
): number {
  const rows = Math.max(1, Math.floor(viewportRows))
  const maxOffset = Math.max(0, lineCount - rows)
  const selected = Math.max(0, Math.min(lineIndex, Math.max(0, lineCount - 1)))
  const minOffset = Math.max(0, lineCount - selected - rows)
  const preferred = Math.min(maxOffset, Math.max(0, lineCount - selected - 1))
  return Math.max(minOffset, preferred)
}
