/** Stable, target-aware choices for the application-owned mouse context menu. */

import { Key, matchesKey, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { SearchSelectOverlay, type OverlayChoice, type SelectOverlayRequest } from './overlays.ts'
import { ui } from './locale.ts'
import {
  hitTest,
  pointInRect,
  type CellPoint,
  type CellRect,
  type HitMapSnapshot,
  type HitRegion,
  type TuiFrameGeometry,
} from './mouse-hit-map.ts'
import type { MouseSemanticEvent } from './mouse-controller.ts'
import type { ContextActionItem, ContextActionNode } from './context-actions.ts'

type Click = Extract<MouseSemanticEvent, { kind: 'click' }>
type ReopenMenu = (point: CellPoint, target: HitRegion | undefined) => void

interface MenuLayer {
  readonly id: number
  readonly depth: 0 | 1
  readonly nodes: readonly ContextActionNode[]
  readonly view: ContextMenuView
  readonly handle: OverlayHandle
  readonly parentOptionId?: string
  rect?: CellRect
}

interface MenuSession {
  readonly resolve: (value: ContextActionItem | undefined) => void
  readonly valid: () => boolean
  readonly columns: number
  readonly rows: number
  readonly layers: MenuLayer[]
}

interface PendingMenu {
  readonly point: CellPoint
  readonly reopen: ReopenMenu
  readonly valid: () => boolean
  readonly columns: number
  readonly rows: number
}

function actionable(nodes: readonly ContextActionNode[]): readonly ContextActionNode[] {
  return nodes.filter(node => node.kind !== 'separator')
}

function choiceOf(node: ContextActionNode): OverlayChoice | undefined {
  if (node.kind === 'separator') return undefined
  return {
    id: node.id,
    label: `${node.kind === 'action' && node.danger === true ? '! ' : ''}${node.label}${node.kind === 'submenu' ? '  ›' : ''}`,
    ...(node.description === undefined ? {} : { description: node.description }),
    ...(node.kind === 'action' && node.disabledReason !== undefined
      ? { disabledReason: node.disabledReason }
      : {}),
  }
}

class ContextMenuView extends SearchSelectOverlay {
  constructor(
    request: SelectOverlayRequest,
    private readonly nodes: readonly ContextActionNode[],
    submit: (node: ContextActionNode) => void,
    private readonly cancel: () => void,
    private readonly back: () => void,
    private readonly expand: (optionId: string) => void,
    private readonly valid: () => boolean,
  ) {
    super(request, (choice) => {
      const node = nodes.find(candidate => candidate.id === choice.id)
      if (node !== undefined && node.kind !== 'separator') submit(node)
    })
  }

  node(optionId: string | undefined): ContextActionNode | undefined {
    return optionId === undefined ? undefined : this.nodes.find(candidate => candidate.id === optionId)
  }

  override handleInput(data: string): void {
    if (!this.valid() || matchesKey(data, Key.ctrl('c'))) {
      this.cancel()
      return
    }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.left)) {
      this.back()
      return
    }
    if (matchesKey(data, Key.right)) {
      const selected = this.selectedChoiceId()
      if (selected !== undefined) this.expand(selected)
      return
    }
    super.handleInput(data)
  }
}

/** One transient popup tree, separate from the modal queue and its Back stack. */
export class ContextMenuController {
  private active: MenuSession | undefined
  private pending: PendingMenu | undefined
  private underlay: HitMapSnapshot | undefined
  private sequence = 0
  private hoverTimer: NodeJS.Timeout | undefined

  constructor(private readonly tui: TUI, private readonly onChange: () => void = () => undefined) {}

  hasActive(): boolean { return this.active !== undefined || this.pending !== undefined }

