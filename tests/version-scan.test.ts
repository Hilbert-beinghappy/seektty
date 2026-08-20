import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DSH_DIST_TAGS_URL,
  SEEKTTY_LATEST_RELEASE_URL,
  scanLatestVersions,
  tagToVersion,
  updateAdvice,
  updatePlan,
} from '../src/version-scan.ts'
import { isLocalPluginSpec, isUpdateRequest, maybeAutoUpdate, postSessionUpdateNotice, runUpdate, updateMode } from '../src/bin.ts'

const facts = { dshTested: '0.1.0-rc.7', seekttyVersion: '1.1.0', dshPinned: false, seekttyPinned: false }
const temporaryHomes: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function isolatedProfileEnv(dependencies: Record<string, string> = {
  seektty: 'github:Hilbert-beinghappy/seektty#v1.1.0',
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
  return { LANG: 'en_US.UTF-8', DSH_HOME: home }
}

function fakeFetch(payloads: Record<string, unknown>) {
  return (url: string) => {
    const payload = payloads[url]
    if (payload === undefined) return Promise.reject(new Error(`unexpected ${url}`))
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  }
}

describe('live version scan', () => {
  it('reads only the npm latest dist-tag and the SeekTTY GitHub release', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
      [SEEKTTY_LATEST_RELEASE_URL]: { tag_name: 'v1.2.0' },
    }))
    expect(scan).toEqual({
      dshLatest: '0.1.0-rc.7',
      seekttyLatestTag: 'v1.2.0',
    })
  })

  it('ignores npm next even when that channel is newer', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
    }))
    expect(scan.dshLatest).toBe('0.1.0-rc.7')
    expect(updatePlan(scan, facts)).toEqual({
      dshSpec: undefined,
      seekttySpec: undefined,
    })
    expect(updateAdvice(scan, facts, true)).toEqual([])
  })

  it('does not query the GitHub harness pre-release feed', async () => {
    const fetchImpl = vi.fn(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
      [SEEKTTY_LATEST_RELEASE_URL]: { tag_name: 'v1.1.0' },
    }))
    await scanLatestVersions(fetchImpl)
    const urls = fetchImpl.mock.calls.map(call => call[0])
    expect(urls).toHaveLength(2)
    expect(urls).toEqual(expect.arrayContaining([DSH_DIST_TAGS_URL, SEEKTTY_LATEST_RELEASE_URL]))
    expect(urls.join('\n')).not.toContain('deepseek-harness')
  })

  it('degrades every source silently instead of rejecting', async () => {
    const scan = await scanLatestVersions(() => Promise.reject(new Error('offline')))
    expect(scan).toEqual({
      dshLatest: undefined,
      seekttyLatestTag: undefined,
    })
    const partial = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.7', next: '0.1.0-rc.8' },
    }))
    expect(partial.dshLatest).toBe('0.1.0-rc.7')
    expect(partial.seekttyLatestTag).toBeUndefined()
  })

  it('plans dsh from npm latest only, and only when that tag is newer than tested', () => {
    expect(updatePlan({ dshLatest: '0.1.0-rc.8', seekttyLatestTag: 'v1.2.0' }, facts)).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.0-rc.8',
      seekttySpec: 'github:Hilbert-beinghappy/seektty#v1.2.0',
    })
    expect(updatePlan(
      { dshLatest: '0.1.0-rc.7', seekttyLatestTag: 'v1.2.0' },
      facts,
    ).dshSpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.0-rc.8', seekttyLatestTag: 'v1.1.0' }, facts).seekttySpec).toBeUndefined()
    expect(updatePlan({ dshLatest: '0.1.0-rc.8' }, { ...facts, dshPinned: true }).dshSpec).toBeUndefined()
    expect(updatePlan(
      { dshLatest: '0.1.0-rc.8', seekttyLatestTag: 'v1.2.0' },
      { ...facts, seekttyPinned: true },
    ).seekttySpec).toBeUndefined()
    expect(updatePlan({}, facts)).toEqual({ dshSpec: undefined, seekttySpec: undefined })
    expect(tagToVersion('v1.2.0')).toBe('1.2.0')
    expect(tagToVersion('1.2.0')).toBe('1.2.0')
  })

  it('advises only when npm latest or SeekTTY is actually newer', () => {
    expect(updateAdvice({}, facts, true)).toEqual([])
    expect(updateAdvice({ dshLatest: '0.1.0-rc.7', seekttyLatestTag: 'v1.1.0' }, facts, true)).toEqual([])
    expect(updateAdvice({ dshLatest: '0.1.0-rc.7', seekttyLatestTag: 'v1.2.0' }, facts, true).some(
      line => line.includes('0.1.0-rc.8'),
    )).toBe(false)
    const lines = updateAdvice({ dshLatest: '0.1.0-rc.8', seekttyLatestTag: 'v1.2.0' }, facts, true)
    expect(lines.some(line => line.includes('0.1.0-rc.8'))).toBe(true)
    expect(lines.some(line => line.includes('v1.2.0'))).toBe(true)
    expect(lines.at(-1)).toContain('deepseek --update')
  })
})

