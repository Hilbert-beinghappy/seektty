import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DSH_DIST_TAGS_URL,
  SEEKTTY_DIST_TAGS_URL,
  exclusiveUpdatePlan,
  isAutoPermittedDshVersion,
  parseDshCliVersion,
  scanLatestVersions,
  updateAdvice,
  updatePlan,
  type InstalledFacts,
  type UpdatePlan,
} from '../src/version-scan.ts'
import {
  dshVersionProbeEnv,
  internals,
  isLocalPluginSpec,
  isUpdateRequest,
  maybeAutoUpdate,
  postSessionUpdateNotice,
  runUpdate,
  updateMode,
} from '../src/bin.ts'
import { PNPM_GVS_CONFIG_ARG } from '../src/pnpm-compat.ts'

const facts = (overrides: Partial<InstalledFacts> = {}): InstalledFacts => ({
  dshTested: '0.1.1-rc.2',
  dshInstalled: '0.1.0-rc.8',
  seekttyVersion: '1.2.1',
  dshPinned: false,
  seekttyPinned: false,
  ...overrides,
})

const temporaryHomes: string[] = []
const defaultReadInstalledDshVersion = internals.readInstalledDshVersion

afterEach(() => {
  internals.readInstalledDshVersion = defaultReadInstalledDshVersion
  vi.unstubAllEnvs()
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function isolatedProfileEnv(dependencies: Record<string, string> = {
  seektty: 'github:Hilbert-beinghappy/seektty#v1.2.1',
}): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), 'seektty-update-'))
  temporaryHomes.push(home)
  const dir = join(home, 'profiles', 'tui')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-tui',
    private: true,
    dependencies,
  }))
  vi.stubEnv('DSH_HOME', home)
  internals.readInstalledDshVersion = () => '0.1.0-rc.8'
  return { LANG: 'en_US.UTF-8', DSH_HOME: home }
}

function fakeFetch(payloads: Record<string, unknown>) {
  return (url: string) => {
    const payload = payloads[url]
    if (payload === undefined) return Promise.reject(new Error(`unexpected ${url}`))
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  }
}

function plannedSpecs(plan: UpdatePlan): string[] {
  return [plan.dshSpec, plan.seekttySpec].filter((spec): spec is string => spec !== undefined)
}

describe('live version scan', () => {
  it('reads the npm latest dist-tags for dsh and SeekTTY', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.1-rc.2', next: '0.1.2' },
      [SEEKTTY_DIST_TAGS_URL]: { latest: '1.3.0', next: '9.9.9' },
    }))
    expect(scan).toEqual({
      dshLatest: '0.1.1-rc.2',
      seekttyLatest: '1.3.0',
    })
  })

  it('ignores npm next even when that channel is newer', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.8', next: '0.1.2' },
      [SEEKTTY_DIST_TAGS_URL]: { latest: '1.2.1', next: '9.9.9' },
    }))
    expect(scan.dshLatest).toBe('0.1.0-rc.8')
    expect(scan.seekttyLatest).toBe('1.2.1')
    expect(updatePlan(scan, facts({ dshInstalled: '0.1.0-rc.8' }))).toEqual({
      dshSpec: undefined,
      seekttySpec: undefined,
    })
    expect(updateAdvice(scan, facts({ dshInstalled: '0.1.0-rc.8' }), true)).toEqual([])
  })

  it('queries only the npm dist-tag endpoints', async () => {
    const fetchImpl = vi.fn(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.1-rc.2', next: '0.1.2' },
      [SEEKTTY_DIST_TAGS_URL]: { latest: '1.2.1' },
    }))
    await scanLatestVersions(fetchImpl)
    const urls = fetchImpl.mock.calls.map(call => call[0])
    expect(urls).toHaveLength(2)
    expect(urls).toEqual(expect.arrayContaining([DSH_DIST_TAGS_URL, SEEKTTY_DIST_TAGS_URL]))
    expect(urls.every(url => url.startsWith('https://registry.npmjs.org/'))).toBe(true)
    expect(urls.join('\n')).not.toContain('github.com')
  })

  it('degrades every source silently instead of rejecting', async () => {
    const scan = await scanLatestVersions(() => Promise.reject(new Error('offline')))
    expect(scan).toEqual({
      dshLatest: undefined,
      seekttyLatest: undefined,
    })
    const partial = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.1-rc.2', next: '0.1.2' },
    }))
    expect(partial.dshLatest).toBe('0.1.1-rc.2')
    expect(partial.seekttyLatest).toBeUndefined()

    const seekttyOnly = await scanLatestVersions(fakeFetch({
      [SEEKTTY_DIST_TAGS_URL]: { latest: '1.3.0' },
    }))
    expect(seekttyOnly.dshLatest).toBeUndefined()
    expect(seekttyOnly.seekttyLatest).toBe('1.3.0')
  })

  it('ignores blank and non-string npm latest values', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: 123 },
      [SEEKTTY_DIST_TAGS_URL]: { latest: '  ' },
    }))
    expect(scan).toEqual({
      dshLatest: undefined,
      seekttyLatest: undefined,
    })
  })
})

