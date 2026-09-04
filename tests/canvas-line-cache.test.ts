import { afterEach, expect, it, vi } from 'vitest'
import { visibleWidth } from '@mariozechner/pi-tui'
import { CanvasLineCache } from '../src/client/canvas-line-cache.ts'
import { background, setTheme, setRendering, setTerminalCanvasBackground } from '../src/client/theme.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  setTheme(BUILT_IN_THEMES.dark)
  setTerminalCanvasBackground(undefined)
})

it('matches uncached output through theme, width, encoding and terminal-background changes', () => {
  const cache = new CanvasLineCache()
  const lines = ['', 'abc', '中文👩‍💻é', '\u001b[31mred\u001b[0m', '\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007']
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
  for (const theme of [BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light]) {
    setTheme(theme)
    for (const colorMode of ['rgb', 'auto'] as const) for (const backgroundFill of ['theme', 'terminal'] as const) {
      setRendering({ colorMode, backgroundFill, terminalBackgroundSync: 'off' })
      for (const bg of [undefined, '#ffffff', '#000000']) for (const width of [1, 3, 100, 100]) {
        setTerminalCanvasBackground(bg)
        const expected = lines.map(line => background.canvas(`${line}${' '.repeat(Math.max(0, width - visibleWidth(line)))}`))
        expect(cache.render(lines, width)).toEqual(expected)
        expect(cache.render(lines, width)).toEqual(expected)
        const output = cache.render(lines, width)
        output[0] = 'caller-mutated-output'
        const edited = [...lines]; edited[0] = 'same-position-new-content'
        cache.render(edited, width)
        expect(cache.render(lines, width)).toEqual(expected)
      }
    }
  }
})
