import { describe, expect, it } from 'vitest'
import {
  InstallerOutputRedactor,
  redactInstallerText,
} from '../src/host/installer-output.ts'

describe('installer output redaction (review #17)', () => {
  it('does not emit a token that arrives split across chunks', () => {
    const redactor = new InstallerOutputRedactor({ secrets: [], hold: 32, maxBytes: 4096 })
    const first = redactor.push('npm notice token=abc')
    const second = redactor.push('defGHI\nnext line\n')
    const flushed = redactor.flush()
    const visible = `${first}${second}${flushed}`
    expect(visible).not.toContain('abcdefGHI')
    expect(visible).toContain('token=***')
  })

  it('does not emit a basic-auth URL that arrives split across chunks', () => {
    const redactor = new InstallerOutputRedactor({ secrets: [], hold: 32, maxBytes: 4096 })
    expect(redactor.push('fetch https://user:se')).not.toContain('secret')
    const rest = `${redactor.push('cret@registry.example/pkg')}${redactor.flush()}`
    expect(rest).not.toContain('user:secret')
    expect(rest).toMatch(/https:\/\/\*\*\*@registry\.example\/pkg/u)
  })

  it('redacts environment secrets even when split, and bounds stored text', () => {
    const secret = 's3cret-value-ABCDEF'
    const redactor = new InstallerOutputRedactor({
      secrets: [secret],
      hold: 8,
      maxBytes: 40,
    })
    redactor.push('prefix ')
    redactor.push(secret.slice(0, 9))
    redactor.push(`${secret.slice(9)} trailing-output-that-should-be-trimmed`)
    const stored = redactor.flush()
    const text = redactor.text()
    expect(`${stored}${text}`).not.toContain(secret)
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(40)
  })

  it('redacts a complete chunk immediately', () => {
    expect(redactInstallerText('password=hunter2 https://a:b@host/x')).toBe(
      'password=*** https://***@host/x',
    )
  })
})
