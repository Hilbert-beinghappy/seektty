/** Text selection owned by a single modal page, never by the hidden composer. */
import { CURSOR_MARKER, type Editor, type Input, visibleWidth } from '@mariozechner/pi-tui'
import { editorMouseApi } from './pi-tui-adapters.ts'
import type { CellPoint, CellRect } from './mouse-hit-map.ts'
import { graphemeRangeAt, invertLineCells, stripCopyDecorations, wordRangeAt } from './text-selection.ts'

export interface OverlayEditable {
  readonly rect: CellRect
  text(): string
  position(): number
  selection(): { readonly anchor: number; readonly focus: number } | undefined
  offsetAt(point: CellPoint): number
  cursor(offset: number): void
  select(anchor: number, focus: number): void
  replace(text: string): void
  undo(): void
}

/** A captured target must still own the current page when an async clipboard read ends. */
export interface OverlayTextTarget {
  readonly text: string
  readonly editable: boolean
  valid(): boolean
  replace(text: string): boolean
  selectAll(): void
  undo(): void
}

export function inputEditable(input: Input, rect: CellRect, changed: () => void): OverlayEditable {
  return {
    rect,
    text: () => input.getValue(),
    position: () => input.getCursor(),
    selection: () => input.getSelection(),
    offsetAt: point => input.getPointerOffset(point.col - rect.col),
    cursor: offset => { input.setCursor(offset) },
    select: (anchor, focus) => { input.setSelection(anchor, focus) },
    replace: text => {
      // Use Input's own paste/undo path and preserve single-line normalization.
      input.handleInput(`\u001B[200~${text}\u001B[201~`)
      changed()
    },
    undo: () => { input.handleInput('\u001A'); changed() },
  }
}

/** Use the exact rendered editor window, including wrapping and its own scroll offset. */
export function editorEditable(editor: Editor, origin: CellPoint, width: number, sliceStart: number, visibleRows: number): OverlayEditable | undefined {
  const api = editorMouseApi(editor)
  const rows = api.getVisibleLineMap?.().filter(row => row.row >= sliceStart && row.row < sliceStart + visibleRows) ?? []
  const first = rows[0]
  if (first === undefined) return undefined
  const offsetOf = (point: { line: number; col: number }): number =>
    editor.getText().split('\n').slice(0, point.line).reduce((sum, line) => sum + line.length + 1, 0) + point.col
  const pointOf = (offset: number): { line: number; col: number } => {
    const lines = editor.getText().split('\n')
    let remaining = offset
    for (const [index, line] of lines.entries()) {
      if (remaining <= line.length) return { line: index, col: remaining }
      remaining -= line.length + 1
    }
    return { line: lines.length - 1, col: lines.at(-1)?.length ?? 0 }
  }
  return {
    rect: { col: origin.col, row: origin.row + first.row - sliceStart, width, height: rows.length },
    text: () => editor.getText(), position: () => offsetOf(api.getCursor()),
    selection: () => {
      const selection = api.getSelection?.()
      return selection === undefined ? undefined : { anchor: offsetOf(selection.anchor), focus: offsetOf(selection.focus) }
    },
    offsetAt: point => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, point.row - origin.row - first.row + sliceStart))] ?? first
      return offsetOf({ line: row.logicalLine, col: row.startCol + cellOffset(row.text, point.col - origin.col - row.col) })
    },
    cursor: offset => { const point = pointOf(offset); api.clearSelection?.(); api.setCursor?.(point.line, point.col) },
    select: (anchor, focus) => { api.setSelection?.(pointOf(anchor), pointOf(focus)); const point = pointOf(focus); api.setCursor?.(point.line, point.col) },
    replace: text => { api.replaceSelection?.(text) },
    undo: () => { editor.handleInput('\u001A') },
  }
}

