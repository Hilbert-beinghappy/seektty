import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { lastFencedCode, copyTargets } from '../src/client/copy-content.ts'
import {
  CLIPBOARD_READ_BYTE_LIMIT,
  OSC52_BYTE_LIMIT,
  osc52Sequence,
  readClipboardText,
  writeClipboard,
} from '../src/client/clipboard.ts'

const UTF8_CORPUS = [
  'plain text',
  '简体中文 · 繁體中文 · 日本語 · 한국어',
  'family 👨‍👩‍👧‍👦 · tone 👋🏽 · variation ✈️',
  'precomposed é · combining e\u0301',
  'line one\r\n\r\nline three',
].join('\n')

type WriterCall = [
  command: string,
  args: readonly string[],
  input: Buffer,
  env: Readonly<Record<string, string | undefined>> | undefined,
]

describe('copy content', () => {
  it('extracts the last fenced code block and lists newest-first copy targets', () => {
    expect(lastFencedCode('no fence')).toBeUndefined()
    expect(lastFencedCode('```ts\nfirst\n```\n```\nsecond\n```')).toBe('second')
    expect(copyTargets([
      { id: '1', text: 'older' },
      { id: '2', text: 'newer line' },
    ]).map(row => row.id)).toEqual(['2', '1'])
    expect(copyTargets([{ id: '3', text: '  keep edges  \n' }])[0]?.text).toBe('  keep edges  \n')
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/capabilities.ts'), 'utf8')
    expect(source).not.toMatch(/join\('\\n'\)\.trim\(\)/u)
  })
})

