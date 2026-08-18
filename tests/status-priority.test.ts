import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickStatusLine } from '../src/client/status-priority.ts'

const root = resolve(import.meta.dirname, '..')

describe('status line priority', () => {
  it('keeps errors, pending, and restart above a success toast', () => {
    expect(pickStatusLine({
      error: 'send failed',
      pending: 'waiting',
      notice: 'copied',
    })).toBe('send failed')
    expect(pickStatusLine({
      pending: 'waiting',
      notice: 'copied',
    })).toBe('waiting')
    expect(pickStatusLine({
      restart: 'restart',
      running: 'generating',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('restart')
    expect(pickStatusLine({
      running: 'generating',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('generating')
    expect(pickStatusLine({
      warning: 'need restart',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('need restart')
    expect(pickStatusLine({
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('queue 1')
    expect(pickStatusLine({ notice: 'copied' })).toBe('copied')
  })

  it('expires success and info notices in the surface listener', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).toContain('EPHEMERAL_NOTICE_MS')
    expect(surface).toContain('pickStatusLine')
    expect(surface).toMatch(/tone === 'success' \|\| tone === 'info'/u)
  })
})
