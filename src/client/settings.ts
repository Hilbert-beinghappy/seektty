/** Schemastery-driven terminal model for every redacted Harness Settings namespace. */

import {
  getPath,
  hasPath,
  rehydrateSchema,
  type SchemaNode,
} from '@deepseek-ai/dsh-client-schema-form'
import { LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-client-locale'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE,
  TUI_WELCOME_SETTINGS_NAMESPACE,
} from '@deepseek-ai/dsh-tui-protocol'
import { ui, uiLocale } from './locale.ts'
import type { TuiSettingsDocument } from './management.ts'

/** Terminal control selected for one schema-addressed Settings field. */
export type TuiSettingsControl = 'boolean' | 'enum' | 'number' | 'text' | 'json' | 'secret' | 'credential-ref'

/** One primitive enum choice reconstructed from a Schemastery union. */
export interface TuiSettingsChoice {
  readonly id: string
  readonly label: string
  readonly value: string | number | boolean | null
}

/** One editable field in the universal Settings fallback. */
export interface TuiSettingsField {
  readonly path: readonly string[]
  readonly label: string
  readonly description?: string
  readonly schemaType: string
  readonly control: TuiSettingsControl
  readonly value: unknown
  readonly overridden: boolean
  readonly inherited: unknown
  readonly required: boolean
  readonly disabled: boolean
  readonly secretSet: boolean
  readonly choices: readonly TuiSettingsChoice[]
}

