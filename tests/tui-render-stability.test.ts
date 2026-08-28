import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, TUI, visibleWidth, type Component, type Terminal } from '@mariozechner/pi-tui'
import { BottomAnchoredLayout } from '../src/client/chrome.ts'
import { background } from '../src/client/theme.ts'

/**
 * Regression tests for the patched pi-tui renderer (patches/@mariozechner__pi-tui@0.73.1.patch).
 *
 * The stock renderer answers any line change above the visible viewport with a
 * full redraw: clear screen + clear scrollback + rewrite the entire history.
 * On terminals without synchronized-output (DEC 2026) support that flashes a
 * default-background frame and visibly replays old content. The patch keeps
 * scrollback untouched and repaints only the visible region, and unavoidable
 * full redraws overwrite rows in place instead of blanking the screen first.
 */

const CLEAR_SCREEN = '\u001B[2J'
const CLEAR_SCROLLBACK = '\u001B[3J'
const CLEAR_TO_END = '\u001B[0J'
const ERASE_LINE = '\u001B[2K'
const SYNC_BEGIN = '\u001B[?2026h'
const SYNC_END = '\u001B[?2026l'

class RecordingTerminal implements Terminal {
  writes: string[] = []
  columns = 40
  rows = 10
  kittyProtocolActive = false
  __seekttyManagedAlternateScreen?: boolean
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve() }
  write(data: string): void { this.writes.push(data) }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  output(): string { return this.writes.join('') }
  reset(): void { this.writes = [] }
}

const ASCII_PRINTABLE = /^[\x20-\x7e]+$/u

const nextFrame = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 40))
}

const tuiCursor = (tui: TUI): { cursorRow: number; hardwareCursorRow: number } =>
  tui as unknown as { cursorRow: number; hardwareCursorRow: number }

const rowTokens = (text: string): string[] =>
  [...text.matchAll(/row-\d+/gu)].map(match => match[0]!)

const uniqueTokens = (tokens: readonly string[]): boolean =>
  new Set(tokens).size === tokens.length

const isAsciiCols = (line: string, cols: number): boolean =>
  line.length === cols && ASCII_PRINTABLE.test(line)

const csiCount = (output: string, token: string): number =>
  token.length === 0 ? 0 : output.split(token).length - 1

const stubRows = (...values: string[]): Component => ({
  render: () => values,
  invalidate: () => undefined,
})

/** Fill a row to exactly `cols` using `unit`, with ASCII `#` only for a leftover odd cell. */
const exactWidthLine = (unit: string, cols: number): string => {
  const unitWidth = visibleWidth(unit)
  expect(unitWidth).toBeGreaterThan(0)
  const count = Math.floor(cols / unitWidth)
  const used = count * unitWidth
  return `${unit.repeat(count)}${'#'.repeat(cols - used)}`
}

interface Harness {
  terminal: RecordingTerminal
  tui: TUI
  lines: string[]
  initialOutput: string
}

/** Start a TUI whose single component renders 30 unique lines into a 10-row terminal. */
async function startedTui(): Promise<Harness> {
  const terminal = new RecordingTerminal()
  const tui = new TUI(terminal, false)
  const lines = Array.from({ length: 30 }, (_, index) => `row-${String(index).padStart(2, '0')}`)
  tui.addChild({ render: () => [...lines], invalidate: () => undefined })
  tui.start()
  await nextFrame()
  expect(terminal.output()).toContain('row-29')
  const initialOutput = terminal.output()
  terminal.reset()
  return { terminal, tui, lines, initialOutput }
}

