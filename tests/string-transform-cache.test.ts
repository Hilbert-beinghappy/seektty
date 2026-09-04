import { expect, it, vi } from 'vitest'
import { StringTransformCache } from '../src/client/string-transform-cache.ts'

it('memoizes empty results and clears all retained entries', () => {
  const transform = vi.fn(() => '')
  const cache = new StringTransformCache(transform)
  expect(cache.get('source')).toBe('')
  expect(cache.get('source')).toBe('')
  expect(transform).toHaveBeenCalledTimes(1)
  cache.clear()
  cache.get('source')
  expect(transform).toHaveBeenCalledTimes(2)
})

it('retains at most 20000 entries and refreshes recently read entries', () => {
  const transform = vi.fn((source: string) => source)
  const cache = new StringTransformCache(transform)
  for (let index = 0; index < 20000; index++) cache.get(String(index))
  cache.get('0')
  cache.get('next')
  cache.get('0')
  expect(transform).toHaveBeenCalledTimes(20001)
  cache.get('1')
  expect(transform).toHaveBeenCalledTimes(20002)
})

it('bounds source plus result characters and does not retain oversized entries', () => {
  const transform = vi.fn((source: string) => source)
  const cache = new StringTransformCache(transform)
  const first = 'a'.repeat(3000000), second = 'b'.repeat(3000000)
  cache.get(first)
  cache.get(second)
  cache.get(second)
  expect(transform).toHaveBeenCalledTimes(2)
  cache.get(first)
  expect(transform).toHaveBeenCalledTimes(3)
  const oversized = 'c'.repeat(4000001)
  cache.get(oversized)
  cache.get(oversized)
  expect(transform).toHaveBeenCalledTimes(5)
})
