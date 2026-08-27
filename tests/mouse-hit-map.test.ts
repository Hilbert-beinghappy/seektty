import { describe, expect, it } from 'vitest'
import {
  finalizeHitMap,
  HitMapBuilder,
  hitTest,
  OVERLAY_CAPTURE_Z_BAND,
  type TuiFrameGeometry,
} from '../src/client/mouse-hit-map.ts'

const geometry: TuiFrameGeometry = {
  terminalWidth: 80,
  terminalHeight: 24,
  rootScreenOrigin: { col: 0, row: 0 },
  rootSliceOffset: 0,
  overlays: [{ row: 4, col: 10, width: 40, height: 10, zOrder: 1, capturing: true }],
}

function builder(generation = 1): HitMapBuilder {
  return new HitMapBuilder(generation)
}

describe('hit map z-order and overlay capture', () => {
  it('prefers the smaller rect only inside the same non-capturing z-band', () => {
    const snapshot = builder()
      .add({
        id: 'transcript:text',
        rect: { col: 0, row: 0, width: 80, height: 20 },
        zIndex: 10,
        role: 'text',
        enabled: true,
        action: { kind: 'transcript', command: 'select' },
      })
      .add({
        id: 'transcript:tool:a',
        rect: { col: 2, row: 4, width: 20, height: 1 },
        zIndex: 10,
        role: 'button',
        enabled: true,
        action: { kind: 'transcript', command: 'toggle', targetKey: 'a' },
      })
      .freeze(geometry)
    expect(hitTest(snapshot, { col: 3, row: 4 })?.region.id).toBe('transcript:tool:a')
    expect(hitTest(snapshot, { col: 40, row: 4 })?.region.id).toBe('transcript:text')
  })

  it('lets a capturing overlay blocker swallow chrome and composer hits', () => {
    const snapshot = finalizeHitMap(
      builder(7)
        .add({
          id: 'transcript:text',
          rect: { col: 0, row: 0, width: 80, height: 20 },
          zIndex: 10,
          role: 'text',
          enabled: true,
          action: { kind: 'transcript', command: 'select' },
        })
        .add({
          id: 'composer:input',
          rect: { col: 0, row: 21, width: 80, height: 2 },
          zIndex: 20,
          role: 'input',
          enabled: true,
          action: { kind: 'composer', command: 'caret' },
        }),
      geometry,
      { overlayId: 'confirm' },
    )
    const outside = hitTest(snapshot, { col: 2, row: 2 })
    expect(outside?.region.id).toBe('overlay:confirm:blocker')
    expect(outside?.region.zIndex).toBe(OVERLAY_CAPTURE_Z_BAND)
    const inside = hitTest(snapshot, { col: 12, row: 5 })
    expect(inside?.region.id).toBe('overlay:confirm:body')
    expect(hitTest(snapshot, { col: 2, row: 21 })?.region.id).toBe('overlay:confirm:blocker')
  })

  it('keeps overlay children above the overlay body and records frame generation', () => {
    const snapshot = finalizeHitMap(
      builder(9),
      geometry,
      {
        overlayId: 'picker',
        children: [{
          id: 'overlay:picker:option:save',
          rect: { col: 2, row: 2, width: 20, height: 1 },
          zIndex: 1,
          role: 'option',
          enabled: true,
          action: { kind: 'overlay', command: 'focus', optionId: 'save' },
        }],
      },
    )
    expect(snapshot.generation).toBe(9)
    expect(hitTest(snapshot, { col: 12, row: 6 })?.region.id).toBe('overlay:picker:option:save')
  })

  it('keeps the overlay blocker in screen space after the root is sliced', () => {
    const sliced: TuiFrameGeometry = {
      ...geometry,
      rootSliceOffset: 3,
    }
    const snapshot = finalizeHitMap(builder(4), sliced, { overlayId: 'confirm' })
    expect(hitTest(snapshot, { col: 2, row: 2 })?.region.id).toBe('overlay:confirm:blocker')
    expect(hitTest(snapshot, { col: 12, row: 2 })?.region.id).toBe('overlay:confirm:body')
    expect(hitTest(snapshot, { col: 12, row: 5 })?.region.id).toBe('overlay:confirm:body')
  })

  it('translates content-relative rects by the post-slice root origin', () => {
    const sliced: TuiFrameGeometry = {
      ...geometry,
      overlays: [],
      rootSliceOffset: 3,
      rootScreenOrigin: { col: 0, row: 0 },
    }
    const snapshot = builder()
      .addLocal({
        id: 'transcript:text',
        rect: { col: 0, row: 5, width: 80, height: 2 },
        zIndex: 10,
        role: 'text',
        enabled: true,
        action: { kind: 'transcript', command: 'select' },
      }, { col: 0, row: 0 })
      .freeze(sliced)
    expect(snapshot.regions[0]?.rect.row).toBe(2)
    expect(hitTest(snapshot, { col: 0, row: 2 })?.region.id).toBe('transcript:text')
    expect(hitTest(snapshot, { col: 0, row: 5 })).toBeUndefined()
  })
})
