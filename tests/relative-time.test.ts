import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { relativeTime, sortSessionsByUpdatedAt } from '../src/client/relative-time.ts'

afterEach(() => { setUiLocale('zh') })

describe('session relative time', () => {
  it('formats compact relative clocks and sorts by updatedAt descending', () => {
    const now = Date.parse('2026-08-18T00:00:00.000Z')
    expect(relativeTime(now - 10_000, now)).toBe('刚刚')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前')
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 天前')
    expect(relativeTime(now - 10 * 86_400_000, now)).toBe('2026-08-08')
    setUiLocale('en')
    expect(relativeTime(now - 10_000, now)).toBe('just now')
    expect(sortSessionsByUpdatedAt([
      { id: 'old', updatedAt: 1 },
      { id: 'new', updatedAt: 3 },
      { id: 'mid', updatedAt: 2 },
    ]).map(row => row.id)).toEqual(['new', 'mid', 'old'])
  })
})