describe('patched pi-tui render stability', () => {
  it('clamps a tall first frame to the physical viewport', async () => {
    const { terminal, tui, initialOutput: output } = await startedTui()
    expect(output).not.toContain('row-00')
    expect(output).toContain('row-20')
    expect(output).toContain('row-29')
    expect(output.match(/\r\n/gu)?.length ?? 0).toBeLessThan(terminal.rows)
    tui.stop()
  })

  it('repaints only visible rows when a scrollback row changes alongside a visible row', async () => {
    const { terminal, tui, lines } = await startedTui()
    // Rows 0-19 are scrollback (30 lines into a 10-row terminal); row 25 is visible.
    lines[5] = 'row-05-changed'
    lines[25] = 'row-25-changed'
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).not.toContain('row-05-changed')
    expect(output).toContain('row-25-changed')
    expect(tui.fullRedraws).toBe(1) // only the initial frame
    tui.stop()
  })

  it('leaves the screen untouched when every change is hidden in scrollback', async () => {
    const { terminal, tui, lines } = await startedTui()
    lines[3] = 'row-03-changed'
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain('row-03-changed')
    // Follow-up visible change still renders normally against the recorded content.
    terminal.reset()
    lines[27] = 'row-27-changed'
    tui.requestRender()
    await nextFrame()
    expect(terminal.output()).toContain('row-27-changed')
    expect(tui.fullRedraws).toBe(1)
    tui.stop()
  })

  it('never blanks the whole screen on a forced full redraw', async () => {
    const { terminal, tui, lines } = await startedTui()
    lines[5] = 'row-05-restyled'
    lines[25] = 'row-25-restyled'
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).not.toContain(CLEAR_TO_END)
    // Tall content: only the visible window is painted, so older turns stay
    // in native scrollback instead of replaying through the viewport.
    expect(output).not.toContain('row-05-restyled')
    expect(output).toContain('row-25-restyled')
    expect(output).toContain('row-29')
    tui.stop()
  })

  it('does not replay early history when the terminal width changes', async () => {
    const { terminal, tui } = await startedTui()
    terminal.columns = 39
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).not.toContain('row-00')
    expect(output).toContain('row-29')
    tui.stop()
  })

  it('clears removed viewport rows without a full-screen redraw', async () => {
    const { terminal, tui, lines } = await startedTui()
    lines.length = 0
    lines.push('only-row')
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain('only-row')
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(tui.fullRedraws).toBe(1)
    tui.stop()
  })

  it('does not append a main-screen newline after a managed alternate-screen restore', async () => {
    const { terminal, tui } = await startedTui()
    terminal.__seekttyManagedAlternateScreen = true
    terminal.reset()
    tui.stop()
    expect(terminal.output()).not.toContain('\r\n')
    expect(terminal.output()).not.toMatch(/\u001B\[\d+[AB]/u)
  })

  it('discards queued frames before alternate-screen restoration', async () => {
    const { terminal, tui, lines } = await startedTui()
    const managed = tui as TUI & { stopRenderingSync(): void }
    terminal.reset()
    lines[29] = 'must-not-reach-main-screen'
    tui.requestRender()
    managed.stopRenderingSync()
    await nextFrame()
    expect(terminal.output()).not.toContain('must-not-reach-main-screen')
    tui.stop()
  })

  it('preserves the upstream stop newline outside a managed alternate screen', async () => {
    const { terminal, tui } = await startedTui()
    terminal.reset()
    tui.stop()
    expect(terminal.output()).toContain('\r\n')
  })

  it('skips per-row 2K and trailing 0J when a forced redraw fills the viewport with full-width rows', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const lines = Array.from({ length: terminal.rows }, (_, index) =>
      `full-${String(index).padStart(2, '0')}`.padEnd(terminal.columns, ' '))
    expect(lines.every(line => isAsciiCols(line, terminal.columns))).toBe(true)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain(SYNC_BEGIN)
    expect(output).toContain(SYNC_END)
    expect(output).toContain('\u001B[H')
    expect(output).not.toContain(ERASE_LINE)
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).toContain('full-00')
    expect(output).toContain('full-09')
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(terminal.rows - 1)
    expect(cursor.hardwareCursorRow).toBe(cursor.cursorRow)
    tui.stop()
  })

  it('keeps per-row 2K and skips trailing 0J on a full-height forced redraw of short rows', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const lines = Array.from({ length: terminal.rows }, (_, index) => `short-${String(index)}`)
    expect(lines.every(line => line.length < terminal.columns && ASCII_PRINTABLE.test(line))).toBe(true)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain(SYNC_BEGIN)
    expect(output).toContain(SYNC_END)
    expect(output).toContain(ERASE_LINE)
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(terminal.rows - 1)
    expect(cursor.hardwareCursorRow).toBe(cursor.cursorRow)
    tui.stop()
  })

  it('clears rows below a short-height full-width forced redraw without ED0 on a wrap-pending last cell', async () => {
    const terminal = new RecordingTerminal()
    const contentRows = 3
    const lines = [
      `${'a'.repeat(terminal.columns - 1)}A`,
      `${'b'.repeat(terminal.columns - 1)}B`,
      `${'c'.repeat(terminal.columns - 1)}#`,
    ]
    expect(lines).toHaveLength(contentRows)
    expect(lines.every(line => isAsciiCols(line, terminal.columns))).toBe(true)
    expect(lines[2]!.endsWith('#')).toBe(true)
    const tui = new TUI(terminal, false)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain(SYNC_BEGIN)
    expect(output).toContain(SYNC_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(`#${CLEAR_TO_END}`)
    expect(output).toContain('#')
    const extraLines = terminal.rows - contentRows
    const leftover = `\r\u001B[1B${Array.from({ length: extraLines }, (_, index) =>
      `\r${ERASE_LINE}${index < extraLines - 1 ? '\u001B[1B' : ''}`).join('')}\u001B[${extraLines}A`
    expect(output).toContain(leftover)
    expect(csiCount(output, ERASE_LINE)).toBe(extraLines)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(contentRows - 1)
    expect(cursor.hardwareCursorRow).toBe(cursor.cursorRow)
    tui.stop()
  })

  it('clears rows below a short-height short-row forced redraw without ED0', async () => {
    const terminal = new RecordingTerminal()
    const contentRows = 3
    const lines = Array.from({ length: contentRows }, (_, index) => `short-${String(index)}`)
    expect(lines.every(line => line.length < terminal.columns && ASCII_PRINTABLE.test(line))).toBe(true)
    const tui = new TUI(terminal, false)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).toContain('short-0')
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(contentRows - 1)
    expect(cursor.hardwareCursorRow).toBe(cursor.cursorRow)
    tui.stop()
  })

  it('does not let trailing 0J erase a visible last-cell # on a full-height mixed forced redraw', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const lines = [
      ...Array.from({ length: 8 }, () => 'x'.repeat(terminal.columns)),
      'short',
      `${'x'.repeat(terminal.columns - 1)}#`,
    ]
    expect(lines.slice(0, 8).every(line => isAsciiCols(line, terminal.columns))).toBe(true)
    expect(lines[8]!.length < terminal.columns && ASCII_PRINTABLE.test(lines[8]!)).toBe(true)
    expect(isAsciiCols(lines[9]!, terminal.columns)).toBe(true)
    expect(lines[9]!.endsWith('#')).toBe(true)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain(SYNC_BEGIN)
    expect(output).toContain(SYNC_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).toContain(ERASE_LINE)
    expect(output).toContain('#')
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(`#${CLEAR_TO_END}`)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(terminal.rows - 1)
    expect(cursor.hardwareCursorRow).toBe(cursor.cursorRow)
    tui.stop()
  })

  it('allows 0J only from Home on an empty forced redraw and clears the viewport', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    tui.addChild({ render: () => [], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain('\u001B[H')
    expect(output).toContain(CLEAR_TO_END)
    expect(output.indexOf('\u001B[H')).toBeLessThan(output.indexOf(CLEAR_TO_END))
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
    expect(csiCount(output, CLEAR_TO_END)).toBe(1)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(0)
    expect(cursor.hardwareCursorRow).toBe(0)
    tui.stop()
  })

  it('preserves a one-row exact-width last cell and clears rows below without ED0', async () => {
    const terminal = new RecordingTerminal()
    const line = `${'x'.repeat(terminal.columns - 1)}#`
    expect(isAsciiCols(line, terminal.columns)).toBe(true)
    const tui = new TUI(terminal, false)
    tui.addChild({ render: () => [line], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    tui.requestRender(true)
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
    expect(output).toContain('#')
    expect(output).not.toContain(`#${CLEAR_TO_END}`)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(0)
    expect(cursor.hardwareCursorRow).toBe(0)
    tui.stop()
  })

  it('keeps last-cell and 2026 balance when height shrinks onto a full-width frame', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    tui.addChild({
      render: () => Array.from({ length: terminal.rows }, (_, index) =>
        `${'y'.repeat(terminal.columns - 1)}${index === terminal.rows - 1 ? '#' : 'Y'}`),
      invalidate: () => undefined,
    })
    tui.start()
    await nextFrame()
    terminal.reset()
    terminal.rows = 6
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(output).not.toContain(CLEAR_TO_END)
    expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
    expect(output).toContain('#')
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(5)
    expect(cursor.hardwareCursorRow).toBe(5)
    tui.stop()
  })

  it('clears newly exposed rows when height grows under a three-row exact-width frame', async () => {
    const terminal = new RecordingTerminal()
    const lines = [
      `${'a'.repeat(terminal.columns - 1)}A`,
      `${'b'.repeat(terminal.columns - 1)}B`,
      `${'c'.repeat(terminal.columns - 1)}#`,
    ]
    const tui = new TUI(terminal, false)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    terminal.reset()
    terminal.rows = 14
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
    expect(output).toContain('#')
    expect(output).toContain(ERASE_LINE)
    const cursor = tuiCursor(tui)
    expect(cursor.cursorRow).toBe(2)
    expect(cursor.hardwareCursorRow).toBe(2)
    tui.stop()
  })

  it('repaints an exact-width last cell after a width shrink without ED0, 2J, or 3J', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    tui.addChild({
      render: () => [`${'z'.repeat(Math.max(1, terminal.columns - 1))}#`],
      invalidate: () => undefined,
    })
    tui.start()
    await nextFrame()
    terminal.reset()
    terminal.columns = 20
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).not.toContain(CLEAR_TO_END)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_SCROLLBACK)
    expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
    expect(output).toContain('#')
    expect(output).not.toContain(`#${CLEAR_TO_END}`)
    tui.stop()
  })

  it('follows the tail without duplicating or replaying the head when a short child grows past the viewport', async () => {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const lines = Array.from({ length: 5 }, (_, index) => `row-${String(index).padStart(2, '0')}`)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    expect(rowTokens(terminal.output())).toEqual(['row-00', 'row-01', 'row-02', 'row-03', 'row-04'])

    terminal.reset()
    lines.length = 0
    lines.push(...Array.from({ length: 25 }, (_, index) => `row-${String(index).padStart(2, '0')}`))
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    const tokens = rowTokens(output)
    expect(output).not.toContain('row-00')
    expect(output).toContain('row-24')
    expect(tokens.at(-1)).toBe('row-24')
    expect(uniqueTokens(tokens)).toBe(true)
    tui.stop()
  })
})

