import { describe, expect, it } from 'vitest'
import { TUI, type Terminal } from '@mariozechner/pi-tui'

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

const nextFrame = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 40))
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
    expect(output).toContain(CLEAR_TO_END)
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
})
