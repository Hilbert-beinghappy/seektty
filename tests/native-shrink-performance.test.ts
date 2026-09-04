import { expect, it } from 'vitest'
import { TUI, type Terminal } from '@mariozechner/pi-tui'

function terminal() {
  return { columns: 100, rows: 32, kittyProtocolActive: false, __seekttyManagedAlternateScreen: false,
    writes: [] as string[], start() {}, stop() {}, drainInput: async () => {},
    write(data: string) { this.writes.push(data) }, moveBy() {}, hideCursor() {}, showCursor() {},
    clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} } satisfies Terminal & { __seekttyManagedAlternateScreen: boolean; writes: string[] }
}
const rows = (text: string) => [...text.matchAll(/ROW\d{5}/g)].map(match => match[0])

it('bounds native recovery output by viewport rows, preserving initial history and later append', () => {
  for (const count of [100, 1000, 5000]) {
    const output = terminal(), tui = new TUI(output, false)
    let lines = Array.from({ length: count }, (_, index) => `ROW${String(index).padStart(5, '0')} ` + '\u001b[38;2;120;180;240mx\u001b[0m'.repeat(80))
    tui.addChild({ render: () => [...lines], invalidate() {} })
    const render = () => (tui as unknown as { doRender(): void }).doRender()
    try {
      render()
      expect(rows(output.writes.join(''))).toHaveLength(count)
      output.writes.length = 0
      lines = lines.slice(0, -64)
      render()
      const emitted = output.writes.join('')
      expect(rows(emitted)).toEqual(lines.slice(-output.rows).map(line => line.slice(0, 8)))
      expect(emitted).toBe('\u001b[?2026h\u001b[H'
        + lines.slice(-output.rows).map(line => '\u001b[2K' + line + '\u001b[0m\u001b]8;;\u0007').join('\r\n')
        + '\u001b[?2026l')
      expect(emitted).not.toContain('\u001b[3J')
      expect(emitted).not.toContain('\u001b[2J')
      expect(tui.captureRenderState()).toMatchObject({ previousLines: expect.any(Array), previousViewportTop: lines.length - output.rows })
      output.writes.length = 0
      lines.push('APPEND_SENTINEL')
      render()
      expect(output.writes.join('')).toContain('APPEND_SENTINEL')
      expect(output.writes.join('')).not.toContain('ROW00000')
    } finally { tui.stop() }
  }
}, 60000)
