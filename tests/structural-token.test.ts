import { expect, it } from 'vitest'
import { sameStructuralToken, structuralToken } from '../src/client/structural-token.ts'

it('preserves JSON distinctions including same-length edits, positions and scalar types', () => {
  const values = [null, 0, false, '', '0', 'abc', 'axc', [], [''], ['a', 'b'], ['ab'],
    { a: 'x', b: 0 }, { a: 0, b: 'x' }, { a: '', b: 'x' }, { a: 'x', b: '' },
    { a: { b: 'x' } }, { a: ['x'] }, { a: '"\\\n' }, { a: undefined }, {},
    { a: null }, { a: NaN }, { a: '中👩‍💻\u001b[2J' }]
  for (const a of values) for (const b of values) {
    expect(sameStructuralToken(structuralToken(a), structuralToken(b))).toBe(JSON.stringify(a) === JSON.stringify(b))
  }
})

it('detects in-place changes without trusting object identity', () => {
  const data = { blocks: [{ kind: 'text', text: 'A'.repeat(30000) }] }
  const first = structuralToken(data)
  data.blocks[0]!.text = `${'A'.repeat(15000)}B${'A'.repeat(14999)}`
  expect(sameStructuralToken(first, structuralToken(data))).toBe(false)
  data.blocks[0]!.text = 'A'.repeat(30000)
  expect(sameStructuralToken(first, structuralToken(data))).toBe(true)
})
