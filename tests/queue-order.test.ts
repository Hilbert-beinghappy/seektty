import { describe, expect, it } from 'vitest'
import { moveIndex } from '../src/client/queue-order.ts'

describe('queue reorder', () => {
  it('moves an item up or down and no-ops at the ends', () => {
    const rows = ['a', 'b', 'c']
    expect(moveIndex(rows, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveIndex(rows, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveIndex(rows, 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveIndex(rows, 2, 1)).toEqual(['a', 'b', 'c'])
  })
})
