import { afterEach, describe, expect, it } from 'vitest'
import { agentPresetCopy } from '../src/client/agent-preset-copy.ts'
import type { TuiModeOption } from '../src/client/capabilities.ts'
import { setUiLocale } from '../src/client/locale.ts'

function mode(overrides: Partial<TuiModeOption> = {}): TuiModeOption {
  return {
    id: 'standard',
    label: '标准模式',
    description: '功能完整的编码 Agent。',
    trust: 'system',
    current: false,
    isDefault: true,
    ...overrides,
  }
}

afterEach(() => { setUiLocale('zh') })

describe('Agent Preset display copy', () => {
  it('localizes every shipped system Preset in English', () => {
    setUiLocale('en')
    expect(agentPresetCopy(mode({ id: 'standard' })).label).toBe('Standard mode')
    expect(agentPresetCopy(mode({ id: 'code' })).label).toBe('PTC mode')
    expect(agentPresetCopy(mode({ id: 'minimal' })).label).toBe('Minimal mode')
    expect(agentPresetCopy(mode({ id: 'cordis' })).label).toBe('Creator mode')
    expect(agentPresetCopy(mode({ id: 'standard' })).description).not.toMatch(/\p{Script=Han}/u)
  })

  it('keeps user-authored metadata verbatim even when its id matches a shipped Preset', () => {
    setUiLocale('en')
    expect(agentPresetCopy(mode({
      id: 'standard',
      label: '我的标准模式',
      description: '作者自己的说明',
      trust: 'user',
    }))).toEqual({ label: '我的标准模式', description: '作者自己的说明' })
  })
})
