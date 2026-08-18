import { describe, expect, it } from 'vitest'
import { unifiedHunks } from '../src/client/line-diff.ts'

describe('unified hunks (task 8 leftover: diff context lines)', () => {
  it('keeps context around a one-line change', () => {
    const oldText = ['alpha', 'keep-one', 'old', 'keep-two', 'omega'].join('\n')
    const newText = ['alpha', 'keep-one', 'new', 'keep-two', 'omega'].join('\n')
    const hunks = unifiedHunks(oldText, newText, 1)
    expect(hunks.join('\n')).toContain('@@ -2,3 +2,3 @@')
    expect(hunks.join('\n')).toContain(' keep-one')
    expect(hunks.join('\n')).toContain('-old')
    expect(hunks.join('\n')).toContain('+new')
    expect(hunks.join('\n')).toContain(' keep-two')
    expect(hunks.join('\n')).not.toContain('alpha')
    expect(hunks.join('\n')).not.toContain('omega')
  })

  it('treats a missing old file as all additions', () => {
    expect(unifiedHunks(null, 'one\ntwo\n', 3).join('\n')).toBe([
      '@@ -0,0 +1,2 @@',
      '+one',
      '+two',
    ].join('\n'))
  })

  it('does not drop a final-newline-only change', () => {
    const hunks = unifiedHunks('a\n', 'a', 0).join('\n')
    expect(hunks).not.toBe('')
    expect(hunks).toContain('-a')
    expect(hunks).toContain('+a')
    expect(hunks).toContain('No newline at end of file')
  })

  it('uses a non-zero old start for a mid-file insert when context is 0', () => {
    const hunks = unifiedHunks('a\nb\n', 'a\nINSERTED\nb\n', 0)
    expect(hunks[0]).toBe('@@ -1,0 +2,1 @@')
    expect(hunks.join('\n')).toContain('+INSERTED')
  })

  it('uses a non-zero new start for a mid-file delete when context is 0', () => {
    const hunks = unifiedHunks('a\nGONE\nb\n', 'a\nb\n', 0)
    expect(hunks[0]).toBe('@@ -2,1 +1,0 @@')
    expect(hunks.join('\n')).toContain('-GONE')
  })

  it('diffs an empty file against a new line', () => {
    expect(unifiedHunks('', 'hello\n', 0).join('\n')).toBe([
      '@@ -0,0 +1,1 @@',
      '+hello',
    ].join('\n'))
  })

  it('falls back on oversized inputs instead of allocating a full LCS table', () => {
    const oldText = `${Array.from({ length: 3000 }, (_, index) => `o${String(index)}`).join('\n')}\n`
    const newText = `${Array.from({ length: 3000 }, (_, index) => `n${String(index)}`).join('\n')}\n`
    const hunks = unifiedHunks(oldText, newText, 0)
    expect(hunks[0]).toBe('@@ -1,3000 +1,3000 @@')
    expect(hunks).toHaveLength(6001)
  })
})
