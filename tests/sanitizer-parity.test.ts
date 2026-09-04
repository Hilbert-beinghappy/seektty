import { createHash } from 'node:crypto'
import baseline from './fixtures/render-baseline-93a00b1.json' with { type: 'json' }
import { expect, it } from 'vitest'
import { escapeTerminalText } from '../src/client/theme.ts'

it('matches previous sanitizer for controls, truncated sequences and deterministic fuzz', () => {
  const hash = createHash('sha256')
  const fragments = ['text', '中👩‍💻é', '\t\n', '\r\b', '\u001b[31m', '\u001b[38:2::1:2:3m', '\u001b[2J', '\u001b]8;;https://example.test\u0007', '\u001b]52;c;payload\u001b\\', '\u001bPbad\u001b\\', '\u0090bad\u009c', '\u009b31m', '\u001b', '\u001b[', '\u001b]unterminated', '\u001b(B', '\u0000', '\ud800', '\udc00']
  let state = 0x12345678
  for (let i = 0; i < 10000; i++) {
    let text = ''
    for (let j = 0; j < 8; j++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      text += fragments[state % fragments.length]
    }
    hash.update(JSON.stringify(escapeTerminalText(text)))
  }
  for (let code = 0; code < 256; code++) {
    const text = `before${String.fromCharCode(code)}after`
    hash.update(JSON.stringify(escapeTerminalText(text)))
  }
  expect(hash.digest('hex')).toBe(baseline.sanitizer)
})
