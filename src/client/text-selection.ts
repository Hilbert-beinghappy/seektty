/** Application-owned selection coordinates, copy text, and viewport cell invert. */

import { visibleWidth } from '@mariozechner/pi-tui'

export interface SelectionAnchor {
  readonly surface: 'transcript' | 'composer'
  readonly ownerKey: string
  readonly textOffset: number
  readonly affinity: 'before' | 'after'
}

export interface TextSelection {
  readonly anchor: SelectionAnchor
  readonly focus: SelectionAnchor
  readonly granularity: 'character' | 'word' | 'line'
}

export interface OwnerText {
  readonly key: string
  readonly text: string
}

export interface ViewportCellMap {
  readonly row: number
  readonly ownerKey: string
  readonly surface: 'transcript' | 'composer'
  readonly startOffset: number
  readonly endOffset: number
  readonly cellOffsets: readonly (number | undefined)[]
  readonly hardBreakAfter: boolean
}

export interface SelectionLineProjection {
  readonly text: string
  readonly displayStartCell: number
  readonly joinerAfter: string
}

const OSC = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/gu
const CSI = /\u001B\[[0-9;:]*[ -/]*[@-~]/gu
const C1_OSC = /\u009D[\s\S]*?(?:\u0007|\u001B\\|\u009C)/gu

let graphemeSegmenter: Intl.Segmenter | undefined
let wordSegmenter: Intl.Segmenter | undefined

function graphemesOf(text: string): Intl.Segmenter {
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return graphemeSegmenter
}

function wordsOf(text: string): Intl.Segmenter {
  wordSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' })
  return wordSegmenter
}

/** Strip SGR, OSC (including OSC 8), and leftover CSI so copy matches visible text. */
export function stripCopyDecorations(value: string): string {
  return value.replace(OSC, '').replace(C1_OSC, '').replace(CSI, '')
}

export function compareAnchors(left: SelectionAnchor, right: SelectionAnchor, order: readonly string[]): number {
  if (left.surface !== right.surface) return left.surface === 'transcript' ? -1 : 1
  if (left.ownerKey !== right.ownerKey) {
    return order.indexOf(left.ownerKey) - order.indexOf(right.ownerKey)
  }
  if (left.textOffset !== right.textOffset) return left.textOffset - right.textOffset
  if (left.affinity === right.affinity) return 0
  return left.affinity === 'before' ? -1 : 1
}

export function orderedSelection(
  selection: TextSelection,
  order: readonly string[],
): { readonly start: SelectionAnchor; readonly end: SelectionAnchor } {
  const reversed = compareAnchors(selection.anchor, selection.focus, order) > 0
  return reversed
    ? { start: selection.focus, end: selection.anchor }
    : { start: selection.anchor, end: selection.focus }
}

export function sameSurface(selection: TextSelection): boolean {
  return selection.anchor.surface === selection.focus.surface
}

export function graphemeRangeAt(text: string, offset: number): { readonly start: number; readonly end: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  for (const segment of graphemesOf(text).segment(text)) {
    const start = segment.index
    const end = start + segment.segment.length
    if (clamped >= start && clamped < end) return { start, end }
  }
  return { start: clamped, end: Math.min(text.length, clamped + 1) }
}

export function wordRangeAt(text: string, offset: number): { readonly start: number; readonly end: number } {
  const clamped = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)))
  for (const segment of wordsOf(text).segment(text)) {
    const start = segment.index
    const end = start + segment.segment.length
    if (clamped >= start && clamped < end) {
      if (segment.isWordLike === true) return { start, end }
      return graphemeRangeAt(text, clamped)
    }
  }
  return graphemeRangeAt(text, clamped)
}

export function lineRangeAt(text: string, offset: number): { readonly start: number; readonly end: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  const start = text.lastIndexOf('\n', Math.max(0, clamped - 1)) + 1
  const next = text.indexOf('\n', clamped)
  const end = next < 0 ? text.length : next
  return { start, end }
}

export function expandSelection(
  selection: TextSelection,
  text: string,
  granularity: TextSelection['granularity'],
): TextSelection {
  const range = granularity === 'word'
    ? wordRangeAt(text, selection.focus.textOffset)
    : granularity === 'line'
      ? lineRangeAt(text, selection.focus.textOffset)
      : graphemeRangeAt(text, selection.focus.textOffset)
  return {
    anchor: { ...selection.anchor, textOffset: range.start, affinity: 'before' },
    focus: { ...selection.focus, textOffset: range.end, affinity: 'before' },
    granularity,
  }
}

/**
 * Copy selected owner text. Soft wraps are already absent from owner text;
 * real newlines inside owner text are kept. Surrounding whitespace is not trimmed.
 */
