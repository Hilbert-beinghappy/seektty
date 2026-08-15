import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SyntaxHighlighter,
  syntaxLanguageForPath,
} from '../src/client/syntax-highlighter.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'

function truecolor(): void {
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Shiki terminal syntax rendering', () => {
  it('preloads common Harness languages and reuses the active semantic theme', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      const dark = highlighter.highlight('const answer: number = 42', 'ts').join('\n')
      expect(dark).toContain('\u001B[')
      expect(dark).toContain('\u001B[38;2;145;167;255m')
      expect(dark).toContain('answer')
      expect(new Set([...dark.matchAll(/\u001B\[38;2;\d+;\d+;\d+m/gu)].map(match => match[0])).size)
        .toBeGreaterThan(1)
      expect(dark).not.toMatch(/\u001B\[(?:1|3|4|9)m/u)

      highlighter.setTheme(BUILT_IN_THEMES.light)
      const light = highlighter.highlight('const answer: number = 42', 'typescript').join('\n')
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
      const first = highlighter.highlight('def greet(name):\n    return f"hello {name}"', 'python').join('\n')
      expect(first).toContain('\u001B[38;2;221;226;238m')
      await vi.waitFor(() => { expect(invalidate).toHaveBeenCalledTimes(1) })
      const loaded = highlighter.highlight('def greet(name):\n    return f"hello {name}"', 'python').join('\n')
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
        fontStyle: ['italic', 'bold'] as const,
      }],
    }
    const highlighter = await SyntaxHighlighter.create(imported, () => undefined)
    try {
      const rendered = highlighter.highlight('// imported comment', 'typescript').join('\n')
      expect(rendered).toContain('\u001B[38;2;255;102;204m')
      expect(rendered).toContain('\u001B[1m')
      expect(rendered).toContain('\u001B[3m')
    } finally {
      highlighter.dispose()
    }
  })

  it('degrades unknown languages and NO_COLOR terminals without leaking control sequences', async () => {
    truecolor()
    const highlighter = await SyntaxHighlighter.create(BUILT_IN_THEMES.dark, () => undefined)
    try {
      expect(highlighter.highlight('plain <text>', 'not-a-language').join('\n'))
        .toContain('\u001B[38;2;221;226;238m')
      vi.stubEnv('NO_COLOR', '1')
      expect(highlighter.highlight('const raw = true', 'ts')).toEqual(['const raw = true'])
    } finally {
      highlighter.dispose()
    }
  })
})

describe('syntax language inference', () => {
  it('uses explicit aliases first and otherwise maps supported file extensions', () => {
    expect(syntaxLanguageForPath('/tmp/file.unknown', 'py')).toBe('python')
    expect(syntaxLanguageForPath('/tmp/component.tsx')).toBe('tsx')
    expect(syntaxLanguageForPath('Dockerfile')).toBe('bash')
    expect(syntaxLanguageForPath('/tmp/plain.bin')).toBeUndefined()
  })
})
