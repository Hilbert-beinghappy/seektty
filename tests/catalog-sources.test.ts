import { describe, expect, it } from 'vitest'
import { catalogSourcesFromStored } from '../src/host/management.ts'

describe('catalog sources (task 6.5)', () => {
  it('keeps valid catalog rows', () => {
    const rows = catalogSourcesFromStored([{
      id: 'private',
      label: 'Private',
      url: 'https://example.com/catalog.json',
      enabled: true,
      credentialRef: '',
    }], new Set(['npm']))
    expect(rows).toEqual([{
      id: 'private',
      kind: 'catalog',
      label: 'Private',
      url: 'https://example.com/catalog.json',
      enabled: true,
      builtIn: false,
    }])
  })

  it('degrades a stored row with an embedded credential instead of throwing', () => {
    const rows = catalogSourcesFromStored([{
      id: 'leaky',
      label: 'Leaky',
      url: 'https://user:secret@example.com/catalog.json',
      enabled: true,
      credentialRef: '',
    }], new Set(['npm']))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.enabled).toBe(false)
    expect(rows[0]?.diagnostic).toMatch(/Credential|凭证|Secret/u)
  })

  it('degrades a row that collides with a reserved source id', () => {
    const rows = catalogSourcesFromStored([{
      id: 'npm',
      label: 'Collision',
      url: 'https://example.com/catalog.json',
      enabled: true,
      credentialRef: '',
    }], new Set(['npm']))
    expect(rows[0]?.enabled).toBe(false)
    expect(rows[0]?.diagnostic).toMatch(/冲突/u)
  })
})