describe('differential skip-2K on exact-width changed rows (TUI bytes, not a native oracle)', () => {
  async function startedExact(line: string): Promise<Harness> {
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const lines = Array.from({ length: terminal.rows }, () => line)
    tui.addChild({ render: () => [...lines], invalidate: () => undefined })
    tui.start()
    await nextFrame()
    expect(visibleWidth(line)).toBe(terminal.columns)
    expect(tui.fullRedraws).toBe(1)
    terminal.reset()
    return { terminal, tui, lines, initialOutput: '' }
  }

  it('does not emit 2K when one exact-width ASCII, CJK, emoji, or SGR row changes', async () => {
    const cases = [
      ['A'.repeat(40), 'B'.repeat(40), 'B'.repeat(40)],
      [exactWidthLine('中', 40), exactWidthLine('文', 40), exactWidthLine('文', 40)],
      [exactWidthLine('😀', 40), exactWidthLine('😄', 40), exactWidthLine('😄', 40)],
      [`\u001B[44m${'C'.repeat(40)}\u001B[0m`, `\u001B[45m${'D'.repeat(40)}\u001B[0m`, 'D'.repeat(40)],
    ] as const
    for (const [before, after, token] of cases) {
      const { terminal, tui, lines } = await startedExact(before)
      lines[3] = after
      tui.requestRender()
      await nextFrame()
      const output = terminal.output()
      expect(csiCount(output, SYNC_BEGIN), token).toBe(csiCount(output, SYNC_END))
      expect(output, token).toContain(token)
      expect(output, token).not.toContain(ERASE_LINE)
      expect(output, token).not.toContain(CLEAR_SCREEN)
      expect(output, token).not.toContain(CLEAR_SCROLLBACK)
      expect(output, token).not.toContain(CLEAR_TO_END)
      expect(tui.fullRedraws, token).toBe(1)
      tui.stop()
    }
  })

  it('emits 2K when a full-width row shrinks so the tail must clear', async () => {
    const { terminal, tui, lines } = await startedExact('A'.repeat(40))
    lines[3] = 'hi'
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain(`${ERASE_LINE}hi`)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(output).not.toContain(CLEAR_TO_END)
    expect(tui.fullRedraws).toBe(1)
    tui.stop()
  })
})

