import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, linkSync, symlinkSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { moduleFileIdentity, physicalModuleIdentity } from '../scripts/module-file-identity.mjs'

const roots = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'seektty-module-id-'))
  roots.push(root)
  const original = join(root, 'original.js')
  writeFileSync(original, 'export const scope = 1\n')
  return { root, original }
}

it('compares a physical file across hard-link aliases without accepting a same-content copy', () => {
  const { root, original } = fixture()
  const alias = join(root, 'alias.js')
  const copy = join(root, 'copy.js')
  linkSync(original, alias)
  writeFileSync(copy, 'export const scope = 1\n')
  expect(moduleFileIdentity(alias)).toBe(moduleFileIdentity(original))
  expect(moduleFileIdentity(copy)).not.toBe(moduleFileIdentity(original))
})

it('follows a symbolic directory alias and rejects missing or non-file identities', () => {
  const { root } = fixture()
  const modules = join(root, 'modules')
  mkdirSync(modules)
  const original = join(modules, 'module.js')
  writeFileSync(original, 'export const scope = 1\n')
  const alias = join(root, 'linked-modules')
  // Windows directory junctions exercise path aliases without symlink privileges.
  symlinkSync(modules, alias, process.platform === 'win32' ? 'junction' : 'dir')
  expect(moduleFileIdentity(join(alias, 'module.js'))).toBe(moduleFileIdentity(original))
  expect(() => moduleFileIdentity(root)).toThrow('unavailable')
  expect(() => moduleFileIdentity(join(root, 'missing.js'))).toThrow()
})

it('embeds the same closure-free identity check in the native Loader probe', () => {
  const { root, original } = fixture()
  const alias = join(root, 'other-name.js')
  linkSync(original, alias)
  const embedded = new Function(`return (${physicalModuleIdentity.toString()})`)()
  expect(embedded(statSync, alias)).toBe(moduleFileIdentity(original))
  expect(() => embedded(() => ({ isFile: () => true, dev: 1n, ino: 0n }), original)).toThrow('unavailable')
})
