/** Schemastery-driven terminal model for every redacted Harness Settings namespace. */

import {
  getPath,
  hasPath,
  rehydrateSchema,
  type SchemaNode,
} from '@deepseek-ai/dsh-client-schema-form'
import { TUI_APPEARANCE_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-tui-protocol'
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
  for (const key of ['zh-CN', 'zh', 'en-US', 'en']) {
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
    label: path.length === 0 ? document.namespace : path.join('.'),
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
      if (!Number.isFinite(value)) throw new Error(`${field.label} 必须是有限数字`)
      return value
    }
    case 'json': {
      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new Error(`${field.label} 需要有效 JSON：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    case 'boolean':
    case 'enum': throw new Error(`${field.label} 应通过选择器写入`)
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
  if (value === undefined) return '未设置'
  if (typeof value === 'string') return value === '' ? '空字符串' : value
  return JSON.stringify(value)
}

/**
 * Label a known high-frequency section while keeping unknown namespaces visible.
 * @param namespace - registered Harness Settings namespace.
 * @returns dedicated-control or generic-settings label.
 */
export function settingsSectionLabel(namespace: string): string {
  if (namespace === 'permission') return '默认权限'
  if (namespace === 'agent-presets') return '默认 Agent Preset'
  if (namespace === 'agent-default-model' || namespace.startsWith('llm-')) return '模型与 Provider'
  if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) return 'SeekTTY 主题'
  if (namespace === 'tui-plugin-marketplace') return '插件市场来源'
  return '通用设置'
}