describe('unicode exact-width skip-2K (TUI bytes, not a terminal oracle)', () => {
  it('skips 2K on forced exact-width CJK and emoji rows, and keeps 2K on a short SGR span', async () => {
    for (const unit of ['中', '😀'] as const) {
      const terminal = new RecordingTerminal()
      const line = exactWidthLine(unit, terminal.columns)
      expect(visibleWidth(line)).toBe(terminal.columns)
      const tui = new TUI(terminal, false)
      tui.addChild({
        render: () => Array.from({ length: terminal.rows }, () => line),
        invalidate: () => undefined,
      })
      tui.start()
      await nextFrame()
      terminal.reset()
      tui.requestRender(true)
      await nextFrame()
      const output = terminal.output()
      expect(csiCount(output, SYNC_BEGIN)).toBe(csiCount(output, SYNC_END))
      expect(output).not.toContain(ERASE_LINE)
      expect(output).not.toContain(CLEAR_TO_END)
      expect(output).not.toContain(CLEAR_SCREEN)
      tui.stop()
    }

    const shortTerm = new RecordingTerminal()
    const shortBg = `\u001B[44mhi\u001B[0m`
    expect(visibleWidth(shortBg)).toBeLessThan(shortTerm.columns)
    const shortTui = new TUI(shortTerm, false)
    shortTui.addChild({
      render: () => Array.from({ length: shortTerm.rows }, () => shortBg),
      invalidate: () => undefined,
    })
    shortTui.start()
    await nextFrame()
    shortTerm.reset()
    shortTui.requestRender(true)
    await nextFrame()
    expect(shortTerm.output()).toContain(ERASE_LINE)
    shortTui.stop()

    const padded = new RecordingTerminal()
    const bgLine = `\u001B[44m${' '.repeat(padded.columns)}\u001B[0m`
    expect(visibleWidth(bgLine)).toBe(padded.columns)
    const paddedTui = new TUI(padded, false)
    paddedTui.addChild({
      render: () => Array.from({ length: padded.rows }, () => bgLine),
      invalidate: () => undefined,
    })
    paddedTui.start()
    await nextFrame()
    padded.reset()
    paddedTui.requestRender(true)
    await nextFrame()
    expect(padded.output()).not.toContain(ERASE_LINE)
    paddedTui.stop()
  })
})