describe('clipboard fallback', () => {
  it('reports both OSC 52 and the final platform writer for small payloads', async () => {
    const writeOsc52 = vi.fn()
    const spawn = vi.fn((..._args: WriterCall) => ({ status: 0 }))
    await expect(writeClipboard('hello', {
      fallback: 'auto',
      platform: 'darwin',
      writeOsc52,
      spawn,
    })).resolves.toEqual({ finalMethod: 'pbcopy', succeeded: ['osc52', 'pbcopy'] })
    expect(writeOsc52).toHaveBeenCalledWith(osc52Sequence('hello'))
    expect(spawn).toHaveBeenCalledWith(
      'pbcopy',
      [],
      Buffer.from('hello', 'utf8'),
      { LC_ALL: undefined, LANG: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' },
    )

    const large = 'x'.repeat(OSC52_BYTE_LIMIT + 1)
    await expect(writeClipboard(large, {
      fallback: 'auto',
      platform: 'darwin',
      writeOsc52,
      spawn,
    })).resolves.toEqual({ finalMethod: 'pbcopy', succeeded: ['pbcopy'] })
    expect(spawn).toHaveBeenLastCalledWith(
      'pbcopy',
      [],
      Buffer.from(large, 'utf8'),
      { LC_ALL: undefined, LANG: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' },
    )
  })

  it.each([
    {
      platform: 'win32' as const,
      command: 'powershell.exe',
      method: 'powershell' as const,
      expectedArgs: /UTF8Encoding.*Set-Clipboard/u,
      expectedEnv: undefined,
    },
    {
      platform: 'darwin' as const,
      command: 'pbcopy',
      method: 'pbcopy' as const,
      expectedArgs: /^$/u,
      expectedEnv: { LC_ALL: undefined, LANG: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' },
    },
    {
      platform: 'linux' as const,
      command: 'wl-copy',
      method: 'wl-copy' as const,
      expectedArgs: /--type text\/plain;charset=utf-8/u,
      expectedEnv: undefined,
    },
  ])('writes the shared Unicode corpus through an explicit UTF-8 $platform contract', async ({
    platform,
    command,
    method,
    expectedArgs,
    expectedEnv,
  }) => {
    const spawn = vi.fn((..._args: WriterCall) => ({ status: 0 }))
    await expect(writeClipboard(UTF8_CORPUS, {
      fallback: 'auto',
      platform,
      writeOsc52: () => undefined,
      spawn,
    })).resolves.toEqual({ finalMethod: method, succeeded: ['osc52', method] })

    expect(spawn).toHaveBeenCalledOnce()
    const [actualCommand, args, input, env] = spawn.mock.calls[0] ?? []
    expect(actualCommand).toBe(command)
    expect((args ?? []).join(' ')).toMatch(expectedArgs)
    expect(input).toEqual(Buffer.from(UTF8_CORPUS, 'utf8'))
    expect(env).toEqual(expectedEnv)
    expect((args ?? []).join(' ')).not.toContain(UTF8_CORPUS)
    expect(Object.values(env ?? {}).join(' ')).not.toContain(UTF8_CORPUS)
  })

  it('falls from Wayland to an explicit X11 UTF8_STRING target without changing bytes', async () => {
    const spawn = vi.fn((...args: WriterCall) => ({ status: args[0] === 'wl-copy' ? 1 : 0 }))
    await expect(writeClipboard(UTF8_CORPUS, {
      fallback: 'auto',
      platform: 'linux',
      writeOsc52: () => undefined,
      spawn,
    })).resolves.toEqual({ finalMethod: 'xclip', succeeded: ['osc52', 'xclip'] })

    expect(spawn.mock.calls.map(call => [call[0], call[1]])).toEqual([
      ['wl-copy', ['--type', 'text/plain;charset=utf-8']],
      ['xclip', ['-selection', 'clipboard', '-target', 'UTF8_STRING']],
    ])
    expect(spawn.mock.calls.every(call => Buffer.compare(call[2], Buffer.from(UTF8_CORPUS, 'utf8')) === 0))
      .toBe(true)
  })

  it('keeps off as process-fallback-off and never invokes a platform writer', async () => {
    const spawn = vi.fn(() => ({ status: 0 }))
    await expect(writeClipboard('osc only', {
      fallback: 'off',
      platform: 'win32',
      writeOsc52: () => undefined,
      spawn,
    })).resolves.toEqual({ finalMethod: 'osc52', succeeded: ['osc52'] })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('measures the OSC 52 boundary in UTF-8 bytes instead of JavaScript code units', async () => {
    const inside = `${'界'.repeat(Math.floor(OSC52_BYTE_LIMIT / 3))}a`
    const outside = `${inside}b`
    const writeOsc52 = vi.fn()
    await expect(writeClipboard(inside, {
      fallback: 'osc52',
      platform: 'linux',
      writeOsc52,
    })).resolves.toEqual({ finalMethod: 'osc52', succeeded: ['osc52'] })
    await expect(writeClipboard(outside, {
      fallback: 'osc52',
      platform: 'linux',
      writeOsc52,
    })).rejects.toThrow('/export')
    expect(writeOsc52).toHaveBeenCalledOnce()
  })

  it('retains a successful OSC 52 write when every platform writer fails', async () => {
    await expect(writeClipboard('remote-safe', {
      fallback: 'auto',
      platform: 'linux',
      writeOsc52: () => undefined,
      spawn: () => ({ status: 1 }),
    })).resolves.toEqual({ finalMethod: 'osc52', succeeded: ['osc52'] })
  })

  it('refuses oversized OSC 52 when process fallback is disabled', async () => {
    await expect(writeClipboard('x'.repeat(OSC52_BYTE_LIMIT + 1), {
      fallback: 'osc52',
      platform: 'darwin',
      writeOsc52: () => undefined,
    })).rejects.toThrow('/export')
  })

  it('kills a hung clipboard fallback after the deadline and fails closed', async () => {
    const large = 'x'.repeat(OSC52_BYTE_LIMIT + 1)
    const killed: string[] = []
    const started = Date.now()
    await expect(writeClipboard(large, {
      fallback: 'auto',
      platform: 'darwin',
      writeOsc52: () => undefined,
      deadlineMs: 40,
      spawn: () => new Promise(() => undefined),
      kill: command => { killed.push(command) },
    })).rejects.toThrow(/deadline|剪贴板|export/i)
    expect(Date.now() - started).toBeLessThan(500)
    expect(killed).toEqual(['pbcopy'])
  })

  it('never includes clipboard payload bytes in a platform failure', async () => {
    const payload = `${UTF8_CORPUS}${'界'.repeat(OSC52_BYTE_LIMIT)}`
    const error = await writeClipboard(payload, {
      fallback: 'auto',
      platform: 'linux',
      writeOsc52: () => undefined,
      spawn: () => ({ status: 1 }),
    }).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(UTF8_CORPUS)
  })
})

describe('bounded clipboard text reads', () => {
  it('uses fixed platform commands and returns normalized plain text', async () => {
    const spawn = vi.fn((_command: string, _args: readonly string[]) => ({
      status: 0,
      stdout: Buffer.from('first\r\nsecond', 'utf8'),
    }))
    await expect(readClipboardText({ platform: 'win32', spawn })).resolves.toBe('first\nsecond')
    expect(spawn).toHaveBeenCalledOnce()
    expect(spawn.mock.calls[0]?.[0]).toBe('powershell.exe')
    expect(spawn.mock.calls[0]?.[1].join(' ')).toContain('Get-Clipboard -Raw')
  })

  it('falls through unavailable readers without passing clipboard bytes as arguments', async () => {
    const spawn = vi.fn((command: string, _args: readonly string[]) => command === 'wl-paste'
      ? { status: 1 }
      : { status: 0, stdout: 'safe text' })
    await expect(readClipboardText({ platform: 'linux', spawn })).resolves.toBe('safe text')
    expect(spawn.mock.calls.map(call => call[0])).toEqual(['wl-paste', 'xclip'])
    expect(spawn.mock.calls.flatMap(call => call[1])).not.toContain('safe text')
  })

  it('rejects terminal controls and over-limit output without returning partial text', async () => {
    await expect(readClipboardText({
      platform: 'darwin',
      spawn: () => ({ status: 0, stdout: 'safe\u001B[2Junsafe' }),
    })).rejects.toThrow(/control|控制/u)
    await expect(readClipboardText({
      platform: 'darwin',
      maxBytes: 4,
      spawn: () => ({ status: 0, stdout: '12345' }),
    })).rejects.toThrow(/limit|上限/u)
    expect(CLIPBOARD_READ_BYTE_LIMIT).toBeGreaterThan(OSC52_BYTE_LIMIT)
  })

  it('times out an injected hung reader and reports no clipboard contents', async () => {
    const killed: string[] = []
    await expect(readClipboardText({
      platform: 'darwin',
      deadlineMs: 30,
      spawn: () => new Promise(() => undefined),
      kill: command => { killed.push(command) },
    })).rejects.toThrow(/reader|读取器/u)
    expect(killed).toEqual(['pbpaste'])
  })
})
