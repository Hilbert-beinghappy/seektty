import { describe, expect, it, vi } from 'vitest'
import {
  offsetForTrackRow,
  paintScrollbar,
  scrollbarHitRegions,
  scrollbarModel,
  SCROLLBAR_MIN_WIDTH,
} from '../src/client/scrollbar.ts'
import { color } from '../src/client/theme.ts'

function strip(value: string): string {
  return value.replace(/\u001B\[[0-9;:]*m/gu, '')
}

describe('resident scrollbar geometry', () => {
  it('draws a full-height disabled thumb when there is no overflow', () => {
    const model = scrollbarModel({
      rows: 8,
      contentWidth: 40,
      startOffset: 0,
      loadedTotal: 5,
      estimated: false,
      hasMore: false,
      hasNewer: false,
      loadingOlder: false,
    })
    expect(model.overflow).toBe(false)
    expect(model.thumbSize).toBe(8)
    const cells = paintScrollbar(model).map(strip)
    expect(cells.every(cell => cell === '▐' || cell === '│')).toBe(true)
    expect(cells[0]).toBe('▐')
  })

  it('sizes the thumb from the loaded range when content overflows', () => {
    const model = scrollbarModel({
      rows: 10,
      contentWidth: 40,
      startOffset: 20,
      loadedTotal: 40,
      estimated: false,
      hasMore: false,
      hasNewer: true,
      loadingOlder: false,
    })
    expect(model.overflow).toBe(true)
    expect(model.thumbSize).toBeLessThan(10)
    expect(model.thumbTop).toBeGreaterThan(0)
    const cells = paintScrollbar(model).map(strip)
    expect(cells[cells.length - 1]).toBe('▾')
  })

  it('uses a distinct older end-cap while unloaded history remains', () => {
    const model = scrollbarModel({
      rows: 8,
      contentWidth: 40,
      startOffset: 0,
      loadedTotal: 20,
      estimated: false,
      hasMore: true,
      hasNewer: false,
      loadingOlder: false,
    })
    expect(strip(paintScrollbar(model)[0] ?? '')).toBe('▴')
  })

  it('changes only the older cap glyph while loading, without timers', () => {
    const model = scrollbarModel({
      rows: 8,
      contentWidth: 40,
      startOffset: 0,
      loadedTotal: 20,
      estimated: false,
      hasMore: true,
      hasNewer: false,
      loadingOlder: true,
    })
    expect(strip(paintScrollbar(model)[0] ?? '')).toBe('⇡')
  })

  it('flags estimated totals instead of advertising a fake absolute range', () => {
    const model = scrollbarModel({
      rows: 8,
      contentWidth: 40,
      startOffset: 4,
      loadedTotal: 12,
      estimated: true,
      hasMore: true,
      hasNewer: false,
      loadingOlder: false,
    })
    expect(model.estimated).toBe(true)
    expect(model.startOffset).toBeLessThanOrEqual(model.loadedTotal)
    const jumped = offsetForTrackRow(model, model.rows - 1)
    expect(jumped).toBeLessThanOrEqual(Math.max(model.loadedTotal, model.viewportRows))
  })

  it('registers track and cap hit regions in the last column', () => {
    const model = scrollbarModel({
      rows: 12,
      contentWidth: 40,
      startOffset: 10,
      loadedTotal: 40,
      estimated: false,
      hasMore: true,
      hasNewer: true,
      loadingOlder: false,
    })
    const regions = scrollbarHitRegions({ col: 0, row: 2, width: 80, height: 12 }, model)
    expect(regions.some(region => region.id === 'transcript:scrollbar:cap-older')).toBe(true)
    expect(regions.some(region => region.id === 'transcript:scrollbar:thumb')).toBe(true)
    expect(regions.every(region => region.rect.col === 79)).toBe(true)
    expect(regions.every(region => region.rect.width === 1)).toBe(true)
    expect(regions.every(region => region.hover === 'highlight')).toBe(true)
    expect(regions.find(region => region.id.endsWith(':thumb'))?.activation).toBe('drag')
  })

  it('changes only the hovered scrollbar part presentation', () => {
    const brand = vi.spyOn(color, 'brand')
    const model = scrollbarModel({
      rows: 10,
      contentWidth: 40,
      startOffset: 20,
      loadedTotal: 40,
      estimated: false,
      hasMore: true,
      hasNewer: true,
      loadingOlder: false,
    })
    const normal = paintScrollbar(model)
    const hovered = paintScrollbar(model, 'cap-older')
    expect(strip(hovered[0] ?? '')).toBe(strip(normal[0] ?? ''))
    expect(brand).toHaveBeenCalledWith('▴')
    expect(hovered.slice(1)).toEqual(normal.slice(1))
    brand.mockRestore()
  })

  it('keeps the minimum terminal width at 12 columns', () => {
    expect(SCROLLBAR_MIN_WIDTH).toBe(12)
  })
})
