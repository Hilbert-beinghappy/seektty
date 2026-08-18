import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('plugin remove confirm (review #62)', () => {
  it('asks to remove the plugin from the Profile, not the Profile from the plugin', () => {
    const source = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    expect(source).toContain('Remove ${target} from ${snapshot.profile}?')
    expect(source).not.toContain('Remove ${snapshot.profile} from ${target}?')
  })
})