describe('launcher update flow', () => {
  it('recognizes --update without treating it as a dsh argument', () => {
    expect(isUpdateRequest(['--update'])).toBe(true)
    expect(isUpdateRequest(['--profile', 'tui'])).toBe(false)
  })

  it('updates dsh globally and the SeekTTY Bundle through native dsh plugin add', async () => {
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
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: 'v9.9.9' }),
    )
    expect(status).toBe(0)
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', '@deepseek-ai/dsh@0.1.0-rc.9'],
      ['dsh', 'plugin', '--profile', 'team', 'add', 'github:Hilbert-beinghappy/seektty#v9.9.9'],
    ])
  })

  it('skips the dsh update when DSH_BIN pins the executable', async () => {
    const execute = vi.fn(() => 0)
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8', DSH_BIN: '/opt/dsh/bin/dsh' },
      execute,
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: undefined }),
    )
    expect(status).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    expect(chunks.join('')).toContain('DSH_BIN')
  })

  it('fails clearly when both release channels are unreachable', async () => {
    const chunks: string[] = []
    const status = await runUpdate(
      ['--update'],
      { LANG: 'en_US.UTF-8' },
      vi.fn(() => 0),
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: undefined, seekttyLatestTag: undefined }),
    )
    expect(status).toBe(1)
    expect(chunks.join('')).toContain('npm Registry')
  })

  it('prints a post-session notice only in check mode and stays silent offline', async () => {
    const chunks: string[] = []
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: 'check' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: undefined }),
    )
    expect(chunks.join('')).toContain('deepseek --update')
    chunks.length = 0
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: undefined }),
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
      () => Promise.resolve({ dshLatest: '9.9.9', seekttyLatestTag: undefined }),
    )
    expect(chunks).toEqual([])
  })

  it('defaults to auto updates from npm latest and the SeekTTY GitHub release', async () => {
    expect(updateMode({})).toBe('auto')
    expect(updateMode({ SEEKTTY_UPDATE: 'off' })).toBe('off')
    expect(updateMode({ SEEKTTY_UPDATE: 'check' })).toBe('check')
    expect(updateMode({ SEEKTTY_UPDATE_CHECK: '0' })).toBe('off')
    expect(isLocalPluginSpec('link:/tmp/seektty')).toBe(true)
    expect(isLocalPluginSpec('github:Hilbert-beinghappy/seektty#v1.1.0')).toBe(false)
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
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: 'v9.9.9' }),
    )
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', '@deepseek-ai/dsh@0.1.0-rc.9'],
      ['dsh', 'plugin', '--profile', 'tui', 'add', 'github:Hilbert-beinghappy/seektty#v9.9.9'],
    ])
    calls.length = 0
    await maybeAutoUpdate(
      ['--profile', 'tui'],
      isolatedProfileEnv({ seektty: 'link:/tmp/seektty' }),
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: 'v9.9.9' }),
    )
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', '@deepseek-ai/dsh@0.1.0-rc.9'],
    ])
    calls.length = 0
    await maybeAutoUpdate(
      [],
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE: '0' },
      execute,
      () => {},
      () => Promise.resolve({ dshLatest: '0.1.0-rc.9', seekttyLatestTag: 'v9.9.9' }),
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
})
