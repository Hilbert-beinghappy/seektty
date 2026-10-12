import { afterEach, describe, expect, it } from 'vitest'
import { agentPresetCopy } from '../src/client/agent-preset-copy.ts'
import type { TuiModeOption } from '../src/client/capabilities.ts'
import { setUiLocale } from '../src/client/locale.ts'

function mode(overrides: Partial<TuiModeOption> = {}): TuiModeOption {
  return { id: 'standard', label: '标准模式', description: 'Host 的说明', current: false, isDefault: true, ...overrides }
}
afterEach(() => { setUiLocale('zh') })

describe('native Agent Preset display copy', () => {
  it.each(['standard', 'code', 'minimal', 'cordis'])('preserves Host metadata for %s without guessing authorship from id', id => {
    setUiLocale('en')
    expect(agentPresetCopy(mode({ id }))).toEqual({ label: '标准模式', description: 'Host 的说明' })
  })
  it('keeps user-authored metadata verbatim when its id matches a shipped Preset', () => {
    setUiLocale('en')
    expect(agentPresetCopy(mode({ label: '我的标准模式', description: '作者自己的说明' })))
      .toEqual({ label: '我的标准模式', description: '作者自己的说明' })
  })
  it('keeps absent optional descriptions absent', () => {
    expect(agentPresetCopy({ id: 'custom', label: 'Custom', current: false, isDefault: false }))
      .toEqual({ label: 'Custom' })
  })
})