export function extractSelectedText(
  selection: TextSelection,
  owners: readonly OwnerText[],
): string {
  if (!sameSurface(selection)) return ''
  const order = owners.map(owner => owner.key)
  const { start, end } = orderedSelection(selection, order)
  const parts: string[] = []
  let started = false
  for (const owner of owners) {
    if (owner.key === start.ownerKey) started = true
    if (!started) continue
    const from = owner.key === start.ownerKey ? start.textOffset : 0
    const to = owner.key === end.ownerKey ? end.textOffset : owner.text.length
    parts.push(owner.text.slice(Math.max(0, from), Math.max(from, to)))
    if (owner.key === end.ownerKey) break
    if (owner.key !== end.ownerKey) parts.push('\n')
  }
  return parts.join('')
}

export interface CopyableLine {
  readonly text: string
  readonly endOffset: number
  readonly cellOffsets: readonly (number | undefined)[]
  readonly hardBreakAfter: boolean
}

/** Map only semantic text cells; presentation columns and renderer padding stay inert. */
export function mapSelectionProjectionLine(
  projection: SelectionLineProjection,
  startOffset: number,
  contentWidth: number,
): CopyableLine {
  const cellOffsets: Array<number | undefined> = Array.from({ length: contentWidth }, () => undefined)
  let offset = startOffset
  let col = Math.max(0, projection.displayStartCell)
  for (const segment of graphemesOf(projection.text).segment(projection.text)) {
    const grapheme = segment.segment
    const width = Math.max(1, visibleWidth(grapheme))
    for (let cell = 0; cell < width && col + cell < contentWidth; cell += 1) {
      cellOffsets[col + cell] = offset
    }
    col += width
    offset += grapheme.length
  }
  return {
    text: projection.text + projection.joinerAfter,
    endOffset: offset,
    cellOffsets,
    hardBreakAfter: projection.joinerAfter === '\n',
  }
}

/** Build one stable owner string from semantic visual-line projections. */
export function ownerTextFromProjections(
  projections: readonly SelectionLineProjection[],
): { readonly text: string; readonly lineStarts: readonly number[] } {
  let text = ''
  const lineStarts: number[] = []
  for (const projection of projections) {
    lineStarts.push(text.length)
    text += projection.text
    text += projection.joinerAfter
  }
  return { text, lineStarts }
}

/**
 * Map one already-rendered visual line to copyable cells.
 * ANSI/OSC and the scrollbar column are skipped; graphemes stay atomic.
 */
export function mapCopyableLine(
  line: string,
  startOffset: number,
  contentWidth: number,
  options: { readonly skipLeading?: number; readonly skipTrailing?: number } = {},
): CopyableLine {
  const skipLeading = options.skipLeading ?? 0
  const skipTrailing = options.skipTrailing ?? 0
  const stripped = stripCopyDecorations(line)
  const cellOffsets: Array<number | undefined> = Array.from({ length: contentWidth }, () => undefined)
  let offset = startOffset
  let col = 0
  let visible = 0
  for (const segment of graphemesOf(stripped).segment(stripped)) {
    const grapheme = segment.segment
    const width = Math.max(1, visibleWidth(grapheme))
    if (visible >= skipLeading && visible + width <= contentWidth - skipTrailing) {
      for (let cell = 0; cell < width && col + cell < contentWidth; cell += 1) {
        cellOffsets[col + cell] = offset
      }
    }
    col += width
    visible += width
    offset += grapheme.length
  }
  const used = Math.min(visibleWidth(stripped) - skipLeading - skipTrailing, contentWidth)
  const hardBreakAfter = used < contentWidth - skipLeading - skipTrailing
  return {
    text: stripped.slice(skipLeading) + (hardBreakAfter ? '\n' : ''),
    endOffset: offset,
    cellOffsets,
    hardBreakAfter,
  }
}

/**
 * Join already-rendered visual lines of one owner into stable logical text.
 * A visual line that does not fill the content width is a real newline.
 */
export function ownerTextFromRenderedLines(
  lines: readonly string[],
  contentWidth: number,
  hardBreaks?: readonly (boolean | undefined)[],
): { readonly text: string; readonly lineStarts: readonly number[] } {
  let text = ''
  const lineStarts: number[] = []
  for (const [index, line] of lines.entries()) {
    lineStarts.push(text.length)
    const mapped = mapCopyableLine(line, text.length, contentWidth)
    const piece = stripCopyDecorations(line)
    text += piece
    const hardBreakAfter = hardBreaks?.[index] ?? mapped.hardBreakAfter
    if (index < lines.length - 1 && hardBreakAfter) text += '\n'
  }
  return { text, lineStarts }
}

