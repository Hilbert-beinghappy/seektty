/** Cached Shiki tokenization adapted to terminal ANSI rendering. */

import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
  type LanguageRegistration,
  type ThemeRegistration,
  type ThemedToken,
} from '@shikijs/core'
import {
  createJavaScriptRegexEngine,
} from '@shikijs/engine-javascript'
import type { TuiSyntaxThemeColors } from '@deepseek-ai/dsh-tui-protocol'
import { normalizeThemeColor, type ResolvedTuiTheme } from './theme-config.ts'
import { styleTerminalText, terminalColorLevel, type CodeBackgroundPolicy } from './theme.ts'
import { measureStartup } from '../startup-trace.ts'

type LanguageLoader = () => Promise<{ readonly default: LanguageRegistration[] }>

const LANGUAGE_LOADERS = {
  typescript: () => import('@shikijs/langs/typescript'),
  javascript: () => import('@shikijs/langs/javascript'),
  tsx: () => import('@shikijs/langs/tsx'),
  jsx: () => import('@shikijs/langs/jsx'),
  bash: () => import('@shikijs/langs/bash'),
  json: () => import('@shikijs/langs/json'),
  jsonc: () => import('@shikijs/langs/jsonc'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  php: () => import('@shikijs/langs/php'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  ini: () => import('@shikijs/langs/ini'),
  markdown: () => import('@shikijs/langs/markdown'),
  mdx: () => import('@shikijs/langs/mdx'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  less: () => import('@shikijs/langs/less'),
  sql: () => import('@shikijs/langs/sql'),
  xml: () => import('@shikijs/langs/xml'),
  lua: () => import('@shikijs/langs/lua'),
  diff: () => import('@shikijs/langs/diff'),
} satisfies Readonly<Record<string, LanguageLoader>>

type SupportedLanguage = keyof typeof LANGUAGE_LOADERS

const LANGUAGE_ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', typescript: 'typescript',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', javascript: 'javascript',
  tsx: 'tsx', jsx: 'jsx',
  sh: 'bash', shell: 'bash', shellscript: 'bash', zsh: 'bash', bash: 'bash',
  json: 'json', json5: 'jsonc', jsonc: 'jsonc',
  py: 'python', python: 'python', rb: 'ruby', ruby: 'ruby',
  golang: 'go', go: 'go', rs: 'rust', rust: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', csharp: 'csharp', kt: 'kotlin', kotlin: 'kotlin', swift: 'swift', php: 'php',
  yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', properties: 'ini',
  md: 'markdown', markdown: 'markdown', mdx: 'mdx',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  sql: 'sql', xml: 'xml', svg: 'xml', lua: 'lua', diff: 'diff', patch: 'diff',
}

const EXTENSION_LANGUAGES: Readonly<Record<string, SupportedLanguage>> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  tsx: 'tsx', jsx: 'jsx', sh: 'bash', bash: 'bash', zsh: 'bash', json: 'json', jsonc: 'jsonc',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', php: 'php', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini',
  md: 'markdown', mdx: 'mdx', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  less: 'less', sql: 'sql', xml: 'xml', svg: 'xml', lua: 'lua', diff: 'diff', patch: 'diff',
}

const COMMON_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript', 'javascript', 'tsx', 'jsx', 'bash', 'json', 'jsonc', 'markdown', 'diff',
]
const COMMON_WARMUPS = [
  { language: 'typescript', code: 'const answer: number = 42' },
  { language: 'bash', code: 'printf \'%s\\n\' "$HOME"' },
  { language: 'json', code: '{"ready":true}' },
  { language: 'markdown', code: '# ready' },
  { language: 'diff', code: '@@ -1 +1 @@\n-old\n+new' },
] as const satisfies readonly { readonly language: SupportedLanguage; readonly code: string }[]
const MAX_HIGHLIGHT_CHARS = 100_000
const MAX_HIGHLIGHT_LINE_CHARS = 20_000
const MAX_CACHE_ENTRIES = 512

const ROLE_SCOPES: Readonly<Record<Exclude<keyof TuiSyntaxThemeColors, 'background' | 'foreground'>, readonly string[]>> = {
  comment: ['comment'],
  keyword: ['keyword', 'storage.type', 'storage.modifier'],
  string: ['string'],
  number: ['constant.numeric'],
  constant: ['constant', 'variable.language'],
  function: ['entity.name.function', 'support.function', 'meta.function-call'],
  type: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  variable: ['variable.other', 'variable.language'],
  property: ['variable.other.property', 'support.variable.property'],
  parameter: ['variable.parameter'],
  operator: ['keyword.operator'],
  punctuation: ['punctuation'],
  tag: ['entity.name.tag'],
  attribute: ['entity.other.attribute-name'],
  regexp: ['string.regexp'],
}

