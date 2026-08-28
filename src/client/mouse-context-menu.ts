/** Stable, target-aware choices for the application-owned mouse context menu. */

import { Key, matchesKey, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { SearchSelectOverlay, type OverlayChoice, type SelectOverlayRequest } from './overlays.ts'
import { ui } from './locale.ts'
import { hitTest, pointInRect, type CellPoint, type CellRect, type HitMapSnapshot, type HitRegion, type TuiFrameGeometry } from './mouse-hit-map.ts'
import type { MouseSemanticEvent } from './mouse-controller.ts'

type Click = Extract<MouseSemanticEvent, { kind: 'click' }>
type ReopenMenu = (point: CellPoint, target: HitRegion | undefined) => void

interface MenuEntry {
  readonly id: number
  readonly view: SearchSelectOverlay
  readonly handle: OverlayHandle
  readonly resolve: (value: OverlayChoice | undefined) => void
  readonly valid: () => boolean
  readonly columns: number
  readonly rows: number
  rect?: CellRect
}

class ContextMenuView extends SearchSelectOverlay {
  constructor(request: SelectOverlayRequest, submit: (choice: OverlayChoice) => void,
    private readonly cancel: () => void, private readonly valid: () => boolean) {
    super(request, submit)
  }

  override handleInput(data: string): void {
    if (!this.valid() || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) this.cancel()
    else super.handleInput(data)
  }
}

/** One transient popup, separate from the modal queue and its Back stack. */
export class ContextMenuController {
  private active: MenuEntry | undefined
  private pending: { point: CellPoint; reopen: ReopenMenu; valid: () => boolean } | undefined
  private underlay: HitMapSnapshot | undefined
  private sequence = 0

  constructor(private readonly tui: TUI, private readonly onChange: () => void = () => undefined) {}

  hasActive(): boolean { return this.active !== undefined || this.pending !== undefined }

  open(request: {
    readonly point: CellPoint
    readonly choices: readonly OverlayChoice[]
    readonly valid: () => boolean
  }): Promise<OverlayChoice | undefined> {
    this.close()
    if (!request.valid()) return Promise.resolve(undefined)
    return new Promise(resolve => {
      const id = ++this.sequence
      const view = new ContextMenuView({
        title: ui('文本操作', 'Text actions'), choices: request.choices, searchable: false,
        maxVisible: Math.min(6, Math.max(1, this.tui.terminal.rows - 5)),
      }, choice => { if (this.active?.id === id && request.valid()) this.finish(choice) }, () => { this.close() }, request.valid)
      const handle = this.tui.showOverlay(view, {
        width: 38, minWidth: 28, maxHeight: '100%', margin: 1,
        row: request.point.row, col: request.point.col,
      })
      this.active = { id, view, handle, resolve, valid: request.valid, columns: this.tui.terminal.columns, rows: this.tui.terminal.rows }
      this.onChange()
      this.tui.requestRender()
    })
  }

  close(): void {
    const pending = this.pending !== undefined
    this.pending = undefined
    if (this.active !== undefined) this.finish(undefined)
    else if (pending) { this.onChange(); this.tui.requestRender() }
  }

  private finish(value: OverlayChoice | undefined): void {
    const entry = this.active
    if (entry === undefined) return
    this.active = undefined
    entry.handle.hide() // pi-tui restores the previous focus without popping a modal page.
    entry.resolve(value)
    this.onChange()
    this.tui.requestRender()
  }

  /** All keys stay with the popup, including the gap before an outside-right-click reopens it. */
  handleInput(data: string): boolean {
    if (this.pending !== undefined) { this.close(); return true }
    if (this.active === undefined) return false
    this.active.view.handleInput(data)
    this.tui.requestRender()
    return true
  }

  handleClick(click: Click, reopen: ReopenMenu): boolean {
    if (this.pending !== undefined) return true
    const entry = this.active
    if (entry === undefined) return false
    if (click.suppressed) return true
    if (!entry.valid()) { this.close(); return true }
    if (entry.rect === undefined) return true // No click may use geometry from the previous popup.
    if (!pointInRect(click.point, entry.rect)) {
      this.close()
      if (click.button === 'right') this.pending = { point: click.point, reopen, valid: () => this.ownerValid(entry) }
      return true // Dismissal never clicks a button, moves a caret, or clears a selection below.
    }
    const action = click.region?.action
    if (click.button === 'left' && action?.kind === 'context-menu' && action.menuId === entry.id && action.optionId !== undefined) {
      const result = entry.view.handleOptionClick(action.optionId)
      if (result === 'focused' || result === 'activated') entry.view.activateArmedOption()
    }
    return true // Right-clicking the menu itself never nests another menu.
  }

  handleHover(region?: HitRegion): boolean {
    const action = region?.action
    return this.active?.view.handleHover(action?.kind === 'context-menu' && action.menuId === this.active.id ? action.optionId : undefined) ?? false
  }

  private ownerValid(entry: MenuEntry): boolean {
    return entry.valid() && entry.columns === this.tui.terminal.columns && entry.rows === this.tui.terminal.rows
  }

  /** Undefined: no popup. Null: owner/frame invalid, consume. Otherwise continue on this frame. */
  dismissForGesture(): HitMapSnapshot | null | undefined {
    if (!this.hasActive()) return undefined
    const entry = this.active
    const valid = entry === undefined ? this.pending?.valid() === true : this.ownerValid(entry) && entry.handle.isFocused()
    const base = this.underlay
    this.close()
    // The popup floats above the existing layout: removing it does not move any
    // underlying cells. Keep the parent modal's capture barrier in this snapshot.
    return valid && base?.terminalWidth === this.tui.terminal.columns && base.terminalHeight === this.tui.terminal.rows
      ? base : null
  }

  /** Called after the shared renderer freezes its actual, edge-clamped screen geometry. */
  decorateHitMap(base: HitMapSnapshot, geometry: TuiFrameGeometry): HitMapSnapshot {
    this.underlay = base
    const pending = this.pending
    if (pending !== undefined) {
      if (!pending.valid()) { this.close(); return { ...base, regions: [] } }
      this.pending = undefined
      pending.reopen(pending.point, hitTest(base, pending.point)?.region)
      return { ...base, regions: [] } // The replacement becomes interactive after its own first paint.
    }
    const entry = this.active
    if (entry === undefined) return base
    if (!entry.valid() || !entry.handle.isFocused() || entry.columns !== geometry.terminalWidth || entry.rows !== geometry.terminalHeight) {
      this.close()
      return { ...base, regions: [] }
    }
    const rect = geometry.overlays.filter(overlay => overlay.capturing).at(-1)
    if (rect === undefined) return { ...base, regions: [] }
    entry.rect = rect
    const zIndex = Math.max(1_000, ...base.regions.map(region => region.zIndex)) + 1
    const action = { kind: 'context-menu' as const, menuId: entry.id }
    const blocker: HitRegion = {
      id: `context-menu:${entry.id}:outside`,
      rect: { col: 0, row: 0, width: base.terminalWidth, height: base.terminalHeight },
      zIndex, role: 'passive', enabled: true, activation: 'none', hover: 'none', action,
    }
    const children = entry.view.hitChildren().flatMap((hit): HitRegion[] => {
      if (hit.action.kind !== 'overlay' || hit.action.optionId === undefined) return []
      const col = rect.col + hit.rect.col
      const row = rect.row + hit.rect.row
      const width = Math.min(hit.rect.width, rect.col + rect.width - col)
      const height = Math.min(hit.rect.height, rect.row + rect.height - row)
      if (width <= 0 || height <= 0) return []
      return [{
        ...hit, id: `context-menu:${entry.id}:${hit.action.optionId}`, rect: { col, row, width, height },
        zIndex: zIndex + 2, role: 'button', activation: 'direct',
        action: { ...action, optionId: hit.action.optionId },
      }]
    })
    return { ...base, regions: [
      ...base.regions, blocker,
      { ...blocker, id: `context-menu:${entry.id}:body`, rect, zIndex: zIndex + 1 },
      ...children,
    ] }
  }
}

export function mouseContextChoices(options: {
  readonly target: 'transcript' | 'composer' | 'overlay' | 'overlay-input'
  readonly hasSelection: boolean
  readonly pasteSupported: boolean
}): readonly OverlayChoice[] {
  const copy = options.hasSelection ? [{ id: 'copy', label: ui('复制', 'Copy') }] : []
  const cancel = { id: 'cancel', label: ui('取消', 'Cancel') }
  const native = { id: 'native', label: ui('切换到原生选择模式', 'Switch to native selection') }
  if (options.target === 'transcript') return [...copy, native, cancel]
  if (options.target === 'overlay') return [...copy, cancel]
  const paste: OverlayChoice = {
    id: 'paste',
    label: ui('粘贴纯文本', 'Paste plain text'),
    ...(options.pasteSupported ? {} : {
      disabledReason: ui(
        '此平台没有受支持的安全剪贴板读取器',
        'No supported safe clipboard reader exists on this platform',
      ),
    }),
  }
  if (options.target === 'overlay-input') return [
    ...copy,
    ...(options.hasSelection ? [
      { id: 'cut', label: ui('剪切', 'Cut') },
      { id: 'delete', label: ui('删除选区', 'Delete selection') },
    ] : []),
    paste,
    { id: 'select-all', label: ui('全选', 'Select all') },
    cancel,
  ]
  return options.hasSelection ? [...copy, paste, cancel] : [paste, native, cancel]
}
