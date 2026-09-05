import { expect, it, vi } from 'vitest'
import xterm from '@xterm/headless'
import { TUI, type Terminal } from '@mariozechner/pi-tui'
import { NativeOutput } from '../src/client/native-output.ts'
import type { ManagedTerminal } from '../src/client/terminal-session.ts'

it('keeps committed screen/scrollback content once through tail updates, corrections and explicit replay', async () => {
  const vt = new xterm.Terminal({ cols: 40, rows: 10, scrollback: 10000, allowProposedApi: true })
  const output = new NativeOutput(bytes => new Promise(resolve => { vt.write(bytes, resolve) }), error => { throw error })
  const lines = (): string[] => Array.from({ length: vt.buffer.active.length }, (_, i) => vt.buffer.active.getLine(i)!.translateToString(true))
  const history = Array.from({ length: 1000 }, (_, i) => `HISTORY_${i.toString().padStart(4, '0')}`)
  for (let start = 0; start < history.length; start += 256) {
    await output.frame(history.slice(start, start + 256), ['ACTIVE', 'DRAFT'], 40, 10, { row: 1, col: 5 })
  }
  for (let i = 0; i < 20; i++) await output.frame([], [`ACTIVE_${i}`, 'DRAFT'], 40, 10, { row: 1, col: 5 })
  await output.frame(['FINAL_中文😀'], ['DRAFT'], 40, 10, { row: 0, col: 5 })
  const text = lines().join('\n')
  expect(lines().filter(line => /^HISTORY_\d{4}$/u.test(line))).toEqual(history)
  expect(text.match(/FINAL_中文😀/gu)).toHaveLength(1)
  expect(text).not.toContain('ACTIVE')
  expect(text.match(/DRAFT/g)).toHaveLength(1)
  expect(vt.buffer.active.cursorY).toBe(9)
  expect(vt.buffer.active.cursorX).toBe(5)
  output.reset()
  await output.frame(['REPLAY', ...history.slice(0, 2)], ['DRAFT'], 40, 10, null)
  expect(lines().filter(line => line === 'HISTORY_0000')).toHaveLength(2)
  vt.dispose()
})

it('uses the real patched TUI component/overlay pipeline and bypasses retained row diff only for the candidate', async () => {
  const hook = vi.fn((_lines: string[]) => true)
  const terminal: Terminal & ManagedTerminal = {
    columns: 40, rows: 10, kittyProtocolActive: false, __seekttyManagedAlternateScreen: false,
    __seekttyNativeFrame: hook, start() {}, stop() {}, drainInput: async () => {}, write: vi.fn(),
    moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
  }
  const tui = new TUI(terminal, false)
  tui.addChild({ render: () => ['TAIL_中文😀'], invalidate() {} })
  ;(tui as unknown as { doRender(): void }).doRender()
  expect(hook).toHaveBeenCalledOnce()
  expect(hook.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.stringContaining('TAIL_中文😀')]))
  expect(terminal.write).not.toHaveBeenCalled()
  terminal.__seekttyManagedAlternateScreen = true
  ;(tui as unknown as { doRender(): void }).doRender()
  expect(hook).toHaveBeenCalledOnce()
  expect(terminal.write).toHaveBeenCalled()
  tui.stop()
})
