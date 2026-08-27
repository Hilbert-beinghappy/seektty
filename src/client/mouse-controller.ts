/** Gesture state machine, click counting, and wheel scaling for the mouse architecture. */

import {
  DEFAULT_TUI_BEHAVIOR,
  MAX_WHEEL_SCROLL_LINES,
  type TuiBehaviorSettings,
  type TuiMouseMode,
} from '@deepseek-ai/dsh-tui-protocol'
import type { HitMapSnapshot, HitRegion } from './mouse-hit-map.ts'
import { hitTest, sameCell } from './mouse-hit-map.ts'
import type { CellPoint, MouseButton, MouseInput, MouseModifiers } from './mouse-protocol.ts'

export const DOUBLE_CLICK_MS = 400
export const FOCUS_GUARD_MS = 250

export const EDGE_SCROLL_MS = 50
export const EDGE_SCROLL_CAP = 4
export const WHEEL_ACCEL_MS = 80
export const WHEEL_RESET_MS = 120

type GestureState =
  | { readonly kind: 'idle' }
  | {
    readonly kind: 'pressed'
    readonly button: MouseButton
    readonly origin: CellPoint
    readonly region?: HitRegion
    readonly generation: number
    readonly time: number
    readonly grabOffset: number
  }
  | {
    readonly kind: 'selecting'
    readonly button: MouseButton
    readonly origin: CellPoint
    readonly region?: HitRegion
    readonly generation: number
  }
  | {
    readonly kind: 'dragging-scrollbar'
    readonly origin: CellPoint
    readonly region?: HitRegion
    readonly generation: number
    readonly grabOffset: number
  }
  | {
    readonly kind: 'edge-scrolling'
    readonly origin: CellPoint
    readonly region?: HitRegion
    readonly generation: number
    readonly direction: 'older' | 'newer'
    readonly distance: number
  }

export type MouseSemanticEvent =
  | {
    readonly kind: 'click'
    readonly count: 1 | 2 | 3
    readonly button: MouseButton
    readonly point: CellPoint
    readonly region?: HitRegion
    readonly modifiers: MouseModifiers
    readonly suppressed: boolean
  }
  | {
    readonly kind: 'drag'
    readonly button: MouseButton
    readonly point: CellPoint
    readonly origin?: CellPoint
    readonly region?: HitRegion
    readonly modifiers: MouseModifiers
    readonly ended?: boolean
    readonly grabOffset?: number
  }
  | {
    readonly kind: 'wheel'
    readonly axis: 'vertical' | 'horizontal'
    readonly lines: number
    readonly point: CellPoint
    readonly region?: HitRegion
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'focus'
    readonly focused: boolean
  }

export interface MouseControllerCounters {
  parsedMouseEvents: number
  coalescedWheelEvents: number
  hitRegions: number
  hitTestCandidates: number
  selectionCellsProjected: number
  edgeScrollTimers: number
  mouseRenderRequests: number
}

export interface MouseControllerOutcome {
  readonly consume: boolean
  readonly scrollTranscript?: number
  readonly requestRender?: boolean
  readonly semantic?: MouseSemanticEvent
}

export interface MouseControllerOptions {
  getHitMap: () => HitMapSnapshot | undefined
  getBehavior: () => Pick<TuiBehaviorSettings, 'mouseMode' | 'wheelScrollLines' | 'wheelAcceleration'>
  now?: () => number
  setTimeout?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (id: ReturnType<typeof setTimeout>) => void
  onEdgeScroll?: (lines: number) => void
}

function clampWheelLines(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TUI_BEHAVIOR.wheelScrollLines
  return Math.min(MAX_WHEEL_SCROLL_LINES, Math.max(1, Math.floor(value)))
}

function emptyCounters(): MouseControllerCounters {
  return {
    parsedMouseEvents: 0,
    coalescedWheelEvents: 0,
    hitRegions: 0,
    hitTestCandidates: 0,
    selectionCellsProjected: 0,
    edgeScrollTimers: 0,
    mouseRenderRequests: 0,
  }
}

