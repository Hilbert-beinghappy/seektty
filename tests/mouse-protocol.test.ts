import { describe, expect, it } from 'vitest'
import {
  decodeMouseSequence,
  encodeDisableMouseReporting,
  encodeFullMouseReporting,
  encodeMouseReporting,
  MouseProtocolDecoder,
  terminalMouseDelta,
} from '../src/client/mouse-protocol.ts'

const sgr = (code: number, col = 4, row = 8, release = false): string =>
  `\u001B[<${String(code)};${String(col)};${String(row)}${release ? 'm' : 'M'}`

describe('mouse protocol encoding', () => {
  it('never enables 1003 and uses 1002+1004+1006 for application-owned selection', () => {
    const full = encodeFullMouseReporting()
    expect(full).toContain('\u001B[?1002h')
    expect(full).toContain('\u001B[?1004h')
    expect(full).toContain('\u001B[?1006h')
    expect(full).toContain('\u001B[?1000l')
    expect(full).not.toContain('\u001B[?1003h')
    expect(full).not.toContain('\u001B[?1049')
    expect(encodeDisableMouseReporting()).toContain('\u001B[?1004l')
    expect(encodeDisableMouseReporting()).not.toContain('\u001B[?1003h')
    expect(encodeMouseReporting('native')).toBe(encodeDisableMouseReporting())
  })
})

describe('SGR classification', () => {
  it('converts 1-based coordinates and keeps modifiers after masking 4/8/16', () => {
    const press = decodeMouseSequence(sgr(0, 2, 3))
    expect(press).toEqual({
      kind: 'press',
      button: 'left',
      point: { col: 1, row: 2 },
      modifiers: { shift: false, alt: false, ctrl: false },
    })
    const shifted = decodeMouseSequence(sgr(4, 1, 1))
    expect(shifted).toMatchObject({ kind: 'press', button: 'left', modifiers: { shift: true, alt: false, ctrl: false } })
    const alt = decodeMouseSequence(sgr(8, 1, 1))
    expect(alt).toMatchObject({ modifiers: { shift: false, alt: true, ctrl: false } })
    const ctrl = decodeMouseSequence(sgr(16, 1, 1))
    expect(ctrl).toMatchObject({ modifiers: { shift: false, alt: false, ctrl: true } })
  })

  it('treats motion bit 32 as drag and m as release', () => {
    expect(decodeMouseSequence(sgr(32))).toMatchObject({ kind: 'drag', button: 'left' })
    expect(decodeMouseSequence(sgr(1))).toMatchObject({ kind: 'press', button: 'middle' })
    expect(decodeMouseSequence(sgr(2))).toMatchObject({ kind: 'press', button: 'right' })
    expect(decodeMouseSequence(sgr(34))).toMatchObject({ kind: 'drag', button: 'right' })
    expect(decodeMouseSequence(sgr(36))).toMatchObject({ kind: 'drag', button: 'left', modifiers: { shift: true } })
    expect(decodeMouseSequence(sgr(0, 4, 8, true))).toMatchObject({ kind: 'release', button: 'left' })
  })

  it('maps vertical wheel detents to ±1 after masking modifiers', () => {
    expect(decodeMouseSequence(sgr(64))).toMatchObject({ kind: 'wheel', axis: 'vertical', delta: 1 })
    expect(decodeMouseSequence(sgr(65))).toMatchObject({ kind: 'wheel', axis: 'vertical', delta: -1 })
    expect(decodeMouseSequence(sgr(68))).toMatchObject({ kind: 'wheel', axis: 'vertical', delta: 1, modifiers: { shift: true } })
    expect(decodeMouseSequence(sgr(72))).toMatchObject({ kind: 'wheel', axis: 'vertical', delta: 1, modifiers: { alt: true } })
    expect(decodeMouseSequence(sgr(80))).toMatchObject({ kind: 'wheel', axis: 'vertical', delta: 1, modifiers: { ctrl: true } })
    expect(decodeMouseSequence(sgr(92))).toMatchObject({
      kind: 'wheel',
      axis: 'vertical',
      delta: 1,
      modifiers: { shift: true, alt: true, ctrl: true },
    })
    expect(decodeMouseSequence(sgr(68))).not.toMatchObject({ delta: 68 })
  })

  it('identifies horizontal wheel and extra buttons without treating them as clicks', () => {
    expect(decodeMouseSequence(sgr(66))).toMatchObject({ kind: 'wheel', axis: 'horizontal' })
    expect(decodeMouseSequence(sgr(67))).toMatchObject({ kind: 'wheel', axis: 'horizontal' })
    expect(decodeMouseSequence(sgr(128))).toMatchObject({ kind: 'press', button: 'none' })
    expect(decodeMouseSequence(sgr(129, 1, 1, true))).toMatchObject({ kind: 'release', button: 'none' })
  })

  it('parses CSI I/O as focus and does not steal other CSI', () => {
    expect(decodeMouseSequence('\u001B[I')).toEqual({ kind: 'focus', focused: true })
    expect(decodeMouseSequence('\u001B[O')).toEqual({ kind: 'focus', focused: false })
    expect(decodeMouseSequence('\u001B[A')).toBeUndefined()
    expect(decodeMouseSequence('\u001B[200~')).toBeUndefined()
    expect(decodeMouseSequence('\u001B[6;10;20t')).toBeUndefined()
    expect(decodeMouseSequence('\u001B[99;5u')).toBeUndefined()
    expect(decodeMouseSequence('\u001BOA')).toBeUndefined()
    expect(decodeMouseSequence('plain')).toBeUndefined()
  })
})

