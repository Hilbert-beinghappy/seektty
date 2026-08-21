import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isForbiddenPackEntry } from '../scripts/pack-policy.mjs'

const root = resolve(import.meta.dirname, '..')

describe('AppleDouble pack policy', () => {
  it('rejects AppleDouble and Finder metadata pack entries without shipping the helper', () => {
    expect(isForbiddenPackEntry('package/lib/._index.js')).toBe(true)
    expect(isForbiddenPackEntry('package/._README.md')).toBe(true)
    expect(isForbiddenPackEntry('package/.DS_Store')).toBe(true)
    expect(isForbiddenPackEntry('package/lib/.DS_Store')).toBe(true)
    expect(isForbiddenPackEntry('package/lib/index.js')).toBe(false)
    expect(isForbiddenPackEntry('package/README.md')).toBe(false)
    const packCheck = readFileSync(resolve(root, 'scripts/pack-check.mjs'), 'utf8')
    const packPolicy = readFileSync(resolve(root, 'scripts/pack-policy.mjs'), 'utf8')
    expect(packCheck).toMatch(/isForbiddenPackEntry/)
    expect(packCheck).not.toMatch(/scripts\/pack-policy/)
    expect(packPolicy).toMatch(/segment\.startsWith\('\._'\)/)
    expect(packPolicy).toMatch(/segment === '\.DS_Store'/)
    expect(packPolicy.split('\n').filter(line => line.trim()).length).toBeLessThan(8)
  })
})
