import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import {
  createMouseController,
  DOUBLE_CLICK_MS,
  EDGE_SCROLL_MS,
  FOCUS_GUARD_MS,
} from '../src/client/mouse-controller.ts'
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
      activation: role === 'button' ? 'direct' : 'select',
      hover: role === 'button' ? 'highlight' : 'none',
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

function move(point = { col: 2, row: 2 }): MouseInput {
  return { kind: 'move', point, modifiers: { shift: false, alt: false, ctrl: false } }
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

  it('does not suppress repeated direct button clicks', () => {
    let now = 1_000
    const controller = createMouseController({
      getHitMap: () => snapshot(1, 'button'),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      now: () => now,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press())
    expect(controller.handle(release()).semantic).toMatchObject({ kind: 'click', count: 1, suppressed: false })
    now += 10
    controller.handle(press())
    expect(controller.handle(release()).semantic).toMatchObject({ kind: 'click', count: 2, suppressed: false })
  })

  it('coalesces a thousand moves inside one hover target to one transition', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1, 'button'),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    })
    const outcomes = Array.from({ length: 1_000 }, (_, index) => (
      controller.handle(move({ col: index % 80, row: 2 }))
    ))
    expect(outcomes.filter(outcome => outcome.semantic?.kind === 'hover')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome.requestRender === true)).toHaveLength(1)
    controller.handle({ kind: 'focus', focused: false })
    expect(controller.handle(move()).semantic).toMatchObject({ kind: 'hover', region: { id: 'transcript:tool:a' } })
  })

  it('does not create hover transitions when hover feedback is disabled', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1, 'button'),
      getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, hoverFeedback: false }),
    })
    expect(controller.handle(move())).toEqual({ consume: true })
  })

  it('emits a new visual transition only when the hovered target identity changes', () => {
    const map = new HitMapBuilder(1)
      .add({
        id: 'chrome:model',
        rect: { col: 0, row: 0, width: 10, height: 1 },
        zIndex: 10,
        role: 'button',
        enabled: true,
        activation: 'direct',
        hover: 'highlight',
        action: { kind: 'chrome', commandId: 'model' },
      })
      .add({
        id: 'chrome:mode',
        rect: { col: 10, row: 0, width: 10, height: 1 },
        zIndex: 10,
        role: 'button',
        enabled: true,
        activation: 'direct',
        hover: 'highlight',
        action: { kind: 'chrome', commandId: 'mode' },
      })
      .freeze(geometry)
    const controller = createMouseController({
      getHitMap: () => map,
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    })
    expect(controller.handle(move({ col: 2, row: 0 })).semantic).toMatchObject({ region: { id: 'chrome:model' } })
    expect(controller.handle(move({ col: 3, row: 0 })).semantic).toBeUndefined()
    expect(controller.handle(move({ col: 12, row: 0 })).semantic).toMatchObject({ region: { id: 'chrome:mode' } })
  })

  it('keeps the press origin and owner through the final selection release', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    const origin = { col: 1, row: 1 }
    const focus = { col: 9, row: 4 }
    controller.handle(press(origin))
    controller.handle({
      kind: 'drag',
      button: 'left',
      point: focus,
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    const released = controller.handle(release(focus))
    expect(released.semantic).toMatchObject({
      kind: 'drag',
      button: 'left',
      origin,
      point: focus,
      ended: true,
      region: { id: 'transcript:text' },
    })
  })

  it('starts edge scrolling after one dwell and carries the stationary selection point', () => {
    vi.useFakeTimers()
    try {
      const onEdgeScroll = vi.fn()
      const controller = createMouseController({
        getHitMap: () => snapshot(1),
        getBehavior: () => DEFAULT_TUI_BEHAVIOR,
        onEdgeScroll,
      })
      const origin = { col: 8, row: 5 }
      const edge = { col: 8, row: 0 }
      controller.handle(press(origin))
      const dragged = controller.handle({
        kind: 'drag',
        button: 'left',
        point: edge,
        modifiers: { shift: false, alt: false, ctrl: false },
      })
      expect(dragged.semantic).toMatchObject({ kind: 'drag', origin, point: edge })
      expect(onEdgeScroll).not.toHaveBeenCalled()
      vi.advanceTimersByTime(EDGE_SCROLL_MS)
      expect(onEdgeScroll).toHaveBeenCalledWith(1, edge)
      expect(controller.metrics.edgeScrollTimers).toBe(1)
      controller.handle(release(edge))
      vi.advanceTimersByTime(EDGE_SCROLL_MS * 2)
      expect(onEdgeScroll).toHaveBeenCalledTimes(1)
      expect(controller.metrics.edgeScrollTimers).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never starts application-owned selection from a right-button drag', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle({
      kind: 'press',
      button: 'right',
      point: { col: 1, row: 1 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    const dragged = controller.handle({
      kind: 'drag',
      button: 'right',
      point: { col: 6, row: 3 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    expect(controller.gesture).toBe('pressed')
    expect(dragged.semantic).toBeUndefined()
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

  it('drops the final selection release when its hit-map generation is stale', () => {
    let generation = 1
    const controller = createMouseController({
      getHitMap: () => snapshot(generation),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press({ col: 1, row: 1 }))
    controller.handle({
      kind: 'drag',
      button: 'left',
      point: { col: 5, row: 2 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    generation = 2
    expect(controller.handle(release({ col: 5, row: 2 })).semantic).toBeUndefined()
    expect(controller.gesture).toBe('idle')
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

  it('requests a repaint when a completed click arrives without hover invalidation', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1, 'button'),
      getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, hoverFeedback: false }),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    expect(controller.handle(press()).requestRender).not.toBe(true)
    const released = controller.handle(release())
    expect(released.semantic).toMatchObject({ kind: 'click', count: 1, suppressed: false })
    expect(released.requestRender).toBe(true)
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

  it('emits grab offset while dragging the scrollbar thumb', () => {
    const bar = new HitMapBuilder(1)
      .add({
        id: 'transcript:scrollbar:thumb',
        rect: { col: 79, row: 4, width: 1, height: 4 },
        zIndex: 11,
        role: 'scrollbar',
        enabled: true,
        action: { kind: 'transcript', command: 'drag-thumb' },
      })
      .freeze(geometry)
    const controller = createMouseController({
      getHitMap: () => bar,
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle({
      kind: 'press',
      button: 'left',
      point: { col: 79, row: 5 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    const dragged = controller.handle({
      kind: 'drag',
      button: 'left',
      point: { col: 79, row: 8 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    expect(controller.gesture).toBe('dragging-scrollbar')
    expect(dragged.semantic).toMatchObject({ kind: 'drag', grabOffset: 1 })
    const ended = controller.handle({
      kind: 'release',
      button: 'left',
      point: { col: 79, row: 8 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    expect(ended.semantic).toMatchObject({ kind: 'drag', ended: true })
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

  it('does not start a text selection when the press began on a button', () => {
    const controller = createMouseController({
      getHitMap: () => snapshot(1, 'button'),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    controller.handle(press())
    const dragged = controller.handle({
      kind: 'drag',
      button: 'left',
      point: { col: 6, row: 6 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    expect(controller.gesture).toBe('pressed')
    expect(dragged.semantic).toBeUndefined()
  })

  it('resets click count on FocusOut and withholds sensitive execute until a focus cycle', () => {
    let now = 8_000
    const controller = createMouseController({
      getHitMap: () => snapshot(1),
      getBehavior: () => DEFAULT_TUI_BEHAVIOR,
      now: () => now,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    })
    expect(controller.allowsSensitiveMouse).toBe(false)
    controller.handle(press())
    controller.handle(release())
    controller.handle({ kind: 'focus', focused: false })
    expect(controller.gesture).toBe('idle')
    controller.handle({ kind: 'focus', focused: true })
    now += FOCUS_GUARD_MS + 1
    expect(controller.allowsSensitiveMouse).toBe(true)
    controller.handle(press())
    expect(controller.handle(release()).semantic).toMatchObject({ kind: 'click', count: 1 })
  })
})
