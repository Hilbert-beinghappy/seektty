import { afterEach, describe, expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import {
  LOCALE_PREFERENCE_FIELD,
  LOCALE_SETTINGS_NAMESPACE,
} from '@deepseek-ai/dsh-client-locale'
import { setUiLocale } from '../src/client/locale.ts'
import {
  hasDedicatedSettingsEditor,
  indexSettingsFields,
  parseSettingsRootChoice,
  settingsCategoryChoices,
  settingsCategoryFor,
  settingsFieldLabel,
} from '../src/client/settings.ts'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '../src/protocol.ts'

function document(namespace: string, schema: unknown, value: unknown): TuiSettingsDocument {
  return {
    namespace,
    schema,
    value,
    revision: 1,
    applies: 'live',
    secrets: [],
  }
}

afterEach(() => { setUiLocale('zh') })

describe('settings field index', () => {
  it('gives high-frequency fields bilingual labels and searches across namespaces', () => {
    const presets = document(
      'agent-presets',
      z.object({ defaultPreset: z.string().default('code') }).toJSON(),
      { defaultPreset: 'code' },
    )
    const behavior = document(
      'seektty-behavior',
      z.object({ toolCards: z.string().default('collapsed') }).toJSON(),
      { toolCards: 'collapsed' },
    )
    expect(settingsFieldLabel('agent-presets', ['defaultPreset'])).toBe('默认 Agent 模式')
    setUiLocale('en')
    expect(settingsFieldLabel('agent-presets', ['defaultPreset'])).toBe('Default Agent preset')
    setUiLocale('zh')

    const indexed = indexSettingsFields([presets, behavior])
    expect(indexed.map(item => item.field.label)).toEqual(['工具卡片默认形态'])

    const root = settingsCategoryChoices([presets, behavior])
    expect(root.map(choice => choice.id)).toEqual([
      'appearance', 'welcome', 'mouse', 'input', 'model-agent',
      'permissions', 'extensions', 'language-system',
    ])
    expect(root.find(choice => choice.id === 'appearance')?.disabledReason).toBeUndefined()
    expect(root.find(choice => choice.id === 'model-agent')?.disabledReason).toBeUndefined()
    expect(root.find(choice => choice.id === 'welcome')?.disabledReason).toBeDefined()
    expect(parseSettingsRootChoice(`field:seektty-behavior:${JSON.stringify(['toolCards'])}`)).toEqual({
      namespace: 'seektty-behavior',
      fieldPath: ['toolCards'],
    })
    expect(parseSettingsRootChoice('agent-presets')).toEqual({ namespace: 'agent-presets' })
  })

  it('omits dedicated-editor fields from the searchable root while keeping namespace rows', () => {
    const appearance = document(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      z.object({
        theme: z.string().default('dark'),
        codeTheme: z.string().default('auto'),
        customThemes: z.array(z.object({})).default([]),
      }).toJSON(),
      { theme: 'dark', codeTheme: 'auto', customThemes: [] },
    )
    const behavior = document(
      TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      z.object({
        toolCards: z.string().default('collapsed'),
        keyBindings: z.object({}).default({}),
      }).toJSON(),
      { toolCards: 'collapsed', keyBindings: {} },
    )
    const locale = document(
      LOCALE_SETTINGS_NAMESPACE,
      z.object({ [LOCALE_PREFERENCE_FIELD]: z.string() }).toJSON(),
      { [LOCALE_PREFERENCE_FIELD]: 'zh' },
    )
    const marketplace = document(
      'tui-plugin-marketplace',
      z.object({
        sources: z.array(z.string()).default([]),
        extra: z.string().default('keep'),
      }).toJSON(),
      { sources: [], extra: 'keep' },
    )
    const fieldIds = indexSettingsFields([appearance, behavior, locale, marketplace])
      .map(item => `field:${item.namespace}:${JSON.stringify(item.field.path)}`)

    expect(fieldIds).not.toContain(`field:${TUI_APPEARANCE_SETTINGS_NAMESPACE}:${JSON.stringify(['theme'])}`)
    expect(fieldIds).not.toContain(`field:${TUI_APPEARANCE_SETTINGS_NAMESPACE}:${JSON.stringify(['codeTheme'])}`)
    expect(fieldIds).not.toContain(`field:${TUI_BEHAVIOR_SETTINGS_NAMESPACE}:${JSON.stringify(['keyBindings'])}`)
    expect(fieldIds).not.toContain(`field:${LOCALE_SETTINGS_NAMESPACE}:${JSON.stringify([LOCALE_PREFERENCE_FIELD])}`)
    expect(fieldIds).not.toContain(`field:tui-plugin-marketplace:${JSON.stringify(['sources'])}`)
    expect(fieldIds).not.toContain(`field:${TUI_APPEARANCE_SETTINGS_NAMESPACE}:${JSON.stringify(['customThemes'])}`)
    expect(hasDedicatedSettingsEditor('llm-pi-ai', ['providers'])).toBe(true)
    expect(hasDedicatedSettingsEditor('llm-pi-ai', ['unrelated'])).toBe(false)

    expect(fieldIds).toContain(`field:${TUI_BEHAVIOR_SETTINGS_NAMESPACE}:${JSON.stringify(['toolCards'])}`)
    expect(fieldIds).toContain(`field:tui-plugin-marketplace:${JSON.stringify(['extra'])}`)
    expect(settingsCategoryFor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['backgroundMode'])).toBe('appearance')
    expect(settingsCategoryFor(TUI_BEHAVIOR_SETTINGS_NAMESPACE, ['keyBindings'])).toBe('input')
    expect(settingsCategoryFor(TUI_BEHAVIOR_SETTINGS_NAMESPACE, ['mouseMode'])).toBe('mouse')
    expect(settingsCategoryFor('agent-default-model')).toBe('model-agent')
    expect(settingsCategoryFor('permission')).toBe('permissions')
    expect(settingsCategoryFor('tui-plugin-marketplace')).toBe('extensions')
    expect(settingsCategoryFor(LOCALE_SETTINGS_NAMESPACE)).toBe('language-system')
  })

  it('recognizes only the raw fields already owned by dedicated editors', () => {
    expect(hasDedicatedSettingsEditor(LOCALE_SETTINGS_NAMESPACE, [LOCALE_PREFERENCE_FIELD])).toBe(true)
    expect(hasDedicatedSettingsEditor(LOCALE_SETTINGS_NAMESPACE, ['extra'])).toBe(false)
    expect(hasDedicatedSettingsEditor('agent-default-model', ['provider'])).toBe(true)
    expect(hasDedicatedSettingsEditor('agent-default-model', ['model'])).toBe(true)
    expect(hasDedicatedSettingsEditor('agent-default-model', ['reasoningEffort'])).toBe(true)
    expect(hasDedicatedSettingsEditor('agent-default-model', ['extra'])).toBe(false)
    expect(hasDedicatedSettingsEditor('permission', ['default'])).toBe(true)
    expect(hasDedicatedSettingsEditor('permission', ['defaultPreset'])).toBe(true)
    expect(hasDedicatedSettingsEditor('permission', ['rules'])).toBe(false)
    expect(hasDedicatedSettingsEditor('agent-presets', ['default'])).toBe(true)
    expect(hasDedicatedSettingsEditor('agent-presets', ['defaultPreset'])).toBe(true)
    expect(hasDedicatedSettingsEditor('agent-presets', ['extra'])).toBe(false)
    expect(hasDedicatedSettingsEditor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['theme'])).toBe(true)
    expect(hasDedicatedSettingsEditor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['codeTheme'])).toBe(true)
    expect(hasDedicatedSettingsEditor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['backgroundMode'])).toBe(true)
    expect(hasDedicatedSettingsEditor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['customThemes'])).toBe(true)
    expect(hasDedicatedSettingsEditor(TUI_APPEARANCE_SETTINGS_NAMESPACE, ['extra'])).toBe(false)
    expect(hasDedicatedSettingsEditor(TUI_BEHAVIOR_SETTINGS_NAMESPACE, ['keyBindings'])).toBe(true)
    expect(hasDedicatedSettingsEditor(TUI_BEHAVIOR_SETTINGS_NAMESPACE, ['toolCards'])).toBe(false)
    expect(hasDedicatedSettingsEditor('tui-plugin-marketplace', ['sources'])).toBe(true)
    expect(hasDedicatedSettingsEditor('tui-plugin-marketplace', ['extra'])).toBe(false)
    expect(hasDedicatedSettingsEditor('other-plugin', ['theme'])).toBe(false)
  })

  it('labels known fields only by namespace and path, not a bare field name', () => {
    expect(settingsFieldLabel('other-plugin', ['theme'])).toBe('theme')
    expect(settingsFieldLabel('other-plugin', ['default'])).toBe('default')
    expect(settingsFieldLabel('seektty-appearance', ['theme'])).toBe('界面主题')
    expect(settingsFieldLabel('permission', ['default'])).toBe('默认权限')
  })
})
