/** VS Code JSON/JSONC theme loading and terminal-safe color mapping. */

import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import {
  MAX_TEXTMATE_RULES,
  type TuiCustomTheme,
  type TuiSyntaxThemeColors,
  type TuiTextMateRule,
  type TuiThemeTone,
  type TuiThemeUiColors,
  type TuiTokenFontStyle,
} from '@deepseek-ai/dsh-tui-protocol'
import {
  BUILT_IN_THEMES,
  normalizeCustomTheme,
  normalizeThemeColor,
  normalizeThemeColorOn,
} from './theme-config.ts'

const MAX_THEME_FILE_BYTES = 2 * 1024 * 1024
const MAX_THEME_TOTAL_BYTES = 8 * 1024 * 1024
const MAX_INCLUDE_DEPTH = 16

interface LoadedThemeRecord {
  readonly name?: string
  readonly type?: string
  readonly colors: Readonly<Record<string, unknown>>
  readonly tokenColors: readonly unknown[]
  readonly semanticTokenColors: Readonly<Record<string, unknown>>
}

/** Parsed VS Code theme plus the canonical source path. */
export interface LoadedVsCodeTheme {
  readonly path: string
  readonly suggestedName: string
  readonly value: LoadedThemeRecord
}

function objectRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} 必须是对象`)
  return value as Readonly<Record<string, unknown>>
}

function optionalRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  return value === undefined ? {} : objectRecord(value, label)
}

function parseJsonc(text: string, path: string): Readonly<Record<string, unknown>> {
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  const first = errors[0]
  if (first !== undefined) {
    throw new Error(`${path} 的 JSONC 无效：${printParseErrorCode(first.error)}（offset ${String(first.offset)}）`)
  }
  return objectRecord(value, path)
}

function sourcePath(input: string): string {
  const trimmed = input.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, '$1$2')
  if (trimmed === '') throw new Error('VS Code 主题文件路径不能为空')
  if (/^https?:/iu.test(trimmed)) throw new Error('只支持本地 VS Code 主题文件，不读取远程 URL')
  if (trimmed.startsWith('file:')) return fileURLToPath(trimmed)
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/')) return resolve(homedir(), trimmed.slice(2))
  return resolve(trimmed)
}

function mergeTheme(base: LoadedThemeRecord, current: Readonly<Record<string, unknown>>, path: string): LoadedThemeRecord {
  const colors = optionalRecord(current.colors, `${path}.colors`)
  const semanticTokenColors = optionalRecord(current.semanticTokenColors, `${path}.semanticTokenColors`)
  const rawTokenColors = current.tokenColors ?? []
  if (!Array.isArray(rawTokenColors)) throw new Error(`${path}.tokenColors 必须是数组`)
  const name = typeof current.name === 'string' ? current.name : base.name
  const type = typeof current.type === 'string' ? current.type : base.type
  return {
    ...(name === undefined ? {} : { name }),
    ...(type === undefined ? {} : { type }),
    colors: { ...base.colors, ...colors },
    tokenColors: [...base.tokenColors, ...rawTokenColors],
    semanticTokenColors: { ...base.semanticTokenColors, ...semanticTokenColors },
  }
}

const EMPTY_THEME: LoadedThemeRecord = {
  colors: {},
  tokenColors: [],
  semanticTokenColors: {},
}

async function loadThemeRecord(
  path: string,
  active: readonly string[],
  budget: { bytes: number },
): Promise<{ readonly path: string; readonly value: LoadedThemeRecord }> {
  const canonical = await realpath(path)
  if (active.includes(canonical)) {
    const chain = [...active, canonical].map(item => basename(item)).join(' → ')
    throw new Error(`VS Code 主题 include 存在循环：${chain}`)
  }
  if (active.length >= MAX_INCLUDE_DEPTH) throw new Error(`VS Code 主题 include 超过 ${String(MAX_INCLUDE_DEPTH)} 层`)
  const text = await readFile(canonical, 'utf8')
  const bytes = Buffer.byteLength(text)
  if (bytes > MAX_THEME_FILE_BYTES) throw new Error(`VS Code 主题文件超过 ${String(MAX_THEME_FILE_BYTES)} 字节`)
  budget.bytes += bytes
  if (budget.bytes > MAX_THEME_TOTAL_BYTES) throw new Error(`VS Code 主题 include 总大小超过 ${String(MAX_THEME_TOTAL_BYTES)} 字节`)
  const current = parseJsonc(text, canonical)
  let base = EMPTY_THEME
  if (current.include !== undefined) {
    const include = typeof current.include === 'string' ? current.include.trim() : ''
    if (include === '' || isAbsolute(include) || /^[a-z][a-z0-9+.-]*:/iu.test(include)) {
      throw new Error(`${canonical}.include 必须是相对文件路径`)
    }
    const included = await loadThemeRecord(resolve(dirname(canonical), include), [...active, canonical], budget)
    base = included.value
  }
  return { path: canonical, value: mergeTheme(base, current, canonical) }
}

/**
 * Load a local VS Code JSON/JSONC theme and recursively merge relative includes.
 * @param input - local path, file URL, or home-relative path.
 * @returns merged theme record and display-name suggestion.
 */
export async function loadVsCodeThemeFile(input: string): Promise<LoadedVsCodeTheme> {
  const loaded = await loadThemeRecord(sourcePath(input), [], { bytes: 0 })
  const filename = basename(loaded.path)
  const fallback = filename.slice(0, Math.max(1, filename.length - extname(filename).length))
  const suggestedName = loaded.value.name?.trim() || fallback || 'VS Code Theme'
  return { ...loaded, suggestedName }
}

function safeColor(value: unknown, background: string, fallback: string): string {
  if (typeof value !== 'string') return fallback
  try { return normalizeThemeColorOn(value, background) } catch { return fallback }
}

function firstColor(
  colors: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  background: string,
  fallback: string,
): string {
  for (const key of keys) {
    const value = colors[key]
    if (typeof value !== 'string') continue
    try { return normalizeThemeColorOn(value, background) } catch { /* try the next VS Code color */ }
  }
  return fallback
}

function lightBackground(color: string): boolean {
  const normalized = normalizeThemeColor(color)
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  return (red * 0.2126 + green * 0.7152 + blue * 0.0722) >= 150
}

function themeTone(value: LoadedThemeRecord): TuiThemeTone {
  const declared = value.type?.toLowerCase()
  if (declared === 'light' || declared === 'hc-light') return 'light'
  if (declared === 'dark' || declared === 'hc') return 'dark'
  const raw = value.colors['editor.background']
  if (typeof raw !== 'string') return 'dark'
  return lightBackground(safeColor(raw, '#090E1B', '#090E1B')) ? 'light' : 'dark'
}

function scopes(value: unknown): readonly string[] {
  const raw = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  return [...new Set(raw.flatMap(item => typeof item === 'string' ? item.split(',') : [])
    .map(item => item.trim())
    .filter(item => item !== '' && item.length <= 256 && !/[\u0000-\u001F\u007F-\u009F]/u.test(item)))]
    .slice(0, 64)
}

const FONT_STYLES = new Set<TuiTokenFontStyle>(['bold', 'italic', 'underline', 'strikethrough'])

function fontStyles(value: unknown): readonly TuiTokenFontStyle[] | undefined {
  if (typeof value !== 'string') return undefined
  if (value.trim() === '' || value.trim().toLowerCase() === 'none') return []
  return [...new Set(value.toLowerCase().split(/\s+/u)
    .filter((item): item is TuiTokenFontStyle => FONT_STYLES.has(item as TuiTokenFontStyle)))]
}

function textMateRules(value: LoadedThemeRecord, background: string): readonly TuiTextMateRule[] {
  if (value.tokenColors.length > MAX_TEXTMATE_RULES) {
    throw new Error(`VS Code 主题最多导入 ${String(MAX_TEXTMATE_RULES)} 条 TextMate 规则`)
  }
  return value.tokenColors.flatMap((entry): TuiTextMateRule[] => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const record = entry as Readonly<Record<string, unknown>>
    const scope = scopes(record.scope)
    if (scope.length === 0) return []
    const settings = optionalRecord(record.settings, 'tokenColors[].settings')
    const foreground = typeof settings.foreground === 'string'
      ? safeColor(settings.foreground, background, '')
      : undefined
    const tokenBackground = typeof settings.background === 'string'
      ? safeColor(settings.background, background, '')
      : undefined
    const fontStyle = fontStyles(settings.fontStyle)
    if ((foreground === undefined || foreground === '')
      && (tokenBackground === undefined || tokenBackground === '')
      && fontStyle === undefined) return []
    return [{
      scope,
      ...(foreground === undefined || foreground === '' ? {} : { foreground }),
      ...(tokenBackground === undefined || tokenBackground === '' ? {} : { background: tokenBackground }),
      ...(fontStyle === undefined ? {} : { fontStyle }),
    }]
  })
}

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

const SEMANTIC_TYPES: Readonly<Record<Exclude<keyof TuiSyntaxThemeColors, 'background' | 'foreground'>, readonly string[]>> = {
  comment: ['comment'], keyword: ['keyword', 'modifier'], string: ['string'], number: ['number'],
  constant: ['enumMember', 'macro'], function: ['function', 'method'],
  type: ['type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'namespace'],
  variable: ['variable'], property: ['property'], parameter: ['parameter'], operator: ['operator'],
  punctuation: [], tag: ['decorator'], attribute: [], regexp: ['regexp'],
}

function scopedColor(rules: readonly TuiTextMateRule[], candidates: readonly string[], fallback: string): string {
  let selected = fallback
  for (const rule of rules) {
    if (rule.foreground === undefined) continue
    if (rule.scope.some(scope => candidates.some(candidate => scope === candidate || scope.startsWith(`${candidate}.`)))) {
      selected = rule.foreground
    }
  }
  return selected
}

function semanticColor(
  semantic: Readonly<Record<string, unknown>>,
  candidates: readonly string[],
  background: string,
  fallback: string,
): string {
  let selected = fallback
  for (const [key, raw] of Object.entries(semantic)) {
    if (!candidates.includes(key.split('.')[0] ?? '')) continue
    const value = typeof raw === 'string'
      ? raw
      : typeof raw === 'object' && raw !== null && 'foreground' in raw
        ? (raw as Readonly<Record<string, unknown>>).foreground
        : undefined
    if (typeof value === 'string') selected = safeColor(value, background, selected)
  }
  return selected
}

function syntaxColors(
  value: LoadedThemeRecord,
  background: string,
  foreground: string,
  rules: readonly TuiTextMateRule[],
  fallback: TuiSyntaxThemeColors,
): TuiSyntaxThemeColors {
  const entries = Object.entries(ROLE_SCOPES).map(([role, candidates]) => {
    const key = role as Exclude<keyof TuiSyntaxThemeColors, 'background' | 'foreground'>
    const textMate = scopedColor(rules, candidates, fallback[key])
    return [key, semanticColor(value.semanticTokenColors, SEMANTIC_TYPES[key], background, textMate)]
  })
  return { background, foreground, ...Object.fromEntries(entries) } as TuiSyntaxThemeColors
}

function uiColors(
  colors: Readonly<Record<string, unknown>>,
  background: string,
  foreground: string,
  tone: TuiThemeTone,
): TuiThemeUiColors {
  const fallback = BUILT_IN_THEMES[tone].colors
  const surface = firstColor(colors, ['sideBar.background', 'editorWidget.background', 'panel.background'], background, background)
  const brand = firstColor(colors, ['textLink.foreground', 'activityBarBadge.background', 'button.background'], background, fallback.brand)
  return {
    canvas: background,
    surface,
    text: foreground,
    muted: firstColor(colors, ['descriptionForeground', 'editorLineNumber.foreground'], background, fallback.muted),
    border: firstColor(colors, ['focusBorder', 'panel.border', 'editorGroup.border'], background, fallback.border),
    brand,
    accent: firstColor(colors, ['textLink.activeForeground', 'terminal.ansiBlue'], background, brand),
    selection: firstColor(colors, ['editor.selectionBackground', 'list.activeSelectionBackground'], background, fallback.selection),
    success: firstColor(colors, ['testing.iconPassed', 'gitDecoration.addedResourceForeground', 'terminal.ansiGreen'], background, fallback.success),
    warning: firstColor(colors, ['editorWarning.foreground', 'terminal.ansiYellow'], background, fallback.warning),
    danger: firstColor(colors, ['editorError.foreground', 'terminal.ansiRed'], background, fallback.danger),
  }
}

/**
 * Convert one merged VS Code theme to a complete SeekTTY custom theme.
 * Font families and sizes are intentionally excluded because terminals own them.
 * @param loaded - merged local VS Code theme.
 * @param id - durable custom-theme id.
 * @param name - user-visible theme name.
 * @returns normalized theme with exact portable TextMate colors/styles.
 */
export function convertVsCodeTheme(loaded: LoadedVsCodeTheme, id: string, name: string): TuiCustomTheme {
  const tone = themeTone(loaded.value)
  const base = BUILT_IN_THEMES[tone]
  const background = firstColor(loaded.value.colors, ['editor.background'], base.colors.canvas, base.syntax.background)
  const foreground = firstColor(loaded.value.colors, ['editor.foreground'], background, base.syntax.foreground)
  const tokenColors = textMateRules(loaded.value, background)
  return normalizeCustomTheme({
    id,
    name,
    tone,
    source: 'vscode',
    colors: uiColors(loaded.value.colors, background, foreground, tone),
    syntax: syntaxColors(loaded.value, background, foreground, tokenColors, base.syntax),
    tokenColors,
  })
}
