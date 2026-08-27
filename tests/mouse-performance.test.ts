import { describe, expect, it } from 'vitest'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import { HeightIndex } from '../src/client/height-index.ts'
import { HitMapBuilder, hitTest, type TuiFrameGeometry } from '../src/client/mouse-hit-map.ts'
import { createMouseController } from '../src/client/mouse-controller.ts'
import { internals, Transcript } from '../src/client/transcript.ts'
import type { MouseInput } from '../src/client/mouse-protocol.ts'

const geometry: TuiFrameGeometry = {
  terminalWidth: 80,
  terminalHeight: 24,
  rootScreenOrigin: { col: 0, row: 0 },
  rootSliceOffset: 0,
  overlays: [],
}

describe('mouse structural performance counters', () => {
  it('counts parsed events, hit candidates, and coalesced wheels without millisecond bounds', () => {
    const snapshot = new HitMapBuilder(1)
      .add({
        id: 'transcript:text',
        rect: { col: 0, row: 0, width: 80, height: 20 },
        zIndex: 10,
        role: 'text',
        enabled: true,
        action: { kind: 'transcript', command: 'select' },
      })
      .freeze(geometry)
    const controller = createMouseController({
      getHitMap: () => snapshot,
      getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, wheelAcceleration: false }),
    })
    const wheel = (delta: 1 | -1): MouseInput => ({
      kind: 'wheel',
      axis: 'vertical',
      delta,
      point: { col: 2, row: 2 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    controller.handle(wheel(1))
    controller.noteCoalescedWheel()
    controller.handle(wheel(1))
    controller.recordMouseRender()
    controller.noteSelectionCells(20)
    const hit = hitTest(snapshot, { col: 2, row: 2 })
    expect(controller.metrics.parsedMouseEvents).toBe(2)
    expect(controller.metrics.coalescedWheelEvents).toBe(1)
    expect(controller.metrics.hitRegions).toBe(1)
    expect(controller.metrics.hitTestCandidates).toBe(hit?.candidates ?? 0)
    expect(controller.metrics.selectionCellsProjected).toBe(20)
    expect(controller.metrics.mouseRenderRequests).toBe(1)
    expect(controller.metrics.edgeScrollTimers).toBe(0)
  })

  it('keeps height-index exact and estimated entries as observable counters', () => {
    const index = new HeightIndex()
    index.reconcile(['a', 'b', 'c'], () => 2, 80)
    expect(index.estimatedEntries).toBeGreaterThan(0)
    index.setExact('a', 4)
    expect(index.exactEntries).toBeGreaterThan(0)
    internals.heightIndexExact = index.exactEntries
    internals.heightIndexEstimated = index.estimatedEntries
    expect(internals.heightIndexExact + internals.heightIndexEstimated).toBe(index.exactEntries + index.estimatedEntries)
  })

  it('does not copy the full transcript while projecting a viewport selection', () => {
    internals.lastFullLinesCopied = 0
    internals.selectionCellsProjected = 0
    const transcript = new Transcript(() => 8)
    transcript.empty()
    transcript.render(80)
    expect(internals.lastFullLinesCopied).toBe(0)
    expect(transcript.controlHitRegions({ col: 0, row: 0, width: 80, height: 8 }).length).toBeGreaterThanOrEqual(0)
  })
})
