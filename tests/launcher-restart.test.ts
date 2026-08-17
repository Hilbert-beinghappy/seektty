import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  consumeLauncherRestart,
  launcherRestartPath,
  writeLauncherRestart,
} from '../src/launcher-restart.ts'

const pid = 8_675_309

describe('launcher restart ticket', () => {
  it('round-trips an exclusive owner-only ticket and deletes it on consume', () => {
    const path = writeLauncherRestart(pid, {
      profile: 'team',
      args: ['--cwd', '/workspace'],
      handoffPath: '/tmp/deepseek-handoff-test.json',
    })
    expect(path).toBe(launcherRestartPath(pid))
    expect(existsSync(path)).toBe(true)
    if (process.platform !== 'win32') {
      expect(readFileSync(path).length).toBeGreaterThan(0)
    }
    expect(consumeLauncherRestart(pid)).toEqual({
      profile: 'team',
      args: ['--cwd', '/workspace'],
      handoffPath: '/tmp/deepseek-handoff-test.json',
    })
    expect(existsSync(path)).toBe(false)
    expect(consumeLauncherRestart(pid)).toBeUndefined()
  })

  it('replaces a stale ticket so a second restart is not blocked', () => {
    writeFileSync(launcherRestartPath(pid), '{', { encoding: 'utf8' })
    writeLauncherRestart(pid, { profile: 'tui', args: [] })
    expect(consumeLauncherRestart(pid)).toEqual({ profile: 'tui', args: [] })
  })

  it('keeps tickets inside the process temp directory', () => {
    expect(launcherRestartPath(pid).startsWith(tmpdir())).toBe(true)
    expect(launcherRestartPath(pid)).toContain('deepseek-restart-')
  })
})

describe('outer-wait restart contract', () => {
  it('does not spawn a replacement dsh from the inner process', () => {
    const startup = readFileSync(new URL('../src/host/startup.ts', import.meta.url), 'utf8')
    expect(startup).not.toContain("from 'node:child_process'")
    expect(startup).not.toContain('child.once')
    expect(startup).toContain('writeLauncherRestart')
    expect(startup).toContain('LAUNCHER_RESTART_EXIT_CODE')
    const host = readFileSync(new URL('../src/host/index.ts', import.meta.url), 'utf8')
    expect(host).toMatch(/exit\(1\)/)
    expect(host).not.toMatch(/process\.exitCode = 1/)
  })
})
