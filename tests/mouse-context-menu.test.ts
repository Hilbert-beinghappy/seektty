import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { mouseContextChoices } from '../src/client/mouse-context-menu.ts'

afterEach(() => { setUiLocale('zh') })

describe('application-owned mouse context actions', () => {
  it.each([
    ['transcript', true, ['copy', 'native', 'cancel']],
    ['transcript', false, ['native', 'cancel']],
    ['composer', true, ['copy', 'paste', 'cancel']],
    ['composer', false, ['paste', 'native', 'cancel']],
    ['overlay', true, ['copy', 'cancel']],
    ['overlay', false, ['cancel']],
    ['overlay-input', true, ['copy', 'cut', 'delete', 'paste', 'select-all', 'cancel']],
    ['overlay-input', false, ['paste', 'select-all', 'cancel']],
  ] as const)('uses the target-specific action matrix for %s selection=%s', (target, hasSelection, ids) => {
    const choices = mouseContextChoices({ target, hasSelection, pasteSupported: true })
    expect(choices.map(choice => choice.id)).toEqual(ids)
  })

  it('disables paste with a value-free reason on unsupported platforms', () => {
    setUiLocale('en')
    const paste = mouseContextChoices({
      target: 'composer',
      hasSelection: false,
      pasteSupported: false,
    }).find(choice => choice.id === 'paste')
    expect(paste?.disabledReason).toMatch(/safe clipboard reader/u)
  })
})