describe('dsh CLI version and auto-permitted range', () => {
  it('parses official dsh --version text and ignores the host.describe placeholder', () => {
    expect(parseDshCliVersion('0.1.0-rc.8\n')).toBe('0.1.0-rc.8')
    expect(parseDshCliVersion('0.1.1-rc.2\n')).toBe('0.1.1-rc.2')
    expect(parseDshCliVersion('dsh 0.1.0-rc.8')).toBe('0.1.0-rc.8')
    expect(parseDshCliVersion('v0.1.0-rc.6')).toBe('0.1.0-rc.6')
    expect(parseDshCliVersion('0.0.1')).toBeUndefined()
    expect(parseDshCliVersion('')).toBeUndefined()
  })

  it('refuses banner, path, placeholder-prefix, and conflicting version text', () => {
    expect(parseDshCliVersion('Node.js v24.5.0\n')).toBeUndefined()
    expect(parseDshCliVersion('Node.js v24.5.0\n0.1.1-rc.2\n')).toBe('0.1.1-rc.2')
    expect(parseDshCliVersion('using /opt/dsh/0.1.0-rc.8/bin/dsh\n')).toBeUndefined()
    expect(parseDshCliVersion('0.0.1\n0.1.1-rc.2\n')).toBe('0.1.1-rc.2')
    expect(parseDshCliVersion('0.1.0-rc.8\n0.1.1-rc.2\n')).toBeUndefined()
  })

  it('permits the legacy rc.6–rc.8 line and the exact 0.1.1-rc.2 pin', () => {
    expect(isAutoPermittedDshVersion('0.1.0-rc.6')).toBe(true)
    expect(isAutoPermittedDshVersion('0.1.0-rc.7')).toBe(true)
    expect(isAutoPermittedDshVersion('0.1.0-rc.8')).toBe(true)
    expect(isAutoPermittedDshVersion('0.1.1-rc.2')).toBe(true)
    expect(isAutoPermittedDshVersion('0.1.0-rc.5')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.0-rc.9')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.1-rc.0')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.1-rc.1')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.1-rc.3')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.2')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.0')).toBe(false)
    expect(isAutoPermittedDshVersion('0.1.0-rc.6.1')).toBe(true)
    expect(isAutoPermittedDshVersion('0.1.0-rc.8.1')).toBe(false)
  })
})