  open(request: {
    readonly point: CellPoint
    readonly choices: readonly OverlayChoice[]
    readonly valid: () => boolean
    readonly title?: string
  }): Promise<OverlayChoice | undefined>
  open(request: {
    readonly point: CellPoint
    readonly title: string
    readonly nodes: readonly ContextActionNode[]
    readonly valid: () => boolean
  }): Promise<ContextActionItem | undefined>
  open(request: {
    readonly point: CellPoint
    readonly title?: string
    readonly nodes?: readonly ContextActionNode[]
    readonly choices?: readonly OverlayChoice[]
    readonly valid: () => boolean
  }): Promise<ContextActionItem | undefined> {
    this.close()
    if (!request.valid()) return Promise.resolve(undefined)
    return new Promise(resolve => {
      const session: MenuSession = {
        resolve,
        valid: request.valid,
        columns: this.tui.terminal.columns,
        rows: this.tui.terminal.rows,
        layers: [],
      }
      this.active = session
      const nodes = request.nodes ?? (request.choices ?? []).map((choice): ContextActionNode => ({
        kind: 'action',
        id: choice.id,
        label: choice.label,
        ...(choice.description === undefined ? {} : { description: choice.description }),
        ...(choice.disabledReason === undefined ? {} : { disabledReason: choice.disabledReason }),
      }))
      this.showLayer(session, request.title ?? ui('文本操作', 'Text actions'), nodes, request.point, 0)
      this.changed()
    })
  }

  close(): void {
    this.cancelHoverTimer()
    const pending = this.pending !== undefined
    this.pending = undefined
    if (this.active !== undefined) this.finish(undefined)
    else if (pending) this.changed()
  }

  private finish(value: ContextActionItem | undefined): void {
    const session = this.active
    if (session === undefined) return
    this.cancelHoverTimer()
    this.active = undefined
    for (const layer of [...session.layers].reverse()) layer.handle.hide()
    session.resolve(value)
    this.changed()
  }

  private changed(): void {
    this.onChange()
    this.tui.requestRender()
  }

  private showLayer(
    session: MenuSession,
    title: string,
    nodes: readonly ContextActionNode[],
    point: CellPoint,
    depth: 0 | 1,
    parentOptionId?: string,
  ): void {
    const id = ++this.sequence
    const visibleNodes = actionable(nodes)
    let layer: MenuLayer
    const view = new ContextMenuView({
      title,
      choices: visibleNodes.flatMap(node => {
        const choice = choiceOf(node)
        return choice === undefined ? [] : [choice]
      }),
      searchable: false,
      maxVisible: Math.min(12, Math.max(1, this.tui.terminal.rows - 5)),
    }, visibleNodes, node => {
      if (!session.valid() || this.active !== session) return
      if (node.kind === 'submenu') this.expand(layer, node.id)
      else if (node.kind === 'action' && node.disabledReason === undefined) this.finish(node)
    }, () => { this.finish(undefined) }, () => {
      if (depth === 1) this.closeChild(session)
      else this.finish(undefined)
    }, optionId => { this.expand(layer, optionId) }, session.valid)
    const handle = this.tui.showOverlay(view, {
      width: 40,
      minWidth: 28,
      maxHeight: '100%',
      margin: 1,
      row: point.row,
      col: point.col,
    })
    layer = {
      id,
      depth,
      nodes: visibleNodes,
      view,
      handle,
      ...(parentOptionId === undefined ? {} : { parentOptionId }),
    }
    session.layers.push(layer)
  }

  private expand(layer: MenuLayer, optionId: string): void {
    const session = this.active
    if (session === undefined || layer.depth !== 0 || !session.valid()) return
    const node = layer.view.node(optionId)
    if (node?.kind !== 'submenu') return
    const existing = session.layers[1]
    if (existing?.parentOptionId === optionId) return
    this.closeChild(session)
    if (layer.rect === undefined) return
    const hit = layer.view.hitChildren().find(candidate =>
      candidate.action.kind === 'overlay' && candidate.action.optionId === optionId)
    if (hit === undefined) return
    const right = layer.rect.col + layer.rect.width - 1
    const estimatedWidth = 40
    const col = this.tui.terminal.columns - right >= 28
      ? right
      : Math.max(0, layer.rect.col - estimatedWidth + 1)
    const row = Math.max(0, layer.rect.row + hit.rect.row)
    this.showLayer(session, node.label, node.children, { col, row }, 1, optionId)
    this.changed()
  }

  private closeChild(session: MenuSession): void {
    this.cancelHoverTimer()
    let changed = false
    while (session.layers.length > 1) {
      session.layers.pop()?.handle.hide()
      changed = true
    }
    if (changed) this.changed()
  }

