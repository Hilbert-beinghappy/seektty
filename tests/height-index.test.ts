import { describe, expect, it } from 'vitest'
import { FenwickTree, HeightIndex } from '../src/client/height-index.ts'

describe('Fenwick height index', () => {
  it.each([64, 65, 127, 128, 129, 255, 256, 257, 512, 1024])(
    'preserves sums and reverse queries across capacity boundary %i', (length) => {
      const tree = new FenwickTree()
      for (let index = 0; index < length; index += 1) tree.push(1)
      expect(tree.total()).toBe(length)
      for (let count = 0; count <= length; count += 1) {
        expect(tree.prefix(count)).toBe(count)
        expect(tree.indexAt(count)).toBe(count)
      }
      expect(tree.indexAt(length + 1)).toBe(length)
      expect(tree.touches).toBeLessThan(length * (Math.ceil(Math.log2(length)) + 2))
    },
  )

  it('matches a linear oracle through randomized appends, updates and rebuilds', () => {
    let seed = 0xC0FFEE
    const random = (limit: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % limit
    }
    const tree = new FenwickTree()
    const values: number[] = []
    for (let step = 0; step < 1025; step += 1) {
      const value = random(12)
      values.push(value)
      tree.push(value)
      if (step % 7 === 0) {
        const index = random(values.length)
        const next = random(12)
        tree.add(index, next - (values[index] ?? 0))
        values[index] = next
      }
      if (step === 300 || step === 700) tree.rebuild(values)
      const prefixes = [0]
      for (const height of values) prefixes.push((prefixes.at(-1) ?? 0) + height)
      expect(tree.total()).toBe(prefixes.at(-1))
      for (let query = 0; query < 8; query += 1) {
        const count = random(values.length + 1)
        expect(tree.prefix(count)).toBe(prefixes[count])
        const offset = random((prefixes.at(-1) ?? 0) + 2)
        const index = values.findIndex((_height, index) => (prefixes[index + 1] ?? 0) > offset)
        expect(tree.indexAt(offset)).toBe(index === -1 ? values.length : index)
      }
    }
  })

  it('answers prefix and reverse queries in log time after a tail append', () => {
    const tree = new FenwickTree()
    tree.rebuild([2, 4, 8])
    expect(tree.prefix(0)).toBe(0)
    expect(tree.prefix(1)).toBe(2)
    expect(tree.prefix(3)).toBe(14)
    expect(tree.indexAt(0)).toBe(0)
    expect(tree.indexAt(2)).toBe(1)
    expect(tree.indexAt(6)).toBe(2)

    const before = tree.touches
    tree.push(3)
    expect(tree.touches - before).toBeLessThanOrEqual(12)
    expect(tree.prefix(3)).toBe(14)
    expect(tree.total()).toBe(17)
    expect(tree.indexAt(14)).toBe(3)
  })

  it('does not rewrite every later prefix entry when appending a streaming tail', () => {
    const tree = new FenwickTree()
    const values = Array.from({ length: 64 }, () => 1)
    tree.rebuild(values)
    const prefixBefore = Array.from({ length: 64 }, (_, index) => tree.prefix(index + 1))
    const before = tree.touches
    tree.push(5)
    const prefixAfter = Array.from({ length: 64 }, (_, index) => tree.prefix(index + 1))
    expect(prefixAfter).toEqual(prefixBefore)
    expect(tree.touches - before).toBeLessThan(values.length / 2)
    expect(tree.total()).toBe(69)
  })
})

describe('HeightIndex', () => {
  it('keeps visited heights exact and marks the rest estimated', () => {
    const index = new HeightIndex()
    index.reconcile(['a', 'b', 'c'], () => 1, 80)
    expect(index.estimatedEntries).toBe(3)
    expect(index.exactEntries).toBe(0)
    index.setExact('b', 4)
    expect(index.heightOf('b')).toBe(4)
    expect(index.isExact('b')).toBe(true)
    expect(index.exactEntries).toBe(1)
    expect(index.estimatedEntries).toBe(2)
    expect(index.offsetOf('b')).toBe(1)
    expect(index.atOffset(3)).toEqual({ key: 'b', lineOffset: 2 })
  })

  it('appends a tail without rebuilding earlier keys', () => {
    const index = new HeightIndex()
    index.reconcile(['a', 'b'], () => 2, 40)
    index.setExact('a', 2)
    index.reconcile(['a', 'b', 'c'], (key) => key === 'c' ? 9 : 2, 40)
    expect(index.isExact('a')).toBe(true)
    expect(index.isExact('c')).toBe(false)
    expect(index.total()).toBe(13)
  })

  it('marks stored heights estimated after a width change without rendering', () => {
    const index = new HeightIndex()
    index.reconcile(['a', 'b'], () => 3, 80)
    index.setExact('a', 5)
    index.reconcile(['a', 'b'], () => 3, 40)
    expect(index.isExact('a')).toBe(false)
    expect(index.heightOf('a')).toBe(5)
    expect(index.estimatedEntries).toBe(2)
  })
})
