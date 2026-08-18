import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findLineMatches,
  highlightQuery,
  nextMatchIndex,
  planLineSearch,
  scrollOffsetToReveal,
  stripAnsi,
} from '../src/client/transcript-search.ts'

describe('transcript in-session search', () => {
  it('matches stripped lines case-insensitively and steps circularly', () => {
    const lines = ['Hello World', '\u001B[32mhello\u001B[0m there', 'nope']
    expect(findLineMatches(lines, 'HELLO')).toEqual([0, 1])
    expect(findLineMatches(lines, '   ')).toEqual([])
    expect(nextMatchIndex([0, 5], 0, 1)).toBe(5)
    expect(nextMatchIndex([0, 5], 5, 1)).toBe(0)
    expect(nextMatchIndex([0, 5], 5, -1)).toBe(0)
    expect(highlightQuery('Hello World', 'lo', text => `[${text}]`)).toBe('Hel[lo] World')
    expect(stripAnsi('\u001B[7mhit\u001B[0m')).toBe('hit')
    expect(scrollOffsetToReveal(20, 8, 2)).toBe(10)
  })

  it('builds a Set of match indexes so highlight does not rescan includes()', () => {
    const plan = planLineSearch(['a', 'hit', 'b', 'HIT'], 'hit')
    expect(plan.matches).toEqual([1, 3])
    expect(plan.hit.has(1)).toBe(true)
    expect(plan.hit.has(0)).toBe(false)
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/transcript.ts'), 'utf8')
    expect(source).toMatch(/planLineSearch\(/u)
    expect(source).not.toMatch(/matches\.includes\(/u)
  })
})