describe('update plan gates', () => {
  it('upgrades an old Host to 0.1.1-rc.2 when that is npm latest', () => {
    expect(updatePlan({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: '0.1.0-rc.6' }))).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      seekttySpec: undefined,
    })
    expect(updatePlan({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: '0.1.0-rc.8' }))).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      seekttySpec: undefined,
    })
  })

  it('still plans dsh when latest equals tested but the installed Host is older', () => {
    expect(updatePlan(
      { dshLatest: '0.1.1-rc.2' },
      facts({ dshTested: '0.1.1-rc.2', dshInstalled: '0.1.0-rc.8' }),
    )).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      seekttySpec: undefined,
    })
  })

  it('rejects future and gap Host candidates instead of installing them', () => {
    expect(updatePlan({ dshLatest: '0.1.0-rc.9' }, facts()).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.1-rc.0' }, facts()).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.1-rc.1' }, facts()).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.1-rc.3' }, facts()).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.2' }, facts()).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: '0.1.1-rc.2' })).dshSpec)
      .toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: undefined })).dshSpec)
      .toBeUndefined()
  })

  it('plans only SeekTTY when npm latest is newer, even if dsh is also eligible', () => {
    const plan = updatePlan(
      { dshLatest: '0.1.1-rc.2', seekttyLatest: '1.3.0' },
      facts({ seekttyVersion: '1.2.1', dshInstalled: '0.1.0-rc.8' }),
    )
    expect(plan).toEqual({
      dshSpec: undefined,
      seekttySpec: 'seektty@1.3.0',
    })
    expect(plannedSpecs(plan)).toHaveLength(1)
  })

  it('does not form an npm spec from an invalid npm dist-tag', () => {
    expect(updatePlan({ seekttyLatest: 'not-a-version' }, facts())).toEqual({
      dshSpec: undefined,
      seekttySpec: undefined,
    })
  })

  it('plans at most one spec in every combination', () => {
    const cases = [
      updatePlan({ dshLatest: '0.1.1-rc.2', seekttyLatest: '1.3.0' }, facts()),
      updatePlan({ dshLatest: '0.1.1-rc.2' }, facts()),
      updatePlan({ seekttyLatest: '1.3.0' }, facts()),
      updatePlan({ dshLatest: '0.1.2', seekttyLatest: '1.3.0' }, facts()),
      updatePlan({ dshLatest: '0.1.2' }, facts()),
      updatePlan({}, facts()),
    ]
    for (const plan of cases) expect(plannedSpecs(plan).length).toBeLessThanOrEqual(1)
    expect(exclusiveUpdatePlan({
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      seekttySpec: 'seektty@1.3.0',
    })).toEqual({
      dshSpec: undefined,
      seekttySpec: 'seektty@1.3.0',
    })
  })

  it('keeps DSH_BIN, SEEKTTY_SPEC, and local/link pins from installing that side', () => {
    expect(updatePlan({ dshLatest: '0.1.1-rc.2' }, facts({ dshPinned: true })).dshSpec).toBeUndefined()
    expect(updatePlan(
      { dshLatest: '0.1.1-rc.2', seekttyLatest: '1.3.0' },
      facts({ seekttyPinned: true }),
    )).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.1-rc.2',
      seekttySpec: undefined,
    })
  })

  it('advises installable updates and only prompts for future/gap Hosts', () => {
    expect(updateAdvice({}, facts(), true)).toEqual([])
    expect(updateAdvice({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: '0.1.1-rc.2' }), true))
      .toEqual([])
    expect(updateAdvice({ seekttyLatest: '1.3.0' }, facts({ seekttyPinned: true }), true))
      .toEqual([])
    const installable = updateAdvice({ dshLatest: '0.1.1-rc.2' }, facts(), true)
    expect(installable.some(line => line.includes('0.1.1-rc.2'))).toBe(true)
    expect(installable.at(-1)).toContain('deepseek --update')
    const gap = updateAdvice({ dshLatest: '0.1.0-rc.9' }, facts(), true)
    expect(gap.some(line => line.includes('0.1.0-rc.9'))).toBe(true)
    expect(gap.join('\n')).toMatch(/permitted range|will not be installed/u)
    expect(gap.at(-1)).not.toContain('deepseek --update')
    const historicGap = updateAdvice({ dshLatest: '0.1.1-rc.1' }, facts(), true)
    expect(historicGap.some(line => line.includes('0.1.1-rc.1'))).toBe(true)
    expect(historicGap.join('\n')).toMatch(/permitted range|will not be installed/u)
    expect(historicGap.at(-1)).not.toContain('deepseek --update')
    const future = updateAdvice({ dshLatest: '0.1.2', seekttyLatest: '1.3.0' }, facts(), true)
    expect(future.some(line => line.includes('0.1.2'))).toBe(true)
    expect(future.some(line => line.includes('1.3.0'))).toBe(true)
    expect(future.at(-1)).toContain('deepseek --update')
    const selfFirst = updateAdvice({ dshLatest: '0.1.1-rc.2', seekttyLatest: '1.3.0' }, facts(), true)
    expect(selfFirst.some(line => line.includes('1.3.0'))).toBe(true)
    expect(selfFirst.join('\n')).not.toMatch(/installable dsh|可安装版本/u)
    expect(selfFirst.join('\n')).not.toMatch(/automatically/u)
    const unread = updateAdvice({ dshLatest: '0.1.1-rc.2' }, facts({ dshInstalled: undefined }), true)
    expect(unread.join('\n')).toMatch(/Could not read|无法读取/u)
    expect(unread.join('\n')).not.toContain('deepseek --update')
  })
})