export class MouseController {
  private state: GestureState = { kind: 'idle' }
  private clickCount = 0
  private clickButton: MouseButton | undefined
  private clickTarget: string | undefined
  private lastClickAt = 0
  private seenFocusOut = false
  private observedFocusCycle = false
  private readonly counters: MouseControllerCounters = emptyCounters()
  private readonly now: () => number
  private readonly setTimeoutFn: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>
  private readonly clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void
  private clickTimer: ReturnType<typeof setTimeout> | undefined
  private edgeTimer: ReturnType<typeof setTimeout> | undefined
  private focusTimer: ReturnType<typeof setTimeout> | undefined
  private suppressUntil = 0
  private wheelStreak = 1
  private lastWheelAt = 0
  private lastWheelDir = 0

  constructor(private readonly options: MouseControllerOptions) {
    this.now = options.now ?? Date.now
    this.setTimeoutFn = options.setTimeout ?? setTimeout
    this.clearTimeoutFn = options.clearTimeout ?? clearTimeout
  }

  get mode(): TuiMouseMode {
    return this.options.getBehavior().mouseMode
  }

  get metrics(): Readonly<MouseControllerCounters> {
    return this.counters
  }

  get gesture(): GestureState['kind'] {
    return this.state.kind
  }

  get hasReliableFocusProtocol(): boolean {
    return this.observedFocusCycle
  }

  get isFocusGuarded(): boolean {
    return this.now() < this.suppressUntil
  }

  handle(input: MouseInput): MouseControllerOutcome {
    this.counters.parsedMouseEvents += 1
    if (input.kind === 'focus') return this.handleFocus(input.focused)
    if (this.mode === 'native') {
      this.endGesture()
      return { consume: true }
    }
    if (input.kind === 'wheel') return this.handleWheel(input)
    if (input.kind === 'press') return this.handlePress(input)
    if (input.kind === 'drag') return this.handleDrag(input)
    return this.handleRelease(input)
  }

  noteCoalescedWheel(): void {
    this.counters.coalescedWheelEvents += 1
  }

  recordMouseRender(): void {
    this.counters.mouseRenderRequests += 1
  }

  endGesture(): void {
    this.clearTimer('click')
    this.clearTimer('edge')
    this.state = { kind: 'idle' }
  }

  dispose(): void {
    this.endGesture()
    this.clearTimer('focus')
    this.suppressUntil = 0
    this.clickCount = 0
    this.clickButton = undefined
    this.clickTarget = undefined
    this.counters.edgeScrollTimers = 0
  }

  private handleFocus(focused: boolean): MouseControllerOutcome {
    if (!focused) {
      this.seenFocusOut = true
      this.endGesture()
      return { consume: true, semantic: { kind: 'focus', focused: false } }
    }
    if (this.seenFocusOut) this.observedFocusCycle = true
    this.clearTimer('focus')
    this.suppressUntil = this.now() + FOCUS_GUARD_MS
    this.focusTimer = this.setTimeoutFn(() => {
      this.focusTimer = undefined
      this.suppressUntil = 0
    }, FOCUS_GUARD_MS)
    return { consume: true, semantic: { kind: 'focus', focused: true } }
  }

  private handleWheel(
    input: Extract<MouseInput, { kind: 'wheel' }>,
  ): MouseControllerOutcome {
    const hit = this.lookup(input.point)
    const region = hit?.region
    const overlay = region?.action.kind === 'overlay'
    const composer = region?.action.kind === 'composer' || region?.role === 'input'
    const transcript = region?.action.kind === 'transcript'
      || region?.role === 'text'
      || region?.role === 'scrollbar'
    const lines = input.axis === 'horizontal' ? 0 : this.scaledWheelLines(input.delta)
    const semantic = {
      kind: 'wheel' as const,
      axis: input.axis,
      lines,
      point: input.point,
      ...(region === undefined ? {} : { region }),
      modifiers: input.modifiers,
    }
    if (input.axis === 'horizontal' || overlay || composer || !transcript) {
      return {
        consume: true,
        ...(overlay || composer ? { requestRender: true } : {}),
        semantic,
      }
    }
    return {
      consume: true,
      scrollTranscript: lines,
      requestRender: true,
      semantic,
    }
  }

