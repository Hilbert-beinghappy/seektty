import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DSH_SPAWN_OPTIONS,
  installed,
  internals,
  launch,
  launcherArgs,
  run,
} from '../src/bin.ts'
import { PACKAGE_VERSION, defaultPluginSpec } from '../src/dsh-compat.ts'

const temporaryHomes: string[] = []

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'seektty-launcher-'))
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

const defaultSpawnSync = internals.spawnSync

function stubChineseLocale(): void {
  vi.stubEnv('LANGUAGE', '')
  vi.stubEnv('LC_ALL', '')
  vi.stubEnv('LC_MESSAGES', '')
  vi.stubEnv('LANG', 'zh_CN.UTF-8')
}

afterEach(() => {
  internals.spawnSync = defaultSpawnSync
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
    stubChineseLocale()
    expect(() => launcherArgs(['--profile'])).toThrow('--profile 需要一个 Profile 名称')
    expect(() => launcherArgs(['--profile='])).toThrow('--profile 需要一个 Profile 名称')
  })

  it('uses launch env, not the process environment, for argument errors', () => {
    expect(() => launcherArgs(['--profile'], { LANG: 'en_US.UTF-8' }))
      .toThrow('--profile requires a Profile name')
  })
})

describe('launcher provisioning', () => {
  it('uses the supplied DSH_HOME instead of the process environment', () => {
    temporaryHome()
    const suppliedHome = mkdtempSync(join(tmpdir(), 'seektty-launcher-supplied-'))
    temporaryHomes.push(suppliedHome)
    writeProfile(suppliedHome, 'tui', { seektty: PACKAGE_VERSION })
    const execute = vi.fn(() => 0)

    expect(launch([], { DSH_HOME: suppliedHome, DSH_BIN: '/stock/dsh' }, execute)).toBe(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('/stock/dsh', ['--profile', 'tui'])
  })

  it('recognizes only a Profile that already contains seektty', () => {
    const home = temporaryHome()
    expect(installed('tui')).toBe(false)
    writeProfile(home, 'tui', { other: '1.0.0' })
    expect(installed('tui')).toBe(false)
    writeProfile(home, 'tui', { 'deepseek-tui': '0.1.0' })
    expect(installed('tui')).toBe(false)
    writeProfile(home, 'tui', { seektty: '0.1.0' })
    expect(installed('tui')).toBe(true)
  })

  it('provisions a missing Profile once, then boots stock dsh', () => {
    const home = temporaryHome()
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const execute = (command: string, args: readonly string[]): number => {
      calls.push({ command, args })
      if (args[0] === 'plugin') writeProfile(home, 'team', { seektty: 'file:/plugin.tgz' })
      return 0
    }

    expect(launch(
      ['--profile', 'team', '--cwd', '/workspace'],
      { DSH_BIN: '/stock/dsh', SEEKTTY_SPEC: '/plugin.tgz' },
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

  it('replaces the legacy Bundle before booting', () => {
    const home = temporaryHome()
    writeProfile(home, 'tui', { 'deepseek-tui': '0.1.0' })
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const execute = (command: string, args: readonly string[]): number => {
      calls.push({ command, args })
      if (args[0] === 'plugin' && args[3] === 'remove') writeProfile(home, 'tui', {})
      if (args[0] === 'plugin' && args[3] === 'add') writeProfile(home, 'tui', { seektty: '0.1.0' })
      return 0
    }

    expect(launch([], { DSH_BIN: '/stock/dsh' }, execute)).toBe(0)
    expect(calls.map(call => call.args)).toEqual([
      ['plugin', '--profile', 'tui', 'remove', 'deepseek-tui'],
      ['plugin', '--profile', 'tui', 'add', defaultPluginSpec(PACKAGE_VERSION)],
      ['--profile', 'tui'],
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

    expect(launch([], { DSH_BIN: '/stock/dsh', DEEPSEEK_TUI_SPEC: '/legacy-plugin.tgz' }, execute)).toBe(17)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(0, 4)).toEqual(['plugin', '--profile', 'tui', 'add'])
    expect(calls[0]?.[4]).toBe('/legacy-plugin.tgz')
  })

  it('prints version and skips spawning dsh', () => {
    const execute = vi.fn(() => 1)
    const chunks: string[] = []
    expect(launch(['--version'], { LANG: 'en_US.UTF-8' }, execute, chunk => { chunks.push(chunk) })).toBe(0)
    expect(execute).not.toHaveBeenCalled()
    expect(chunks.join('')).toContain(`seektty ${PACKAGE_VERSION}`)
    expect(chunks.join('')).toContain('Requires dsh >= 0.1.0-rc.6')
  })
})

describe('Windows launcher spawn', () => {
  it('hides the console window and uses the PATHEXT-aware sync spawn', () => {
    expect(DSH_SPAWN_OPTIONS).toMatchObject({ stdio: 'inherit', windowsHide: true })
    const source = readFileSync(new URL('../src/bin.ts', import.meta.url), 'utf8')
    expect(source).toContain("from 'cross-spawn'")
    const startup = readFileSync(new URL('../src/host/startup.ts', import.meta.url), 'utf8')
    expect(startup).toContain('windowsHide: true')
  })
})

describe('launcher run()', () => {
  it('returns the child exit status from a real spawn', () => {
    expect(run(process.execPath, ['-e', 'process.exit(0)'])).toBe(0)
    expect(run(process.execPath, ['-e', 'process.exit(9)'])).toBe(9)
  })

  it('explains a missing dsh binary with install and DSH_BIN guidance', () => {
    stubChineseLocale()
    expect(() => run('seektty-missing-dsh-not-on-path', [])).toThrow(/未安装或不在 PATH/)
    expect(() => run('seektty-missing-dsh-not-on-path', [])).toThrow(/DSH_BIN/)
    expect(() => run('seektty-missing-dsh-not-on-path', [])).toThrow(/@deepseek-ai\/dsh/)
  })

  it('explains a missing dsh binary in English when the terminal locale is English', () => {
    vi.stubEnv('LANGUAGE', '')
    vi.stubEnv('LC_ALL', 'en_US.UTF-8')
    expect(() => run('seektty-missing-dsh-not-on-path', [])).toThrow(/is not installed or not on PATH/)
  })

  it('returns 130 silently when dsh is interrupted by SIGINT or SIGTERM', () => {
    internals.spawnSync = () => ({ signal: 'SIGINT', status: null })
    expect(run('dsh', [])).toBe(130)
    internals.spawnSync = () => ({ signal: 'SIGTERM', status: null })
    expect(run('dsh', [])).toBe(130)
  })
})

describe('corrupt Profile manifest', () => {
  it('names the file and how to recover', () => {
    stubChineseLocale()
    const home = temporaryHome()
    const dir = join(home, 'profiles', 'tui')
    mkdirSync(dir, { recursive: true })
    const manifest = join(dir, 'package.json')
    writeFileSync(manifest, '{')
    expect(() => installed('tui')).toThrow(manifest)
    expect(() => installed('tui')).toThrow(/删除该文件后 deepseek 会重新初始化 Profile/)
  })
})
