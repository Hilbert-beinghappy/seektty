/** Schemastery-driven terminal model for every redacted Harness Settings namespace. */

import {
  getPath,
  hasPath,
  rehydrateSchema,
  type SchemaNode,
} from '@deepseek-ai/dsh-client-schema-form'
import { LOCALE_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-client-locale'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
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
  if (namespace === 'tui-plugin-marketplace') return ui('插件市场来源', 'Plugin marketplace sources')
  return ui('通用设置', 'General settings')
}

const FIELD_LABELS: Readonly<Record<string, { readonly zh: string; readonly en: string }>> = {
  defaultPreset: { zh: '默认 Agent 模式', en: 'Default Agent preset' },
  default: { zh: '默认权限', en: 'Default permission' },
  theme: { zh: '界面主题', en: 'Interface theme' },
  codeTheme: { zh: '代码块主题', en: 'Code theme' },
  toolCards: { zh: '工具卡片默认形态', en: 'Default tool-card shape' },
  showReasoning: { zh: '推理默认显示', en: 'Show reasoning by default' },
  desktopNotifications: { zh: '完成/审批桌面通知', en: 'Desktop notifications' },
  followTerminalTitle: { zh: '终端标题跟随', en: 'Follow the terminal title' },
  composerHistoryLimit: { zh: '输入历史条数', en: 'Composer history size' },
  statusElapsed: { zh: '状态栏实时耗时', en: 'Live status elapsed time' },
  clipboardFallback: { zh: '剪贴板回退', en: 'Clipboard fallback' },
  toolOutputLineLimit: { zh: '工具输出行数上限', en: 'Tool output line limit' },
  diffContextLines: { zh: 'Diff 上下文行数', en: 'Diff context lines' },
  dangerConfirmDefault: { zh: '危险确认默认焦点', en: 'Danger confirm default focus' },
  keyBindings: { zh: '快捷键覆盖', en: 'Key binding overrides' },
}

/**
 * Label a known high-frequency field while keeping unknown paths visible.
 * @param namespace - registered Harness Settings namespace.
 * @param path - schema path inside that namespace.
 */
export function settingsFieldLabel(namespace: string, path: readonly string[]): string {
  if (path.length === 0) return namespace
  const dotted = path.join('.')
  const named = FIELD_LABELS[`${namespace}.${dotted}`] ?? FIELD_LABELS[dotted]
  return named === undefined ? dotted : ui(named.zh, named.en)
}

/** One flattened Settings field with its owning namespace. */
export interface IndexedSettingsField {
  readonly namespace: string
  readonly section: string
  readonly field: TuiSettingsField
}

/**
 * Flatten every registered Settings document into a cross-namespace field index.
 * @param documents - redacted Settings descriptors.
 */
export function indexSettingsFields(
  documents: readonly TuiSettingsDocument[],
): readonly IndexedSettingsField[] {
  return documents.flatMap(document => settingsFields(document).map(field => ({
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
}

/**
 * Build the searchable Settings root: namespaces first, then every field.
 * @param documents - redacted Settings descriptors.
 */
export function settingsRootChoices(
  documents: readonly TuiSettingsDocument[],
): readonly SettingsRootChoice[] {
  return [
    ...documents.map(document => ({
      id: document.namespace,
      label: document.namespace,
      description: `${settingsSectionLabel(document.namespace)} · ${document.applies === 'live' ? ui('立即生效', 'applies immediately') : ui('需重启', 'restart required')}`,
    })),
    ...indexSettingsFields(documents).map(item => ({
      id: `field:${item.namespace}:${JSON.stringify(item.field.path)}`,
      label: item.field.label,
      description: `${item.namespace}.${item.field.path.join('.')} · ${item.section}`,
    })),
  ]
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