  private scaledWheelLines(delta: number): number {
    const behavior = this.options.getBehavior()
    const base = clampWheelLines(behavior.wheelScrollLines)
    const direction = Math.sign(delta)
    if (direction === 0) return 0
    const now = this.now()
    const elapsed = now - this.lastWheelAt
    if (!behavior.wheelAcceleration || elapsed > WHEEL_RESET_MS || direction !== this.lastWheelDir) {
      this.wheelStreak = 1
    } else if (elapsed <= WHEEL_ACCEL_MS) {
      this.wheelStreak = Math.min(4, this.wheelStreak + 1)
    }
    this.lastWheelAt = now
    this.lastWheelDir = direction
    const effective = behavior.wheelAcceleration
      ? Math.min(MAX_WHEEL_SCROLL_LINES, base * this.wheelStreak)
      : base
    return effective * direction
  }

  private handlePress(
    input: Extract<MouseInput, { kind: 'press' }>,
  ): MouseControllerOutcome {
    if (input.button === 'none' || input.button === 'middle') {
      return { consume: true }
    }
    const hit = this.lookup(input.point)
    const generation = this.options.getHitMap()?.generation ?? 0
    const grabOffset = hit?.region?.role === 'scrollbar'
      ? input.point.row - hit.region.rect.row
      : 0
    this.state = {
      kind: 'pressed',
      button: input.button,
      origin: input.point,
      ...(hit?.region === undefined ? {} : { region: hit.region }),
      generation,
      time: this.now(),
      grabOffset,
    }
    return { consume: true }
  }

  private handleDrag(
    input: Extract<MouseInput, { kind: 'drag' }>,
  ): MouseControllerOutcome {
    if (this.state.kind === 'pressed' && !sameCell(this.state.origin, input.point)) {
      const scrollbar = this.state.region?.role === 'scrollbar'
      this.state = scrollbar
        ? {
          kind: 'dragging-scrollbar',
          origin: this.state.origin,
          ...(this.state.region === undefined ? {} : { region: this.state.region }),
          generation: this.state.generation,
          grabOffset: this.state.grabOffset,
        }
        : {
          kind: 'selecting',
          button: this.state.button,
          origin: this.state.origin,
          ...(this.state.region === undefined ? {} : { region: this.state.region }),
          generation: this.state.generation,
        }
    }
    if (this.state.kind === 'selecting' || this.state.kind === 'edge-scrolling') {
      this.updateEdgeScroll(input.point)
    }
    if (this.state.kind !== 'selecting' && this.state.kind !== 'dragging-scrollbar'
      && this.state.kind !== 'edge-scrolling') {
      return { consume: true }
    }
    this.counters.mouseRenderRequests += 1
    const hit = this.lookup(input.point)
    const grabOffset = this.state.kind === 'dragging-scrollbar' ? this.state.grabOffset : undefined
    const origin = this.state.origin
    return {
      consume: true,
      requestRender: true,
      semantic: {
        kind: 'drag',
        button: input.button,
        point: input.point,
        origin,
        ...(hit?.region === undefined ? {} : { region: hit.region }),
        modifiers: input.modifiers,
        ...(grabOffset === undefined ? {} : { grabOffset }),
      },
    }
  }

  private handleRelease(
    input: Extract<MouseInput, { kind: 'release' }>,
  ): MouseControllerOutcome {
    const pressed = this.state.kind === 'pressed' ? this.state : undefined
    const wasDrag = this.state.kind === 'selecting' || this.state.kind === 'dragging-scrollbar'
      || this.state.kind === 'edge-scrolling'
    const generation = this.options.getHitMap()?.generation ?? 0
    if (pressed !== undefined && pressed.generation !== generation) {
      this.endGesture()
      return { consume: true }
    }
    const grabOffset = this.state.kind === 'dragging-scrollbar' ? this.state.grabOffset : undefined
    this.clearTimer('edge')
    this.state = { kind: 'idle' }
    if (wasDrag) {
      const hit = this.lookup(input.point)
      return {
        consume: true,
        semantic: {
          kind: 'drag',
          button: input.button,
          point: input.point,
          ...(hit?.region === undefined ? {} : { region: hit.region }),
          modifiers: input.modifiers,
          ended: true,
          ...(grabOffset === undefined ? {} : { grabOffset }),
        },
      }
    }
    if (pressed === undefined) return { consume: true }
    if (!sameCell(pressed.origin, input.point)) return { consume: true }
    const now = this.now()
    const target = pressed.region?.id
    const sameTarget = this.clickButton === input.button
      && this.clickTarget === target
      && now - this.lastClickAt <= DOUBLE_CLICK_MS
    const count = (sameTarget ? this.clickCount + 1 : 1) as 1 | 2 | 3
    const capped = count > 3 ? 3 : count
    this.clickCount = capped
    this.clickButton = input.button
    this.clickTarget = target
    this.lastClickAt = now
    this.clearTimer('click')
    this.clickTimer = this.setTimeoutFn(() => {
      this.clickTimer = undefined
      this.clickCount = 0
      this.clickButton = undefined
      this.clickTarget = undefined
    }, DOUBLE_CLICK_MS)
    const suppressed = now < this.suppressUntil
      || (pressed.region?.role === 'button' && capped > 1)
    const hit = this.lookup(input.point)
    return {
      consume: true,
      semantic: {
        kind: 'click',
        count: capped,
        button: input.button,
        point: input.point,
        ...(hit?.region === undefined ? {} : { region: hit.region }),
        modifiers: input.modifiers,
        suppressed,
      },
    }
  }

