import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adoptSyntaxHighlighter,
  SyntaxHighlighter,
  syntaxLanguageForPath,
  syntaxTokenBackground,
} from '../src/client/syntax-highlighter.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { background, setBackgroundMode, setRendering } from '../src/client/theme.ts'
import { sgrCells } from './helpers/sgr-colors.ts'

function truecolor(): void {
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
}

afterEach(() => {
  setBackgroundMode('theme')
  vi.unstubAllEnvs()
})

describe('Shiki terminal syntax rendering', () => {
  it.each(['xterm', 'xterm-256color'])('re-encodes cached imported code in both directions (%s)', async term => {
    for (const key of ['NO_COLOR', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION']) vi.stubEnv(key, undefined)
    vi.stubEnv('TERM', term)
    const theme = {
      ...BUILT_IN_THEMES.dark, id: 'custom:rgb-cache' as const,
      tokenColors: [{ scope: ['comment'], foreground: '#ff66cc', background: '#123456', fontStyle: ['italic'] as const }],
    }
    const highlighter = await SyntaxHighlighter.create(theme, () => undefined)
    try {
      setBackgroundMode('terminal')
      const previous = highlighter.highlight('// original color', 'typescript', 'inherit')
      setBackgroundMode('foreground')
      const rgb = highlighter.highlight('// original color', 'typescript', 'inherit')
      const painted = background.canvas(rgb.join('\n'))
      expect(rgb).not.toEqual(previous)
      expect(painted).toContain('\u001B[38;2;255;102;204m')
      expect(painted).not.toContain('\u001B[39m')
      expect(painted).not.toContain('\u001B[48;2;17;24;39m')
      // Token background policy retains deliberately different backgrounds.
      expect(syntaxTokenBackground('#123456', '#111827', 'inherit')).toBe('#123456')
      setRendering({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
      const filled = background.canvas(background.code(highlighter.highlight('// original color', 'typescript', 'explicit').join('\n')))
      const cells = sgrCells(filled)
      expect(cells.every(cell => cell.foreground === '#ff66cc')).toBe(true)
      expect(cells.every(cell => cell.background !== undefined)).toBe(true)
      setRendering({ colorMode: 'rgb', backgroundFill: 'terminal', terminalBackgroundSync: 'off' })
      expect(highlighter.highlight('// original color', 'typescript', 'inherit')).toEqual(rgb)
      setBackgroundMode('terminal')
      expect(highlighter.highlight('// original color', 'typescript', 'inherit')).toEqual(previous)
    } finally { highlighter.dispose() }
  })

  it('preloads common Harness languages and reuses the active semantic theme', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      const dark = highlighter.highlight('const answer: number = 42', 'ts', 'inherit').join('\n')
      expect(dark).toContain('\u001B[')
      expect(dark).toContain('\u001B[38;2;145;167;255m')
      expect(dark).toContain('answer')
      expect(new Set([...dark.matchAll(/\u001B\[38;2;\d+;\d+;\d+m/gu)].map(match => match[0])).size)
        .toBeGreaterThan(1)
      expect(dark).not.toMatch(/\u001B\[(?:1|3|4|9)m/u)
      expect(dark).not.toContain('\u001B[48;2;17;24;39m')

      const explicit = highlighter.highlight('const answer: number = 42', 'ts', 'explicit').join('\n')
      expect(explicit).toContain('\u001B[48;2;17;24;39m')
      expect(explicit).not.toBe(dark)
      expect(highlighter.highlight('const answer: number = 42', 'ts', 'inherit').join('\n')).toBe(dark)

      highlighter.setTheme(BUILT_IN_THEMES.light)
      const light = highlighter.highlight('const answer: number = 42', 'typescript', 'inherit').join('\n')
      expect(light).toContain('\u001B[38;2;49;86;216m')
      expect(light).not.toBe(dark)
    } finally {
      highlighter.dispose()
    }
  })

  it('loads uncommon grammars lazily and asks the transcript to redraw once ready', async () => {
    truecolor()
    const invalidate = vi.fn()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, invalidate)
    try {
      const first = highlighter.highlight('def greet(name):\n    return f"hello {name}"', 'python', 'inherit').join('\n')
      expect(first).toContain('\u001B[38;2;221;226;238m')
      await vi.waitFor(() => { expect(invalidate).toHaveBeenCalledTimes(1) })
      const loaded = highlighter.highlight('def greet(name):\n    return f"hello {name}"', 'python', 'inherit').join('\n')
      expect(loaded).toContain('\u001B[38;2;145;167;255m')
      expect(loaded).not.toBe(first)
    } finally {
      highlighter.dispose()
    }
  })

  it('applies imported TextMate colors and portable styles only to code tokens', async () => {
    truecolor()
    const imported = {
      ...BUILT_IN_THEMES.dark,
      id: 'custom:vscode-test' as const,
      name: 'VS Code Test',
      source: 'vscode' as const,
      tokenColors: [{
        scope: ['comment'],
        foreground: '#FF66CC',
        background: '#123456',
        fontStyle: ['italic', 'bold'] as const,
      }],
    }
    const highlighter = await SyntaxHighlighter.create(imported, () => undefined)
    try {
      const rendered = highlighter.highlight('// imported comment', 'typescript', 'inherit').join('\n')
      expect(rendered).toContain('\u001B[38;2;255;102;204m')
      expect(rendered).not.toContain('\u001B[48;2;17;24;39m')
      expect(rendered).toContain('\u001B[1m')
      expect(rendered).toContain('\u001B[3m')
    } finally {
      highlighter.dispose()
    }
  })

  it('treats a supplied TextMate theme as authoritative instead of injecting coarse role colors', async () => {
    truecolor()
    const imported = {
      ...BUILT_IN_THEMES.dark,
      id: 'custom:authoritative' as const,
      name: 'Authoritative',
      source: 'vscode' as const,
      tokenColors: [{
        scope: ['keyword.control'],
        foreground: '#123456',
      }],
    }
    const highlighter = await SyntaxHighlighter.create(imported, () => undefined)
    try {
      const rendered = highlighter.highlight('if (ready) return true', 'typescript', 'inherit').join('\n')
      expect(rendered).toContain('\u001B[38;2;18;52;86m')
      expect(rendered).toContain('\u001B[38;2;221;226;238m')
      expect(rendered).not.toContain('\u001B[38;2;240;113;127m')
    } finally {
      highlighter.dispose()
    }
  })

  it('keeps function calls, arguments, and literals independently colored', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      const rendered = highlighter.highlight('run("value", 42)', 'typescript', 'inherit').join('\n')
      expect(rendered).toContain('\u001B[38;2;127;155;255m')
      expect(rendered).toContain('\u001B[38;2;66;201;154m')
      expect(rendered).toContain('\u001B[38;2;229;170;89m')
    } finally {
      highlighter.dispose()
    }
  })

  it('uses fine-grained built-in rules across structured data and markup', async () => {
    truecolor()
    const invalidate = vi.fn()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, invalidate)
    try {
      const json = highlighter.highlight('{"name":"SeekTTY","count":3}', 'json', 'inherit').join('\n')
      expect(json).toContain('\u001B[38;2;180;194;255m')
      expect(json).toContain('\u001B[38;2;66;201;154m')
      expect(json).toContain('\u001B[38;2;229;170;89m')

      const markdown = highlighter.highlight('# Heading\n**bold** and `code`', 'markdown', 'inherit').join('\n')
      expect(markdown).toContain('\u001B[38;2;145;167;255m')
      expect(markdown).toContain('\u001B[1m')
      expect(markdown).toContain('\u001B[38;2;66;201;154m')

      const firstHtml = highlighter.highlight('<button disabled title="Save">Save</button>', 'html', 'inherit').join('\n')
      expect(firstHtml).toContain('\u001B[38;2;221;226;238m')
      await vi.waitFor(() => { expect(invalidate).toHaveBeenCalledTimes(1) })
      const html = highlighter.highlight('<button disabled title="Save">Save</button>', 'html', 'inherit').join('\n')
      expect(html).toContain('\u001B[38;2;102;130;255m')
      expect(html).toContain('\u001B[38;2;229;170;89m')
      expect(html).toContain('\u001B[38;2;66;201;154m')
    } finally {
      highlighter.dispose()
    }
  })

  it('uses theme status colors for Diff insertions and deletions', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      const rendered = highlighter.highlight([
        '--- a/src/theme.ts',
        '+++ b/src/theme.ts',
        "-const codeTheme = 'dark'",
        '+const codeTheme = interfaceTone',
      ].join('\n'), 'diff', 'inherit').join('\n')
      expect(rendered).toContain('\u001B[38;2;240;113;127m')
      expect(rendered).toContain('\u001B[38;2;66;201;154m')
    } finally {
      highlighter.dispose()
    }
  })

  it('degrades unknown languages and NO_COLOR terminals without leaking control sequences', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      expect(highlighter.highlight('plain <text>', 'not-a-language', 'inherit').join('\n'))
        .toContain('\u001B[38;2;221;226;238m')
      expect(highlighter.highlight('plain <text>', 'not-a-language', 'inherit').join('\n'))
        .not.toContain('\u001B[48;2;17;24;39m')
      vi.stubEnv('NO_COLOR', '1')
      expect(highlighter.highlight('const raw = true', 'ts', 'inherit')).toEqual(['const raw = true'])
    } finally {
      highlighter.dispose()
    }
  })
})

