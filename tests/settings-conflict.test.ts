import { afterEach, describe, expect, it } from 'vitest'
import { TuiSettingsConflictError } from '../src/protocol.ts'
import { capabilityError } from '../src/client/capabilities.ts'
import { setUiLocale } from '../src/client/locale.ts'

afterEach(() => { setUiLocale('zh') })

describe('settings conflict protocol copy (review #64)', () => {
  it('keeps the Error message language-agnostic and localizes at the client boundary', () => {
    const error = new TuiSettingsConflictError('seektty-behavior', 3, 5)
    expect(error.code).toBe('TUI_SETTINGS_CONFLICT')
    expect(error.message).not.toMatch(/\p{Script=Han}/u)
    expect(error.message).toContain('seektty-behavior')
    expect(error.message).toContain('3')
    expect(error.message).toContain('5')

    setUiLocale('en')
    const english = capabilityError(error)
    expect(english).toContain('another surface')
    expect(english).toContain('seektty-behavior')
    expect(english).not.toMatch(/\p{Script=Han}/u)

    setUiLocale('zh')
    expect(capabilityError(error)).toContain('其他界面')
  })
})
