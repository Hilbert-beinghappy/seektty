import { expect, it, vi } from 'vitest'
import { TUI, type Terminal } from '@mariozechner/pi-tui'

function terminal(native: boolean): Omit<Terminal, 'columns' | 'rows'> & { columns: number; rows: number; writes: string[]; __seekttyManagedAlternateScreen: boolean } {
  return { columns: 80, rows: 12, kittyProtocolActive: false, __seekttyManagedAlternateScreen: !native,
    writes: [], start() {}, stop() {}, drainInput: async () => {}, write(text) { this.writes.push(text) },
    moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} }
}

it('submits input without waiting for the stream frame interval or clearing history', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const output = terminal(true), tui = new TUI(output, false)
  let text = 'before'
  const component = { render: () => [text], invalidate() {}, handleInput: (data: string) => { text += data } }
  tui.addChild(component); tui.setFocus(component)
  const driver = tui as unknown as { doRender(): void; scheduleRender(): void; handleInput(data: string): void; lastRenderAt: number; renderRequested: boolean }
  try {
    driver.doRender(); output.writes.length = 0
    driver.lastRenderAt = performance.now(); driver.renderRequested = true; driver.scheduleRender()
    await vi.advanceTimersByTimeAsync(1)
    expect(output.writes).toEqual([])
    driver.handleInput('X')
    await new Promise<void>(resolve => process.nextTick(resolve))
    expect(output.writes.join('')).toContain('beforeX')
    expect(output.writes.join('')).not.toContain('\u001b[3J')
    expect(output.writes.join('')).not.toContain('\u001b[2J')
    output.writes.length = 0
    await vi.advanceTimersByTimeAsync(20)
    expect(output.writes).toEqual([])
  } finally { tui.stop(); vi.useRealTimers() }
})

it('coalesces a keyboard data batch and cancels its queued frame on stop', async () => {
  const output = terminal(true), tui = new TUI(output, false)
  let text = '', renders = 0
  const component = { render: () => { renders++; return [text] }, invalidate() {}, handleInput: (data: string) => { text += data } }
  tui.addChild(component); tui.setFocus(component)
  const driver = tui as unknown as { handleInput(data: string): void; stopRenderingSync(): void }
  try {
    for (const character of 'batch') driver.handleInput(character)
    expect(renders).toBe(0)
    await new Promise<void>(resolve => process.nextTick(resolve))
    expect(renders).toBe(1)
    expect(output.writes.join('')).toContain('batch')
    output.writes.length = 0
    driver.handleInput('cancelled'); driver.stopRenderingSync()
    await new Promise<void>(resolve => process.nextTick(resolve))
    expect(renders).toBe(1)
    expect(output.writes).toEqual([])
  } finally { tui.stop() }
})
