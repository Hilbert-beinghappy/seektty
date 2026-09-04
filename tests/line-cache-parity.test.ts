import { expect, it } from 'vitest'
import { Markdown, wrapTextWithAnsi, visibleWidth } from '@mariozechner/pi-tui'
import { markdownTheme, setTheme } from '../src/client/theme.ts'
import type { MarkdownTheme } from '@mariozechner/pi-tui'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'

// Omitting cacheKey opts this renderer out of cross-update token/layout caches.
const uncachedTheme: MarkdownTheme = { ...markdownTheme }
delete uncachedTheme.cacheKey

it('matches uncached Markdown render and semantic copy across streaming syntax boundaries', () => {
  const text = '# Heading\n\n中文👩‍💻 é **bold** ~~delete~~ [reference][id]\n\n'
    + '- item\n  - nested\n\n> quote\n>\n> ```ts\n> const x = "x"\n> ```\n\n'
    + '| a | b |\n|---|---:|\n|中|xy|\n\n```ts\nconst a = 1\n// comment\n```\n\n'
    + '[id]: https://example.test\n\n---\n\nEND'
  for (const theme of [BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light]) {
    setTheme(theme)
    for (const width of [1, 3, 12, 40, 100]) {
      const actual = new Markdown('', 0, 0, markdownTheme)
      const expected = new Markdown('', 0, 0, uncachedTheme)
      for (let length = 1; length <= text.length; length++) {
        const body = text.slice(0, length)
        actual.setText(body); expected.setText(body)
        expect(actual.render(width)).toEqual(expected.render(width))
        expect(actual.getSelectionLines()).toEqual(expected.getSelectionLines())
      }
    }
  }
}, 60000)

it('keeps Unicode/ANSI wrap output identical across hits and width switches', () => {
  for (const text of ['plain', '中👩‍💻 é กำ ຳ', '\u001b[31mred word long\u001b[0m', '\u001b]8;;https://example.test\u0007url\u001b]8;;\u0007\nnext', 'a\tbc\n  d']) {
    for (const width of [1, 2, 4, 80, 1]) {
      const expected = wrapTextWithAnsi(text, width)
      const result = wrapTextWithAnsi(text, width)
      result[0] = 'mutated'
      expect(wrapTextWithAnsi(text, width)).toEqual(expected)
    }
  }
  for (const [text, cells] of [['中文', 4], ['é', 1], ['👩‍💻', 2], ['\u001b[31mred\u001b[0m', 3]] as const) {
    expect(visibleWidth(text)).toBe(cells)
    expect(visibleWidth(text)).toBe(cells)
  }
})

it('invalidates reused tokens on palette change and same-length middle edit', () => {
  const actual = new Markdown('', 0, 0, markdownTheme)
  const expected = new Markdown('', 0, 0, uncachedTheme)
  for (const theme of [BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light, BUILT_IN_THEMES.dark]) {
    setTheme(theme)
    for (const text of ['**abcd**\n\nend', '**axcd**\n\nend', '**abcd**\n\nend']) {
      actual.setText(text); expected.setText(text)
      expect(actual.render(40)).toEqual(expected.render(40))
      expect(actual.getSelectionLines()).toEqual(expected.getSelectionLines())
    }
  }
})

it('does not retain caller mutations of selection objects in reused logical layouts', () => {
  const actual = new Markdown('one\n\ntwo', 1, 1, markdownTheme)
  actual.render(30)
  for (const line of actual.getSelectionLines()) (line as { text: string }).text = 'mutated'
  actual.setText('one\n\ntwo!')
  const expected = new Markdown('one\n\ntwo!', 1, 1, uncachedTheme)
  expect(actual.render(30)).toEqual(expected.render(30))
  expect(actual.getSelectionLines()).toEqual(expected.getSelectionLines())
  actual.invalidate()
  expect(actual.render(30)).toEqual(expected.render(30))
})

it('compares resolved references, token shape and order rather than raw-text identity', () => {
  const actual = new Markdown('', 0, 0, markdownTheme)
  const expected = new Markdown('', 0, 0, uncachedTheme)
  const variants = [
    '[unchanged][id]\n\n[id]: https://first.test "first"',
    '[unchanged][id]\n\n[id]: https://other.test "other"',
    '# before\n\n[unchanged][id]\n\n[id]: https://other.test "other"',
    '[unchanged][id]\n\n# after\n\n[id]: https://other.test "other"',
    '- same\n- other\n', '1. same\n2. other\n',
    '| left | right |\n|:---|---:|\n| same | same |',
    '| left | right |\n|---:|:---|\n| same | same |',
  ]
  for (const body of [...variants, ...variants.toReversed()]) {
    actual.setText(body); expected.setText(body)
    expect(actual.render(60)).toEqual(expected.render(60))
    expect(actual.getSelectionLines()).toEqual(expected.getSelectionLines())
  }
})