function cellOffset(text: string, col: number): number {
  let cell = 0
  for (const part of segmenter.segment(text)) {
    const width = Math.max(1, visibleWidth(part.segment))
    if (col < cell + width) return part.index
    cell += width
  }
  return text.length
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
interface TextPoint { readonly row: number; readonly offset: number }

/** Bounded rendered modal text; ANSI, cursor markers and frame padding are not copied. */
export class OverlayTextSelection {
  private rows: readonly string[] = []
  private anchor: TextPoint | undefined
  private focus: TextPoint | undefined
  private inputAnchor: number | undefined

  clear(): void { this.anchor = undefined; this.focus = undefined; this.inputAnchor = undefined }

  render(lines: readonly string[]): string[] {
    const rows = lines.slice(1, -1).map(line =>
      stripCopyDecorations(line.replaceAll(CURSOR_MARKER, '')).slice(2, -2).trimEnd())
    if (rows.length !== this.rows.length || rows.some((row, index) => row !== this.rows[index])) {
      this.anchor = undefined
      this.focus = undefined
    }
    this.rows = rows
    const range = this.range()
    if (range === undefined) return [...lines]
    return lines.map((line, index) => {
      const row = index - 1
      if (row < range.start.row || row > range.end.row) return line
      const text = rows[row] ?? ''
      const start = row === range.start.row ? range.start.offset : 0
      const end = row === range.end.row ? range.end.offset : text.length
      return invertLineCells(line, 2 + visibleWidth(text.slice(0, start)), 2 + visibleWidth(text.slice(0, end)))
    })
  }

  pointer(point: CellPoint, origin: CellPoint | undefined, count: number, ended: boolean, input?: OverlayEditable): void {
    if (input !== undefined) {
      this.anchor = undefined
      this.focus = undefined
      const focus = input.offsetAt(point)
      if (origin !== undefined) {
        this.inputAnchor ??= input.offsetAt(origin)
        const anchor = this.inputAnchor
        const advance = (offset: number) => graphemeRangeAt(input.text(), offset).end
        input.select(focus >= anchor ? anchor : advance(anchor), focus >= anchor ? advance(focus) : focus)
      } else {
        this.inputAnchor = undefined
        if (count >= 3) input.select(0, input.text().length)
        else if (count === 2) {
          const range = wordRangeAt(input.text(), focus)
          input.select(range.start, range.end)
        } else input.cursor(focus)
      }
      if (ended) this.inputAnchor = undefined
      return
    }
    this.inputAnchor = undefined
    const focus = this.at(point)
    if (origin === undefined) {
      if (count === 1) { this.clear(); return }
      const text = this.rows[focus.row] ?? ''
      const range = count >= 3 ? { start: 0, end: text.length } : wordRangeAt(text, focus.offset)
      this.anchor = { row: focus.row, offset: range.start }
      this.focus = { row: focus.row, offset: range.end }
      return
    }
    const anchor = this.at(origin)
    const forward = anchor.row < focus.row || (anchor.row === focus.row && anchor.offset <= focus.offset)
    const advance = (at: TextPoint): TextPoint => ({
      row: at.row, offset: graphemeRangeAt(this.rows[at.row] ?? '', at.offset).end,
    })
    this.anchor = forward ? anchor : advance(anchor)
    this.focus = forward ? advance(focus) : focus
  }

  selectedText(): string {
    const range = this.range()
    if (range === undefined) return ''
    return this.rows.slice(range.start.row, range.end.row + 1).map((text, index, rows) => text.slice(
      index === 0 ? range.start.offset : 0,
      index === rows.length - 1 ? range.end.offset : text.length,
    )).join('\n')
  }

  private at(point: CellPoint): TextPoint {
    const row = Math.max(0, Math.min(point.row - 1, this.rows.length - 1))
    return { row, offset: cellOffset(this.rows[row] ?? '', point.col - 2) }
  }

  private range(): { start: TextPoint; end: TextPoint } | undefined {
    if (this.anchor === undefined || this.focus === undefined) return undefined
    return this.anchor.row < this.focus.row || (this.anchor.row === this.focus.row && this.anchor.offset <= this.focus.offset)
      ? { start: this.anchor, end: this.focus } : { start: this.focus, end: this.anchor }
  }
}
