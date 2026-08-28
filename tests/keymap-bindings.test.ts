import { afterEach, describe, expect, it } from 'vitest'
import { BehaviorSettingsSchema } from '../src/host/management.ts'
import {
  applyKeyBindingOverrides,
  bindingConflict,
  helpKeymapText,
  keyBindingsIssue,
  matchesBinding,
  normalizeChord,
  sanitizeKeyBindings,
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
    expect(normalizeChord('F3')).toBe('f3')
    expect(normalizeChord('Ctrl+Shift+C')).toBe('ctrl+shift+c')
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
      .toEqual(['undoInput', 'submit', 'newline', 'transcriptSearch'])
  })

  it('reports conflicts against the effective keymap', () => {
    expect(bindingConflict('commandPalette', 'ctrl+s')).toBe('sessions')
    expect(bindingConflict('commandPalette', 'Ctrl+P')).toBeUndefined()
    expect(bindingConflict('commandPalette', 'Enter')).toBe('submit')
    expect(bindingConflict('commandPalette', 'Ctrl+Z')).toBe('undoInput')
    expect(bindingConflict('commandPalette', 'Ctrl+-')).toBe('undoInput')
    expect(keyBindingsIssue({ commandPalette: 'Ctrl+Z' })).toMatch(/undoInput/u)
    applyKeyBindingOverrides({ sessions: 'ctrl+k' })
    expect(bindingConflict('commandPalette', 'ctrl+k')).toBe('sessions')
    expect(bindingConflict('historySearch', 'ctrl+s')).toBeUndefined()
  })

  it('rejects unmodified printable characters and duplicate chords in the full map', () => {
    expect(keyBindingsIssue({ commandPalette: 'k' })).toMatch(/printable|可打印/u)
    expect(keyBindingsIssue({ commandPalette: '/' })).toMatch(/printable|可打印/u)
    expect(keyBindingsIssue({ commandPalette: 'ctrl+s' })).toMatch(/sessions/u)
    expect(keyBindingsIssue({
      commandPalette: 'ctrl+k',
      historySearch: 'ctrl+k',
    })).toMatch(/conflict|冲突/u)
    expect(keyBindingsIssue({ commandPalette: 'Ctrl+K' })).toBeUndefined()
    expect(sanitizeKeyBindings({
      commandPalette: 'k',
      historySearch: 'ctrl+k',
      sessions: 'ctrl+k',
    })).toEqual({})
    applyKeyBindingOverrides({ commandPalette: 'k' })
    expect(matchesBinding('commandPalette', 'k')).toBe(false)
    expect(matchesBinding('commandPalette', '\u0010')).toBe(true)
    expect(() => BehaviorSettingsSchema({ keyBindings: { commandPalette: 'k' } })).toThrow(/printable|可打印/u)
    expect(() => BehaviorSettingsSchema({
      keyBindings: { commandPalette: 'ctrl+k', historySearch: 'ctrl+k' },
    })).toThrow(/conflict|冲突/u)
    expect(BehaviorSettingsSchema({ keyBindings: { commandPalette: 'Ctrl+K' } }).keyBindings)
      .toEqual({ commandPalette: 'ctrl+k' })
  })
})

describe('mouse keymap bindings', () => {
  it('matches F3 and Ctrl+Shift+C across legacy and Kitty encodings', () => {
    expect(matchesBinding('toggleMouseMode', '\u001bOR')).toBe(true)
    expect(matchesBinding('toggleMouseMode', '\u001b[13~')).toBe(true)
    expect(matchesBinding('copySelection', '\u001b[99;6u')).toBe(true)
    expect(matchesBinding('copySelection', '\u001b[27;6;99~')).toBe(true)
    expect(keyBindingsIssue({ toggleMouseMode: 'F3' })).toBeUndefined()
    expect(keyBindingsIssue({ copySelection: 'Ctrl+Shift+C' })).toBeUndefined()
    expect(keyBindingsIssue({ copySelection: 'ctrl+c' })).toMatch(/interrupt|冲突|conflict/u)
  })
})
