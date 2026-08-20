import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProfilePluginManager, type ProfileDoctorResult } from '../src/host/profile-plugin-manager.ts'

const clarifySpec = process.env.CLARIFY_SPEC?.trim()

function writeEmptyTuiProfile(home: string): string {
  const dir = join(home, 'profiles', 'tui')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-tui',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] as string[] } },
  }, null, 2)}\n`)
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`)
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
  return dir
}

function plantClarifyBundle(profileDir: string): void {
  const pkg = join(profileDir, 'node_modules', 'dsh-plugin-clarify')
  mkdirSync(pkg, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({
    name: 'dsh-plugin-clarify',
    version: '0.0.0-test',
    description: 'planted Clarify bundle for the unchanged doctor receiver',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)}\n`)
  writeFileSync(join(pkg, 'cordis.patch.yml'), `- insert:
    - id: clarify
      name: dsh-plugin-clarify
`)
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  manifest.dependencies = { 'dsh-plugin-clarify': 'file:./planted-clarify' }
  manifest.dsh = { profile: { bundles: ['dsh-plugin-clarify'] } }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function assertClarifyDoctorHealthy(report: ProfileDoctorResult): void {
  expect(report.diagnostics.filter(item => item.level === 'error')).toEqual([])
  expect(report.diagnostics.filter(item => item.level === 'warning')).toEqual([])
  expect(report.snapshot.bundles).toContain('dsh-plugin-clarify')
  const clarify = report.snapshot.plugins.find(plugin => plugin.name === 'dsh-plugin-clarify')
  expect(clarify).toMatchObject({
    name: 'dsh-plugin-clarify',
    bundle: true,
    active: true,
    patchValid: true,
    diagnostics: [],
  })
}

describe('unchanged SeekTTY doctor receiver for Clarify', () => {
  it('reports a planted Clarify bundle as healthy without rewriting doctor', () => {
    const home = mkdtempSync(join(tmpdir(), 'seektty-clarify-doctor-'))
    try {
      const profileDir = writeEmptyTuiProfile(home)
      plantClarifyBundle(profileDir)
      const report = new ProfilePluginManager({
        profile: 'tui',
        installAnchor: home,
        home,
      }).doctor()
      assertClarifyDoctorHealthy(report)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it.skipIf(clarifySpec === undefined)(
    'installs the local Clarify package into isolated DSH_HOME and doctor stays clean',
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'seektty-clarify-install-'))
      try {
        writeEmptyTuiProfile(home)
        const manager = new ProfilePluginManager({
          profile: 'tui',
          installAnchor: home,
          home,
          invokingCwd: process.cwd(),
        })
        const result = await manager.run(['add', resolve(clarifySpec as string)])
        expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
        assertClarifyDoctorHealthy(manager.doctor())
      } finally {
        rmSync(home, { recursive: true, force: true })
      }
    },
    120_000,
  )
})
