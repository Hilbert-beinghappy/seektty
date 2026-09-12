import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_PROFILE_BUNDLES, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'
import { ProfilePluginManager } from '../src/host/profile-plugin-manager.ts'

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'seektty-profile-materialize-'))
  const manager = new ProfilePluginManager({ profile: 'tui', installAnchor: home, home })
  manager.ensureProfile()
  const bundle = join(manager.dir, 'fixture-bundle')
  mkdirSync(bundle)
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'seektty-profile-fixture', version: '0.0.1', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), '[]\n')
  writeProfileManifest(manager.dir, { name: 'dsh-profile-tui',
    dependencies: { 'seektty-profile-fixture': 'file:./fixture-bundle' },
    dsh: { profile: { bundles: ['seektty-profile-fixture'], patchReload: 'live' } },
  })
  return { home, manager, bundle }
}

describe('native Profile creation materialization', () => {
  it('installs copied relative local dependencies into the new Profile without copying node_modules', async () => {
    const { manager, bundle } = fixture()
    const source = readFileSync(join(manager.dir, 'package.json'), 'utf8')
    const profile = await manager.createUsableProfile('copied', 'tui')
    expect(profile.compatible).toBe(true)
    expect(profile.bundles).toEqual(['seektty-profile-fixture'])
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    expect(manifest.dependencies['seektty-profile-fixture']).toBe(`file:${bundle}`)
    expect(existsSync(join(profile.dir, 'node_modules', 'seektty-profile-fixture', 'cordis.patch.yml'))).toBe(true)
    expect(readFileSync(join(manager.dir, 'package.json'), 'utf8')).toBe(source)
    expect(existsSync(join(manager.dir, 'node_modules'))).toBe(false)
  }, 30000)

  it('uses the current Profile exact source for a newly added terminal Bundle', async () => {
    const { manager, bundle } = fixture()
    const profile = await manager.createUsableProfile('new-terminal', undefined, {
      removeBundles: DEFAULT_PROFILE_BUNDLES,
      addBundles: ['seektty-profile-fixture'],
    })
    expect(profile.compatible).toBe(true)
    expect(profile.bundles).toEqual(['seektty-profile-fixture'])
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    expect(manifest.dependencies).toEqual({ 'seektty-profile-fixture': `file:${bundle}` })
  }, 30000)

  it('reports failed native installs with the preserved Profile directory and retry command', async () => {
    const { manager } = fixture()
    const manifestPath = join(manager.dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.dependencies['seektty-profile-fixture'] = 'file:./missing-bundle'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    await expect(manager.createUsableProfile('failed', 'tui')).rejects.toThrow(/dsh plugin --profile failed install/u)
    const target = join(dirname(manager.dir), 'failed')
    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(manager.listProfiles().find(profile => profile.name === 'failed')?.compatible).toBe(false)
  }, 30000)

  it('removes excluded Surface dependencies before native reconciliation without changing the source Profile', async () => {
    const { manager } = fixture()
    const nextBundle = join(manager.dir, 'terminal-bundle')
    mkdirSync(nextBundle)
    writeFileSync(join(nextBundle, 'package.json'), JSON.stringify({ name: 'seektty-terminal-fixture', version: '0.0.1', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(nextBundle, 'cordis.patch.yml'), '[]\n')
    const manifestPath = join(manager.dir, 'package.json')
    const source = JSON.parse(readFileSync(manifestPath, 'utf8'))
    source.dependencies['seektty-terminal-fixture'] = 'file:./terminal-bundle'
    writeFileSync(manifestPath, JSON.stringify(source))
    const before = readFileSync(manifestPath, 'utf8')
    const profile = await manager.createUsableProfile('converted', 'tui', {
      addBundles: ['seektty-terminal-fixture'], removeBundles: ['seektty-profile-fixture'],
    })
    expect(profile.compatible).toBe(true)
    expect(profile.bundles).toEqual(['seektty-terminal-fixture'])
    const target = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    expect(target.dependencies['seektty-profile-fixture']).toBeUndefined()
    expect(existsSync(join(profile.dir, 'node_modules', 'seektty-profile-fixture'))).toBe(false)
    expect(readFileSync(manifestPath, 'utf8')).toBe(before)
    expect(source.dependencies['seektty-profile-fixture']).toBe('file:./fixture-bundle')
  }, 30000)
})
