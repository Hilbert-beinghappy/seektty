import { afterEach, describe, expect, it } from 'vitest'
import { helpSectionChoices, helpSectionText } from '../src/client/help.ts'
import { SURFACE_KEYMAP, helpKeymapText, matchesBinding } from '../src/client/keymap.ts'
import { setUiLocale } from '../src/client/locale.ts'

afterEach(() => {
  setUiLocale('zh')
})

describe('in-app help keymap', () => {
  it('lists F1 help and Ctrl+P palette from the same table surface matches', () => {
    expect(SURFACE_KEYMAP.some(binding => binding.id === 'help' && binding.keys.includes('F1'))).toBe(true)
    expect(matchesBinding('help', '\u001bOP')).toBe(true)
    expect(matchesBinding('commandPalette', '\u0010')).toBe(true)
    expect(helpKeymapText()).toContain('F1')
    expect(helpKeymapText()).toContain('Ctrl+P')
    expect(helpKeymapText()).toContain('F3')
    expect(helpKeymapText()).toContain('Ctrl+Shift+C')
    expect(helpSectionText('doctor')).toContain('/doctor')
    expect(helpSectionText('flows')).toContain('/mouse')
  })

  it('keeps F1 flows on daily work, not theme export or keymap setup', () => {
    for (const locale of ['zh', 'en'] as const) {
      setUiLocale(locale)
      const flows = helpSectionText('flows')
      expect(flows).not.toContain('/theme export')
      expect(flows).not.toContain('/keymap commandPalette')
    }

    setUiLocale('en')
    const flows = helpSectionText('flows')
    expect(flows.toLowerCase()).toMatch(/input/)
    expect(flows.toLowerCase()).toMatch(/stop/)
    expect(flows.toLowerCase()).toMatch(/session/)
    expect(flows.toLowerCase()).toMatch(/approv/)
    expect(flows.toLowerCase()).toMatch(/brows/)
    expect(flows).toContain('Terminal.app')
    expect(flows).toContain('Option')

    const description = helpSectionChoices().find(choice => choice.id === 'flows')?.description ?? ''
    expect(description.toLowerCase()).not.toMatch(/export|shortcut/)
  })
})
