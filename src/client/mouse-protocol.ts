/** Parse and encode mouse/focus terminal protocols without holding UI state. */

import { DEFAULT_WHEEL_SCROLL_LINES } from '@deepseek-ai/dsh-tui-protocol'

const ESC = '\u001B'
const CSI = `${ESC}[`
const SGR_PREFIX = `${CSI}<`
const X10_PREFIX = `${CSI}M`
const FOCUS_IN = `${CSI}I`
const FOCUS_OUT = `${CSI}O`
const SGR_BODY = /^(\d+);(\d+);(\d+)([Mm])/u
const MAX_PENDING = 64
const MODIFIER_MASK = 4 | 8 | 16
const MOTION_BIT = 32
const EXTRA_BUTTON_BIT = 128

export interface CellPoint {
  readonly col: number
  readonly row: number
}

export interface MouseModifiers {
  readonly shift: boolean
  readonly alt: boolean
  readonly ctrl: boolean
}

export type MouseButton = 'left' | 'middle' | 'right' | 'none'

export type MouseInput =
  | {
    readonly kind: 'press'
    readonly button: MouseButton
    readonly point: CellPoint
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'release'
    readonly button: MouseButton
    readonly point: CellPoint
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'drag'
    readonly button: MouseButton
    readonly point: CellPoint
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'move'
    readonly point: CellPoint
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'wheel'
    readonly axis: 'vertical' | 'horizontal'
    readonly delta: number
    readonly point: CellPoint
    readonly modifiers: MouseModifiers
  }
  | {
    readonly kind: 'focus'
    readonly focused: boolean
  }

export type MouseDecodeResult = {
  readonly events: readonly MouseInput[]
  readonly leftover: string
  readonly pending: string
}

/** Alternate-screen enter; written once by Surface `enter()`, never by live mouse toggles. */
export const ENTER_ALTERNATE_SCREEN = `${CSI}?1049h${ESC}[H`

/** Cursor-on plus leave alternate screen; written once by Surface `restore()`. */
export const LEAVE_ALTERNATE_SCREEN = `${CSI}?25h${CSI}?1049l`

/**
 * Full mouse uses all-motion `1003` only when hover feedback is enabled.
 * Otherwise it keeps button-motion `1002`; both variants retain SGR and focus.
 */
export function encodeFullMouseReporting(hoverFeedback = true): string {
  return hoverFeedback
    ? `${CSI}?1000l${CSI}?1002l${CSI}?1007l${CSI}?1003h${CSI}?1004h${CSI}?1006h`
    : `${CSI}?1000l${CSI}?1003l${CSI}?1007l${CSI}?1002h${CSI}?1004h${CSI}?1006h`
}

/** Close every mouse/focus private mode, including `1003` and `1004`. */
export function encodeDisableMouseReporting(): string {
  return `${CSI}?1000l${CSI}?1002l${CSI}?1003l${CSI}?1004l${CSI}?1006l${CSI}?1007l`
}

/** Encode the live mouse/focus private-mode sequence for one reporting mode. */
export function encodeMouseReporting(mode: 'full' | 'native', hoverFeedback = true): string {
  return mode === 'native' ? encodeDisableMouseReporting() : encodeFullMouseReporting(hoverFeedback)
}

function modifiersOf(code: number): MouseModifiers {
  return {
    shift: (code & 4) !== 0,
    alt: (code & 8) !== 0,
    ctrl: (code & 16) !== 0,
  }
}

function cellPoint(column: number, row: number): CellPoint {
  return {
    col: Math.max(0, column - 1),
    row: Math.max(0, row - 1),
  }
}

function buttonOf(base: number): MouseButton {
  switch (base & 3) {
    case 0: return 'left'
    case 1: return 'middle'
    case 2: return 'right'
    default: return 'none'
  }
}

