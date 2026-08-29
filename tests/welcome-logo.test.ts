import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  builtinWelcomeLogo,
  loadWelcomeLogoFile,
  parseThemeIndexedLogo,
  sanitizeOriginalAnsiLogo,
} from '../src/client/welcome-logo.ts'

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;:]*m/gu, '')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('welcome logos', () => {
  it('ships fixed half-block DeepSeek whale masks', () => {
    vi.stubEnv('NO_COLOR', '1')
    const large = builtinWelcomeLogo('large', 'original')
    const compact = builtinWelcomeLogo('compact', 'theme')
    expect(large).toMatchObject({ width: 40, height: 16 })
    expect(compact).toMatchObject({ width: 24, height: 10 })
    expect(stripAnsi(large.lines.join('\n'))).toMatch(/[▀▄█]/u)
    expect(stripAnsi(compact.lines.join('\n'))).toMatch(/[▀▄█]/u)
  })

  it('keeps color-only SGR and removes active terminal controls', () => {
    const logo = sanitizeOriginalAnsiLogo([
      '\u001B[31mred\u001B[0m\u001B[2J',
      '\u001B]52;c;secret\u0007safe\u001BPimage\u001B\\',
    ].join('\r\n'))
    const output = logo.lines.join('\n')
    expect(output).toContain('\u001B[31mred')
    expect(stripAnsi(output)).toBe('red\nsafe')
    expect(output).not.toContain('[2J')
    expect(output).not.toContain(']52')
    expect(output).not.toContain('secret')
    expect(output).not.toContain('image')
  })

  it('parses Fastfetch palette placeholders and literal dollars', () => {
    vi.stubEnv('NO_COLOR', '1')
    const logo = parseThemeIndexedLogo('$[2]seek$$tty\n$[7]safe')
    expect(logo.lines).toEqual(['seek$tty', 'safe'])
    expect(logo.width).toBe(8)
  })

  it('resolves workspace-relative UTF-8 files and rejects oversized dimensions', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const directory = await mkdtemp(join(tmpdir(), 'seektty-welcome-logo-'))
    await writeFile(join(directory, 'logo.txt'), '$[1]SeekTTY', 'utf8')
    const loaded = await loadWelcomeLogoFile('logo.txt', directory, 'theme')
    expect(loaded.path).toBe(join(directory, 'logo.txt'))
    expect(loaded.logo.lines).toEqual(['SeekTTY'])

    await writeFile(join(directory, 'wide.txt'), 'x'.repeat(257), 'utf8')
    await expect(loadWelcomeLogoFile('wide.txt', directory, 'original')).rejects.toThrow('256 columns')
  })
})