describe('Shiki theme revision', () => {
  it('applies the latest theme before the highlighter takes over the renderer', () => {
    const order: string[] = []
    adoptSyntaxHighlighter(
      { setTheme: theme => { order.push(`theme:${theme.id}`) } },
      BUILT_IN_THEMES.light,
      highlighter => { order.push(`takeover:${highlighter === undefined ? 'missing' : 'ready'}`) },
    )
    expect(order).toEqual(['theme:light', 'takeover:ready'])

    const source = readFileSync(resolve(import.meta.dirname, '../src/client/surface.ts'), 'utf8')
    expect(source).toMatch(/liveTheme = initialTheme/u)
    expect(source).toMatch(/adoptSyntaxHighlighter\(created, liveTheme,/u)
    expect(source).toMatch(/liveTheme = theme/u)
  })
})

describe('syntax language inference', () => {
  it('inherits only the base code background and preserves explicit token backgrounds', () => {
    expect(syntaxTokenBackground(undefined, '#111827', 'inherit')).toBeUndefined()
    expect(syntaxTokenBackground('#111827', '#111827', 'inherit')).toBeUndefined()
    expect(syntaxTokenBackground('#123456', '#111827', 'inherit')).toBe('#123456')
    expect(syntaxTokenBackground(undefined, '#111827', 'explicit')).toBe('#111827')
  })

  it('uses explicit aliases first and otherwise maps supported file extensions', () => {
    expect(syntaxLanguageForPath('/tmp/file.unknown', 'py')).toBe('python')
    expect(syntaxLanguageForPath('/tmp/component.tsx')).toBe('tsx')
    expect(syntaxLanguageForPath('Dockerfile')).toBe('bash')
    expect(syntaxLanguageForPath('/tmp/plain.bin')).toBeUndefined()
  })
})
