/** Resident transcript scrollbar geometry and glyphs. No fade, flash, or timers. */

import { visibleWidth } from '@mariozechner/pi-tui'
import type { CellRect, HitRegion } from './mouse-hit-map.ts'
import { color } from './theme.ts'
import { ui } from './locale.ts'

export const SCROLLBAR_MIN_WIDTH = 12

export interface ScrollbarModel {
  readonly rows: number
  readonly contentWidth: number
  readonly startOffset: number
  readonly viewportRows: number
  readonly loadedTotal: number
  readonly estimated: boolean
  readonly hasMore: boolean
  readonly hasNewer: boolean
  readonly loadingOlder: boolean
  readonly overflow: boolean
  readonly thumbTop: number
  readonly thumbSize: number
}

export interface ScrollbarPaint {
  readonly cells: readonly string[]
  readonly model: ScrollbarModel
}

const TRACK = '│'
const THUMB = '▐'
const OLDER = '▴'
const OLDER_LOADING = '⇡'
const NEWER = '▾'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Derive thumb geometry from the height-index snapshot.
 * Unknown history (`hasMore` or estimated entries) never places the thumb in a
 * fake unloaded absolute range: offsets are clamped to the loaded total.
 */
export function scrollbarModel(options: {
  readonly rows: number
  readonly contentWidth: number
  readonly startOffset: number
  readonly loadedTotal: number
  readonly estimated: boolean
  readonly hasMore: boolean
  readonly hasNewer: boolean
  readonly loadingOlder: boolean
}): ScrollbarModel {
  const rows = Math.max(1, Math.floor(options.rows))
  const loadedTotal = Math.max(0, options.loadedTotal)
  const overflow = loadedTotal > rows || options.hasMore || options.hasNewer
  const span = Math.max(loadedTotal, rows)
  const startOffset = clamp(options.startOffset, 0, Math.max(0, span - rows))
  const thumbSize = overflow
    ? clamp(Math.round((rows / span) * rows), 1, rows)
    : rows
  const maxTop = Math.max(0, rows - thumbSize)
  const travel = Math.max(1, span - rows)
  const thumbTop = overflow && maxTop > 0
    ? clamp(Math.round((startOffset / travel) * maxTop), 0, maxTop)
    : 0
  return {
    rows,
    contentWidth: options.contentWidth,
    startOffset,
    viewportRows: rows,
    loadedTotal,
    estimated: options.estimated,
    hasMore: options.hasMore,
    hasNewer: options.hasNewer,
    loadingOlder: options.loadingOlder,
    overflow,
    thumbTop,
    thumbSize,
  }
}

/** One cell per viewport row. End-caps replace the first/last track cells. */
export function paintScrollbar(model: ScrollbarModel, hoveredPart?: string): readonly string[] {
  const cells: string[] = Array.from({ length: model.rows }, (_, row) => {
    const inThumb = row >= model.thumbTop && row < model.thumbTop + model.thumbSize
    const glyph = inThumb ? THUMB : TRACK
    const olderTrack = row > 0 && row < Math.max(1, model.thumbTop)
    const newerTrack = row >= model.thumbTop + model.thumbSize && row < model.rows - 1
    const hovered = hoveredPart === 'thumb' && inThumb
      || hoveredPart === 'track-older' && olderTrack
      || hoveredPart === 'track-newer' && newerTrack
    return hovered ? color.brand(glyph) : color.muted(glyph)
  })
  if (model.rows === 0) return cells
  const older = model.loadingOlder ? OLDER_LOADING : model.hasMore ? OLDER : (model.overflow ? TRACK : THUMB)
  cells[0] = hoveredPart === 'cap-older' ? color.brand(older) : color.muted(older)
  const last = model.rows - 1
  if (last > 0) {
    const newer = model.hasNewer ? NEWER : (model.overflow ? TRACK : THUMB)
    cells[last] = hoveredPart === 'cap-newer' ? color.brand(newer) : color.muted(newer)
  }
  return cells
}

export function padToWidth(line: string, width: number): string {
  const current = visibleWidth(line)
  if (current >= width) return line
  return `${line}${' '.repeat(width - current)}`
}

export function appendScrollbarColumn(
  lines: readonly string[],
  cells: readonly string[],
  width: number,
): string[] {
  return lines.map((line, index) => `${padToWidth(line, Math.max(0, width - 1))}${cells[index] ?? color.muted(TRACK)}`)
}

export function scrollbarHitRegions(
  origin: CellRect,
  model: ScrollbarModel,
): HitRegion[] {
  if (origin.width <= 0 || origin.height <= 0 || model.rows <= 0) return []
  const col = origin.col + Math.max(0, origin.width - 1)
  const regions: HitRegion[] = []
  const add = (
    id: string,
    row: number,
    height: number,
    command: string,
  ): void => {
    if (height <= 0) return
    regions.push({
      id: `transcript:scrollbar:${id}`,
      rect: { col, row: origin.row + row, width: 1, height },
      zIndex: 11,
      role: 'scrollbar',
      enabled: true,
      activation: command === 'drag-thumb' ? 'drag' : 'direct',
      hover: 'highlight',
      action: { kind: 'transcript', command, targetKey: id },
    })
  }
  add('cap-older', 0, 1, model.hasMore ? 'page-older' : 'jump')
  const thumbStart = Math.max(1, model.thumbTop)
  const thumbEnd = Math.min(model.rows - 1, model.thumbTop + model.thumbSize)
  const trackOlder = Math.max(0, thumbStart - 1)
  if (trackOlder > 1) add('track-older', 1, trackOlder - 1, 'jump')
  add('thumb', thumbStart, Math.max(1, thumbEnd - thumbStart), 'drag-thumb')
  const afterThumb = thumbEnd
  const newerCap = model.rows - 1
  if (afterThumb < newerCap) add('track-newer', afterThumb, newerCap - afterThumb, 'jump')
  if (model.rows > 1) add('cap-newer', newerCap, 1, 'jump')
  return regions
}

/** Offset in the loaded height space for a click on the track or thumb. */
export function offsetForTrackRow(model: ScrollbarModel, row: number): number {
  const span = Math.max(model.loadedTotal, model.viewportRows)
  const travel = Math.max(1, span - model.viewportRows)
  const maxTop = Math.max(0, model.rows - model.thumbSize)
  const clampedRow = clamp(row, 0, Math.max(0, model.rows - 1))
  if (maxTop === 0) return 0
  return Math.round((clampedRow / maxTop) * travel)
}

export function scrollbarLabel(model: ScrollbarModel): string {
  if (model.loadingOlder) return ui('正在加载更早内容', 'Loading older content')
  if (model.hasMore) return ui('还有更早内容', 'Older content available')
  if (model.estimated) return ui('滚动位置为估算', 'Scrollbar position is estimated')
  return ''
}
