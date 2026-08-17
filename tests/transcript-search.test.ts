import { describe, expect, it } from 'vitest'
import {
  findLineMatches,
  highlightQuery,
  nextMatchIndex,
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
})
