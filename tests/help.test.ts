import { describe, expect, it } from 'vitest'
import { helpSectionText } from '../src/client/help.ts'
import { SURFACE_KEYMAP, helpKeymapText, matchesBinding } from '../src/client/keymap.ts'

describe('in-app help keymap', () => {
  it('lists F1 help and Ctrl+P palette from the same table surface matches', () => {
    expect(SURFACE_KEYMAP.some(binding => binding.id === 'help' && binding.keys.includes('F1'))).toBe(true)
    expect(matchesBinding('help', '\u001bOP')).toBe(true)
    expect(matchesBinding('commandPalette', '\u0010')).toBe(true)
    expect(helpKeymapText()).toContain('F1')
    expect(helpKeymapText()).toContain('Ctrl+P')
    expect(helpSectionText('doctor')).toContain('/doctor')
  })
})