describe('streaming decoder', () => {
  it('buffers incomplete SGR and glued sequences without leaking into leftover text', () => {
    const decoder = new MouseProtocolDecoder()
    expect(decoder.push('\u001B[<64;4').leftover).toBe('')
    expect(decoder.buffered.length).toBeGreaterThan(0)
    const done = decoder.push(';8Mhello')
    expect(done.events).toEqual([expect.objectContaining({ kind: 'wheel', delta: 1 })])
    expect(done.leftover).toBe('hello')
    expect(done.pending).toBe('')
  })

  it('parses concatenated reports and keeps ordinary CSI intact', () => {
    const decoder = new MouseProtocolDecoder()
    const glued = decoder.push(`${sgr(64)}${sgr(65)}\u001B[A`)
    expect(glued.events).toHaveLength(2)
    expect(glued.leftover).toBe('\u001B[A')
    const before = decoder.push(`\u001B[A${sgr(64)}`)
    expect(before.events).toEqual([expect.objectContaining({ kind: 'wheel', delta: 1 })])
    expect(before.leftover).toBe('\u001B[A')
    expect(decoder.push('\u001B[200~paste\u001B[201~').leftover).toContain('paste')
  })

  it('consumes malformed complete SGR without leftover composer text', () => {
    const decoder = new MouseProtocolDecoder()
    const result = decoder.push('\u001B[<abcM')
    expect(result.events).toEqual([])
    expect(result.leftover).toBe('')
    const glued = decoder.push('\u001B[<abcM\u001B[A')
    expect(glued.events).toEqual([])
    expect(glued.leftover).toBe('\u001B[A')
  })
})

describe('terminalMouseDelta compatibility', () => {
  it('keeps the shipped 3-line wheel distance on the legacy helper', () => {
    expect(terminalMouseDelta(sgr(64))).toBe(3)
    expect(terminalMouseDelta(sgr(65))).toBe(-3)
    expect(terminalMouseDelta(sgr(68))).toBe(3)
    expect(terminalMouseDelta(sgr(66))).toBeNull()
    expect(terminalMouseDelta(sgr(0))).toBeNull()
    expect(terminalMouseDelta('\u001B[<64;4')).toBeNull()
    expect(terminalMouseDelta('\u001B[M')).toBeNull()
    expect(terminalMouseDelta('\u001B[A')).toBeUndefined()
    expect(terminalMouseDelta('plain')).toBeUndefined()
  })
})
