import { afterEach, describe, expect, it } from 'vitest'
import {
  dangerConfirmChoices,
  setDangerConfirmDefault,
} from '../src/client/overlays.ts'

afterEach(() => { setDangerConfirmDefault('cancel') })

describe('danger confirm default (task 8 leftover)', () => {
  it('focuses cancel first so Enter does not confirm', () => {
    const { choices, initialChoiceId } = dangerConfirmChoices('删除')
    expect(initialChoiceId).toBe('cancel')
    expect(choices.map(choice => choice.id)).toEqual(['cancel', 'confirm'])
    expect(choices[1]?.label).toBe('删除')
  })

  it('can restore confirm-first when the setting is confirm', () => {
    setDangerConfirmDefault('confirm')
    const { choices, initialChoiceId } = dangerConfirmChoices('删除')
    expect(initialChoiceId).toBe('confirm')
    expect(choices.map(choice => choice.id)).toEqual(['confirm', 'cancel'])
  })
})
