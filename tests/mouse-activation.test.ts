import { describe, expect, it } from 'vitest'
import {
  armMouseActivation,
  matchesMouseActivation,
  MOUSE_ARM_TTL_MS,
} from '../src/client/mouse-activation.ts'

describe('focus-then-activate identity', () => {
  it('requires the same kind, stable target, and content generation', () => {
    const armed = armMouseActivation('autocomplete', 'item-id', 7, 1_000)
    expect(matchesMouseActivation(armed, 'autocomplete', 'item-id', 7, 1_001)).toBe(true)
    expect(matchesMouseActivation(armed, 'option', 'item-id', 7, 1_001)).toBe(false)
    expect(matchesMouseActivation(armed, 'autocomplete', 'other', 7, 1_001)).toBe(false)
    expect(matchesMouseActivation(armed, 'autocomplete', 'item-id', 8, 1_001)).toBe(false)
  })

  it('expires and rejects clocks earlier than the observed arm event', () => {
    const armed = armMouseActivation('example', 'example-1', 3, 10_000)
    expect(matchesMouseActivation(armed, 'example', 'example-1', 3, 9_999)).toBe(false)
    expect(matchesMouseActivation(armed, 'example', 'example-1', 3, 10_000 + MOUSE_ARM_TTL_MS)).toBe(true)
    expect(matchesMouseActivation(armed, 'example', 'example-1', 3, 10_001 + MOUSE_ARM_TTL_MS)).toBe(false)
  })
})
