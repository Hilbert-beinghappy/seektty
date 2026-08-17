import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatBusyFooter, lastOutputLines } from '../src/client/busy-status.ts'
import { redactInstallerOutput } from '../src/host/installer-output.ts'

describe('installer output redaction', () => {
  it('redacts credentials inside a single streamed chunk', () => {
    expect(redactInstallerOutput('Cloning https://user:secret@github.com/org/repo.git')).toContain('https://***@github.com/org/repo.git')
    expect(redactInstallerOutput('_authToken=abc123')).toContain('_authToken=***')
  })
})

describe('busy overlay chrome', () => {
  it('shows a spinner, elapsed seconds, and an Esc notice', () => {
    expect(formatBusyFooter(0)).toMatch(/⠋ 0s/)
    expect(formatBusyFooter(2_500, '操作进行中')).toMatch(/2s · 操作进行中/)
  })

  it('keeps only the tail of streamed output', () => {
    expect(lastOutputLines('a\nb\nc\nd', 2)).toBe('c\nd')
  })
})

describe('progress wiring', () => {
  it('forwards plugin run output chunks through redaction instead of dumping after completion', () => {
    const source = readFileSync(new URL('../src/host/management.ts', import.meta.url), 'utf8')
    expect(source).toContain('output(stream, redactInstallerOutput(chunk))')
    expect(source).not.toMatch(/if \(stdout !== ''\) output\('stdout', stdout\)/)
    const actions = readFileSync(new URL('../src/client/actions.ts', import.meta.url), 'utf8')
    expect(actions).toContain('overlays.progress')
    expect(actions).toContain('onOutput:')
  })
})
