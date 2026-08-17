/** Context-bounded unified hunks for transcript file diffs. */

const MAX_LCS_CELLS = 250_000

export function contentLines(text: string): string[] {
  if (text === '') return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

interface Edit {
  readonly kind: 'eq' | 'del' | 'add'
  readonly line: string
  readonly oldLine: number
  readonly newLine: number
}

function lcsEdits(oldLines: readonly string[], newLines: readonly string[]): Edit[] {
  const n = oldLines.length
  const m = newLines.length
  if (n * m > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((line, index) => ({
        kind: 'del' as const,
        line,
        oldLine: index + 1,
        newLine: 0,
      })),
      ...newLines.map((line, index) => ({
        kind: 'add' as const,
        line,
        oldLine: 0,
        newLine: index + 1,
      })),
    ]
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]
    if (row === undefined) continue
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = oldLines[i] === newLines[j]
        ? (dp[i + 1]?.[j + 1] ?? 0) + 1
        : Math.max(dp[i + 1]?.[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const edits: Edit[] = []
  let i = 0
  let j = 0
  let oldLine = 0
  let newLine = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      oldLine += 1
      newLine += 1
      edits.push({ kind: 'eq', line: oldLines[i] ?? '', oldLine, newLine })
      i += 1
      j += 1
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      oldLine += 1
      edits.push({ kind: 'del', line: oldLines[i] ?? '', oldLine, newLine })
      i += 1
    } else {
      newLine += 1
      edits.push({ kind: 'add', line: newLines[j] ?? '', oldLine, newLine })
      j += 1
    }
  }
  while (i < n) {
    oldLine += 1
    edits.push({ kind: 'del', line: oldLines[i] ?? '', oldLine, newLine })
    i += 1
  }
  while (j < m) {
    newLine += 1
    edits.push({ kind: 'add', line: newLines[j] ?? '', oldLine, newLine })
    j += 1
  }
  return edits
}

function hunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  return `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`
}

/**
 * Emit unified hunks for one file, keeping `context` unchanged lines around each change.
 * @param oldText - previous file body, or null when the file is created.
 * @param newText - current file body.
 * @param context - unchanged lines to keep on each side of a change.
 */
export function unifiedHunks(oldText: string | null, newText: string, context: number): string[] {
  const bounded = Math.max(0, Math.floor(context))
  const edits = lcsEdits(oldText === null ? [] : contentLines(oldText), contentLines(newText))
  const changeIndexes = edits.flatMap((edit, index) => edit.kind === 'eq' ? [] : [index])
  if (changeIndexes.length === 0) return []
  const windows: Array<{ start: number; end: number }> = []
  for (const index of changeIndexes) {
    const start = Math.max(0, index - bounded)
    const end = Math.min(edits.length, index + bounded + 1)
    const last = windows.at(-1)
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end)
    else windows.push({ start, end })
  }
  return windows.flatMap(({ start, end }) => {
    const slice = edits.slice(start, end)
    const oldRows = slice.filter(edit => edit.kind !== 'add')
    const newRows = slice.filter(edit => edit.kind !== 'del')
    const lines = [
      hunkHeader(
        oldRows[0]?.oldLine ?? 0,
        oldRows.length,
        newRows[0]?.newLine ?? 0,
        newRows.length,
      ),
      ...slice.map((edit) => {
        if (edit.kind === 'eq') return ` ${edit.line}`
        if (edit.kind === 'del') return `-${edit.line}`
        return `+${edit.line}`
      }),
    ]
    return lines
  })
}
