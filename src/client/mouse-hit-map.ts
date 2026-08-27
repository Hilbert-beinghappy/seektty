/** Current-frame hit regions, screen-coordinate finalization, and z-order query. */

import type { CellPoint } from './mouse-protocol.ts'

export type { CellPoint }

export interface CellRect {
  readonly col: number
  readonly row: number
  readonly width: number
  readonly height: number
}

export type HitRole = 'text' | 'scrollbar' | 'button' | 'option' | 'input' | 'link' | 'passive'
export type HitActivationPolicy = 'none' | 'select' | 'direct' | 'arm' | 'enter-only' | 'drag'
export type HitHoverPolicy = 'none' | 'highlight'

export type MouseAction =
  | { readonly kind: 'focus'; readonly targetId: string }
  | { readonly kind: 'transcript'; readonly command: string; readonly targetKey?: string }
  | { readonly kind: 'composer'; readonly command: string; readonly logicalOffset?: number }
  | { readonly kind: 'overlay'; readonly command: string; readonly optionId?: string }
  | { readonly kind: 'chrome'; readonly commandId: string }

export interface HitRegion {
  readonly id: string
  readonly rect: CellRect
  readonly zIndex: number
  readonly role: HitRole
  readonly enabled: boolean
  readonly activation?: HitActivationPolicy
  readonly hover?: HitHoverPolicy
  readonly action: MouseAction
}

export interface OverlayScreenRect {
  readonly row: number
  readonly col: number
  readonly width: number
  readonly height: number
  readonly zOrder: number
  readonly capturing: boolean
}

export interface TuiFrameGeometry {
  readonly terminalWidth: number
  readonly terminalHeight: number
  readonly rootScreenOrigin: CellPoint
  readonly rootSliceOffset: number
  readonly overlays: readonly OverlayScreenRect[]
}

export interface HitMapSnapshot {
  readonly generation: number
  readonly terminalWidth: number
  readonly terminalHeight: number
  readonly regions: readonly HitRegion[]
}

/** z-band strictly above every chrome/transcript region. */
export const OVERLAY_CAPTURE_Z_BAND = 1_000

const EMPTY_ACTION: MouseAction = { kind: 'focus', targetId: 'none' }

export function pointInRect(point: CellPoint, rect: CellRect): boolean {
  return point.col >= rect.col
    && point.row >= rect.row
    && point.col < rect.col + rect.width
    && point.row < rect.row + rect.height
}

export function translateRect(rect: CellRect, origin: CellPoint): CellRect {
  return {
    col: rect.col + origin.col,
    row: rect.row + origin.row,
    width: rect.width,
    height: rect.height,
  }
}

export function rectArea(rect: CellRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function samePoint(left: CellPoint, right: CellPoint): boolean {
  return left.col === right.col && left.row === right.row
}

/** Whether two press/release points occupy the same cell. */
export function sameCell(left: CellPoint, right: CellPoint): boolean {
  return samePoint(left, right)
}

export class HitMapBuilder {
  private readonly regions: HitRegion[] = []
  private readonly screenRegions: HitRegion[] = []

  constructor(readonly generation: number) {}

  add(region: HitRegion): this {
    if (region.rect.width <= 0 || region.rect.height <= 0) return this
    this.regions.push(region)
    return this
  }

  addLocal(region: Omit<HitRegion, 'rect'> & { readonly rect: CellRect }, origin: CellPoint): this {
    return this.add({ ...region, rect: translateRect(region.rect, origin) })
  }

  addCapturingOverlay(options: {
    readonly overlayId: string
    readonly viewport: CellRect
    readonly overlay: CellRect
    readonly zOrder: number
    readonly children?: readonly HitRegion[]
  }): this {
    if (options.viewport.width > 0 && options.viewport.height > 0) {
      this.screenRegions.push({
        id: `overlay:${options.overlayId}:blocker`,
        rect: options.viewport,
        zIndex: OVERLAY_CAPTURE_Z_BAND,
        role: 'passive',
        enabled: true,
        activation: 'none',
        hover: 'none',
        action: { kind: 'overlay', command: 'consume' },
      })
    }
    this.add({
      id: `overlay:${options.overlayId}:body`,
      rect: options.overlay,
      zIndex: OVERLAY_CAPTURE_Z_BAND + 1 + options.zOrder,
      role: 'passive',
      enabled: true,
      activation: 'none',
      hover: 'none',
      action: { kind: 'overlay', command: 'consume' },
    })
    for (const child of options.children ?? []) {
      this.add({
        ...child,
        rect: translateRect(child.rect, { col: options.overlay.col, row: options.overlay.row }),
        zIndex: Math.max(child.zIndex, OVERLAY_CAPTURE_Z_BAND + 2 + options.zOrder),
      })
    }
    return this
  }

  freeze(geometry: TuiFrameGeometry): HitMapSnapshot {
    const origin = {
      col: geometry.rootScreenOrigin.col,
      row: geometry.rootScreenOrigin.row - geometry.rootSliceOffset,
    }
    const translated = this.regions.map(region => (
      geometry.rootSliceOffset === 0 && origin.col === 0 && origin.row === 0
        ? region
        : { ...region, rect: translateRect(region.rect, origin) }
    ))
    return {
      generation: this.generation,
      terminalWidth: geometry.terminalWidth,
      terminalHeight: geometry.terminalHeight,
      regions: [...translated, ...this.screenRegions],
    }
  }
}

export function viewportRect(geometry: TuiFrameGeometry): CellRect {
  return {
    col: 0,
    row: 0,
    width: geometry.terminalWidth,
    height: geometry.terminalHeight,
  }
}

export function finalizeHitMap(
  builder: HitMapBuilder,
  geometry: TuiFrameGeometry,
  capturingOverlay?: {
    readonly overlayId: string
    readonly children?: readonly HitRegion[]
  },
): HitMapSnapshot {
  if (capturingOverlay !== undefined) {
    const overlay = geometry.overlays.find(entry => entry.capturing)
      ?? geometry.overlays.at(-1)
    if (overlay !== undefined) {
      builder.addCapturingOverlay({
        overlayId: capturingOverlay.overlayId,
        viewport: viewportRect(geometry),
        overlay: {
          col: overlay.col,
          row: overlay.row,
          width: overlay.width,
          height: overlay.height,
        },
        zOrder: overlay.zOrder,
        ...(capturingOverlay.children === undefined ? {} : { children: capturingOverlay.children }),
      })
    }
  }
  return builder.freeze(geometry)
}

export function hitTest(
  snapshot: HitMapSnapshot,
  point: CellPoint,
): { readonly region: HitRegion; readonly candidates: number } | undefined {
  const hits = snapshot.regions.filter(region => pointInRect(point, region.rect))
  if (hits.length === 0) return undefined
  const capturing = hits.filter(region => region.zIndex >= OVERLAY_CAPTURE_Z_BAND)
  const candidates = capturing.length > 0 ? capturing : hits
  const ranked = [...candidates].sort((left, right) => {
    if (right.zIndex !== left.zIndex) return right.zIndex - left.zIndex
    if (left.zIndex < OVERLAY_CAPTURE_Z_BAND) return rectArea(left.rect) - rectArea(right.rect)
    return 0
  })
  const region = ranked[0]
  return region === undefined ? undefined : { region, candidates: hits.length }
}

export function emptyHitMap(generation: number, width: number, height: number): HitMapSnapshot {
  return {
    generation,
    terminalWidth: width,
    terminalHeight: height,
    regions: [],
  }
}

export function emptyAction(): MouseAction {
  return EMPTY_ACTION
}
