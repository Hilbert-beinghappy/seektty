import { describe, expect, it, vi } from 'vitest'
import { lastFencedCode, copyTargets } from '../src/client/copy-content.ts'
import { OSC52_BYTE_LIMIT, osc52Sequence, writeClipboard } from '../src/client/clipboard.ts'

describe('copy content', () => {
  it('extracts the last fenced code block and lists newest-first copy targets', () => {
    expect(lastFencedCode('no fence')).toBeUndefined()
    expect(lastFencedCode('```ts\nfirst\n```\n```\nsecond\n```')).toBe('second')
    expect(copyTargets([
      { id: '1', text: 'older' },
      { id: '2', text: 'newer line' },
    ]).map(row => row.id)).toEqual(['2', '1'])
  })
})

describe('clipboard fallback', () => {
  it('writes OSC 52 for small payloads and falls back to pbcopy when OSC 52 is too large', async () => {
    const writeOsc52 = vi.fn()
    const spawn = vi.fn(() => ({ status: 0 }))
    await expect(writeClipboard('hello', {
      fallback: 'auto',
      platform: 'darwin',
      writeOsc52,
      spawn,
    })).resolves.toBe('osc52')
    expect(writeOsc52).toHaveBeenCalledWith(osc52Sequence('hello'))

    const large = 'x'.repeat(OSC52_BYTE_LIMIT + 1)
    await expect(writeClipboard(large, {
      fallback: 'auto',
      platform: 'darwin',
      writeOsc52,
      spawn,
    })).resolves.toBe('pbcopy')
    expect(spawn).toHaveBeenCalledWith('pbcopy', [], large)
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
})
