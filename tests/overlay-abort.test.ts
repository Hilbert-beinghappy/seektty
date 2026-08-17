import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('overlay abort wiring (task 5.4)', () => {
  it('passes overlay signals into marketplace search, inspect, run, and session export', () => {
    const actions = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    const capabilities = readFileSync(resolve(root, 'src/client/capabilities.ts'), 'utf8')
    expect(actions).toMatch(/plugins\.search\([^)]*signal/u)
    expect(actions).toMatch(/plugins\.inspect\([^)]*signal/u)
    expect(actions).toMatch(/plugins\.run\([\s\S]*signal/u)
    expect(capabilities).toMatch(/sessionExport\.download\([\s\S]*signal/u)
  })
})
