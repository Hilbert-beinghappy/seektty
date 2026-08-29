import { describe, expect, it } from 'vitest'
import {
  collectFastfetch,
  fastfetchArguments,
  parseFastfetchOutput,
} from '../src/host/fastfetch.ts'
import type { TuiWelcomeFastfetchRequest } from '../src/protocol.ts'

const safe: TuiWelcomeFastfetchRequest = {
  source: 'safe',
  modules: ['os', 'cpu', 'memory'],
  configPath: '',
}

describe('Fastfetch host adapter', () => {
  it('builds a shell-free safe preset and preserves user config selection', () => {
    expect(fastfetchArguments(safe, '__SEP__')).toEqual([
      '--config', 'none', '--logo', 'none', '--pipe', 'true', '--separator', '__SEP__',
      '--structure', 'os:cpu:memory',
    ])
    expect(fastfetchArguments({ ...safe, source: 'user-config', configPath: 'C:\\ff.jsonc' }, '__SEP__'))
      .toEqual(['--config', 'C:\\ff.jsonc', '--logo', 'none', '--pipe', 'true', '--separator', '__SEP__'])
  })

  it('parses fields and text while stripping terminal control data and module errors', () => {
    const rows = parseFastfetchOutput([
      'OS__SEP__Windows 11',
      '\u001b[31mCPU\u001b[0m__SEP__Ryzen',
      'Banner without a key',
      'Font__SEP__Error: unavailable',
      '\u001b]52;c;secret\u0007Clipboard__SEP__safe',
    ].join('\n'), '__SEP__')
    expect(rows).toEqual([
      { kind: 'field', label: 'OS', value: 'Windows 11' },
      { kind: 'field', label: 'CPU', value: 'Ryzen' },
      { kind: 'text', text: 'Banner without a key' },
      { kind: 'field', label: 'Clipboard', value: 'safe' },
    ])
  })

  it('runs an executable, captures its generated separator and returns semantic rows', async () => {
    const script = [
      "const index = process.argv.indexOf('--separator')",
      'const separator = process.argv[index + 1]',
      "process.stdout.write('OS' + separator + 'Test OS\\nCPU' + separator + 'Test CPU\\n')",
    ].join(';')
    const result = await collectFastfetch(safe, undefined, {
      command: process.execPath,
      prefixArgs: ['-e', script, '--'],
    })
    expect(result).toEqual({
      status: 'ok',
      rows: [
        { kind: 'field', label: 'OS', value: 'Test OS' },
        { kind: 'field', label: 'CPU', value: 'Test CPU' },
      ],
    })
  })

  it('classifies missing executables, timeouts and aborts without throwing', async () => {
    const missing = await collectFastfetch(safe, undefined, { command: `seektty-missing-${Date.now()}` })
    expect(missing.status).toBe('unavailable')

    const timeout = await collectFastfetch(safe, undefined, {
      command: process.execPath,
      prefixArgs: ['-e', 'setInterval(() => {}, 1000)', '--'],
      timeoutMs: 20,
    })
    expect(timeout.status).toBe('timeout')

    const controller = new AbortController()
    controller.abort()
    await expect(collectFastfetch(safe, controller.signal)).resolves.toEqual({ status: 'cancelled', rows: [] })
  })

  it('rejects oversized output', async () => {
    const result = await collectFastfetch(safe, undefined, {
      command: process.execPath,
      prefixArgs: ['-e', "process.stdout.write('x'.repeat(2048))", '--'],
      outputLimit: 128,
    })
    expect(result.status).toBe('error')
    expect(result.diagnostic).toContain('exceeded')
  })
})
