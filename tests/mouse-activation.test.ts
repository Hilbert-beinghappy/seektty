import { describe, expect, it, vi } from 'vitest'
import {
  armMouseActivation,
  matchesMouseActivation,
} from '../src/client/mouse-activation.ts'

describe('focus-then-activate identity', () => {
  it('requires the same kind, stable target, and content generation', () => {
    const armed = armMouseActivation('autocomplete', 'item-id', 7)
    expect(matchesMouseActivation(armed, 'autocomplete', 'item-id', 7)).toBe(true)
    expect(matchesMouseActivation(armed, 'option', 'item-id', 7)).toBe(false)
    expect(matchesMouseActivation(armed, 'autocomplete', 'other', 7)).toBe(false)
    expect(matchesMouseActivation(armed, 'autocomplete', 'item-id', 8)).toBe(false)
    expect(matchesMouseActivation(undefined, 'autocomplete', 'item-id', 7)).toBe(false)
  })

  it('keeps the selection armed for a later click, independent of the wall clock', () => {
    vi.useFakeTimers()
    try {
      const armed = armMouseActivation('option', 'model', 3)
      vi.advanceTimersByTime(60_000)
      expect(matchesMouseActivation(armed, 'option', 'model', 3)).toBe(true)
      vi.setSystemTime(0)
      expect(matchesMouseActivation(armed, 'option', 'model', 3)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
