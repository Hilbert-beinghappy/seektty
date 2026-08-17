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
    expect(unifiedHunks(null, 'one\ntwo', 3).join('\n')).toBe([
      '@@ -0,0 +1,2 @@',
      '+one',
      '+two',
    ].join('\n'))
  })
})
