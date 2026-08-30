/** Validation and persistence helpers for the Profile-owned welcome page. */

import {
  DEFAULT_TUI_WELCOME,
  MAX_WELCOME_ROWS,
  MAX_WELCOME_TEXT_LENGTH,
  TUI_WELCOME_SETTINGS_NAMESPACE,
  type TuiManagementBridge,
  type TuiSafeFastfetchModule,
  type TuiSettingsDocument,
  type TuiWelcomeFact,
  type TuiWelcomeRow,
  type TuiWelcomeSettings,
} from '@deepseek-ai/dsh-tui-protocol'
import { stat } from 'node:fs/promises'
import { escapeTerminalText } from './theme.ts'
import { ui } from './locale.ts'
import { loadWelcomeLogoFile } from './welcome-logo.ts'
import { resolveHarnessUserPath } from './workspace-path.ts'

const INFO_MODES = new Set(['custom', 'fastfetch', 'mixed'] as const)
const MIXED_ORDERS = new Set(['custom-first', 'fastfetch-first'] as const)
const LOGO_SOURCES = new Set(['builtin', 'file', 'fastfetch', 'none'] as const)
const LOGO_COLOR_MODES = new Set(['original', 'theme'] as const)
const FASTFETCH_SOURCES = new Set(['safe', 'user-config'] as const)
const FACTS = new Set<TuiWelcomeFact>([
  'seekttyVersion', 'profile', 'workspace', 'model', 'reasoning', 'mode',
  'permission', 'theme', 'platform',
])
export const SAFE_FASTFETCH_MODULES: readonly TuiSafeFastfetchModule[] = Object.freeze([
  'os', 'host', 'kernel', 'uptime', 'packages', 'shell', 'display', 'de', 'wm',
  'terminal', 'terminalfont', 'cpu', 'gpu', 'memory', 'swap', 'disk', 'battery',
  'locale', 'theme', 'colors',
])
const SAFE_MODULE_SET = new Set<TuiSafeFastfetchModule>(SAFE_FASTFETCH_MODULES)

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? value as Readonly<Record<string, unknown>> : {}
}

function boundedText(value: unknown): string {
  return escapeTerminalText(typeof value === 'string' ? value : '').slice(0, MAX_WELCOME_TEXT_LENGTH)
}

function normalizeRow(value: unknown): TuiWelcomeRow | undefined {
  const row = recordOf(value)
  switch (row.kind) {
    case 'heading': return { kind: 'heading', text: boundedText(row.text) }
    case 'text': return { kind: 'text', text: boundedText(row.text) }
    case 'field': return { kind: 'field', label: boundedText(row.label), value: boundedText(row.value) }
    case 'fact': {
      if (typeof row.fact !== 'string' || !FACTS.has(row.fact as TuiWelcomeFact)) return undefined
      const label = boundedText(row.label)
      return {
        kind: 'fact',
        fact: row.fact as TuiWelcomeFact,
        ...(label === '' ? {} : { label }),
      }
    }
    case 'separator': return { kind: 'separator' }
    case 'blank': return { kind: 'blank' }
    case 'palette': return { kind: 'palette' }
    default: return undefined
  }
}

export function defaultWelcomeSettings(): TuiWelcomeSettings {
  return {
    infoMode: DEFAULT_TUI_WELCOME.infoMode,
    mixedOrder: DEFAULT_TUI_WELCOME.mixedOrder,
    customRows: DEFAULT_TUI_WELCOME.customRows.map(row => ({ ...row })),
    logo: { ...DEFAULT_TUI_WELCOME.logo },
    fastfetch: {
      ...DEFAULT_TUI_WELCOME.fastfetch,
      modules: [...DEFAULT_TUI_WELCOME.fastfetch.modules],
    },
  }
}