describe('SeekTTY Box + BottomAnchoredLayout first-frame bytes (not native pixels)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(process.env, 'NO_COLOR')
  })

  async function startedCanvas(columns: number, rows: number, color: boolean): Promise<{
    terminal: RecordingTerminal
    tui: TUI
  }> {
    vi.unstubAllEnvs()
    if (color) {
      Reflect.deleteProperty(process.env, 'NO_COLOR')
      vi.stubEnv('COLORTERM', 'truecolor')
      vi.stubEnv('TERM', 'xterm-256color')
      vi.stubEnv('TERM_PROGRAM', 'iTerm.app')
    }
    else {
      vi.stubEnv('NO_COLOR', '1')
    }
    const terminal = new RecordingTerminal()
    terminal.columns = columns
    terminal.rows = rows
    const tui = new TUI(terminal, false)
    const canvas = new Box(0, 0, background.canvas)
    canvas.addChild(new BottomAnchoredLayout(
      () => terminal.rows,
      stubRows('context-bar'),
      stubRows('hello', 'world'),
      stubRows('editor-top', 'editor-body', 'editor-bot'),
      stubRows('status-row'),
    ))
    tui.addChild(canvas)
    tui.start()
    await nextFrame()
    return { terminal, tui }
  }

  it('does not emit 2K when a full-width canvas child changes without a forced redraw', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const terminal = new RecordingTerminal()
    terminal.columns = 40
    terminal.rows = 10
    const tui = new TUI(terminal, false)
    const mid = ['hello', 'world']
    const canvas = new Box(0, 0, background.canvas)
    canvas.addChild(new BottomAnchoredLayout(
      () => terminal.rows,
      stubRows('context-bar'),
      { render: () => mid, invalidate: () => undefined },
      stubRows('editor-top', 'editor-body', 'editor-bot'),
      stubRows('status-row'),
    ))
    tui.addChild(canvas)
    tui.start()
    await nextFrame()
    expect(tui.render(terminal.columns).every(line => visibleWidth(line) === terminal.columns)).toBe(true)
    terminal.reset()
    mid[0] = 'hello!'
    tui.requestRender()
    await nextFrame()
    const output = terminal.output()
    expect(output).toContain('hello!')
    expect(output).not.toContain(ERASE_LINE)
    expect(output).not.toContain(CLEAR_SCREEN)
    expect(tui.fullRedraws).toBe(1)
    tui.stop()
  })

  it('emits a full-height canvas without 2J/3J, and skips 2K on force', async () => {
    for (const [columns, rows, color] of [[40, 10, false], [80, 24, true]] as const) {
      const label = `${columns}x${rows} color=${color}`
      const { terminal, tui } = await startedCanvas(columns, rows, color)
      const first = terminal.output()
      expect(first, label).not.toContain(CLEAR_SCREEN)
      expect(first, label).not.toContain(CLEAR_SCROLLBACK)
      const painted = tui.render(columns)
      expect(painted.length, label).toBe(rows)
      expect(painted.every(line => visibleWidth(line) === columns), label).toBe(true)
      if (color) expect(first, label).toContain('\u001B[49m')
      terminal.reset()
      tui.requestRender(true)
      await nextFrame()
      const forced = terminal.output()
      expect(forced, `${label} force`).not.toContain(ERASE_LINE)
      expect(forced, `${label} force`).not.toContain(CLEAR_TO_END)
      tui.stop()
    }
  })
})
