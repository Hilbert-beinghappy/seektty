import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { PluginMarketplace } from '../src/host/plugin-marketplace.ts'
import { AUTO_PERMITTED_DSH_EXACT, AUTO_PERMITTED_DSH_MINIMUM } from '../src/version-scan.ts'
import { dshPeerRange } from '../scripts/dsh-peer-range.mjs'
import { DSH_COMPATIBILITY, PACKAGE_VERSION, compareDshVersion } from '../src/dsh-compat.ts'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>

describe('out-of-tree Bundle contract', () => {
  it('declares the native dsh Bundle patch and exact tested baseline', () => {
    expect(manifest.dsh).toEqual({
      bundle: { patch: './cordis.patch.yml' },
      compatibility: { minimum: '0.1.0-rc.6', tested: DSH_COMPATIBILITY.tested },
    })
    expect(manifest.bin).toEqual({ deepseek: './lib/bin.js' })
    const launcher = readFileSync(resolve(root, 'src/bin.ts'), 'utf8')
    expect(launcher).not.toMatch(/from ['"]@deepseek-ai\//u)
    expect(PACKAGE_VERSION).toBe(manifest.version)
    expect(DSH_COMPATIBILITY).toEqual((manifest.dsh as { compatibility: unknown }).compatibility)
  })

  it('ships only for the supported terminal platforms', () => {
    expect(manifest.os).toEqual(['darwin', 'linux', 'win32'])
  })

  it('contains no consumer workspace dependency', () => {
    const dependencyGroups = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    for (const group of dependencyGroups) {
      const dependencies = manifest[group] as Record<string, string> | undefined
      for (const spec of Object.values(dependencies ?? {})) expect(spec).not.toMatch(/^workspace:/)
    }
  })

  it('pins SeekTTY 1.2.1 to tested 0.1.1-rc.2 with a legacy union plus exact Host peer', () => {
    expect(manifest.version).toBe('1.2.1')
    expect(PACKAGE_VERSION).toBe('1.2.1')
    expect(DSH_COMPATIBILITY).toEqual({ minimum: '0.1.0-rc.6', tested: '0.1.1-rc.2' })
    expect(AUTO_PERMITTED_DSH_MINIMUM).toBe(DSH_COMPATIBILITY.minimum)
    expect(AUTO_PERMITTED_DSH_EXACT).toBe(DSH_COMPATIBILITY.tested)
    const expectedPeer = dshPeerRange(DSH_COMPATIBILITY.minimum, DSH_COMPATIBILITY.tested)
    expect(expectedPeer).toBe('>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2')
    const peers = manifest.peerDependencies as Record<string, string>
    for (const [name, spec] of Object.entries(peers)) {
      if (!name.startsWith('@deepseek-ai/dsh-')) continue
      expect(spec, name).toBe(expectedPeer)
      expect(spec, name).not.toContain('<0.1.0-rc.9')
      expect(spec, name).not.toContain('0.1.1-rc.1')
    }
    const devDependencies = manifest.devDependencies as Record<string, string>
    for (const [name, version] of Object.entries(devDependencies)) {
      if (!name.startsWith('@deepseek-ai/dsh-')) continue
      if (name === '@deepseek-ai/dsh-client-schema-form') {
        expect(version, name).toBe('0.1.0-rc.7')
        continue
      }
      expect(version, name).toBe('0.1.1-rc.2')
    }
  })

  it('mounts the terminal entries through one valid patch list', () => {
    const patchText = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    const patch = load(patchText, { schema: entryListSchema })
    expect(Array.isArray(patch)).toBe(true)
    expect(patchText).toContain("name: 'seektty/marketplace-provider'")
    expect(patchText).toContain("name: '@deepseek-ai/dsh-client-locale'")
    expect(patchText).toContain("name: 'seektty/attachment-compat'")
    expect(patchText).toContain("name: 'seektty/in-process'")
    expect(patchText).toContain("name: 'seektty/startup'")
    expect(patchText).toContain("name: 'seektty'")
    const insert = (patch as { insert?: { name?: string }[] }[]).find(row => Array.isArray(row.insert))
    const names = (insert?.insert ?? []).map(row => row.name)
    expect(names.indexOf('seektty/attachment-compat')).toBe(names.indexOf('@deepseek-ai/dsh-host-apiproxy') - 1)
    expect(manifest.exports).toMatchObject({ './attachment-compat': './lib/attachment-compat.js' })
  })

  it('never installs a second official Host identity graph into a Profile', () => {
    const dependencies = manifest.dependencies as Record<string, string>
    expect(Object.keys(dependencies).filter(name => name.startsWith('@deepseek-ai/'))).toEqual([])

    const peers = manifest.peerDependencies as Record<string, string>
    const peerMeta = manifest.peerDependenciesMeta as Record<string, { optional?: boolean }>
    const devDependencies = manifest.devDependencies as Record<string, string>
    const hostPeers = Object.keys(peers).filter(name => name.startsWith('@deepseek-ai/'))
    expect(hostPeers).toContain('@deepseek-ai/dsh-client-locale')
    expect(hostPeers).toContain('@deepseek-ai/dsh-tools')
    for (const name of hostPeers) {
      expect(peerMeta[name], name).toEqual({ optional: true })
      expect(devDependencies[name], name).toBeDefined()
    }

    const testedDevPackages = Object.keys(devDependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))
    for (const name of testedDevPackages) {
      const version = devDependencies[name]
      expect(version, name).toBeDefined()
      if (version === undefined) continue
      const order = compareDshVersion(version, DSH_COMPATIBILITY.tested)
      expect(order, `${name}@${version}`).toBeDefined()
      expect(order, `${name}@${version}`).toBeLessThanOrEqual(0)
    }
  })

  it('does not retain the in-tree TUI Bundle identity', () => {
    const management = readFileSync(resolve(root, 'src/host/management.ts'), 'utf8')
    expect(management).toContain("const TUI_BUNDLE = 'seektty'")
    expect(management).not.toContain('@deepseek-ai/dsh-tui-app')
  })

  it('leaves text selection, copying, and scrollback under terminal control', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).not.toContain("from './mouse.ts'")
    expect(surface).not.toMatch(/\\u001B\[\?100[0-6]h/u)
    expect(surface).toContain('Number.POSITIVE_INFINITY')
  })

  it('gates pull requests on pnpm run check and a rebuilt lib/ tree', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('pnpm run check')
    expect(workflow).toContain('git diff --exit-code lib/')
    expect(workflow).toContain("'release/**'")
  })

  it('tracks every packaged path so GitHub ref installs cannot omit files', () => {
    const tracked = new Set(
      execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean),
    )
    const patterns = [
      ...(manifest.files as string[]),
      ...Object.values(manifest.bin as Record<string, string>),
    ]
    for (const pattern of patterns) {
      const matches = pattern.includes('*')
        ? globSync(pattern, { cwd: root })
        : existsSync(resolve(root, pattern)) ? [pattern] : []
      expect(matches, pattern).not.toEqual([])
      for (const file of matches) {
        expect(tracked.has(file.replaceAll('\\', '/').replace(/^\.\//u, '')), file).toBe(true)
      }
    }
  })

  it('is accepted by its own local marketplace preflight', async () => {
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
    })
    const candidate = await marketplace.inspect(root, [])
    expect(candidate.name).toBe('seektty')
    expect(candidate.bundle).toBe(true)
    expect(candidate.patchValid).toBe(true)
    expect(candidate.diagnostics).toEqual([
      '安装包声明脚本：build、typecheck、test、test:stock、test:clarify-doctor、pack:check、check',
    ])
  })

  it('keeps pack-policy helpers out of the published files and runs pack-check from check', () => {
    const scripts = manifest.scripts as Record<string, string>
    expect(scripts.check).toBe('pnpm run typecheck && pnpm run test && pnpm run build && pnpm run pack:check')
    expect(scripts['pack:check']).toBe('node scripts/pack-check.mjs')
    expect((manifest.files as string[]).join('\n')).not.toMatch(/pack-policy|scripts\//)
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('SEEKTTY_SPEC="$RUNNER_TEMP/seektty-$VERSION.tgz"')
    expect(workflow).toContain("require('./package.json').dsh.compatibility.tested")
  })

  it('states current 1.2.1 / rc.2 pins without inventing an unreleased download URL', () => {
    for (const name of ['README.md', 'README.zh.md']) {
      const text = readFileSync(resolve(root, name), 'utf8')
      expect(text).toContain('Version-1.2.1')
      expect(text).toContain('DeepSeek%20Harness-0.1.1--rc.2')
      expect(text).toContain('https://github.com/Hilbert-beinghappy/seektty/releases')
      expect(text).not.toContain('/releases/tag/v1.2.1')
      expect(text).not.toContain('/releases/download/v1.2.1/')
      expect(text).toContain('/releases/download/v1.2.0/seektty-1.2.0.tgz')
      expect(text).toMatch(/Vision-Exp/)
      expect(text).toMatch(/self-first|SeekTTY 自更新优先|每轮只安装一个/u)
    }
    const english = readFileSync(resolve(root, 'README.md'), 'utf8')
    const chinese = readFileSync(resolve(root, 'README.zh.md'), 'utf8')
    expect(english).toContain('The current tested Host is official `0.1.1-rc.2`')
    expect(chinese).toContain('当前已测 Host 是官方 `0.1.1-rc.2`')
    expect(english).toContain('SeekTTY `1.2.1` + Auxiliary Runtime `0.1.1` + Clarify `0.2.2`')
    expect(chinese).toContain('SeekTTY `1.2.1` + Auxiliary Runtime `0.1.1` + Clarify `0.2.2`')
  })
})