const DIFF_SCOPES = {
  inserted: ['markup.inserted', 'punctuation.definition.inserted'],
  deleted: ['markup.deleted', 'punctuation.definition.deleted'],
  header: ['meta.diff.header', 'meta.diff.range'],
} as const

function languageOf(value: string | undefined): SupportedLanguage | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase().split(/[\s,{]/u, 1)[0] ?? ''
  return LANGUAGE_ALIASES[normalized]
}

/**
 * Infer a supported syntax grammar from a path and optional explicit language.
 * @param path - file path or display name.
 * @param explicit - Harness-provided language id.
 * @returns canonical language or undefined for plain text.
 */
export function syntaxLanguageForPath(path: string, explicit?: string): string | undefined {
  const requested = languageOf(explicit)
  if (requested !== undefined) return requested
  const filename = path.toLowerCase().split(/[\\/]/u).at(-1) ?? ''
  if (filename === 'dockerfile') return 'bash'
  if (filename === 'makefile') return undefined
  const extension = filename.includes('.') ? filename.split('.').at(-1) ?? '' : ''
  return EXTENSION_LANGUAGES[extension]
}

function themeHash(theme: ResolvedTuiTheme): string {
  const value = JSON.stringify([theme.syntaxTone, theme.colors, theme.syntax, theme.tokenColors])
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return `seektty-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function themeRegistration(theme: ResolvedTuiTheme, name: string): ThemeRegistration {
  const settings: NonNullable<ThemeRegistration['settings']> = [
    { settings: { foreground: theme.syntax.foreground, background: theme.syntax.background } },
    ...Object.entries(ROLE_SCOPES).map(([role, scope]) => ({
      scope: [...scope],
      settings: { foreground: theme.syntax[role as keyof typeof ROLE_SCOPES] },
    })),
    { scope: [...DIFF_SCOPES.inserted], settings: { foreground: theme.colors.success } },
    { scope: [...DIFF_SCOPES.deleted], settings: { foreground: theme.colors.danger } },
    { scope: [...DIFF_SCOPES.header], settings: { foreground: theme.colors.accent } },
    ...theme.tokenColors.map(rule => ({
      scope: [...rule.scope],
      settings: {
        ...(rule.foreground === undefined ? {} : { foreground: rule.foreground }),
        ...(rule.background === undefined ? {} : { background: rule.background }),
        ...(rule.fontStyle === undefined ? {} : { fontStyle: rule.fontStyle.join(' ') }),
      },
    })),
  ]
  return {
    name,
    displayName: theme.name,
    type: theme.syntaxTone,
    fg: theme.syntax.foreground,
    bg: theme.syntax.background,
    settings,
    colors: {
      'editor.foreground': theme.syntax.foreground,
      'editor.background': theme.syntax.background,
    },
  }
}

function safeTokenColor(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  try { return normalizeThemeColor(value) } catch { return fallback }
}

/** Resolve a token background without turning the theme's block fill into a per-token color. */
export function syntaxTokenBackground(
  value: string | undefined,
  fallback: string,
  policy: CodeBackgroundPolicy,
): string | undefined {
  const resolved = safeTokenColor(value, fallback)
  return policy === 'inherit' && resolved === normalizeThemeColor(fallback)
    ? undefined
    : resolved
}

function renderToken(token: ThemedToken, theme: ResolvedTuiTheme, background: CodeBackgroundPolicy): string {
  const fontStyle = token.fontStyle ?? 0
  const resolvedBackground = syntaxTokenBackground(token.bgColor, theme.syntax.background, background)
  return styleTerminalText(token.content, {
    foreground: safeTokenColor(token.color, theme.syntax.foreground),
    ...(resolvedBackground === undefined ? {} : { background: resolvedBackground }),
    italic: (fontStyle & 1) !== 0,
    bold: (fontStyle & 2) !== 0,
    underline: (fontStyle & 4) !== 0,
    strikethrough: (fontStyle & 8) !== 0,
  })
}

function plainLines(code: string, theme: ResolvedTuiTheme, background: CodeBackgroundPolicy): string[] {
  return code.split('\n').map(line => styleTerminalText(line, {
    foreground: theme.syntax.foreground,
    ...(background === 'explicit' ? { background: theme.syntax.background } : {}),
  }))
}

function highlightable(code: string): boolean {
  return code.length <= MAX_HIGHLIGHT_CHARS
    && code.split('\n').every(line => line.length <= MAX_HIGHLIGHT_LINE_CHARS)
}

/** Theme-aware highlighter that can receive the latest Surface theme. */
export interface SyntaxThemeTarget {
  setTheme(theme: ResolvedTuiTheme): void
}

/**
 * Apply the current theme, then hand the highlighter to the renderer.
 * Call this only after construction finishes so a mid-load theme change wins.
 */
export function adoptSyntaxHighlighter<T extends SyntaxThemeTarget>(
  created: T,
  currentTheme: ResolvedTuiTheme,
  takeOver: (highlighter: T) => void,
): void {
  created.setTheme(currentTheme)
  takeOver(created)
}

/** Synchronous render face backed by asynchronously loaded Shiki grammars. */
export class SyntaxHighlighter {
  private readonly loaded = new Set<SupportedLanguage>()
  private readonly loading = new Map<SupportedLanguage, Promise<void>>()
  private readonly failed = new Set<SupportedLanguage>()
  private readonly themes = new Set<string>()
  private readonly cache = new Map<string, readonly string[]>()
  private themeName = ''
  private disposed = false

  private constructor(
    private readonly highlighter: HighlighterCore,
    private theme: ResolvedTuiTheme,
    private readonly invalidate: () => void,
  ) {}

  /**
   * Prepare the JavaScript-regex engine and common Harness grammars.
   * @param theme - initial resolved theme.
   * @param invalidate - called after a lazy grammar becomes usable.
   * @returns ready syntax renderer.
   */
  static async create(theme: ResolvedTuiTheme, invalidate: () => void): Promise<SyntaxHighlighter> {
    return measureStartup('shiki', async () => {
      const highlighter = await createHighlighterCore({
        engine: createJavaScriptRegexEngine({
          forgiving: true,
        }),
        langs: COMMON_LANGUAGES.map(language => LANGUAGE_LOADERS[language] as LanguageInput),
        themes: [],
        warnings: false,
      })
      const service = new SyntaxHighlighter(highlighter, theme, invalidate)
      for (const language of COMMON_LANGUAGES) service.loaded.add(language)
      service.setTheme(theme)
      for (const sample of COMMON_WARMUPS) {
        highlighter.codeToTokens(sample.code, {
          lang: sample.language,
          theme: service.themeName,
          tokenizeTimeLimit: 0,
        })
      }
      return service
    })
  }

  /**
   * Replace the active token theme and invalidate bounded render caches.
   * @param theme - complete current theme.
   */
  setTheme(theme: ResolvedTuiTheme): void {
    if (this.disposed) return
    this.theme = theme
    this.themeName = themeHash(theme)
    if (!this.themes.has(this.themeName)) {
      this.highlighter.loadThemeSync(themeRegistration(theme, this.themeName))
      this.themes.add(this.themeName)
    }
    this.cache.clear()
  }

  /**
   * Highlight one code block synchronously, loading uncommon grammars in the background.
   * @param code - raw code block.
   * @param language - Markdown or tool-provided language id.
   * @returns ANSI-styled lines or a safe plain fallback.
   */
  highlight(code: string, language: string | undefined, background: CodeBackgroundPolicy): string[] {
    if (this.disposed || !highlightable(code) || terminalColorLevel() === 0) return plainLines(code, this.theme, background)
    const canonical = languageOf(language)
    if (canonical === undefined) return plainLines(code, this.theme, background)
    if (!this.loaded.has(canonical)) {
      this.load(canonical)
      return plainLines(code, this.theme, background)
    }
    const key = `${this.themeName}:${String(terminalColorLevel())}:${background}:${canonical}:${code}`
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return [...cached]
    }
    let lines: string[]
    try {
      const result = this.highlighter.codeToTokens(code, {
        lang: canonical,
        theme: this.themeName,
        tokenizeTimeLimit: 0,
      })
      lines = result.tokens.map(line => line.map(token => renderToken(token, this.theme, background)).join(''))
    } catch {
      this.failed.add(canonical)
      return plainLines(code, this.theme, background)
    }
    this.cache.set(key, lines)
    if (this.cache.size > MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string)
    return [...lines]
  }

  /** Release Shiki registries and ignore pending lazy-load invalidations. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cache.clear()
    this.highlighter.dispose()
  }

  private load(language: SupportedLanguage): void {
    if (this.loading.has(language) || this.failed.has(language) || this.disposed) return
    const task = this.highlighter.loadLanguage(LANGUAGE_LOADERS[language] as LanguageInput).then(() => {
      if (this.disposed) return
      this.loaded.add(language)
      this.invalidate()
    }).catch(() => {
      this.failed.add(language)
    }).finally(() => { this.loading.delete(language) })
    this.loading.set(language, task)
  }
}
