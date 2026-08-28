/** Duck-typed public adapters over the pinned pi-tui geometry and Editor APIs. */

import type { Editor, TUI } from '@mariozechner/pi-tui'
import type { OverlayScreenRect, TuiFrameGeometry } from './mouse-hit-map.ts'

export interface EditorPoint {
  readonly line: number
  readonly col: number
}

export interface EditorTextSelection {
  readonly anchor: EditorPoint
  readonly focus: EditorPoint
}

export interface VisualLine {
  readonly logicalLine: number
  readonly startCol: number
  readonly length: number
}

export interface AutocompleteVisibleRow {
  readonly visualRow: number
  readonly absoluteIndex: number
  readonly itemId: string
  readonly selectable: boolean
}

export interface AutocompleteSnapshot {
  readonly generation: number
  readonly selectedIndex: number
  readonly visibleRows: readonly AutocompleteVisibleRow[]
}

export interface AutocompleteActivation {
  readonly applied: boolean
  readonly submitText?: string
}

interface PatchedEditor {
  setCursor?(line: number, col: number): void
  getCursor(): EditorPoint
  getSelection?(): EditorTextSelection | undefined
  setSelection?(anchor: EditorPoint, focus: EditorPoint): void
  clearSelection?(): void
  replaceSelection?(text: string): boolean
  getVisualLineMap?(width?: number): readonly VisualLine[]
  getVisibleLineMap?(): readonly { readonly row: number; readonly col: number; readonly logicalLine: number; readonly startCol: number; readonly text: string }[]
  isShowingAutocomplete(): boolean
  getAutocompleteSnapshot?(): AutocompleteSnapshot | undefined
  moveAutocompleteSelection?(delta: number): boolean
  scrollAutocomplete?(delta: number): boolean
  selectAutocompleteItem?(generation: number, itemId: string): boolean
  completeAutocompleteSelection?(): boolean
  activateAutocompleteSelection?(source: 'enter' | 'mouse'): AutocompleteActivation
}

interface PatchedTui {
  getLastFrameGeometry?(): TuiFrameGeometry
  onAfterRender?: () => void
}

export function editorMouseApi(editor: Editor): PatchedEditor {
  return editor as unknown as PatchedEditor
}

/** Stable current-generation target id used by render, hit-test, and hover. */
export function autocompleteTargetId(generation: number, absoluteIndex: number): string {
  return `composer:autocomplete:${generation}:${absoluteIndex}`
}

export function tuiFrameApi(tui: TUI): PatchedTui {
  return tui as unknown as PatchedTui
}

export function emptyFrameGeometry(width: number, height: number): TuiFrameGeometry {
  return {
    terminalWidth: width,
    terminalHeight: height,
    rootScreenOrigin: { col: 0, row: 0 },
    rootSliceOffset: 0,
    overlays: [] as OverlayScreenRect[],
  }
}