/** Normalize a possibly partial legacy value without accepting unsafe modules. */
export function normalizeWelcome(value: unknown): TuiWelcomeSettings {
  const fallback = defaultWelcomeSettings()
  const record = recordOf(value)
  const logo = recordOf(record.logo)
  const fastfetch = recordOf(record.fastfetch)
  const rows = Array.isArray(record.customRows)
    ? record.customRows.slice(0, MAX_WELCOME_ROWS).map(normalizeRow).filter((row): row is TuiWelcomeRow => row !== undefined)
    : fallback.customRows
  const modules = Array.isArray(fastfetch.modules)
    ? [...new Set(fastfetch.modules.filter((module): module is TuiSafeFastfetchModule =>
      typeof module === 'string' && SAFE_MODULE_SET.has(module as TuiSafeFastfetchModule)))]
    : fallback.fastfetch.modules
  return {
    infoMode: typeof record.infoMode === 'string' && INFO_MODES.has(record.infoMode as never)
      ? record.infoMode as TuiWelcomeSettings['infoMode'] : fallback.infoMode,
    mixedOrder: typeof record.mixedOrder === 'string' && MIXED_ORDERS.has(record.mixedOrder as never)
      ? record.mixedOrder as TuiWelcomeSettings['mixedOrder'] : fallback.mixedOrder,
    customRows: rows,
    logo: {
      source: typeof logo.source === 'string' && LOGO_SOURCES.has(logo.source as never)
        ? logo.source as TuiWelcomeSettings['logo']['source'] : fallback.logo.source,
      colorMode: typeof logo.colorMode === 'string' && LOGO_COLOR_MODES.has(logo.colorMode as never)
        ? logo.colorMode as TuiWelcomeSettings['logo']['colorMode'] : fallback.logo.colorMode,
      largePath: boundedText(logo.largePath),
      compactPath: boundedText(logo.compactPath),
    },
    fastfetch: {
      source: typeof fastfetch.source === 'string' && FASTFETCH_SOURCES.has(fastfetch.source as never)
        ? fastfetch.source as TuiWelcomeSettings['fastfetch']['source'] : fallback.fastfetch.source,
      modules,
      configPath: boundedText(fastfetch.configPath),
    },
  }
}

export function welcomeSettings(documents: readonly TuiSettingsDocument[]): TuiSettingsDocument {
  const document = documents.find(candidate => candidate.namespace === TUI_WELCOME_SETTINGS_NAMESPACE)
  if (document === undefined) {
    throw new Error(ui(
      `Harness 未注册设置 ${TUI_WELCOME_SETTINGS_NAMESPACE}`,
      `Harness did not register settings ${TUI_WELCOME_SETTINGS_NAMESPACE}`,
    ))
  }
  return document
}

export function welcomeFromSettings(document: TuiSettingsDocument): TuiWelcomeSettings {
  return normalizeWelcome(document.value)
}

/** Validate external paths before a draft is allowed to replace live settings. */
export async function prepareWelcomeSettings(
  draft: TuiWelcomeSettings,
  workspacePath: string,
): Promise<TuiWelcomeSettings> {
  const value = normalizeWelcome(draft)
  let largePath = value.logo.largePath
  let compactPath = value.logo.compactPath
  if (value.logo.source === 'file') {
    if (largePath.trim() === '') {
      throw new Error(ui(
        '自定义 Logo 需要大图文件路径。',
        'A custom logo requires a large-logo file path.',
      ))
    }
    const large = await loadWelcomeLogoFile(largePath, workspacePath, value.logo.colorMode)
    largePath = large.path
    if (compactPath.trim() !== '') {
      const compact = await loadWelcomeLogoFile(compactPath, workspacePath, value.logo.colorMode)
      compactPath = compact.path
    }
  }
  let configPath = value.fastfetch.configPath
  if ((value.fastfetch.source === 'user-config' || value.logo.source === 'fastfetch') && configPath.trim() !== '') {
    const path = resolveHarnessUserPath(configPath, workspacePath)
    const metadata = await stat(path)
    if (!metadata.isFile()) throw new Error(ui('Fastfetch 配置路径不是文件。', 'The Fastfetch config path is not a file.'))
    configPath = path
  }
  return {
    ...value,
    logo: { ...value.logo, largePath, compactPath },
    fastfetch: { ...value.fastfetch, configPath },
  }
}

/** Persist one validated draft atomically under the descriptor revision. */
export async function saveWelcomeSettings(
  settings: TuiManagementBridge['settings'],
  document: TuiSettingsDocument,
  draft: TuiWelcomeSettings,
): Promise<TuiSettingsDocument> {
  const value = normalizeWelcome(draft)
  const updated = await settings.mutate(TUI_WELCOME_SETTINGS_NAMESPACE, [
    { op: 'set', path: ['infoMode'], value: value.infoMode },
    { op: 'set', path: ['mixedOrder'], value: value.mixedOrder },
    { op: 'set', path: ['customRows'], value: value.customRows },
    { op: 'set', path: ['logo'], value: value.logo },
    { op: 'set', path: ['fastfetch'], value: value.fastfetch },
  ], document.revision)
  return updated
}
