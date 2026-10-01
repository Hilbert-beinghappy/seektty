import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, linkSync, symlinkSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { moduleFileIdentity, physicalModuleIdentity } from '../scripts/module-file-identity.mjs'
const roots = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'seektty-module-id-')); roots.push(root)
  const original = join(root, 'original.js'); writeFileSync(original, 'export const scope = 1\n')
  return { root, original }
}
it('compares a real physical file across distinct hard-link spellings without accepting content equality', () => {
  const { root, original } = fixture(), alias = join(root, 'alias.js'), copy = join(root, 'copy.js')
  linkSync(original, alias); writeFileSync(copy, 'export const scope = 1\n')
  expect(moduleFileIdentity(alias)).toBe(moduleFileIdentity(original))
  expect(moduleFileIdentity(copy)).not.toBe(moduleFileIdentity(original))
})
it('follows a symbolic alias to the same module and rejects missing/non-file identities', () => {
  const { root, original } = fixture(), alias = join(root, 'symlink.js')
  symlinkSync(original, alias)
  expect(moduleFileIdentity(alias)).toBe(moduleFileIdentity(original))
  expect(() => moduleFileIdentity(root)).toThrow('unavailable')
  expect(() => moduleFileIdentity(join(root, 'missing.js'))).toThrow()
})
it('the generated self-contained probe retains the same identity behavior', () => {
  const { root, original } = fixture(), alias = join(root, 'other-name.js')
  linkSync(original, alias)
  // Exercise the function source embedded in the native Loader's probe, not just its import.
  const embedded = new Function(`return (${physicalModuleIdentity.toString()})`)()
  expect(embedded(statSync, alias)).toBe(moduleFileIdentity(original))
  expect(() => embedded(() => ({ isFile: () => true, dev: 1n, ino: 0n }), original)).toThrow('unavailable')
})
