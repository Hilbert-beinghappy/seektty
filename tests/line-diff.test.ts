import { describe, expect, it } from 'vitest'
import { DIFF_CONTEXT_LINES, splitDiffLines, unifiedHunks } from '../src/client/line-diff.ts'

describe('line-level unified diff', () => {
  it('keeps three isolated edits in a 200-line file within 3×7 body lines plus hunk headers', () => {
    const previous = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`)
    const next = [...previous]
    next[9] = 'changed 10'
    next[49] = 'changed 50'
    next[149] = 'changed 150'
    const hunks = unifiedHunks(previous, next, DIFF_CONTEXT_LINES)
    const headers = hunks.filter(line => line.startsWith('@@'))
    const body = hunks.length - headers.length
    expect(headers).toHaveLength(3)
    expect(body).toBe(3 * 8)
    expect(hunks.length).toBe(3 * 8 + headers.length)
    expect(hunks.join('\n')).toContain('-line 10')
    expect(hunks.join('\n')).toContain('+changed 10')
    expect(hunks.join('\n')).not.toContain('line 1\n')
  })

  it('shows a new file as a full addition', () => {
    const hunks = unifiedHunks([], ['alpha', 'beta'])
    expect(hunks.some(line => line.startsWith('@@'))).toBe(true)
    expect(hunks).toContain('+alpha')
    expect(hunks).toContain('+beta')
    expect(hunks.every(line => !line.startsWith('-') || line.startsWith('---') || line.startsWith('@@'))).toBe(true)
  })

  it('splits files on the last newline the same way transcript did', () => {
    expect(splitDiffLines('old\n')).toEqual(['old'])
    expect(splitDiffLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitDiffLines('')).toEqual([])
  })
})
