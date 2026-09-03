import { afterEach, describe, expect, it, vi } from 'vitest'
import { Box, TUI, visibleWidth, type Terminal } from '@mariozechner/pi-tui'
import { BottomAnchoredLayout } from '../src/client/chrome.ts'
import {
  background,
  color,
  highlightCodeLines,
  interaction,
  setBackgroundMode,
  setRendering,
  setCodeHighlighter,
  setTerminalCanvasBackground,
  setTheme,
} from '../src/client/theme.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { tuiFrameApi } from '../src/client/pi-tui-adapters.ts'
import type { TuiBackgroundMode } from '../src/protocol.ts'
import { sgrCells } from './helpers/sgr-colors.ts'

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
  setCodeHighlighter(undefined)
  setTerminalCanvasBackground(undefined)
  setTheme(BUILT_IN_THEMES.dark)
})

describe('main canvas background semantics', () => {
  it.each(['theme', 'terminal', 'explicit', 'foreground'] as const)('restores %s semantics after nested text resets and theme preview cancellation', mode => {
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

  it('inherits panel and code backgrounds while preserving hover and selection geometry', () => {
    truecolor()
    const stableLayers = () => [interaction.hover('hover'), background.selection('selected')]
    setBackgroundMode('explicit')
    const original = stableLayers()
    for (const mode of ['theme', 'terminal', 'explicit', 'foreground'] as const) {
      setBackgroundMode(mode)
      expect(stableLayers()).toEqual(original)
      const panel = background.surface('panel')
      const code = background.code('const 中文 = 1')
      expect(panel).toContain(mode === 'explicit' ? '\u001B[48;2;17;24;39m' : DEFAULT_BG)
      expect(code).toContain(mode === 'explicit' ? '\u001B[48;2;17;24;39m' : DEFAULT_BG)
      if (mode !== 'explicit') {
        expect(panel).not.toContain('\u001B[48;')
        expect(code).not.toContain('\u001B[48;')
      }
      const composed = background.canvas(`${panel} ${code} ${original.join(' ')} tail`)
      expect(plain(composed)).toBe('panel const 中文 = 1 hover selected tail')
      expect(visibleWidth(composed)).toBe(visibleWidth(plain(composed)))
      for (const line of [panel, code, ...original]) expect(composed).toContain(line.slice(0, line.indexOf('m') + 1))
    }
  })

  it('passes the current code background policy to the highlighter on every render', () => {
    const highlighter = vi.fn((_code: string, _language: string | undefined, mode: 'inherit' | 'explicit') => [mode])
    setCodeHighlighter(highlighter)
    for (const mode of ['theme', 'terminal', 'explicit', 'theme'] as const) {
      setBackgroundMode(mode)
      expect(highlightCodeLines('const value = 1', 'ts')).toEqual([mode === 'explicit' ? 'explicit' : 'inherit'])
    }
    expect(highlighter.mock.calls.map(call => call[2])).toEqual(['inherit', 'inherit', 'explicit', 'inherit'])
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
    const redraw = async (mode: TuiBackgroundMode | 'rgb-fill') => {
      terminal.writes = []
      if (mode === 'rgb-fill') setRendering({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
      else setBackgroundMode(mode)
      tui.invalidate()
      tui.requestRender(true)
      await frame()
      const painted = tui.render(terminal.columns)
      expect(painted).toHaveLength(terminal.rows)
      expect(painted.every(row => visibleWidth(row) === terminal.columns)).toBe(true)
      for (const row of painted) {
        const filled = mode === 'explicit' || mode === 'rgb-fill'
        expect(row).toContain(filled ? RGB_BG : DEFAULT_BG)
        if (!filled) expect(row).not.toContain(RGB_BG)
        if (filled) expect(sgrCells(row).every(cell => cell.background !== undefined)).toBe(true)
      }
      expect(terminal.writes.join('')).not.toMatch(/\u001B\[[23]J/u)
      return painted.map(plain)
    }
    tui.start()
    try {
      await frame()
      const original = await redraw('explicit')
      const geometry = tuiFrameApi(tui).getLastFrameGeometry?.()
      for (const mode of ['theme', 'terminal', 'foreground', 'rgb-fill', 'explicit', 'theme'] as const) {
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
      const nested = tui.showOverlay({ render: () => [background.surface(color.brand('nested'))], invalidate: () => undefined }, { width: 16 })
      await redraw('foreground')
      expect(terminal.writes.join('')).toContain('nested')
      await redraw('rgb-fill')
      expect(terminal.writes.join('')).toContain('nested')
      nested.hide()
      await frame()
      overlay.hide()
      rows = ['new'] // a shorter/scrolling transcript still fills/cleans the entire canvas
      await redraw('terminal')
      expect(terminal.writes.join('')).not.toContain('overlay')
      expect(terminal.writes.join('')).not.toContain('old-long-row')
      for (const [columns, height] of [[40, 12], [100, 30]] as const) {
        terminal.columns = columns
        terminal.rows = height
        await redraw('rgb-fill')
        expect(tuiFrameApi(tui).getLastFrameGeometry?.().terminalWidth).toBe(columns)
      }
    } finally { tui.stop() }
  })
})
