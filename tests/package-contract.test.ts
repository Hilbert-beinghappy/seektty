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
import { PNPM_GVS_DSH_RANGE, PNPM_GVS_TESTED_WITH } from '../src/pnpm-compat.ts'

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

  it('is configured for a public npm Registry publication', () => {
    expect(manifest.private).not.toBe(true)
    expect(manifest.publishConfig).toEqual({
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    })
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

  it('pins SeekTTY 1.2.5 to tested 0.1.1-rc.2 with a legacy union plus exact Host peer', () => {
    expect(manifest.version).toBe('1.2.5')
    expect(PACKAGE_VERSION).toBe('1.2.5')
    expect(DSH_COMPATIBILITY).toEqual({ minimum: '0.1.0-rc.6', tested: '0.1.1-rc.2' })
    expect(AUTO_PERMITTED_DSH_MINIMUM).toBe(DSH_COMPATIBILITY.minimum)
    expect(AUTO_PERMITTED_DSH_EXACT).toBe(DSH_COMPATIBILITY.tested)
    const expectedPeer = dshPeerRange(DSH_COMPATIBILITY.minimum, DSH_COMPATIBILITY.tested)
    expect(expectedPeer).toBe('>=0.1.0-rc.6 <=0.1.0-rc.8 || 0.1.1-rc.2')
    expect(PNPM_GVS_DSH_RANGE).toBe(expectedPeer)
    expect(PNPM_GVS_TESTED_WITH).toEqual({ dsh: DSH_COMPATIBILITY.tested, pnpm: '11.7.0' })
    expect(manifest.packageManager).toBe(`pnpm@${PNPM_GVS_TESTED_WITH.pnpm}`)
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

  it('keeps full mode managed while native mode uses terminal scrollback', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const session = readFileSync(resolve(root, 'src/client/terminal-session.ts'), 'utf8')
    const mouse = readFileSync(resolve(root, 'src/client/mouse-protocol.ts'), 'utf8')
    expect(surface).toContain('createTerminalSession')
    expect(surface).toContain('setMouseReporting')
    expect(surface).toContain('decodeMouseSequence(data)')
    expect(surface).not.toContain('mouseDecoder.push(data)')
    expect(surface).toContain("liveBehavior.get().mouseMode === 'native'")
    expect(surface).toContain('Number.POSITIVE_INFINITY')
    expect(session).toContain('__seekttyManagedAlternateScreen')
    expect(session).toContain('ENTER_ALTERNATE_SCREEN')
    expect(session).toContain('setMouseReporting')
    expect(mouse).toContain('?1049h')
    expect(mouse).toContain('?1002h')
    expect(mouse).toContain('?1003h')
    expect(mouse).toContain('?1004h')
    expect(mouse).toContain('?1006h')
    expect(mouse).toContain('?1004l')
    expect(mouse).toContain('hoverFeedback')
  })

  it('gates pull requests on pnpm run check and a rebuilt lib/ tree', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    const buildConfig = readFileSync(resolve(root, 'tsdown.config.ts'), 'utf8')
    expect(workflow).toContain('pnpm run check')
    expect(workflow).toContain('git diff --exit-code lib/')
    expect(workflow).toContain("'release/**'")
    expect(buildConfig).toContain("attachDebugInfo: 'none'")
    expect(readFileSync(resolve(root, 'lib/index.js'), 'utf8')).not.toContain('node_modules/.pnpm/')
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
      '安装包声明脚本：build、typecheck、test、perf:tui、test:stock、test:pnpm11-layout、test:clarify-doctor、pack:check、test:mouse-pty、check',
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
    expect(workflow).toContain('pnpm11-layout:')
    expect(workflow).toContain('os: [ubuntu-latest, windows-latest, macos-latest]')
    expect(workflow).toContain('node: [22.x, 24.x]')
    expect(workflow).toContain('include-hidden-files: true')
    expect(workflow).toContain('pnpm test:pnpm11-layout false .artifacts')
    expect(workflow).toContain('pnpm test:pnpm11-layout true .artifacts')
  })

  it('keeps both READMEs on the release version and exact npm install spec', () => {
    for (const name of ['README.md', 'README.zh.md']) {
      const text = readFileSync(resolve(root, name), 'utf8')
      expect(text).toContain(`Version-${PACKAGE_VERSION}`)
      expect(text).toContain('DeepSeek%20Harness-0.1.1--rc.2')
      expect(text).toContain('https://github.com/Hilbert-beinghappy/seektty/releases')
      expect(text).toContain(`seektty@${PACKAGE_VERSION}`)
      expect(text).not.toContain('/releases/download/v1.2.0/')
      expect(text).toContain('pnpm add --global --config.enable-global-virtual-store=false @deepseek-ai/dsh@0.1.1-rc.2')
      expect(text).toContain('store/v11/links')
      expect(text).toContain(`docs/release-v${PACKAGE_VERSION}.md`)
      expect(text).toContain(`docs/release-v${PACKAGE_VERSION}-verification.md`)
      expect(text).toContain('npm Registry')
      expect(text).toMatch(/optional, not default dependencies|可选插件，不是默认依赖/u)
      expect(text).toMatch(/Vision-Exp/)
      expect(text).toMatch(/self-first|SeekTTY 自更新优先|每轮只安装一个/u)
    }
    const english = readFileSync(resolve(root, 'README.md'), 'utf8')
    const chinese = readFileSync(resolve(root, 'README.zh.md'), 'utf8')
    expect(english).toContain('The current tested Host is official `0.1.1-rc.2`')
    expect(chinese).toContain('当前已测 Host 是官方 `0.1.1-rc.2`')
    expect(english).toContain('SeekTTY `1.2.5` on official dsh `0.1.1-rc.2`')
    expect(chinese).toContain('SeekTTY `1.2.5` + 官方 dsh `0.1.1-rc.2`')
    const release = readFileSync(resolve(root, `docs/release-v${PACKAGE_VERSION}.md`), 'utf8')
    expect(release).toContain(`# SeekTTY ${PACKAGE_VERSION}`)
    expect(release).toContain('## English')
    expect(release).toContain('## 中文')
    expect(release.indexOf('## English')).toBeLessThan(release.indexOf('## 中文'))
    expect(existsSync(resolve(root, `docs/release-v${PACKAGE_VERSION}-verification.md`))).toBe(true)
  })
})
