import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { ProfilePluginManager } from '../src/host/profile-plugin-manager.ts'

describe('profile plugin snapshot (task 5.3)', () => {
  it('reuses the same snapshot object until the Profile manifest changes', () => {
    const home = mkdtempSync(join(tmpdir(), 'seektty-snapshot-'))
    const manager = new ProfilePluginManager({
      profile: 'tui',
      installAnchor: home,
      home,
    })
    const first = manager.snapshot()
    const second = manager.snapshot()
    expect(second).toBe(first)
    const manifestPath = join(manager.dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, description: 'changed' }, null, 2)}\n`)
    const third = manager.snapshot()
    expect(third).not.toBe(first)
    expect(third.profile).toBe('tui')
    writeFileSync(join(manager.dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    const afterLock = manager.snapshot()
    expect(afterLock).not.toBe(third)
    mkdirSync(join(manager.dir, 'node_modules'))
    writeFileSync(join(manager.dir, 'node_modules', '.modules.yaml'), 'hoisted: {}\n')
    const afterModules = manager.snapshot()
    expect(afterModules).not.toBe(afterLock)
  })
})

// New dsh templates carry lifecycle policy beside their bundle list.
describe('native Profile template lifecycle', () => {
  it('preserves the official template bundles and patch reload policy when creating a Profile', () => {
    const home = mkdtempSync(join(tmpdir(), 'seektty-template-'))
    const manager = new ProfilePluginManager({ profile: 'tui', installAnchor: home, home })
    const templateName = Object.keys(PROFILE_TEMPLATES).find(name => name !== 'tui')!
    const template = PROFILE_TEMPLATES[templateName]!
    manager.createProfile(templateName)
    const manifest = JSON.parse(readFileSync(join(home, 'profiles', templateName, 'package.json'), 'utf8'))
    expect(manifest.dsh.profile.bundles).toEqual(template.bundles)
    expect(manifest.dsh.profile.patchReload).toBe(template.patchReload)
  })
})
