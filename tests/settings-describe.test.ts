import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSettingsDescribeCache } from '../src/host/management.ts'
import type { TuiSettingsDocument } from '../src/protocol.ts'

const root = resolve(import.meta.dirname, '..')

function document(namespace: string): TuiSettingsDocument {
  return {
    namespace,
    schema: {},
    value: { namespace },
    revision: 1,
    applies: 'live',
    secrets: [],
  }
}

describe('settings describe (task 5.3)', () => {
  it('exposes an optional namespace on the management bridge', () => {
    const source = readFileSync(resolve(root, 'src/protocol.ts'), 'utf8')
    expect(source).toMatch(/describe\(namespace\?: string\): Promise<readonly TuiSettingsDocument\[\]>/u)
  })

  it('loads every namespace once then serves one() from that snapshot', () => {
    let loads = 0
    const cache = createSettingsDescribeCache(() => {
      loads += 1
      return [document('seektty-appearance'), document('seektty-behavior')]
    })
    expect(cache.one('seektty-appearance').namespace).toBe('seektty-appearance')
    expect(cache.one('seektty-behavior').value).toEqual({ namespace: 'seektty-behavior' })
    expect(cache.describe().map(row => row.namespace)).toEqual(['seektty-appearance', 'seektty-behavior'])
    expect(loads).toBe(1)
  })

  it('filters describe(namespace) without a second load', () => {
    let loads = 0
    const cache = createSettingsDescribeCache(() => {
      loads += 1
      return [document('seektty-appearance'), document('seektty-behavior')]
    })
    expect(cache.describe('seektty-behavior')).toEqual([document('seektty-behavior')])
    expect(loads).toBe(1)
  })

  it('reloads after invalidate so mutate cannot serve a stale revision', () => {
    let revision = 1
    const cache = createSettingsDescribeCache(() => [
      { ...document('seektty-appearance'), revision },
    ])
    expect(cache.one('seektty-appearance').revision).toBe(1)
    revision = 2
    cache.invalidate()
    expect(cache.one('seektty-appearance').revision).toBe(2)
  })
})