describe('launcher update flow', () => {
  it('recognizes --update without treating it as a dsh argument', () => {
    expect(isUpdateRequest(['--update'])).toBe(true)
    expect(isUpdateRequest(['--profile', 'tui'])).toBe(false)
  })

  it('updates SeekTTY first and never installs dsh in the same --update round', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.8'
    const calls: string[][] = []
    const execute = vi.fn((command: string, args: readonly string[]) => {
      calls.push([command, ...args])
      return 0
    })
    const status = await runUpdate(
      ['--update', '--profile', 'team'],
      { LANG: 'en_US.UTF-8' },
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(status).toBe(0)
    expect(calls).toEqual([
      ['dsh', 'plugin', '--profile', 'team', 'add', PNPM_GVS_CONFIG_ARG, 'seektty@9.9.9'],
    ])
  })

  it('updates a compatible old Host to 0.1.1-rc.2 when SeekTTY is already current', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.6'
    const calls: string[][] = []
    const execute = vi.fn((command: string, args: readonly string[]) => {
      calls.push([command, ...args])
      return 0
    })
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8' },
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '1.2.1' }),
    )
    expect(status).toBe(0)
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', PNPM_GVS_CONFIG_ARG, '@deepseek-ai/dsh@0.1.1-rc.2'],
    ])
  })

  it('skips the dsh update when DSH_BIN pins the executable', async () => {
    const probe = vi.fn(() => '0.1.0-rc.8')
    internals.readInstalledDshVersion = probe
    const execute = vi.fn(() => 0)
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8', DSH_BIN: '/opt/dsh/bin/dsh' },
      execute,
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: undefined }),
    )
    expect(status).toBe(0)
    expect(probe).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(chunks.join('')).toContain('DSH_BIN')
  })

  it('skips SeekTTY when SEEKTTY_SPEC pins it and does not call it latest', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.8'
    const execute = vi.fn(() => 0)
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8', SEEKTTY_SPEC: 'github:Hilbert-beinghappy/seektty#v1.2.1' },
      execute,
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(status).toBe(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('pnpm', ['add', '--global', PNPM_GVS_CONFIG_ARG, '@deepseek-ai/dsh@0.1.1-rc.2'])
    expect(chunks.join('')).toMatch(/SEEKTTY_SPEC|pinned/u)
    expect(chunks.join('')).not.toMatch(/already the latest/u)
  })

  it('fails clearly when both npm dist-tag lookups are unreachable', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.8'
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8' },
      vi.fn(() => 0),
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: undefined, seekttyLatest: undefined }),
    )
    expect(status).toBe(1)
    expect(chunks.join('')).toContain('npm Registry')
  })

  it('prints a post-session notice only in check mode and stays silent offline', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.8'
    const chunks: string[] = []
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: 'check' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: undefined }),
    )
    expect(chunks.join('')).toContain('deepseek --update')
    chunks.length = 0
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: undefined }),
    )
    expect(chunks).toEqual([])
    chunks.length = 0
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: 'check' },
      chunk => { chunks.push(chunk) },
      () => Promise.reject(new Error('offline')),
    )
    expect(chunks).toEqual([])
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE_CHECK: '0' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.2', seekttyLatest: undefined }),
    )
    expect(chunks).toEqual([])
  })

  it('does not install in check mode, including future or gap Hosts', async () => {
    expect(updateMode({})).toBe('auto')
    expect(updateMode({ SEEKTTY_UPDATE: 'off' })).toBe('off')
    expect(updateMode({ SEEKTTY_UPDATE: 'check' })).toBe('check')
    expect(updateMode({ SEEKTTY_UPDATE_CHECK: '0' })).toBe('off')
    const execute = vi.fn(() => 0)
    const chunks: string[] = []
    await maybeAutoUpdate(
      [],
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: 'check' },
      execute,
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(execute).not.toHaveBeenCalled()
    expect(chunks).toEqual([])
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: 'check' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.2', seekttyLatest: undefined }),
    )
    expect(chunks.join('')).toContain('0.1.2')
    expect(chunks.join('')).toMatch(/permitted range|will not be installed/u)
    expect(chunks.join('')).not.toContain('pnpm add')
  })

  it('keeps local/link and SEEKTTY_SPEC pins, and installs at most one component', async () => {
    expect(isLocalPluginSpec('link:/tmp/seektty')).toBe(true)
    expect(isLocalPluginSpec('file:/tmp/seektty.tgz')).toBe(true)
    expect(isLocalPluginSpec('/tmp/seektty.tgz')).toBe(true)
    expect(isLocalPluginSpec('github:Hilbert-beinghappy/seektty#v1.2.1')).toBe(false)
    const calls: string[][] = []
    const execute = vi.fn((command: string, args: readonly string[]) => {
      calls.push([command, ...args])
      return 0
    })
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv(),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(calls).toEqual([
      ['dsh', 'plugin', '--profile', 'tui', 'add', PNPM_GVS_CONFIG_ARG, 'seektty@9.9.9'],
    ])
    calls.length = 0
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', PNPM_GVS_CONFIG_ARG, '@deepseek-ai/dsh@0.1.1-rc.2'],
    ])
    calls.length = 0
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      { ...isolatedProfileEnv(), SEEKTTY_SPEC: 'github:Hilbert-beinghappy/seektty#v1.2.1' },
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', PNPM_GVS_CONFIG_ARG, '@deepseek-ai/dsh@0.1.1-rc.2'],
    ])
    calls.length = 0
    await maybeAutoUpdate(
      [],
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: '0' },
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )
    expect(calls).toEqual([])
    await maybeAutoUpdate(
      [],
      { LANG: 'en_US.UTF-8' },
      execute,
      () => {},
      () => Promise.reject(new Error('offline')),
    )
    expect(calls).toEqual([])
  })

  it('continues boot when SeekTTY self-update fails', async () => {
    const execute = vi.fn(() => 17)
    await expect(maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv(),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(
      'dsh',
      ['plugin', '--profile', 'tui', 'add', PNPM_GVS_CONFIG_ARG, 'seektty@9.9.9'],
    )
  })

  it('continues boot when a compatible dsh update fails', async () => {
    const execute = vi.fn(() => 17)
    await expect(maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '9.9.9' }),
    )).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('pnpm', ['add', '--global', PNPM_GVS_CONFIG_ARG, '@deepseek-ai/dsh@0.1.1-rc.2'])
  })

  it('skips future and gap Hosts during auto-update instead of installing them', async () => {
    const execute = vi.fn(() => 0)
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.2', seekttyLatest: '1.2.1' }),
    )
    expect(execute).not.toHaveBeenCalled()
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatest: '1.2.1' }),
    )
    expect(execute).not.toHaveBeenCalled()
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.1', seekttyLatest: '1.2.1' }),
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('reads the installed Host from dsh --version rather than Profile files', () => {
    expect(defaultReadInstalledDshVersion.toString()).toContain('--version')
    const env = dshVersionProbeEnv({
      DSH_HOME: '/secret-profile',
      DEEPSEEK_API_KEY: 'leak',
      HOME: '/users/me',
      NODE_OPTIONS: '--require ./preload.cjs',
      PATH: '/usr/bin',
    })
    expect(env.DSH_HOME).toBeUndefined()
    expect(env.HOME).toBe('/users/me')
    expect(env.NODE_OPTIONS).toBe('--require ./preload.cjs')
    expect(env.DEEPSEEK_API_KEY).toBe('leak')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('tells --update when latest is outside the permitted range instead of claiming SeekTTY is current only', async () => {
    internals.readInstalledDshVersion = () => '0.1.0-rc.8'
    const execute = vi.fn(() => 0)
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8' },
      execute,
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.2', seekttyLatest: '1.2.1' }),
    )
    expect(status).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    expect(chunks.join('')).toMatch(/permitted range|will not be installed/u)
    expect(chunks.join('')).not.toMatch(/automatically/u)
  })

  it('keeps auto-update failure on the launch path without using its status as boot status', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(fileURLToPath(new URL('../src/bin.ts', import.meta.url)), 'utf8')
    expect(source).toMatch(/await maybeAutoUpdate\(args\)\s+process\.exitCode = launch\(args\)/u)
    expect(source).not.toMatch(/process\.exitCode = await maybeAutoUpdate/u)
    const execute = vi.fn(() => 17)
    await expect(maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.1-rc.2', seekttyLatest: '1.2.1' }),
    )).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
