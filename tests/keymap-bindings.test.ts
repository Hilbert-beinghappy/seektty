import { afterEach, describe, expect, it } from 'vitest'
import {
  applyKeyBindingOverrides,
  bindingConflict,
  helpKeymapText,
  matchesBinding,
  normalizeChord,
  SURFACE_KEYMAP,
} from '../src/client/keymap.ts'

afterEach(() => {
  applyKeyBindingOverrides({})
})

describe('normalizeChord', () => {
  it('maps typed shortcuts onto pi-tui key ids', () => {
    expect(normalizeChord('Ctrl+P')).toBe('ctrl+p')
    expect(normalizeChord('ctrl+p')).toBe('ctrl+p')
    expect(normalizeChord('Cmd+,')).toBe('super+,')
    expect(normalizeChord('Command+,')).toBe('super+,')
    expect(normalizeChord('Win+,')).toBe('super+,')
    expect(normalizeChord('Meta+,')).toBe('super+,')
    expect(normalizeChord('F2')).toBe('f2')
    expect(normalizeChord('Shift+Tab')).toBe('shift+tab')
    expect(normalizeChord('Shift+Left')).toBe('shift+left')
    expect(normalizeChord('  Ctrl+O  ')).toBe('ctrl+o')
    expect(normalizeChord('')).toBeUndefined()
    expect(normalizeChord('Ctrl+')).toBeUndefined()
  })
})

describe('key binding overrides', () => {
  it('matches the override chord instead of the shipped default', () => {
    expect(matchesBinding('commandPalette', '\u0010')).toBe(true)
    applyKeyBindingOverrides({ commandPalette: 'ctrl+k' })
    expect(matchesBinding('commandPalette', '\u0010')).toBe(false)
    expect(matchesBinding('commandPalette', '\u000b')).toBe(true)
    expect(helpKeymapText()).toContain('Ctrl+K')
    expect(helpKeymapText()).not.toContain('Ctrl+P')
  })

  it('never treats Enter as Ctrl+M, even after a rebind to ctrl+m', () => {
    expect(matchesBinding('model', '\r')).toBe(false)
    expect(matchesBinding('model', '\n')).toBe(false)
    applyKeyBindingOverrides({ commandPalette: 'ctrl+m' })
    expect(matchesBinding('commandPalette', '\r')).toBe(false)
    expect(matchesBinding('commandPalette', '\n')).toBe(false)
  })

  it('ignores overrides for documentation-only bindings', () => {
    applyKeyBindingOverrides({
      submit: 'ctrl+k',
      newline: 'ctrl+n',
      transcriptSearch: 'ctrl+f',
    })
    expect(matchesBinding('submit', '\u000b')).toBe(false)
    expect(SURFACE_KEYMAP.filter(binding => binding.configurable === false).map(binding => binding.id))
      .toEqual(['submit', 'newline', 'transcriptSearch'])
  })

  it('reports conflicts against the effective keymap', () => {
    expect(bindingConflict('commandPalette', 'ctrl+s')).toBe('sessions')
    expect(bindingConflict('commandPalette', 'Ctrl+P')).toBeUndefined()
    expect(bindingConflict('commandPalette', 'Enter')).toBe('submit')
    applyKeyBindingOverrides({ sessions: 'ctrl+k' })
    expect(bindingConflict('commandPalette', 'ctrl+k')).toBe('sessions')
    expect(bindingConflict('historySearch', 'ctrl+s')).toBeUndefined()
  })
})