function decodeSgr(code: number, column: number, row: number, terminator: 'M' | 'm'): MouseInput {
  const modifiers = modifiersOf(code)
  const base = code & ~MODIFIER_MASK
  const point = cellPoint(column, row)
  const wheelBase = base & ~MOTION_BIT
  if (wheelBase === 64) {
    return { kind: 'wheel', axis: 'vertical', delta: 1, point, modifiers }
  }
  if (wheelBase === 65) {
    return { kind: 'wheel', axis: 'vertical', delta: -1, point, modifiers }
  }
  if (wheelBase === 66 || wheelBase === 67) {
    return {
      kind: 'wheel',
      axis: 'horizontal',
      delta: wheelBase === 66 ? -1 : 1,
      point,
      modifiers,
    }
  }
  if ((base & EXTRA_BUTTON_BIT) !== 0) {
    const extraKind = terminator === 'm' ? 'release' : (base & MOTION_BIT) !== 0 ? 'drag' : 'press'
    return { kind: extraKind, button: 'none', point, modifiers }
  }
  if (terminator === 'm') {
    return { kind: 'release', button: buttonOf(base), point, modifiers }
  }
  if ((base & MOTION_BIT) !== 0) {
    const button = buttonOf(base)
    return button === 'none'
      ? { kind: 'move', point, modifiers }
      : { kind: 'drag', button, point, modifiers }
  }
  return { kind: 'press', button: buttonOf(base), point, modifiers }
}

function isCsiFinal(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= 0x40 && code <= 0x7e
}

function takeOrdinarySequence(input: string): string | undefined {
  if (input.length === 0) return undefined
  if (input === ESC || input === CSI) return undefined
  if (!input.startsWith(ESC)) {
    const escapeAt = input.indexOf(ESC)
    return escapeAt === -1 ? input : input.slice(0, escapeAt)
  }
  if (input.startsWith(CSI)) {
    for (let index = 2; index < input.length; index += 1) {
      const char = input[index]
      if (char !== undefined && isCsiFinal(char)) return input.slice(0, index + 1)
    }
    return undefined
  }
  if (input.startsWith(`${ESC}O`)) {
    return input.length >= 3 ? input.slice(0, 3) : undefined
  }
  if (input.startsWith(`${ESC}]`) || input.startsWith(`${ESC}P`) || input.startsWith(`${ESC}_`)) {
    const bel = input.indexOf('\u0007')
    const st = input.indexOf(`${ESC}\\`)
    if (bel !== -1) return input.slice(0, bel + 1)
    if (st !== -1) return input.slice(0, st + 2)
    return undefined
  }
  return input.length >= 2 ? input.slice(0, 2) : undefined
}

function takeSgr(
  input: string,
): { readonly event?: MouseInput; readonly length: number } | 'incomplete' | undefined {
  if (!input.startsWith(SGR_PREFIX)) return undefined
  const rest = input.slice(SGR_PREFIX.length)
  const match = SGR_BODY.exec(rest)
  if (match !== null) {
    const terminator = match[4] as 'M' | 'm'
    return {
      event: decodeSgr(Number(match[1]), Number(match[2]), Number(match[3]), terminator),
      length: SGR_PREFIX.length + match[0].length,
    }
  }
  const terminatorAt = rest.search(/[Mm]/u)
  if (terminatorAt !== -1) {
    return { length: SGR_PREFIX.length + terminatorAt + 1 }
  }
  return 'incomplete'
}

function takeX10(input: string): { readonly length: number } | 'incomplete' | undefined {
  if (!input.startsWith(X10_PREFIX)) return undefined
  return input.length >= 6 ? { length: 6 } : 'incomplete'
}

function consumeMalformedCsi(input: string): number | undefined {
  if (!input.startsWith(CSI) || input.length < 3) return undefined
  for (let index = 2; index < input.length; index += 1) {
    const char = input[index]
    if (char !== undefined && isCsiFinal(char)) return index + 1
  }
  return undefined
}

/**
 * Decode one already-buffered stdin chunk into mouse/focus events.
 * Incomplete SGR/X10 prefixes stay pending so they cannot leak into the composer.
 */
export class MouseProtocolDecoder {
  private pending = ''

  /** Bytes held while waiting for the rest of a mouse sequence. */
  get buffered(): string {
    return this.pending
  }

