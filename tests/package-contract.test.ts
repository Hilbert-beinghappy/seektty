import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { PluginMarketplace } from '../src/host/plugin-marketplace.ts'
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
    expect(PACKAGE_VERSION).toBe(manifest.version)
    expect(DSH_COMPATIBILITY).toEqual((manifest.dsh as { compatibility: unknown }).compatibility)
  })

  it('ships only for the supported terminal platforms', () => {
    expect(manifest.os).toEqual(['darwin', 'linux', 'win32'])
  })

  it('contains no consumer workspace dependency', () => {
    const dependencyGroups = ['dependencies', 'peerDependencies', 'optionalDependencies']
    for (const group of dependencyGroups) {
      const dependencies = manifest[group] as Record<string, string> | undefined
      for (const spec of Object.values(dependencies ?? {})) expect(spec).not.toMatch(/^workspace:/)
    }
  })

  it('mounts the terminal entries through one valid patch list', () => {
    const patchText = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    const patch = load(patchText, { schema: entryListSchema })
    expect(Array.isArray(patch)).toBe(true)
    expect(patchText).toContain("name: 'seektty/marketplace-provider'")
    expect(patchText).toContain("name: '@deepseek-ai/dsh-client-locale'")
    expect(patchText).toContain("name: 'seektty/in-process'")
    expect(patchText).toContain("name: 'seektty/startup'")
    expect(patchText).toContain("name: 'seektty'")
  })

  it('pins official dsh packages to the tested Harness baseline when that version exists', () => {
    const dependencies = manifest.dependencies as Record<string, string>
    const dshPackages = Object.keys(dependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))
    expect(dshPackages).toContain('@deepseek-ai/dsh-client-locale')
    const exact = dshPackages.filter(name => dependencies[name] === DSH_COMPATIBILITY.tested)
    expect(exact.length).toBeGreaterThan(dshPackages.length / 2)
    for (const name of dshPackages) {
      const version = dependencies[name]
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
      '安装包声明脚本：build、typecheck、test、test:stock、check',
    ])
  })
})
