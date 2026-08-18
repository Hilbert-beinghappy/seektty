import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

  it('does not rebuild the queue by deleting items and re-prompting', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/client/actions.ts'), 'utf8')
    expect(source.includes('reorderQueued')).toBe(false)
    expect(source.includes('与上一条排队消息对调')).toBe(false)
    expect(source.includes('Swap with the previous queued message')).toBe(false)
  })
})
