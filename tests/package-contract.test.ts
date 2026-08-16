import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { PluginMarketplace } from '../src/host/plugin-marketplace.ts'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>

describe('out-of-tree Bundle contract', () => {
  it('declares the native dsh Bundle patch and exact tested baseline', () => {
    expect(manifest.dsh).toEqual({
      bundle: { patch: './cordis.patch.yml' },
      compatibility: { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' },
    })
    expect(manifest.bin).toEqual({ deepseek: './lib/bin.js' })
  })

  it('ships only for the supported terminal platforms', () => {
    expect(manifest.os).toEqual(['darwin', 'linux'])
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

  it('uses the exact official locale plugin from the tested Harness baseline', () => {
    expect((manifest.dependencies as Record<string, string>)['@deepseek-ai/dsh-client-locale'])
      .toBe('0.1.0-rc.6')
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
