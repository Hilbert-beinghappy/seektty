import { afterEach, describe, expect, it, vi } from 'vitest'
import { StdinBuffer } from '@mariozechner/pi-tui'
import { decodeMouseSequence } from '../src/client/mouse-protocol.ts'

const ESC = '\u001B'
const motion = `${ESC}[<35;20;13M`
const paste = (content: string): string => `${ESC}[200~${content}${ESC}[201~`

/** Same framing and mouse classification boundary as ProcessTerminal + Surface. */
function inputHarness() {
  const buffer = new StdinBuffer({ timeout: 10 })
  const keys: string[] = []
  const events: string[] = []
  const ordered: string[] = []
  const onInput = (data: string) => {
    const event = decodeMouseSequence(data)
    if (event === undefined) {
      keys.push(data)
      ordered.push(data)
    } else if (event !== null) {
      events.push(event.kind)
      ordered.push(event.kind)
    }
  }
  buffer.on('data', onInput)
  buffer.on('paste', content => { onInput(paste(content)) })
  return { buffer, keys, events, ordered }
}

afterEach(() => { vi.useRealTimers() })

describe('terminal Escape / mouse framing', () => {
  it('keeps Escape separate from the following hover, wheel, click and focus report', () => {
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}${motion}${ESC}[<65;20;13M${ESC}[<0;20;13M${ESC}[<0;20;13m${ESC}[O`)
      expect(harness.keys).toEqual([ESC])
      expect(harness.ordered).toEqual([ESC, 'move', 'wheel', 'press', 'release', 'focus'])
    } finally { harness.buffer.destroy() }
  })

  it('preserves every chunk boundary of Escape followed by a mouse report', () => {
    vi.useFakeTimers()
    const raw = ESC + motion
    for (let split = 1; split < raw.length; split++) {
      const harness = inputHarness()
      try {
        harness.buffer.process(raw.slice(0, split))
        vi.advanceTimersByTime(5)
        harness.buffer.process(raw.slice(split))
        vi.advanceTimersByTime(50)
        expect(harness.ordered, `split at ${split}`).toEqual([ESC, 'move'])
      } finally { harness.buffer.destroy() }
    }
  })

  it('does not flush a recognized mouse prefix as text after the key timeout', () => {
    vi.useFakeTimers()
    for (let split = 3; split < motion.length; split++) {
      const harness = inputHarness()
      try {
        harness.buffer.process(ESC + motion.slice(0, split))
        vi.advanceTimersByTime(100)
        expect(harness.ordered).toEqual([ESC])
        harness.buffer.process(motion.slice(split))
        expect(harness.ordered, `delayed split at ${split}`).toEqual([ESC, 'move'])
      } finally { harness.buffer.destroy() }
    }
  })

  it('lets a new Escape cancel an unfinished mouse report and still go back', () => {
    vi.useFakeTimers()
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}[<35;20;`)
      vi.advanceTimersByTime(100)
      harness.buffer.process(ESC)
      vi.advanceTimersByTime(10)
      harness.buffer.process(motion)
      expect(harness.ordered).toEqual([ESC, 'move'])
    } finally { harness.buffer.destroy() }
  })

  it('delivers a lone Escape on time and keeps repeated Escapes distinct', () => {
    vi.useFakeTimers()
    const harness = inputHarness()
    try {
      harness.buffer.process(ESC)
      vi.advanceTimersByTime(10)
      expect(harness.keys).toEqual([ESC])
      harness.buffer.process(ESC + ESC + ESC + motion)
      vi.advanceTimersByTime(10)
      expect(harness.ordered).toEqual([ESC, ESC, ESC, ESC, 'move'])
    } finally { harness.buffer.destroy() }
  })

  it('preserves ordinary arrows, Alt keys, CSI-u, Enter and literal protocol-like text', () => {
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}[A${ESC}a${ESC}[1;3A${ESC}[27u\r[<35;20;13M`)
      expect(harness.keys.slice(0, 5)).toEqual([`${ESC}[A`, `${ESC}a`, `${ESC}[1;3A`, `${ESC}[27u`, '\r'])
      expect(harness.keys.slice(5).join('')).toBe('[<35;20;13M')
      expect(harness.events).toEqual([])
    } finally { harness.buffer.destroy() }
  })

  it('preserves bracketed paste verbatim, even after Escape and with mouse-like content', () => {
    const harness = inputHarness()
    try {
      const content = `literal [<35;20;13M ${motion} 中文`
      harness.buffer.process(ESC + paste(content) + motion)
      expect(harness.ordered).toEqual([ESC, paste(content), 'move'])
    } finally { harness.buffer.destroy() }
  })

  it('consumes malformed SGR without losing the following key or mouse event', () => {
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}[<abcM${ESC}[A${motion}`)
      expect(harness.ordered).toEqual([`${ESC}[A`, 'move'])
    } finally { harness.buffer.destroy() }
  })

  it('bounds an oversized mouse prefix without turning its tail into a click or text', () => {
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}[<${'1'.repeat(1000)}`)
      expect(harness.buffer.getBuffer().length).toBeLessThanOrEqual(64)
      harness.buffer.process(`0;1;1M${motion}z`)
      expect(harness.ordered).toEqual(['move', 'z'])
    } finally { harness.buffer.destroy() }
  })

  it('does not time out a partial legacy X10 mouse report into printable bytes', () => {
    vi.useFakeTimers()
    const harness = inputHarness()
    try {
      harness.buffer.process(`${ESC}[M`)
      vi.advanceTimersByTime(100)
      harness.buffer.process(' !!z')
      expect(harness.ordered).toEqual(['z'])
    } finally { harness.buffer.destroy() }
  })
})