function descriptionOf(node: SchemaNode): string | undefined {
  const description = node.meta.description
  if (typeof description === 'string') return description
  if (typeof description !== 'object') return undefined
  const localized = description as Record<string, unknown>
  const preferred = uiLocale() === 'en'
    ? ['en-US', 'en', 'zh-CN', 'zh']
    : ['zh-CN', 'zh', 'en-US', 'en']
  for (const key of preferred) {
    if (typeof localized[key] === 'string') return localized[key]
  }
  return Object.values(localized).find((value): value is string => typeof value === 'string')
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

function enumChoices(node: SchemaNode): readonly TuiSettingsChoice[] {
  if (node.type === 'const' && (['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null)) {
    const value = node.value as string | number | boolean | null
    return [{ id: JSON.stringify(value), label: String(value), value }]
  }
  if (node.type !== 'union' || node.list === undefined) return []
  const choices = node.list.flatMap(enumChoices)
  return choices.length === node.list.length ? choices : []
}

function controlOf(node: SchemaNode, secret: boolean): TuiSettingsControl {
  if (secret || node.meta.role === 'secret') return 'secret'
  if (node.meta.role === 'credential-ref') return 'credential-ref'
  if (node.type === 'boolean') return 'boolean'
  if (enumChoices(node).length > 0) return 'enum'
  if (node.type === 'number' || node.type === 'natural' || node.type === 'percent') return 'number'
  if (node.type === 'string') return 'text'
  return 'json'
}

function inheritedValue(document: TuiSettingsDocument, node: SchemaNode, path: readonly string[]): unknown {
  const base = getPath(document.base, path)
  return base === undefined ? node.meta.default : base
}

function fieldOf(
  document: TuiSettingsDocument,
  node: SchemaNode,
  path: readonly string[],
): TuiSettingsField {
  const secret = document.secrets.find(item => samePath(item.path, path))
  const description = descriptionOf(node)
  return {
    path,
    label: settingsFieldLabel(document.namespace, path),
    ...(description === undefined ? {} : { description }),
    schemaType: node.type,
    control: controlOf(node, secret !== undefined),
    value: getPath(document.value, path),
    overridden: hasPath(document.user, path),
    inherited: inheritedValue(document, node, path),
    required: node.meta.required === true,
    disabled: node.meta.disabled === true,
    secretSet: secret?.set === true,
    choices: enumChoices(node),
  }
}

function walk(
  document: TuiSettingsDocument,
  node: SchemaNode,
  path: readonly string[],
  output: TuiSettingsField[],
): void {
  // Schemastery's generic `hidden` flag is a renderer hint, not proof that a
  // field is purely visual. The task-book requires unknown functional fields
  // to remain reachable, so retain it until Harness publishes an explicit
  // appearance-only role.
  if (node.meta.role === 'secret' || node.meta.role === 'credential-ref') {
    output.push(fieldOf(document, node, path))
    return
  }
  if (node.type === 'object' && node.dict !== undefined && Object.keys(node.dict).length > 0) {
    for (const [key, child] of Object.entries(node.dict)) walk(document, child, [...path, key], output)
    return
  }
  output.push(fieldOf(document, node, path))
}

/**
 * Rehydrate and flatten one Settings schema into terminal controls. Unknown
 * containers and unions remain reachable through a JSON control.
 * @param document - redacted Settings descriptor from the same Host.
 * @returns ordered field list.
 */
export function settingsFields(document: TuiSettingsDocument): readonly TuiSettingsField[] {
  const output: TuiSettingsField[] = []
  walk(document, rehydrateSchema(document.schema), [], output)
  return output
}

/**
 * Parse one text submission according to a field's schema control.
 * @param field - selected Settings field.
 * @param text - unmasked editor value.
 * @returns JSON-compatible value for a Settings path mutation.
 */
export function parseSettingsValue(field: TuiSettingsField, text: string): unknown {
  switch (field.control) {
    case 'number': {
      const value = Number(text)
      if (!Number.isFinite(value)) throw new Error(ui(
        `${field.label} 必须是有限数字`,
        `${field.label} must be a finite number`,
      ))
      return value
    }
    case 'json': {
      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new Error(ui(
          `${field.label} 需要有效 JSON：${error instanceof Error ? error.message : String(error)}`,
          `${field.label} requires valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        ))
      }
    }
    case 'boolean':
    case 'enum': throw new Error(ui(
      `${field.label} 应通过选择器写入`,
      `${field.label} must be changed with the selector`,
    ))
    case 'credential-ref':
    case 'secret':
    case 'text': return text
  }
}

/**
 * Format a non-secret Settings value for selectors without losing structure.
 * @param value - redacted value.
 * @returns compact display string.
 */
export function formatSettingsValue(value: unknown): string {
  if (value === undefined) return ui('未设置', 'Not set')
  if (typeof value === 'string') return value === '' ? ui('空字符串', 'Empty string') : value
  return JSON.stringify(value)
}

/**
 * Label a known high-frequency section while keeping unknown namespaces visible.
 * @param namespace - registered Harness Settings namespace.
 * @returns dedicated-control or generic-settings label.
 */
export function settingsSectionLabel(namespace: string): string {
  if (namespace === LOCALE_SETTINGS_NAMESPACE) return ui('界面语言', 'Interface language')
  if (namespace === 'permission') return ui('默认权限', 'Default permission')
  if (namespace === 'agent-presets') return ui('默认 Agent Preset', 'Default Agent Preset')
  if (namespace === 'agent-default-model' || namespace.startsWith('llm-')) return ui('模型与 Provider', 'Models and Providers')
  if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) return ui('SeekTTY 主题', 'SeekTTY themes')
  if (namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE) return ui('SeekTTY 行为', 'SeekTTY behavior')
  if (namespace === TUI_WELCOME_SETTINGS_NAMESPACE) return ui('SeekTTY 欢迎页', 'SeekTTY welcome page')
  if (namespace === 'tui-plugin-marketplace') return ui('插件市场来源', 'Plugin marketplace sources')
  return ui('通用设置', 'General settings')
}

/** Stable product-level information architecture for the Settings center. */
export type SettingsCategoryId =
  | 'appearance'
  | 'welcome'
  | 'mouse'
  | 'input'
  | 'model-agent'
  | 'permissions'
  | 'extensions'
  | 'language-system'

export const SETTINGS_CATEGORY_ORDER: readonly SettingsCategoryId[] = Object.freeze([
  'appearance',
  'welcome',
  'mouse',
  'input',
  'model-agent',
  'permissions',
  'extensions',
  'language-system',
])

export function settingsCategoryLabel(category: SettingsCategoryId): string {
  switch (category) {
    case 'appearance': return ui('外观', 'Appearance')
    case 'welcome': return ui('欢迎页', 'Welcome page')
    case 'mouse': return ui('鼠标与滚动', 'Mouse and scrolling')
    case 'input': return ui('输入与快捷键', 'Input and shortcuts')
    case 'model-agent': return ui('模型与 Agent', 'Models and Agent')
    case 'permissions': return ui('权限与安全', 'Permissions and security')
    case 'extensions': return ui('插件与扩展', 'Plugins and extensions')
    case 'language-system': return ui('语言与系统', 'Language and system')
  }
}

export function settingsCategoryDescription(category: SettingsCategoryId): string {
  switch (category) {
    case 'appearance': return ui('主题、代码主题、背景和界面呈现', 'Themes, code colors, backgrounds, and presentation')
    case 'welcome': return ui('信息内容、Logo 和 Fastfetch', 'Information, Logo, and Fastfetch')
    case 'mouse': return ui('鼠标模式、滚轮、悬停、选择和滚动条', 'Mouse mode, wheel, hover, selection, and scrollbar')
    case 'input': return ui('输入历史、剪贴板、确认行为和快捷键', 'Input history, clipboard, confirmations, and shortcuts')
    case 'model-agent': return ui('Provider、模型、推理强度和 Agent 模式', 'Providers, models, reasoning, and Agent modes')
    case 'permissions': return ui('默认权限、工作区边界和安全策略', 'Default access, workspace boundaries, and security policy')
    case 'extensions': return ui('插件市场、插件、Skill 和 MCP 设置', 'Plugin catalogs, plugins, skills, and MCP settings')
    case 'language-system': return ui('界面语言、通知、终端和其他系统设置', 'Language, notifications, terminal, and other system settings')
  }
}

const APPEARANCE_BEHAVIOR_FIELDS = new Set(['toolCards', 'showReasoning', 'statusElapsed'])
const MOUSE_BEHAVIOR_FIELDS = new Set([
  'mouseMode', 'hoverFeedback', 'scrollbarVisibility', 'copyOnSelect',
  'wheelScrollLines', 'wheelAcceleration',
])
const INPUT_BEHAVIOR_FIELDS = new Set([
  'composerHistoryLimit', 'clipboardFallback', 'dangerConfirmDefault', 'keyBindings',
])

/** Assign one registered namespace or field to exactly one user-facing category. */
export function settingsCategoryFor(
  namespace: string,
  path: readonly string[] = [],
): SettingsCategoryId {
  const root = path[0] ?? ''
  if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) return 'appearance'
  if (namespace === TUI_WELCOME_SETTINGS_NAMESPACE) return 'welcome'
  if (namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE) {
    if (APPEARANCE_BEHAVIOR_FIELDS.has(root)) return 'appearance'
    if (MOUSE_BEHAVIOR_FIELDS.has(root)) return 'mouse'
    if (INPUT_BEHAVIOR_FIELDS.has(root)) return 'input'
    return 'language-system'
  }
  if (namespace === 'agent-default-model' || namespace === 'agent-presets'
    || namespace.startsWith('llm-') || /(?:model|provider|agent)/iu.test(namespace)) return 'model-agent'
  if (namespace === 'permission' || /(?:permission|security|sandbox|access)/iu.test(namespace)) return 'permissions'
  if (namespace === 'tui-plugin-marketplace' || /(?:plugin|marketplace|skill|mcp|extension)/iu.test(namespace)) return 'extensions'
  return 'language-system'
}

const FIELD_LABELS: Readonly<Record<string, { readonly zh: string; readonly en: string }>> = {
  'agent-presets.defaultPreset': { zh: '默认 Agent 模式', en: 'Default Agent preset' },
  'permission.default': { zh: '默认权限', en: 'Default permission' },
  [`${TUI_APPEARANCE_SETTINGS_NAMESPACE}.theme`]: { zh: '界面主题', en: 'Interface theme' },
  [`${TUI_APPEARANCE_SETTINGS_NAMESPACE}.codeTheme`]: { zh: '代码块主题', en: 'Code theme' },
  [`${TUI_APPEARANCE_SETTINGS_NAMESPACE}.backgroundMode`]: { zh: '背景模式', en: 'Background mode' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.toolCards`]: { zh: '工具卡片默认形态', en: 'Default tool-card shape' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.showReasoning`]: { zh: '推理默认显示', en: 'Show reasoning by default' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.desktopNotifications`]: { zh: '完成/审批桌面通知', en: 'Desktop notifications' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.followTerminalTitle`]: { zh: '终端标题跟随', en: 'Follow the terminal title' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.composerHistoryLimit`]: { zh: '输入历史条数', en: 'Composer history size' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.statusElapsed`]: { zh: '状态栏实时耗时', en: 'Live status elapsed time' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.clipboardFallback`]: { zh: '剪贴板回退', en: 'Clipboard fallback' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.toolOutputLineLimit`]: { zh: '工具输出行数上限', en: 'Tool output line limit' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.diffContextLines`]: { zh: 'Diff 上下文行数', en: 'Diff context lines' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.dangerConfirmDefault`]: { zh: '危险确认默认焦点', en: 'Danger confirm default focus' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.mouseMode`]: { zh: '鼠标模式', en: 'Mouse mode' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.hoverFeedback`]: { zh: '悬停反馈', en: 'Hover feedback' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.scrollbarVisibility`]: { zh: '滚动条显示', en: 'Scrollbar visibility' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.copyOnSelect`]: { zh: '选中后复制', en: 'Copy on select' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.wheelScrollLines`]: { zh: '滚轮每格行数', en: 'Lines per wheel step' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.wheelAcceleration`]: { zh: '滚轮加速', en: 'Wheel acceleration' },
  [`${TUI_BEHAVIOR_SETTINGS_NAMESPACE}.keyBindings`]: { zh: '快捷键覆盖', en: 'Key binding overrides' },
}

/**
 * Label a known high-frequency field while keeping unknown paths visible.
 * Known labels match `namespace + path` only; unknown fields use the dotted path.
 * @param namespace - registered Harness Settings namespace.
 * @param path - schema path inside that namespace.
 */
export function settingsFieldLabel(namespace: string, path: readonly string[]): string {
  if (path.length === 0) return namespace
  const dotted = path.join('.')
  const named = FIELD_LABELS[`${namespace}.${dotted}`]
  return named === undefined ? dotted : ui(named.zh, named.en)
}

/** One flattened Settings field with its owning namespace. */
export interface IndexedSettingsField {
  readonly namespace: string
  readonly section: string
  readonly field: TuiSettingsField
}

/**
 * Drop Host-internal Settings namespaces that are not user-editable.
 * @param documents - redacted Settings descriptors.
 */
export function visibleSettingsDocuments(
  documents: readonly TuiSettingsDocument[],
): readonly TuiSettingsDocument[] {
  return documents.filter(document => document.namespace !== TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE)
}

/**
 * Report whether `/settings` should hide a field already owned by a dedicated editor.
 * @param namespace - registered Harness Settings namespace.
 * @param path - schema path inside that namespace.
 */
export function hasDedicatedSettingsEditor(namespace: string, path: readonly string[]): boolean {
  if (namespace === TUI_WELCOME_SETTINGS_NAMESPACE) return true
  if (namespace === LOCALE_SETTINGS_NAMESPACE) return samePath(path, [LOCALE_PREFERENCE_FIELD])
  if (namespace === 'agent-default-model') {
    return samePath(path, ['provider']) || samePath(path, ['model']) || samePath(path, ['reasoningEffort'])
  }
  if (namespace === 'llm-pi-ai' && samePath(path, ['providers'])) return true
  if (namespace === 'permission' && (samePath(path, ['default']) || samePath(path, ['defaultPreset']))) return true
  if (namespace === 'agent-presets' && (samePath(path, ['default']) || samePath(path, ['defaultPreset']))) return true
  if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE && (
    samePath(path, ['theme']) || samePath(path, ['codeTheme']) || samePath(path, ['backgroundMode'])
    || samePath(path, ['customThemes'])
  )) {
    return true
  }
  if (namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE && samePath(path, ['keyBindings'])) return true
  return namespace === 'tui-plugin-marketplace' && samePath(path, ['sources'])
}

/**
 * Flatten every registered Settings document into a cross-namespace field index.
 * Dedicated-editor fields are omitted so `/settings` search does not duplicate them.
 * @param documents - redacted Settings descriptors.
 */
export function indexSettingsFields(
  documents: readonly TuiSettingsDocument[],
): readonly IndexedSettingsField[] {
  return visibleSettingsDocuments(documents).flatMap(document => settingsFields(document)
    .filter(field => !hasDedicatedSettingsEditor(document.namespace, field.path))
    .map(field => ({
      namespace: document.namespace,
      section: settingsSectionLabel(document.namespace),
      field,
    })))
}

/** One row in the searchable Settings root list. */
export interface SettingsRootChoice {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly disabledReason?: string
}

/** Eight stable category rows; unavailable categories remain visible but disabled. */
export function settingsCategoryChoices(
  documents: readonly TuiSettingsDocument[],
): readonly SettingsRootChoice[] {
  const visible = visibleSettingsDocuments(documents)
  const available = new Set<SettingsCategoryId>()
  for (const document of visible) {
    available.add(settingsCategoryFor(document.namespace))
    for (const field of settingsFields(document)) {
      available.add(settingsCategoryFor(document.namespace, field.path))
    }
  }
  return SETTINGS_CATEGORY_ORDER.map(category => ({
    id: category,
    label: settingsCategoryLabel(category),
    description: settingsCategoryDescription(category),
    ...(available.has(category) ? {} : { disabledReason: ui('当前 Profile 没有相关设置', 'No related settings in this Profile') }),
  }))
}

export function parseSettingsRootChoice(id: string): {
  readonly namespace: string
  readonly fieldPath?: readonly string[]
} | undefined {
  if (id.startsWith('field:')) {
    const separator = id.indexOf(':', 'field:'.length)
    if (separator === -1) return undefined
    const namespace = id.slice('field:'.length, separator)
    try {
      const path = JSON.parse(id.slice(separator + 1)) as unknown
      if (!Array.isArray(path) || path.some(part => typeof part !== 'string')) return undefined
      return { namespace, fieldPath: path as readonly string[] }
    } catch {
      return undefined
    }
  }
  if (id === '') return undefined
  return { namespace: id }
}
