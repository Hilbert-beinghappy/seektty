import { createHash } from 'node:crypto'
import baseline from './fixtures/render-baseline-93a00b1.json' with { type: 'json' }
import { expect, it, vi } from 'vitest'
import { SyntaxHighlighter } from '../src/client/syntax-highlighter.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { setRendering } from '../src/client/theme.ts'

it('retains original output across every supported grammar and multiline edits', async () => {
  const languages = ['typescript','javascript','tsx','jsx','bash','json','jsonc','python','ruby','go','rust','java','c','cpp','csharp','kotlin','swift','php','yaml','toml','ini','markdown','mdx','html','css','scss','less','sql','xml','lua','diff']
  vi.stubEnv('NO_COLOR', undefined); vi.stubEnv('TERM', 'xterm-direct'); vi.stubEnv('COLORTERM', 'truecolor')
  const rendering = { colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' } as const
  setRendering(rendering)
  const ready = vi.fn()
  const actual = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, ready)
  let comparisons = 0
  const hashes = Object.fromEntries(languages.map(lang => [lang, createHash('sha256')]))
  const source = '/* comment\n continued */\nconst value = "中文😀";\nfunction f(x) { return /z+/.test(x); }\n# comment\n<node a="b">text</node>\ncat <<EOF\n${value}\nEOF\n'
  try {
    for (const lang of languages) { actual.highlight('warm', lang, 'inherit') }
    await vi.waitFor(() => { expect(ready).toHaveBeenCalledTimes(22) }, { timeout: 10000 })
    for (const theme of [BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light]) {
      actual.setTheme(theme)
      for (const lang of languages) for (const background of ['inherit', 'explicit'] as const) {
        const texts = [...Array.from({ length: Math.ceil(source.length / 7) }, (_, i) => source.slice(0, (i + 1) * 7)), source.slice(0, 13), source, source.replaceAll('\n', '\r\n')]
        for (const text of texts) {
          hashes[lang]!.update(JSON.stringify([text, actual.highlight(text, lang, background)]))
          comparisons++
        }
      }
    }
    expect(comparisons).toBe(2976)
    expect(Object.fromEntries(languages.map(lang => [lang, hashes[lang]!.digest('hex')]))).toEqual(baseline.highlighter)
  } finally { actual.dispose(); vi.unstubAllEnvs() }
}, 60000)
