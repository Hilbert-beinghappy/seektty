/** Context-bounded unified hunks for transcript file diffs. Linear-space LCS. */

const MAX_LCS_CELLS = 2_000_000
const NO_NEWLINE = '\0NO_NL'
const NO_NEWLINE_MARK = '\\ No newline at end of file'

interface FileLines {
  readonly lines: string[]
  readonly eofNewline: boolean
}

interface Op {
  readonly kind: 'eq' | 'del' | 'add'
  readonly line: string
  readonly noNewline: boolean
}

interface Edit extends Op {
  readonly oldLine: number
  readonly newLine: number
}

/**
 * Split file text into lines, dropping a single trailing newline from the last line.
 * @param text - raw file body.
 */
export function contentLines(text: string): string[] {
  return splitFileLines(text).lines
}

function splitFileLines(text: string): FileLines {
  if (text === '') return { lines: [], eofNewline: false }
  const eofNewline = text.endsWith('\n')
  const body = eofNewline ? text.slice(0, -1) : text
  return { lines: body.split('\n'), eofNewline }
}

function keyedLines(file: FileLines): string[] {
  if (file.lines.length === 0) return []
  if (file.eofNewline) return [...file.lines]
  return [...file.lines.slice(0, -1), `${file.lines.at(-1) ?? ''}${NO_NEWLINE}`]
}

function decodeLine(token: string): { readonly line: string; readonly noNewline: boolean } {
  if (token.endsWith(NO_NEWLINE)) {
    return { line: token.slice(0, -NO_NEWLINE.length), noNewline: true }
  }
  return { line: token, noNewline: false }
}

function lcsRow(left: readonly string[], right: readonly string[]): Uint32Array {
  const current = new Uint32Array(right.length + 1)
  for (const token of left) {
    let last = 0
    for (let j = 0; j < right.length; j += 1) {
      const next = current[j + 1] ?? 0
      current[j + 1] = token === right[j]
        ? last + 1
        : Math.max(next, current[j] ?? 0)
      last = next
    }
  }
  return current
}

function greedyAlign(left: readonly string[], right: readonly string[]): Op[] {
  const ops: Op[] = []
  const used = new Set<number>()
  for (const token of left) {
    const index = right.findIndex((candidate, j) => !used.has(j) && candidate === token)
    if (index === -1) {
      ops.push({ kind: 'del', ...decodeLine(token) })
      continue
    }
    for (let j = 0; j < index; j += 1) {
      if (used.has(j)) continue
      ops.push({ kind: 'add', ...decodeLine(right[j] ?? '') })
      used.add(j)
    }
    ops.push({ kind: 'eq', ...decodeLine(token) })
    used.add(index)
  }
  for (let j = 0; j < right.length; j += 1) {
    if (!used.has(j)) ops.push({ kind: 'add', ...decodeLine(right[j] ?? '') })
  }
  return ops
}

function align(left: readonly string[], right: readonly string[]): Op[] {
  if (left.length === 0) return right.map(token => ({ kind: 'add' as const, ...decodeLine(token) }))
  if (right.length === 0) return left.map(token => ({ kind: 'del' as const, ...decodeLine(token) }))
  if (left.length === 1 || right.length === 1) return greedyAlign(left, right)
  const mid = Math.floor(left.length / 2)
  const leftPart = left.slice(0, mid)
  const rightPart = left.slice(mid)
  const leftScore = lcsRow(leftPart, right)
  const rightScore = lcsRow([...rightPart].reverse(), [...right].reverse())
  let split = 0
  let best = -1
  for (let k = 0; k <= right.length; k += 1) {
    const score = (leftScore[k] ?? 0) + (rightScore[right.length - k] ?? 0)
    if (score > best) {
      best = score
      split = k
    }
  }
  return [...align(leftPart, right.slice(0, split)), ...align(rightPart, right.slice(split))]
}

function numberEdits(ops: readonly Op[]): Edit[] {
  let oldLine = 0
  let newLine = 0
  return ops.map((op) => {
    if (op.kind === 'eq') {
      oldLine += 1
      newLine += 1
      return { ...op, oldLine, newLine }
    }
    if (op.kind === 'del') {
      oldLine += 1
      return { ...op, oldLine, newLine }
    }
    newLine += 1
    return { ...op, oldLine, newLine }
  })
}

function fallbackEdits(oldTokens: readonly string[], newTokens: readonly string[]): Edit[] {
  return numberEdits([
    ...oldTokens.map(token => ({ kind: 'del' as const, ...decodeLine(token) })),
    ...newTokens.map(token => ({ kind: 'add' as const, ...decodeLine(token) })),
  ])
}

function lcsEdits(oldTokens: readonly string[], newTokens: readonly string[]): Edit[] {
  const n = oldTokens.length
  const m = newTokens.length
  if (n * m > MAX_LCS_CELLS) return fallbackEdits(oldTokens, newTokens)
  return numberEdits(align(oldTokens, newTokens))
}

function hunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  return `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`
}

function formatEdit(edit: Edit): string[] {
  const prefix = edit.kind === 'eq' ? ' ' : edit.kind === 'del' ? '-' : '+'
  if (edit.kind !== 'eq' && edit.noNewline) return [`${prefix}${edit.line}`, NO_NEWLINE_MARK]
  return [`${prefix}${edit.line}`]
}

/**
 * Emit unified hunks for one file, keeping `context` unchanged lines around each change.
 * @param oldText - previous file body, or null when the file is created.
 * @param newText - current file body.
 * @param context - unchanged lines to keep on each side of a change.
 */
export function unifiedHunks(oldText: string | null, newText: string, context: number): string[] {
  const bounded = Math.max(0, Math.floor(context))
  const oldFile = oldText === null ? { lines: [], eofNewline: true } : splitFileLines(oldText)
  const newFile = splitFileLines(newText)
  const edits = lcsEdits(keyedLines(oldFile), keyedLines(newFile))
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
    const oldStart = oldRows[0]?.oldLine ?? slice[0]?.oldLine ?? 0
    const newStart = newRows[0]?.newLine ?? slice[0]?.newLine ?? 0
    return [
      hunkHeader(oldStart, oldRows.length, newStart, newRows.length),
      ...slice.flatMap(formatEdit),
    ]
  })
}
