/** Line-level unified diffs for transcript and approval views. */

/** Default unchanged lines kept on each side of a change island. */
export const DIFF_CONTEXT_LINES = 3

export type LineEdit =
  | { readonly type: 'equal'; readonly line: string }
  | { readonly type: 'delete'; readonly line: string }
  | { readonly type: 'insert'; readonly line: string }

export function splitDiffLines(text: string): string[] {
  if (text === '') return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

/**
 * Myers / LCS line edits. Equal lines stay in order; inserts and deletes are
 * the minimum replacements needed to turn `previous` into `next`.
 */
export function lineEdits(previous: readonly string[], next: readonly string[]): LineEdit[] {
  const n = previous.length
  const m = next.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]
    const below = dp[i + 1]
    if (row === undefined || below === undefined) continue
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = previous[i] === next[j]
        ? (below[j + 1] ?? 0) + 1
        : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const edits: LineEdit[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (previous[i] === next[j]) {
      edits.push({ type: 'equal', line: previous[i] ?? '' })
      i += 1
      j += 1
      continue
    }
    if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      edits.push({ type: 'delete', line: previous[i] ?? '' })
      i += 1
    } else {
      edits.push({ type: 'insert', line: next[j] ?? '' })
      j += 1
    }
  }
  while (i < n) {
    edits.push({ type: 'delete', line: previous[i] ?? '' })
    i += 1
  }
  while (j < m) {
    edits.push({ type: 'insert', line: next[j] ?? '' })
    j += 1
  }
  return edits
}

interface ChangeSpan {
  readonly start: number
  readonly end: number
}

function changeSpans(edits: readonly LineEdit[]): ChangeSpan[] {
  const spans: ChangeSpan[] = []
  let index = 0
  while (index < edits.length) {
    if (edits[index]?.type === 'equal') {
      index += 1
      continue
    }
    const start = index
    while (index < edits.length && edits[index]?.type !== 'equal') index += 1
    spans.push({ start, end: index })
  }
  return spans
}

function lineCounts(edits: readonly LineEdit[], start: number, end: number): { oldCount: number; newCount: number } {
  let oldCount = 0
  let newCount = 0
  for (let index = start; index < end; index += 1) {
    const edit = edits[index]
    if (edit?.type === 'insert') newCount += 1
    else if (edit?.type === 'delete') oldCount += 1
    else {
      oldCount += 1
      newCount += 1
    }
  }
  return { oldCount, newCount }
}

function oldIndexAt(edits: readonly LineEdit[], editIndex: number): number {
  let oldIndex = 0
  for (let index = 0; index < editIndex; index += 1) {
    if (edits[index]?.type !== 'insert') oldIndex += 1
  }
  return oldIndex
}

function newIndexAt(edits: readonly LineEdit[], editIndex: number): number {
  let newIndex = 0
  for (let index = 0; index < editIndex; index += 1) {
    if (edits[index]?.type !== 'delete') newIndex += 1
  }
  return newIndex
}

/**
 * Unified hunks with `context` unchanged lines around each change island.
 * Isolated one-line replacements occupy 7 body lines plus a hunk header.
 */
export function unifiedHunks(
  previous: readonly string[],
  next: readonly string[],
  context: number = DIFF_CONTEXT_LINES,
): string[] {
  const edits = lineEdits(previous, next)
  const spans = changeSpans(edits)
  if (spans.length === 0) return []
  const hunks: Array<{ start: number; end: number }> = []
  for (const span of spans) {
    const start = Math.max(0, span.start - context)
    const end = Math.min(edits.length, span.end + context)
    const previousHunk = hunks[hunks.length - 1]
    if (previousHunk !== undefined && start <= previousHunk.end) previousHunk.end = end
    else hunks.push({ start, end })
  }
  const rows: string[] = []
  for (const hunk of hunks) {
    const oldStart = oldIndexAt(edits, hunk.start) + 1
    const newStart = newIndexAt(edits, hunk.start) + 1
    const { oldCount, newCount } = lineCounts(edits, hunk.start, hunk.end)
    rows.push(`@@ -${oldCount === 0 ? oldStart - 1 : oldStart},${oldCount} +${newCount === 0 ? newStart - 1 : newStart},${newCount} @@`)
    for (let index = hunk.start; index < hunk.end; index += 1) {
      const edit = edits[index]
      if (edit === undefined) continue
      if (edit.type === 'equal') rows.push(` ${edit.line}`)
      else if (edit.type === 'delete') rows.push(`-${edit.line}`)
      else rows.push(`+${edit.line}`)
    }
  }
  return rows
}
