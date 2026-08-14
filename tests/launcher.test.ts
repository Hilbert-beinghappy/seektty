import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installed, launch, launcherArgs } from '../src/bin.ts'

const temporaryHomes: string[] = []

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'deepseek-tui-launcher-'))
  temporaryHomes.push(home)
  vi.stubEnv('DSH_HOME', home)
  return home
}

function writeProfile(home: string, profile: string, dependencies: Record<string, string>): void {
  const dir = join(home, 'profiles', profile)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${profile}`,
    private: true,
    dependencies,
  }))
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('launcher arguments', () => {
  it('uses the tui Profile and preserves Surface arguments by default', () => {
    expect(launcherArgs(['--cwd', '../project', '--resume', 'session-1', '检查项目'])).toEqual({
      profile: 'tui',
      inner: ['--cwd', '../project', '--resume', 'session-1', '检查项目'],
    })
  })

  it('removes both supported Profile flag forms before forwarding', () => {
    expect(launcherArgs(['--profile=team', '--cwd', '.'])).toEqual({
      profile: 'team',
      inner: ['--cwd', '.'],
    })
    expect(launcherArgs(['--profile', 'review', '--resume'])).toEqual({
      profile: 'review',
      inner: ['--resume'],
    })
  })

  it('rejects an empty Profile name', () => {
    expect(() => launcherArgs(['--profile'])).toThrow('--profile 需要一个 Profile 名称')
    expect(() => launcherArgs(['--profile='])).toThrow('--profile 需要一个 Profile 名称')
  })
})

describe('launcher provisioning', () => {
  it('recognizes only a Profile that already contains deepseek-tui', () => {
    const home = temporaryHome()
    expect(installed('tui')).toBe(false)
    writeProfile(home, 'tui', { other: '1.0.0' })
    expect(installed('tui')).toBe(false)
    writeProfile(home, 'tui', { 'deepseek-tui': '0.1.0' })
    expect(installed('tui')).toBe(true)
  })

  it('provisions a missing Profile once, then boots stock dsh', () => {
    const home = temporaryHome()
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const execute = (command: string, args: readonly string[]): number => {
      calls.push({ command, args })
      if (args[0] === 'plugin') writeProfile(home, 'team', { 'deepseek-tui': 'file:/plugin.tgz' })
      return 0
    }

    expect(launch(
      ['--profile', 'team', '--cwd', '/workspace'],
      { DSH_BIN: '/stock/dsh', DEEPSEEK_TUI_SPEC: '/plugin.tgz' },
      execute,
    )).toBe(0)
    expect(calls).toEqual([
      {
        command: '/stock/dsh',
        args: ['plugin', '--profile', 'team', 'add', '/plugin.tgz'],
      },
      {
        command: '/stock/dsh',
        args: ['--profile', 'team', '--cwd', '/workspace'],
      },
    ])
  })

  it('does not boot when native plugin installation fails', () => {
    temporaryHome()
    const calls: readonly string[][] = []
    const mutableCalls = calls as string[][]
    const execute = (_command: string, args: readonly string[]): number => {
      mutableCalls.push([...args])
      return 17
    }

    expect(launch([], { DSH_BIN: '/stock/dsh' }, execute)).toBe(17)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(0, 4)).toEqual(['plugin', '--profile', 'tui', 'add'])
  })
})
