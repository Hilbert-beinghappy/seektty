import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, TUI, visibleWidth, type Terminal } from '@mariozechner/pi-tui'
import { BottomAnchoredLayout } from '../src/client/chrome.ts'
import { background, color, setBackgroundMode, setTerminalCanvasBackground, setTheme } from '../src/client/theme.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { tuiFrameApi } from '../src/client/pi-tui-adapters.ts'
import type { TuiBackgroundMode } from '../src/protocol.ts'

const DEFAULT_BG = '\u001B[49m'
const RGB_BG = '\u001B[48;2;9;14;27m'
const plain = (text: string) => text.replace(/\u001B\[[0-9;:]*m/gu, '')

function truecolor() {
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
  setTheme(BUILT_IN_THEMES.dark)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setBackgroundMode('theme')
  setTerminalCanvasBackground(undefined)
  setTheme(BUILT_IN_THEMES.dark)
})

describe('main canvas background semantics', () => {
  it.each(['theme', 'terminal', 'explicit'] as const)('restores %s semantics after nested text resets and theme preview cancellation', mode => {
    truecolor()
    setBackgroundMode(mode)
    const prefix = mode === 'explicit' ? RGB_BG : DEFAULT_BG
    const row = background.canvas(`before ${color.brand('中文')} after\u001B[m end`)
    expect(row.split(prefix)).toHaveLength(4)
    if (mode !== 'explicit') expect(row).not.toContain('\u001B[48;')
    setTheme(BUILT_IN_THEMES.light)
    setTheme(BUILT_IN_THEMES.dark)
    expect(background.canvas(`before ${color.brand('中文')} after\u001B[m end`)).toBe(row)
  })

  it('leaves panel, code, hover and selection colors and text widths unchanged', () => {
    truecolor()
    const layers = () => [background.surface('panel'), background.code('const 中文 = 1'), background.hover('hover'), background.selection('selected')]
    setBackgroundMode('explicit')
    const original = layers()
    for (const mode of ['theme', 'terminal', 'explicit'] as const) {
      setBackgroundMode(mode)
      expect(layers()).toEqual(original)
      const composed = background.canvas(`${original.join(' ')} tail`)
      expect(plain(composed)).toBe('panel const 中文 = 1 hover selected tail')
      expect(visibleWidth(composed)).toBe(visibleWidth(plain(composed)))
      for (const line of original) expect(composed).toContain(line.slice(0, line.indexOf('m') + 1))
    }
  })
})

class RecordingTerminal implements Terminal {
  writes: string[] = []
  columns = 80
  rows = 24
  kittyProtocolActive = false
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
}

describe('canvas / layout / overlay frame integration (synthetic terminal)', () => {
  it('repaints all modes, resize, scrolling and overlay removal without changing geometry or leaving unfilled cells', async () => {
    vi.useFakeTimers()
    truecolor()
    const terminal = new RecordingTerminal()
    const tui = new TUI(terminal, false)
    const canvas = new Box(0, 0, background.canvas)
    let rows = ['old-long-row', 'second-row']
    const fixed = (text: string) => ({ render: () => [text], invalidate: () => undefined })
    canvas.addChild(new BottomAnchoredLayout(() => terminal.rows, fixed('header'),
      { render: () => rows, invalidate: () => undefined }, fixed('composer'), fixed('status')))
    tui.addChild(canvas)
    const frame = async () => { await vi.advanceTimersByTimeAsync(40) }
    const redraw = async (mode: TuiBackgroundMode) => {
      terminal.writes = []
      setBackgroundMode(mode)
      tui.invalidate()
      tui.requestRender(true)
      await frame()
      const painted = tui.render(terminal.columns)
      expect(painted).toHaveLength(terminal.rows)
      expect(painted.every(row => visibleWidth(row) === terminal.columns)).toBe(true)
      for (const row of painted) {
        expect(row).toContain(mode === 'explicit' ? RGB_BG : DEFAULT_BG)
        if (mode !== 'explicit') expect(row).not.toContain(RGB_BG)
      }
      expect(terminal.writes.join('')).not.toMatch(/\u001B\[[23]J/u)
      return painted.map(plain)
    }
    tui.start()
    try {
      await frame()
      const original = await redraw('explicit')
      const geometry = tuiFrameApi(tui).getLastFrameGeometry?.()
      for (const mode of ['theme', 'terminal', 'explicit', 'theme'] as const) {
        expect(await redraw(mode)).toEqual(original)
        expect(tuiFrameApi(tui).getLastFrameGeometry?.()).toEqual(geometry)
      }
      const beforeReply = tui.render(terminal.columns)
      setTerminalCanvasBackground('#ffffff')
      expect(await redraw('terminal')).toEqual(original)
      expect(tui.render(terminal.columns)).not.toEqual(beforeReply)
      expect(tuiFrameApi(tui).getLastFrameGeometry?.()).toEqual(geometry)
      setTerminalCanvasBackground(undefined)
      const overlay = tui.showOverlay({ render: () => [background.surface('overlay')], invalidate: () => undefined }, { width: 20 })
      await frame()
      overlay.hide()
      rows = ['new'] // a shorter/scrolling transcript still fills/cleans the entire canvas
      await redraw('terminal')
      expect(terminal.writes.join('')).not.toContain('overlay')
      expect(terminal.writes.join('')).not.toContain('old-long-row')
      for (const [columns, height] of [[40, 12], [100, 30]] as const) {
        terminal.columns = columns
        terminal.rows = height
        await redraw('theme')
        expect(tuiFrameApi(tui).getLastFrameGeometry?.().terminalWidth).toBe(columns)
      }
    } finally { tui.stop() }
  })
})
