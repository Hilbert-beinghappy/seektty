import { describe, expect, it } from 'vitest'
import { Markdown } from '@mariozechner/pi-tui'

const identity = (text: string): string => text
const theme = {
  heading: identity,
  link: identity,
  linkUrl: identity,
  code: identity,
  codeBlock: identity,
  codeBlockBorder: identity,
  quote: identity,
  quoteBorder: identity,
  hr: identity,
  listBullet: identity,
  bold: identity,
  italic: identity,
  strikethrough: identity,
  underline: identity,
  codeBlockIndent: '  ',
}

function renderProjection(text: string, width: number): {
  readonly rendered: readonly string[]
  readonly copied: string
  readonly projections: ReturnType<Markdown['getSelectionLines']>
} {
  const markdown = new Markdown(text, 0, 0, theme)
  const rendered = markdown.render(width)
  const projections = markdown.getSelectionLines()
  return {
    rendered,
    copied: projections.map(line => line.text + line.joinerAfter).join(''),
    projections,
  }
}

describe('patched pi-tui Markdown selection projection', () => {
  it('rejoins exact soft-wrap separators and literal hard breaks', () => {
    const result = renderProjection('hello  world\nnext', 7)
    expect(result.copied).toBe('hello  world\nnext')
    expect(result.projections.map(line => line.joinerAfter)).toEqual(['  ', '\n', ''])
  })

  it('excludes quote borders and code presentation indentation', () => {
    const quote = renderProjection('> quote text wraps here', 12)
    expect(quote.copied).toBe('quote text wraps here')
    expect(quote.projections.every(line => line.displayStartCell === 2)).toBe(true)

    const code = renderProjection('```python\n  value = "中文👋"\n```', 14)
    expect(code.copied).toBe('  value = "中文👋"')
    expect(code.projections.every(line => line.displayStartCell === 2)).toBe(true)
  })

  it('keeps headings and list text while making rules non-copyable', () => {
    const result = renderProjection('### Heading\n\n- first\n- second\n\n---', 20)
    expect(result.copied).toContain('### Heading')
    expect(result.copied).toContain('- first\n- second')
    expect(result.copied).not.toContain('─')
    expect(result.rendered.join('\n')).not.toContain('\u001B_seektty-copy:')
  })

  it('invalidates width-bound projection metadata with the rendered cache', () => {
    const markdown = new Markdown('one two three four', 0, 0, theme)
    markdown.render(8)
    const narrow = markdown.getSelectionLines()
    markdown.render(30)
    const wide = markdown.getSelectionLines()
    expect(narrow.length).toBeGreaterThan(wide.length)
    expect(narrow.map(line => line.text + line.joinerAfter).join('')).toBe('one two three four')
    expect(wide.map(line => line.text + line.joinerAfter).join('')).toBe('one two three four')
    markdown.invalidate()
    expect(markdown.getSelectionLines()).toEqual([])
  })
})
