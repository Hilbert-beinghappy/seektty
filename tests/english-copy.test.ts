import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const actions = readFileSync(resolve(import.meta.dirname, '../src/client/actions.ts'), 'utf8')

describe('English chrome copy (review #62)', () => {
  it('keeps spaces, ASCII parens, and Close instead of Off', () => {
    expect(actions).toContain('${resolved.name} enabled')
    expect(actions).not.toContain('${resolved.name}enabled')
    expect(actions).toContain("'Theme'} Preview ·")
    expect(actions).not.toContain("Theme'}Preview")
    expect(actions).toMatch(/id: 'close', label: ui\('关闭', "Close"\)/u)
    expect(actions).not.toMatch(/id: 'close', label: ui\('关闭', "Off"\)/u)
    expect(actions).toContain('` (${option.defaultEffort})`')
    expect(actions).not.toMatch(/Provider default\$\{option\.defaultEffort === undefined \? '' : `（/u)
  })
})
