import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatElapsed } from '../src/client/elapsed.ts'
import { ContextBar } from '../src/client/chrome.ts'
import type { TuiHeaderFacts } from '../src/client/capabilities.ts'
import { setUiLocale } from '../src/client/locale.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setUiLocale('zh')
})

function facts(overrides: Partial<TuiHeaderFacts> = {}): TuiHeaderFacts {
  return {
    hostVersion: '0.1.0',
    nodeVersion: '24.0.0',
    platform: 'darwin',
    architecture: 'arm64',
    profile: 'tui',
    workspace: '/workspace',
    session: 'session',
    mode: 'standard',
    model: 'deepseek-official/deepseek-v4-pro',
    permission: 'workspace-write',
    running: false,
    ...overrides,
  }
}

describe('status elapsed clock', () => {
  it('formats the same compact duration used beside in-flight transcript rows', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(3_200)).toBe('3.2s')
    expect(formatElapsed(65_000)).toBe('1m5s')
  })

  it('shows the live duration on the context row while a turn is running', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    vi.stubEnv('NO_COLOR', '1')
    setUiLocale('zh')
    const bar = new ContextBar('tui', '/workspace')
    bar.setFacts(facts({
      running: true,
      runningSince: 1_700_000_000_000 - 3_200,
      statusElapsed: true,
    }))
    expect(bar.render(40).join('\n')).toContain('● 生成中 3.2s')

    bar.setFacts(facts({
      running: true,
      runningSince: 1_700_000_000_000 - 3_200,
      statusElapsed: false,
    }))
    expect(bar.render(40).join('\n')).toContain('● 生成中')
    expect(bar.render(40).join('\n')).not.toContain('3.2s')
  })
})
