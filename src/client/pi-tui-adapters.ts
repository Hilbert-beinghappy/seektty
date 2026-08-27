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

interface PatchedEditor {
  setCursor?(line: number, col: number): void
  getCursor(): EditorPoint
  getSelection?(): EditorTextSelection | undefined
  setSelection?(anchor: EditorPoint, focus: EditorPoint): void
  clearSelection?(): void
  getVisualLineMap?(width?: number): readonly VisualLine[]
  isShowingAutocomplete(): boolean
  getAutocompleteSelectedIndex?(): number
  setAutocompleteSelectedIndex?(index: number): void
  applyAutocompleteSelection?(): boolean
}

interface PatchedTui {
  getLastFrameGeometry?(): TuiFrameGeometry
  onAfterRender?: () => void
}

export function editorMouseApi(editor: Editor): PatchedEditor {
  return editor as unknown as PatchedEditor
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
