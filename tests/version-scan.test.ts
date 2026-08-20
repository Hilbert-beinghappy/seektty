import { describe, expect, it, vi } from 'vitest'
import {
  DSH_DIST_TAGS_URL,
  SEEKTTY_LATEST_RELEASE_URL,
  scanLatestVersions,
  tagToVersion,
  updateAdvice,
  updatePlan,
} from '../src/version-scan.ts'
import { isUpdateRequest, postSessionUpdateNotice, runUpdate } from '../src/bin.ts'

const facts = { dshTested: '0.1.0-rc.7', seekttyVersion: '1.1.0', dshPinned: false }

function fakeFetch(payloads: Record<string, unknown>) {
  return (url: string) => {
    const payload = payloads[url]
    if (payload === undefined) return Promise.reject(new Error(`unexpected ${url}`))
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  }
}

describe('live version scan', () => {
  it('reads npm dist-tags and the newest GitHub release tag', async () => {
    const scan = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.8', next: '0.2.0-rc.1' },
      [SEEKTTY_LATEST_RELEASE_URL]: { tag_name: 'v1.2.0' },
    }))
    expect(scan).toEqual({ dshLatest: '0.1.0-rc.8', dshNext: '0.2.0-rc.1', seekttyLatestTag: 'v1.2.0' })
  })

  it('degrades every source silently instead of rejecting', async () => {
    const scan = await scanLatestVersions(() => Promise.reject(new Error('offline')))
    expect(scan).toEqual({ dshLatest: undefined, dshNext: undefined, seekttyLatestTag: undefined })
    const partial = await scanLatestVersions(fakeFetch({
      [DSH_DIST_TAGS_URL]: { latest: '0.1.0-rc.8' },
    }))
    expect(partial.dshLatest).toBe('0.1.0-rc.8')
    expect(partial.seekttyLatestTag).toBeUndefined()
  })

  it('plans dsh from the latest dist-tag and SeekTTY from a newer release tag only', () => {
    const scan = { dshLatest: '0.1.0-rc.8', seekttyLatestTag: 'v1.2.0' }
    expect(updatePlan(scan, facts)).toEqual({
      dshSpec: '@deepseek-ai/dsh@0.1.0-rc.8',
      seekttySpec: 'github:Hilbert-beinghappy/seektty#v1.2.0',
    })
    expect(updatePlan({ ...scan, seekttyLatestTag: 'v1.1.0' }, facts).seekttySpec).toBeUndefined()
    expect(updatePlan(scan, { ...facts, dshPinned: true }).dshSpec).toBeUndefined()
    expect(updatePlan({}, facts)).toEqual({ dshSpec: undefined, seekttySpec: undefined })
    expect(tagToVersion('v1.2.0')).toBe('1.2.0')
    expect(tagToVersion('1.2.0')).toBe('1.2.0')
  })

  it('advises only when something is actually newer', () => {
    expect(updateAdvice({}, facts, true)).toEqual([])
    expect(updateAdvice({ dshLatest: '0.1.0-rc.7', seekttyLatestTag: 'v1.1.0' }, facts, true)).toEqual([])
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
      () => Promise.resolve({ dshLatest: '0.1.0-rc.8', dshNext: undefined, seekttyLatestTag: 'v9.9.9' }),
    )
    expect(status).toBe(0)
    expect(calls).toEqual([
      ['pnpm', 'add', '--global', '@deepseek-ai/dsh@0.1.0-rc.8'],
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
      () => Promise.resolve({ dshLatest: '0.1.0-rc.8', dshNext: undefined, seekttyLatestTag: undefined }),
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
      () => Promise.resolve({ dshLatest: undefined, dshNext: undefined, seekttyLatestTag: undefined }),
    )
    expect(status).toBe(1)
    expect(chunks.join('')).toContain('npm Registry')
  })

  it('prints a post-session notice only when updates exist and stays silent offline', async () => {
    const chunks: string[] = []
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '0.1.0-rc.8', dshNext: undefined, seekttyLatestTag: undefined }),
    )
    expect(chunks.join('')).toContain('deepseek --update')
    chunks.length = 0
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8' },
      chunk => { chunks.push(chunk) },
      () => Promise.reject(new Error('offline')),
    )
    expect(chunks).toEqual([])
    await postSessionUpdateNotice(
      { LANG: 'en_US.UTF-8', SEEKTTY_UPDATE_CHECK: '0' },
      chunk => { chunks.push(chunk) },
      () => Promise.resolve({ dshLatest: '9.9.9', dshNext: undefined, seekttyLatestTag: undefined }),
    )
    expect(chunks).toEqual([])
  })
})
