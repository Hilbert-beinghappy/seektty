import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import { createMouseController, DOUBLE_CLICK_MS, FOCUS_GUARD_MS } from '../src/client/mouse-controller.ts'
import { HitMapBuilder, emptyHitMap, type HitMapSnapshot, type TuiFrameGeometry } from '../src/client/mouse-hit-map.ts'
import type { MouseInput } from '../src/client/mouse-protocol.ts'

const geometry: TuiFrameGeometry = {
  terminalWidth: 80,
  terminalHeight: 24,
  rootScreenOrigin: { col: 0, row: 0 },
  rootSliceOffset: 0,
  overlays: [],
}

function snapshot(generation: number, role: 'text' | 'button' = 'text'): HitMapSnapshot {
  return new HitMapBuilder(generation)
    .add({
      id: role === 'button' ? 'transcript:tool:a' : 'transcript:text',
      rect: { col: 0, row: 0, width: 80, height: 20 },
      zIndex: 10,
      role,
      enabled: true,
      action: { kind: 'transcript', command: role === 'button' ? 'toggle' : 'select' },
    })
    .freeze(geometry)
}

function press(point = { col: 2, row: 2 }): MouseInput {
  return { kind: 'press', button: 'left', point, modifiers: { shift: false, alt: false, ctrl: false } }
}

function release(point = { col: 2, row: 2 }): MouseInput {
  return { kind: 'release', button: 'left', point, modifiers: { shift: false, alt: false, ctrl: false } }
}

function wheel(delta: 1 | -1, point = { col: 2, row: 2 }): MouseInput {
  return {
    kind: 'wheel',
    axis: 'vertical',
    delta,
    point,
    modifiers: { shift: false, alt: false, ctrl: false },
  }
}

describe('mouse controller skeleton', () => {
  it('scales each protocol detent by wheelScrollLines=3', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    })
    const up = controller.handle(wheel(1))
    expect(up.scrollTranscript).toBe(3)
    expect(up.requestRender).toBe(true)
    expect(controller.handle(wheel(-1)).scrollTranscript).toBe(-3)
  })

  it('consumes native-mode wheels without scrolling', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, mouseMode: 'native' }),
    })
    const outcome = controller.handle(wheel(1))
    expect(outcome.consume).toBe(true)
    expect(outcome.scrollTranscript).toBeUndefined()
  })

  it('emits one semantic click per release and counts double/triple clicks', () => {
    let now = 1_000
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      now: () => now,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press())
    const first = controller.handle(release())
    expect(first.semantic).toMatchObject({ kind: 'click', count: 1, suppressed: false })
    now += 10
    controller.handle(press())
    const second = controller.handle(release())
    expect(second.semantic).toMatchObject({ kind: 'click', count: 2 })
    now += 10
    controller.handle(press())
    const third = controller.handle(release())
    expect(third.semantic).toMatchObject({ kind: 'click', count: 3 })
    expect(first.semantic?.kind === 'click' && second.semantic?.kind === 'click').toBe(true)
  })

  it('does not fire a click after the pointer moves to another cell', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press({ col: 1, row: 1 }))
    controller.handle({
      kind: 'drag',
      button: 'left',
      point: { col: 4, row: 4 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    const released = controller.handle(release({ col: 4, row: 4 }))
    expect(released.semantic?.kind).not.toBe('click')
  })

  it('drops a release when the hit-map generation changed', () => {
    let generation = 1
    const controller = createMouseController({
      getHitMap: () => snapshot(generation),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press())
    generation = 2
    const released = controller.handle(release())
    expect(released.semantic).toBeUndefined()
    expect(released.consume).toBe(true)
  })

  it('suppresses the first click after FocusOut then FocusIn', () => {
    let now = 5_000
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      now: () => now,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle({ kind: 'focus', focused: false })
    controller.handle({ kind: 'focus', focused: true })
    expect(controller.hasReliableFocusProtocol).toBe(true)
    expect(controller.isFocusGuarded).toBe(true)
    controller.handle(press())
    const clicked = controller.handle(release())
    expect(clicked.semantic).toMatchObject({ kind: 'click', suppressed: true })
    now += Math.max(FOCUS_GUARD_MS, DOUBLE_CLICK_MS) + 1
    controller.handle(press())
    const later = controller.handle(release())
    expect(later.semantic).toMatchObject({ kind: 'click', suppressed: false })
  })

  it('clears timers on dispose so no gesture remains', () => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: (handler, ms) => {
        const id = setTimeout(handler, ms)
        timers.add(id)
        return id
      },
      clearTimeout: (id) => {
        timers.delete(id)
        clearTimeout(id)
      },
    })
    controller.handle(press())
    controller.handle(release())
    controller.dispose()
    expect(controller.gesture).toBe('idle')
    expect(timers.size).toBe(0)
    expect(DOUBLE_CLICK_MS).toBe(400)
  })

  it('does not scroll the transcript when a capturing overlay owns the wheel', () => {
    const overlayMap = new HitMapBuilder(1)
      .addCapturingOverlay({
        overlayId: '1',
        viewport: { col: 0, row: 0, width: 80, height: 24 },
        overlay: { col: 10, row: 4, width: 40, height: 10 },
        zOrder: 0,
      })
      .freeze(geometry)
    const controller = createMouseController({
      getHitMap: () => overlayMap,
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    })
    const outcome = controller.handle(wheel(1, { col: 2, row: 2 }))
    expect(outcome.consume).toBe(true)
    expect(outcome.scrollTranscript).toBeUndefined()
    expect(outcome.semantic).toMatchObject({ kind: 'wheel', axis: 'vertical' })
  })

  it('consumes a miss without scrolling', () => {
    const controller = createMouseController({
      getHitMap: () => emptyHitMap(1, 80, 24),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    })
    const outcome = controller.handle(wheel(1, { col: 70, row: 22 }))
    expect(outcome.consume).toBe(true)
    expect(outcome.scrollTranscript).toBeUndefined()
  })

  it('accelerates same-direction detents and resets after 120ms', () => {
    let now = 10_000
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      now: () => now,
    })
    expect(controller.handle(wheel(1)).scrollTranscript).toBe(3)
    now += 50
    expect(controller.handle(wheel(1)).scrollTranscript).toBe(6)
    now += 50
    expect(controller.handle(wheel(1)).scrollTranscript).toBe(9)
    now += 50
    expect(controller.handle(wheel(1)).scrollTranscript).toBe(12)
    now += 121
    expect(controller.handle(wheel(1)).scrollTranscript).toBe(3)
  })

  it('counts extra wheels in the same frame as coalesced', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, wheelAcceleration: false }),
    })
    controller.handle(wheel(1))
    controller.noteCoalescedWheel()
    controller.handle(wheel(1))
    controller.recordMouseRender()
    expect(controller.metrics.coalescedWheelEvents).toBe(1)
    expect(controller.metrics.mouseRenderRequests).toBe(1)
  })
})
