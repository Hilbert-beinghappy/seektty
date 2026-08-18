import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatBusyFooter, lastOutputLines } from '../src/client/busy-status.ts'

describe('busy overlay chrome (review #17)', () => {
  it('shows a spinner frame, elapsed seconds, and an optional notice', () => {
    expect(formatBusyFooter(0)).toMatch(/⠋ 0s/)
    expect(formatBusyFooter(2_500, '操作进行中')).toMatch(/2s · 操作进行中/)
  })

  it('keeps only the tail of streamed output', () => {
    expect(lastOutputLines('a\nb\nc\nd', 2)).toBe('c\nd')
    expect(lastOutputLines('a\r\nb\rc\n\nd', 3)).toBe('b\nc\nd')
  })
})

describe('progress wiring', () => {
  it('streams redacted Host output chunks into the cancellable progress overlay', () => {
    const manager = readFileSync(new URL('../src/host/profile-plugin-manager.ts', import.meta.url), 'utf8')
    expect(manager).toMatch(/(stdout|stderr)Redactor\.push\(chunk\)/u)
    expect(manager).toContain("options.onOutput?.('stdout', visible)")
    const actions = readFileSync(new URL('../src/client/actions.ts', import.meta.url), 'utf8')
    expect(actions).toContain('overlays.progress')
    expect(actions).toContain('onOutput:')
    const overlays = readFileSync(new URL('../src/client/overlays.ts', import.meta.url), 'utf8')
    expect(overlays).toContain('request.work((chunk) => { overlay.append(chunk) }, this.signal)')
  })
})