  /** All keys stay with the popup, including the gap before an outside-right-click reopens it. */
  handleInput(data: string): boolean {
    if (this.pending !== undefined) { this.close(); return true }
    const session = this.active
    if (session === undefined) return false
    session.layers.at(-1)?.view.handleInput(data)
    this.tui.requestRender()
    return true
  }

  handleClick(click: Click, reopen: ReopenMenu): boolean {
    if (this.pending !== undefined) return true
    const session = this.active
    if (session === undefined) return false
    if (click.suppressed) return true
    if (!this.ownerValid(session)) { this.close(); return true }
    const regionAction = click.region?.action
    const layer = regionAction?.kind === 'context-menu'
      ? session.layers.find(candidate => candidate.id === regionAction.menuId)
      : undefined
    if (layer === undefined || layer.rect === undefined || !pointInRect(click.point, layer.rect)) {
      const valid = session.valid
      const columns = session.columns
      const rows = session.rows
      this.close()
      if (click.button === 'right') this.pending = { point: click.point, reopen, valid, columns, rows }
      return true
    }
    const action = click.region?.action
    if (click.button === 'left' && action?.kind === 'context-menu' && action.optionId !== undefined) {
      const result = layer.view.handleOptionClick(action.optionId)
      if (result === 'focused' || result === 'activated') layer.view.activateArmedOption()
    }
    return true
  }

  handleHover(region?: HitRegion): boolean {
    const session = this.active
    if (session === undefined) return false
    const action = region?.action
    const layer = action?.kind === 'context-menu'
      ? session.layers.find(candidate => candidate.id === action.menuId)
      : undefined
    let changed = false
    for (const candidate of session.layers) {
      if (candidate === layer) changed = candidate.view.handleHover(action?.kind === 'context-menu' ? action.optionId : undefined) || changed
      else if (candidate.depth === 1) changed = candidate.view.handleHover() || changed
    }
    this.cancelHoverTimer()
    if (layer?.depth === 0 && action?.kind === 'context-menu' && action.optionId !== undefined) {
      const node = layer.view.node(action.optionId)
      if (node?.kind === 'submenu') {
        this.hoverTimer = setTimeout(() => {
          this.hoverTimer = undefined
          if (this.active === session && session.valid()) this.expand(layer, node.id)
        }, 250)
        this.hoverTimer.unref()
      } else if (session.layers.length > 1) {
        this.closeChild(session)
        changed = true
      }
    }
    return changed
  }

  private cancelHoverTimer(): void {
    if (this.hoverTimer !== undefined) clearTimeout(this.hoverTimer)
    this.hoverTimer = undefined
  }

  private ownerValid(session: MenuSession): boolean {
    const top = session.layers.at(-1)
    return session.valid() && top?.handle.isFocused() === true
      && session.columns === this.tui.terminal.columns && session.rows === this.tui.terminal.rows
  }

  /** Undefined: no popup. Null: owner/frame invalid, consume. Otherwise continue on this frame. */
  dismissForGesture(): HitMapSnapshot | null | undefined {
    if (!this.hasActive()) return undefined
    const session = this.active
    const pending = this.pending
    const valid = session !== undefined
      ? this.ownerValid(session)
      : pending?.valid() === true && pending.columns === this.tui.terminal.columns && pending.rows === this.tui.terminal.rows
    const base = this.underlay
    this.close()
    return valid && base?.terminalWidth === this.tui.terminal.columns && base.terminalHeight === this.tui.terminal.rows
      ? base : null
  }

