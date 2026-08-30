import { describe, expect, it } from 'vitest'
import {
  compareDshVersion,
  defaultPluginSpec,
  dshCompatibilityError,
  dshCompatibilityNotice,
  isVersionRequest,
  launcherCopy,
  versionMessage,
} from '../src/dsh-compat.ts'

describe('dsh version and compatibility', () => {
  it('pins the default plugin spec to the exact npm version and prints --version without spawning', () => {
    expect(defaultPluginSpec('1.0.0')).toBe('seektty@1.0.0')
    expect(isVersionRequest(['--cwd', '.', '--version'])).toBe(true)
    expect(isVersionRequest(['-V'])).toBe(true)
    expect(isVersionRequest(['--cwd', '.'])).toBe(false)
    expect(versionMessage({
      name: 'seektty',
      version: '1.0.0',
      compatibility: { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' },
    }, true)).toContain('Requires dsh >= 0.1.0-rc.6')
    expect(launcherCopy('--profile 需要一个 Profile 名称', '--profile requires a Profile name', true))
      .toBe('--profile requires a Profile name')
  })

  it('rejects dsh older than the declared minimum', () => {
    expect(compareDshVersion('0.1.0-rc.5', '0.1.0-rc.6')).toBeLessThan(0)
    expect(dshCompatibilityError('0.1.0-rc.5', { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' }, false))
      .toContain('0.1.0-rc.5')
    expect(dshCompatibilityError('0.1.0-rc.6', { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' }, false))
      .toBeUndefined()
  })

  it('boots on dsh newer than the tested upper bound and only advises', () => {
    const range = { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' }
    expect(dshCompatibilityError('0.2.0', range, true)).toBeUndefined()
    expect(dshCompatibilityNotice('0.2.0', range, true)).toContain('0.2.0')
    expect(dshCompatibilityNotice('0.2.0', range, true)).toMatch(/tested 0\.1\.0-rc\.6/u)
    expect(dshCompatibilityNotice('0.1.0-rc.6', range, true)).toBeUndefined()
    expect(dshCompatibilityNotice('0.1.0-rc.5', range, false)).toBeUndefined()
    expect(dshCompatibilityNotice('0.0.1', range, false)).toBeUndefined()
    expect(dshCompatibilityNotice(undefined, range, false)).toBeUndefined()
  })

  it('does not treat the official host.describe placeholder as a real dsh version', () => {
    const range = { minimum: '0.1.0-rc.6', tested: '0.1.0-rc.6' }
    expect(dshCompatibilityError('0.0.1', range, false)).toBeUndefined()
    expect(dshCompatibilityError('0.0.1', range, true)).toBeUndefined()
  })
})
