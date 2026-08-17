import { afterEach, describe, expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { setUiLocale } from '../src/client/locale.ts'
import {
  indexSettingsFields,
  parseSettingsRootChoice,
  settingsFieldLabel,
  settingsRootChoices,
} from '../src/client/settings.ts'
import type { TuiSettingsDocument } from '../src/protocol.ts'

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
    expect(indexed.map(item => item.field.label)).toEqual([
      '默认 Agent 模式',
      '工具卡片默认形态',
    ])

    const root = settingsRootChoices([presets, behavior])
    expect(root.some(choice => choice.id === 'agent-presets')).toBe(true)
    const field = root.find(choice => choice.label === '默认 Agent 模式')
    expect(field?.id).toBe(`field:agent-presets:${JSON.stringify(['defaultPreset'])}`)
    expect(field?.description).toContain('agent-presets.defaultPreset')
    expect(parseSettingsRootChoice(field?.id ?? '')).toEqual({
      namespace: 'agent-presets',
      fieldPath: ['defaultPreset'],
    })
    expect(parseSettingsRootChoice('agent-presets')).toEqual({ namespace: 'agent-presets' })
  })
})