  /**
   * Push one stdin chunk and split it into events, leftover non-mouse bytes, and a pending prefix.
   * @param chunk - raw terminal input, possibly fragmented or concatenated.
   */
  push(chunk: string): MouseDecodeResult {
    this.pending += chunk
    if (this.pending.length > MAX_PENDING && !this.pending.startsWith(SGR_PREFIX) && !this.pending.startsWith(X10_PREFIX)) {
      const leftover = this.pending
      this.pending = ''
      return { events: [], leftover, pending: '' }
    }
    const events: MouseInput[] = []
    let leftover = ''
    while (this.pending.length > 0) {
      const escapeAt = this.pending.indexOf(ESC)
      if (escapeAt > 0) {
        leftover += this.pending.slice(0, escapeAt)
        this.pending = this.pending.slice(escapeAt)
      } else if (escapeAt === -1) {
        leftover += this.pending
        this.pending = ''
        break
      }
      if (this.pending === FOCUS_IN || this.pending.startsWith(FOCUS_IN)) {
        events.push({ kind: 'focus', focused: true })
        this.pending = this.pending.slice(FOCUS_IN.length)
        continue
      }
      if (this.pending === FOCUS_OUT || this.pending.startsWith(FOCUS_OUT)) {
        events.push({ kind: 'focus', focused: false })
        this.pending = this.pending.slice(FOCUS_OUT.length)
        continue
      }
      const sgr = takeSgr(this.pending)
      if (sgr === 'incomplete') {
        if (this.pending.length > MAX_PENDING) {
          this.pending = ''
        }
        break
      }
      if (sgr !== undefined) {
        if (sgr.event !== undefined) events.push(sgr.event)
        this.pending = this.pending.slice(sgr.length)
        continue
      }
      const x10 = takeX10(this.pending)
      if (x10 === 'incomplete') {
        if (this.pending.length > MAX_PENDING) {
          leftover += this.pending
          this.pending = ''
        }
        break
      }
      if (x10 !== undefined) {
        this.pending = this.pending.slice(x10.length)
        continue
      }
      if (this.pending.startsWith(SGR_PREFIX) || this.pending.startsWith(X10_PREFIX)) {
        const malformed = consumeMalformedCsi(this.pending)
        if (malformed === undefined) break
        this.pending = this.pending.slice(malformed)
        continue
      }
      const ordinary = takeOrdinarySequence(this.pending)
      if (ordinary === undefined) break
      leftover += ordinary
      this.pending = this.pending.slice(ordinary.length)
    }
    return { events, leftover, pending: this.pending }
  }

  /** Drop any unfinished mouse prefix. */
  reset(): void {
    this.pending = ''
  }

  /**
   * Release an ambiguous incomplete prefix as ordinary terminal input.
   * The Surface calls this after a short escape-sequence timeout so a lone
   * Escape key is not held until the user's next key or mouse event.
   */
  flushPending(): string {
    const pending = this.pending
    this.pending = ''
    return pending
  }
}

/**
 * Decode one complete stdin sequence.
 * @returns a mouse/focus event, `null` when a mouse sequence was consumed without an action,
 * or `undefined` when the bytes are not mouse/focus protocol.
 */
export function decodeMouseSequence(data: string): MouseInput | null | undefined {
  if (data === FOCUS_IN) return { kind: 'focus', focused: true }
  if (data === FOCUS_OUT) return { kind: 'focus', focused: false }
  const sgr = takeSgr(data)
  if (sgr === 'incomplete') return null
  if (sgr !== undefined) return sgr.event ?? null
  const x10 = takeX10(data)
  if (x10 === 'incomplete') return null
  if (x10 !== undefined) return null
  if (data.startsWith(SGR_PREFIX) || data.startsWith(X10_PREFIX)) return null
  return undefined
}

/**
 * Compatibility wheel helper used by existing viewport tests.
 * Protocol detents stay ±1; this multiplies by the shipped default of 3 lines.
 */
export function terminalMouseDelta(data: string): number | null | undefined {
  const decoded = decodeMouseSequence(data)
  if (decoded === undefined) {
    if (data.startsWith(SGR_PREFIX) || data.startsWith(X10_PREFIX)) return null
    return undefined
  }
  if (decoded === null) return null
  if (decoded.kind === 'wheel' && decoded.axis === 'vertical') {
    return decoded.delta * DEFAULT_WHEEL_SCROLL_LINES
  }
  return null
}