export function anchorAtCell(
  map: ViewportCellMap,
  col: number,
  affinity: SelectionAnchor['affinity'] = 'before',
): SelectionAnchor | undefined {
  if (col < 0 || col >= map.cellOffsets.length) return undefined
  const offset = map.cellOffsets[col]
  if (offset === undefined) {
    const nearbyIndex = map.cellOffsets.findLastIndex((value, index) => index <= col && value !== undefined)
    const fallbackIndex = map.cellOffsets.findIndex(value => value !== undefined)
    const resolvedIndex = nearbyIndex >= 0 ? nearbyIndex : fallbackIndex
    const nearby = resolvedIndex < 0 ? undefined : map.cellOffsets[resolvedIndex]
    if (nearby === undefined) return undefined
    const textOffset = affinity === 'after' ? offsetAfterCell(map, resolvedIndex, nearby) : nearby
    return { surface: map.surface, ownerKey: map.ownerKey, textOffset, affinity }
  }
  const textOffset = affinity === 'after' ? offsetAfterCell(map, col, offset) : offset
  return { surface: map.surface, ownerKey: map.ownerKey, textOffset, affinity }
}

function offsetAfterCell(map: ViewportCellMap, col: number, offset: number): number {
  for (let index = col + 1; index < map.cellOffsets.length; index += 1) {
    const candidate = map.cellOffsets[index]
    if (candidate !== undefined && candidate !== offset) return candidate
  }
  return map.endOffset
}

export function selectionCellsOnLine(
  map: ViewportCellMap,
  selection: TextSelection,
  order: readonly string[],
): { readonly start: number; readonly end: number } | undefined {
  if (selection.anchor.surface !== map.surface) return undefined
  const { start, end } = orderedSelection(selection, order)
  const ownerIndex = order.indexOf(map.ownerKey)
  const startIndex = order.indexOf(start.ownerKey)
  const endIndex = order.indexOf(end.ownerKey)
  if (ownerIndex < startIndex || ownerIndex > endIndex) return undefined
  let startCol = 0
  let endCol = map.cellOffsets.length
  if (map.ownerKey === start.ownerKey) {
    const index = map.cellOffsets.findIndex(offset => offset !== undefined && offset >= start.textOffset)
    if (index < 0) return undefined
    startCol = index
  }
  if (map.ownerKey === end.ownerKey) {
    const index = map.cellOffsets.findLastIndex(offset => offset !== undefined && offset < end.textOffset)
    endCol = index < 0 ? startCol : index + 1
  }
  if (endCol <= startCol) return undefined
  return { start: startCol, end: endCol }
}

/** Invert already-generated visible cells. Does not re-render the owner. */
export function invertLineCells(line: string, startCol: number, endCol: number): string {
  if (endCol <= startCol) return line
  let result = ''
  let col = 0
  let index = 0
  let open = false
  while (index < line.length) {
    if (line.charCodeAt(index) === 0x1B) {
      const end = consumeEscape(line, index)
      const escape = line.slice(index, end)
      result += escape
      if (open && escape.startsWith('\u001B[') && escape.endsWith('m')) result += '\u001B[7m'
      index = end
      continue
    }
    const next = nextGrapheme(line, index)
    const width = Math.max(1, visibleWidth(stripCopyDecorations(next)))
    const selected = col >= startCol && col < endCol
    if (selected && !open) {
      result += '\u001B[7m'
      open = true
    } else if (!selected && open) {
      result += '\u001B[27m'
      open = false
    }
    result += next
    col += width
    index += next.length
  }
  if (open) result += '\u001B[27m'
  return result
}

function nextGrapheme(text: string, index: number): string {
  const slice = text.slice(index)
  for (const segment of graphemesOf(slice).segment(slice)) return segment.segment
  return text.charAt(index)
}

function consumeEscape(text: string, index: number): number {
  if (text.startsWith('\u001B]', index) || text.charCodeAt(index) === 0x9D) {
    const bel = text.indexOf('\u0007', index + 1)
    const st = text.indexOf('\u001B\\', index + 1)
    const ends = [bel, st].filter(value => value >= 0)
    if (ends.length === 0) return text.length
    const end = Math.min(...ends)
    return end === st ? st + 2 : end + 1
  }
  if (text.startsWith('\u001B[', index)) {
    let cursor = index + 2
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor)
      cursor += 1
      if (code >= 0x40 && code <= 0x7E) break
    }
    return cursor
  }
  return Math.min(text.length, index + 2)
}

export function paintSelection(
  lines: readonly string[],
  maps: readonly ViewportCellMap[],
  selection: TextSelection | undefined,
  order: readonly string[],
): string[] {
  if (selection === undefined || !sameSurface(selection)) return [...lines]
  return lines.map((line, row) => {
    const map = maps.find(candidate => candidate.row === row)
    if (map === undefined) return line
    const range = selectionCellsOnLine(map, selection, order)
    return range === undefined ? line : invertLineCells(line, range.start, range.end)
  })
}

export function selectionClearedForOwner(
  selection: TextSelection | undefined,
  keys: ReadonlySet<string>,
): TextSelection | undefined {
  if (selection === undefined) return undefined
  if (!keys.has(selection.anchor.ownerKey) || !keys.has(selection.focus.ownerKey)) return undefined
  return selection
}
