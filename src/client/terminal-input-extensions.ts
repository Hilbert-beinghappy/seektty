/** Revision-guarded terminal equivalent of InputActions.captureInsertion/insertText. */
import type { TerminalInputTarget } from '../terminal-extensions.ts'

export interface InsertionEditor {
  onChange?: ((text: string) => void) | undefined
  getText(): string
  getCursor(): { line: number; col: number }
  getSelection?(): { anchor: { line: number; col: number }; focus: { line: number; col: number } } | undefined
  setSelection?(anchor: { line: number; col: number }, focus: { line: number; col: number }): void
  setCursor?(line: number, col: number): void
  insertTextAtCursor(text: string): void
}
export interface InsertionScope { readonly sessionId: string; readonly displayTitle: string; readonly generation: number; readonly ready: boolean; readonly locked: boolean }
export interface TerminalInsertion { readonly target: TerminalInputTarget; readonly draftRev: number }

const offsetOf = (text: string, point: { line: number; col: number }): number => {
  const lines = text.split('\n')
  if (!Number.isSafeInteger(point.line) || !Number.isSafeInteger(point.col) || point.line < 0 || point.line >= lines.length
    || point.col < 0 || point.col > lines[point.line]!.length) throw new Error('Composer selection is unavailable')
  return lines.slice(0, point.line).reduce((count, line) => count + line.length + 1, 0) + point.col
}
const pointOf = (text: string, offset: number): { line: number; col: number } => {
  const prefix = text.slice(0, offset).split('\n')
  return { line: prefix.length - 1, col: prefix[prefix.length - 1]!.length }
}

export class TerminalInputExtensions {
  private revision = 0
  private disposed = false
  private readonly captures = new WeakMap<TerminalInsertion, { generation: number }>()
  private readonly previous: InsertionEditor['onChange']
  private readonly changed: (text: string) => void
  constructor(private readonly editor: InsertionEditor, private readonly scope: () => InsertionScope) {
    this.previous = editor.onChange
    this.changed = text => { this.revision++; this.previous?.(text) }
    editor.onChange = this.changed
  }
  captureInsertion(): TerminalInsertion {
    const state = this.scope()
    if (this.disposed || !state.ready || state.locked || state.sessionId === '') throw new Error('Composer is unavailable or locked')
    const draft = this.editor.getText(), selection = this.editor.getSelection?.(), cursor = this.editor.getCursor()
    const a = offsetOf(draft, selection?.anchor ?? cursor), b = offsetOf(draft, selection?.focus ?? cursor)
    const target = Object.freeze({ sessionId: state.sessionId, displayTitle: state.displayTitle, draft,
      selection: Object.freeze({ start: Math.min(a, b), end: Math.max(a, b) }) })
    const capture = Object.freeze({ target, draftRev: this.revision })
    this.captures.set(capture, { generation: state.generation })
    return capture
  }
  insertText(text: string, capture: TerminalInsertion, signal: AbortSignal): boolean {
    const original = this.captures.get(capture), state = this.scope()
    this.captures.delete(capture)
    if (this.disposed || original === undefined || signal.aborted || !state.ready || state.locked
      || state.sessionId !== capture.target.sessionId || state.generation !== original.generation
      || capture.draftRev !== this.revision || this.editor.getText() !== capture.target.draft) return false
    const { start, end } = capture.target.selection
    if (this.editor.setSelection === undefined || this.editor.setCursor === undefined) return false
    const anchor = pointOf(capture.target.draft, start)
    this.editor.setCursor(anchor.line, anchor.col)
    this.editor.setSelection(anchor, pointOf(capture.target.draft, end))
    this.editor.insertTextAtCursor(text)
    return true
  }
  dispose(): void {
    this.disposed = true
    if (this.editor.onChange === this.changed) this.editor.onChange = this.previous
  }
}