  /** Called after the shared renderer freezes its actual, edge-clamped screen geometry. */
  decorateHitMap(base: HitMapSnapshot, geometry: TuiFrameGeometry): HitMapSnapshot {
    this.underlay = base
    const pending = this.pending
    if (pending !== undefined) {
      if (!pending.valid() || pending.columns !== geometry.terminalWidth || pending.rows !== geometry.terminalHeight) {
        this.close()
        return { ...base, regions: [] }
      }
      this.pending = undefined
      pending.reopen(pending.point, hitTest(base, pending.point)?.region)
      return { ...base, regions: [] }
    }
    const session = this.active
    if (session === undefined) return base
    if (!this.ownerValid(session)) {
      this.close()
      return { ...base, regions: [] }
    }
    const rects = geometry.overlays.filter(overlay => overlay.capturing).slice(-session.layers.length)
    if (rects.length !== session.layers.length) return { ...base, regions: [] }
    for (let index = 0; index < session.layers.length; index += 1) {
      const rect = rects[index]
      if (rect !== undefined) session.layers[index]!.rect = rect
    }
    const zIndex = Math.max(1_000, ...base.regions.map(region => region.zIndex)) + 1
    const root = session.layers[0]
    if (root === undefined) return base
    const blocker: HitRegion = {
      id: `context-menu:${root.id}:outside`,
      rect: { col: 0, row: 0, width: base.terminalWidth, height: base.terminalHeight },
      zIndex,
      role: 'passive',
      enabled: true,
      activation: 'none',
      hover: 'none',
      action: { kind: 'context-menu', menuId: root.id },
    }
    const regions: HitRegion[] = [...base.regions, blocker]
    for (const [index, layer] of session.layers.entries()) {
      const rect = layer.rect
      if (rect === undefined) continue
      const layerZ = zIndex + 1 + index * 3
      const action = { kind: 'context-menu' as const, menuId: layer.id }
      regions.push({ ...blocker, id: `context-menu:${layer.id}:body`, rect, zIndex: layerZ, action })
      for (const hit of layer.view.hitChildren()) {
        if (hit.action.kind !== 'overlay' || hit.action.optionId === undefined) continue
        const col = rect.col + hit.rect.col
        const row = rect.row + hit.rect.row
        const width = Math.min(hit.rect.width, rect.col + rect.width - col)
        const height = Math.min(hit.rect.height, rect.row + rect.height - row)
        if (width <= 0 || height <= 0) continue
        regions.push({
          ...hit,
          id: `context-menu:${layer.id}:${hit.action.optionId}`,
          rect: { col, row, width, height },
          zIndex: layerZ + 1,
          role: 'button',
          activation: 'direct',
          action: { ...action, optionId: hit.action.optionId },
        })
      }
    }
    return { ...base, regions }
  }
}

/** Stable text-editing action tree shared by every editable and read-only surface. */
export function mouseContextActions(options: {
  readonly target: 'transcript' | 'composer' | 'overlay' | 'overlay-input'
  readonly hasSelection: boolean
  readonly pasteSupported: boolean
  readonly undoSupported?: boolean
}): readonly ContextActionNode[] {
  const disabledSelection = options.hasSelection ? undefined : ui('没有选中的文本', 'No text is selected')
  const copy: ContextActionNode = {
    id: 'copy',
    kind: 'action',
    label: ui('复制所选文本', 'Copy selected text'),
    ...(disabledSelection === undefined ? {} : { disabledReason: disabledSelection }),
  }
  const close: ContextActionNode = { id: 'close', kind: 'action', label: ui('关闭', 'Close') }
  if (options.target === 'transcript' || options.target === 'overlay') return [copy, close]
  const paste: ContextActionNode = {
    id: 'paste',
    kind: 'action',
    label: ui('粘贴纯文本', 'Paste plain text'),
    ...(options.pasteSupported ? {} : { disabledReason: ui('此平台没有受支持的安全剪贴板读取器', 'No supported safe clipboard reader exists on this platform') }),
  }
  return [
    { id: 'undo', kind: 'action', label: ui('撤销', 'Undo'), ...(options.undoSupported === false ? { disabledReason: ui('当前输入无法撤销', 'The current input cannot be undone') } : {}) },
    { id: 'cut', kind: 'action', label: ui('剪切', 'Cut'), ...(disabledSelection === undefined ? {} : { disabledReason: disabledSelection }) },
    paste,
    { id: 'delete', kind: 'action', label: ui('删除选区', 'Delete selection'), ...(disabledSelection === undefined ? {} : { disabledReason: disabledSelection }) },
    { id: 'select-all', kind: 'action', label: ui('全选', 'Select all') },
    { id: 'text-common', kind: 'separator' },
    copy,
    close,
  ]
}

/** @deprecated Compatibility adapter for callers that still consume flat choices. */
export function mouseContextChoices(options: {
  readonly target: 'transcript' | 'composer' | 'overlay' | 'overlay-input'
  readonly hasSelection: boolean
  readonly pasteSupported: boolean
}): readonly OverlayChoice[] {
  return mouseContextActions(options).flatMap(node => {
    const choice = choiceOf(node)
    return choice === undefined ? [] : [choice]
  })
}
