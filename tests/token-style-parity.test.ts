import { createHash } from 'node:crypto'
import baseline from './fixtures/render-baseline-93a00b1.json' with { type: 'json' }
import { afterEach, expect, it, vi } from 'vitest'
import { styleTerminalText, setRendering, type TerminalTextStyle } from '../src/client/theme.ts'

afterEach(() => vi.unstubAllEnvs())

it('preserves exact styled bytes across capability changes, eviction and unsafe input', () => {
  const rendering = { colorMode: 'auto', backgroundFill: 'theme', terminalBackgroundSync: 'off' } as const
  setRendering(rendering)
  const hash = createHash('sha256')
  for (const key of ['NO_COLOR', 'TERM', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION']) vi.stubEnv(key, undefined)
  const texts = ['', '中文👩‍💻e\u0301', '\u001b]52;c;secret\u0007hello', '\u001b[31mred\u001b[0m', '\r\n\t\u0000end']
  for (const term of ['xterm', 'xterm-256color', 'xterm-direct', 'dumb', 'xterm']) {
    vi.stubEnv('TERM', term)
    for (let i = 0; i < 600; i++) {
      const style: TerminalTextStyle = {
        foreground: `#${i.toString(16).padStart(6, '0')}`, background: '#abcdef',
        bold: !!(i & 1), italic: !!(i & 2), underline: !!(i & 4), strikethrough: !!(i & 8),
      }
      for (const text of texts) hash.update(JSON.stringify(styleTerminalText(text, style)))
      hash.update(JSON.stringify(styleTerminalText('repeat', style)))
    }
    for (const text of texts) hash.update(JSON.stringify(styleTerminalText(text, {})))
  }
  vi.stubEnv('TERM', 'xterm-direct')
  expect(() => styleTerminalText('text', { foreground: 'invalid' })).toThrow()
  vi.stubEnv('NO_COLOR', '')
  expect(styleTerminalText('text', { foreground: 'invalid' })).toBe('text')
  expect(hash.digest('hex')).toBe(baseline.styles)
})