  private lookup(point: CellPoint): { readonly region: HitRegion; readonly candidates: number } | undefined {
    const snapshot = this.options.getHitMap()
    this.counters.hitRegions = snapshot?.regions.length ?? 0
    const hit = snapshot === undefined ? undefined : hitTest(snapshot, point)
    this.counters.hitTestCandidates = hit?.candidates ?? 0
    return hit
  }

  private updateEdgeScroll(point: CellPoint): void {
    if (this.state.kind !== 'selecting' && this.state.kind !== 'edge-scrolling') return
    const region = this.state.region
    const rect = region?.rect
    const transcript = region?.role === 'text' || region?.action.kind === 'transcript'
    if (rect === undefined || !transcript) {
      this.stopEdgeScroll()
      return
    }
    const topDist = point.row - rect.row
    const bottomDist = rect.row + rect.height - 1 - point.row
    let direction: 'older' | 'newer' | undefined
    let distance = 0
    if (topDist <= 0) {
      direction = 'older'
      distance = Math.min(EDGE_SCROLL_CAP, Math.max(1, 1 - topDist))
    } else if (bottomDist <= 0) {
      direction = 'newer'
      distance = Math.min(EDGE_SCROLL_CAP, Math.max(1, 1 - bottomDist))
    }
    if (direction === undefined) {
      this.stopEdgeScroll()
      return
    }
    this.state = {
      kind: 'edge-scrolling',
      origin: this.state.origin,
      ...(region === undefined ? {} : { region }),
      generation: this.state.generation,
      direction,
      distance,
    }
    if (this.edgeTimer === undefined) this.tickEdge()
  }

  private tickEdge(): void {
    if (this.state.kind !== 'edge-scrolling') return
    const lines = this.state.direction === 'older' ? this.state.distance : -this.state.distance
    this.counters.edgeScrollTimers = 1
    this.counters.mouseRenderRequests += 1
    this.options.onEdgeScroll?.(lines)
    this.edgeTimer = this.setTimeoutFn(() => {
      this.edgeTimer = undefined
      this.tickEdge()
    }, EDGE_SCROLL_MS)
  }

  private stopEdgeScroll(): void {
    this.clearTimer('edge')
    if (this.state.kind !== 'edge-scrolling') return
    this.state = {
      kind: 'selecting',
      button: 'left',
      origin: this.state.origin,
      ...(this.state.region === undefined ? {} : { region: this.state.region }),
      generation: this.state.generation,
    }
  }

  private clearTimer(kind: 'click' | 'edge' | 'focus'): void {
    if (kind === 'click' && this.clickTimer !== undefined) {
      this.clearTimeoutFn(this.clickTimer)
      this.clickTimer = undefined
    }
    if (kind === 'edge' && this.edgeTimer !== undefined) {
      this.clearTimeoutFn(this.edgeTimer)
      this.edgeTimer = undefined
      this.counters.edgeScrollTimers = 0
    }
    if (kind === 'focus' && this.focusTimer !== undefined) {
      this.clearTimeoutFn(this.focusTimer)
      this.focusTimer = undefined
    }
  }
}

export function createMouseController(options: MouseControllerOptions): MouseController {
  return new MouseController(options)
}
