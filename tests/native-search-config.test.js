import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'

it('enables native full-text search on the existing base service without replacing its owner', () => {
  const patch = load(readFileSync(resolve(import.meta.dirname, '../cordis.patch.yml'), 'utf8'), { schema: entryListSchema })
  const base = [{ id: 'session-query-sqlite', name: '@deepseek-ai/dsh-session-query-sqlite',
    config: { path: ':memory:', openAt: 'never' } }]
  const rows = applyEntryPatches(base, patch, () => {})
  const search = rows.filter(row => row.id === 'session-query-sqlite')
  expect(search).toHaveLength(1)
  expect(search[0]).toMatchObject({ name: '@deepseek-ai/dsh-session-query-sqlite',
    config: { path: ':memory:', openAt: 'first-search' } })
  expect(base[0].config.openAt).toBe('never')
  // The user Profile remains the final authority over deployment composition.
  const overridden = applyEntryPatches(rows, [{ id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'never' } }], () => {})
  expect(overridden.find(row => row.id === 'session-query-sqlite').config.openAt).toBe('never')
})
