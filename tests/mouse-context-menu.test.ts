import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { mouseContextChoices } from '../src/client/mouse-context-menu.ts'

afterEach(() => { setUiLocale('zh') })

describe('application-owned mouse context actions', () => {
  it.each([
    ['transcript', true, ['copy', 'close']],
    ['transcript', false, ['copy', 'close']],
    ['composer', true, ['undo', 'cut', 'paste', 'delete', 'select-all', 'copy', 'close']],
    ['composer', false, ['undo', 'cut', 'paste', 'delete', 'select-all', 'copy', 'close']],
    ['overlay', true, ['copy', 'close']],
    ['overlay', false, ['copy', 'close']],
    ['overlay-input', true, ['undo', 'cut', 'paste', 'delete', 'select-all', 'copy', 'close']],
    ['overlay-input', false, ['undo', 'cut', 'paste', 'delete', 'select-all', 'copy', 'close']],
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
