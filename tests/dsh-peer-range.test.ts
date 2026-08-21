import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DSH_LEGACY_PEER_MAXIMUM, dshPeerRange } from '../scripts/dsh-peer-range.mjs'

const LEGACY_UNION = '>=0.1.0-rc.6 <=0.1.0-rc.8'

describe('dsh peer range generator', () => {
  it('keeps the legacy rc.6–rc.8 union plus an exact target outside that line', () => {
    expect(DSH_LEGACY_PEER_MAXIMUM).toBe('0.1.0-rc.8')
    expect(dshPeerRange('0.1.0-rc.6', '0.1.1-rc.2')).toBe(`${LEGACY_UNION} || 0.1.1-rc.2`)
    expect(dshPeerRange('0.1.0-rc.6', '0.1.1-rc.3')).toBe(`${LEGACY_UNION} || 0.1.1-rc.3`)
  })

  it('does not widen into 0.1.0-rc.9 or 0.1.1-rc.1 when those are not the target', () => {
    const rc2 = dshPeerRange('0.1.0-rc.6', '0.1.1-rc.2')
    const rc3 = dshPeerRange('0.1.0-rc.6', '0.1.1-rc.3')
    for (const range of [rc2, rc3]) {
      expect(range).not.toContain('<0.1.0-rc.9')
      expect(range).not.toContain('<0.1.1-rc.')
      expect(range).not.toContain('0.1.0-rc.9')
      expect(range).not.toContain('0.1.1-rc.1')
    }
    expect(rc2).not.toBe('>=0.1.0-rc.6 <0.1.1-rc.3')
    expect(rc3).not.toBe('>=0.1.0-rc.6 <0.1.1-rc.4')
  })

  it('stays on the exclusive legacy ceiling when tested is still on that line', () => {
    expect(dshPeerRange('0.1.0-rc.6', '0.1.0-rc.8')).toBe(LEGACY_UNION)
    expect(dshPeerRange('0.1.0-rc.6', '0.1.0-rc.7')).toBe(LEGACY_UNION)
    expect(dshPeerRange('0.1.0-rc.6', '0.1.0-rc.8')).not.toContain('<0.1.0-rc.9')
  })
})

describe('bump-dsh.mjs peer contract', () => {
  it('applies dshPeerRange instead of a wide rc+1 exclusive range', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../scripts/bump-dsh.mjs'), 'utf8')
    expect(source).toContain("from './dsh-peer-range.mjs'")
    expect(source).toContain('dshPeerRange(minimum, target)')
    expect(source).not.toContain('testedPeerRange')
    expect(source).not.toMatch(/<\$\{rc\[1\]\}/u)
  })
})
