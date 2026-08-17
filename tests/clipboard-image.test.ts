import { describe, expect, it } from 'vitest'
import { PNG_MAGIC, captureClipboardImage, isPng } from '../src/client/clipboard-image.ts'

const png = Buffer.concat([PNG_MAGIC, Buffer.from('payload')])

describe('clipboard image capture', () => {
  it('writes pngpaste output on macOS and wl-paste stdout on Linux', () => {
    const written: Array<{ path: string; bytes: Buffer }> = []
    expect(captureClipboardImage({
      platform: 'darwin',
      dest: '/tmp/seektty-paste.png',
      spawn: (command, args) => {
        expect(command).toBe('pngpaste')
        expect(args).toEqual(['/tmp/seektty-paste.png'])
        return { status: 0, stdout: Buffer.alloc(0) }
      },
      writeFile: (path, bytes) => { written.push({ path, bytes }) },
      readFile: () => png,
    })).toBe('/tmp/seektty-paste.png')
    expect(written).toEqual([])

    expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: (command) => command === 'wl-paste'
        ? { status: 0, stdout: png }
        : { status: 1, stdout: Buffer.alloc(0) },
      writeFile: (path, bytes) => { written.push({ path, bytes }) },
      readFile: () => png,
    })).toBe('/tmp/seektty-paste.png')
    expect(written[0]?.path).toBe('/tmp/seektty-paste.png')
    expect(isPng(png)).toBe(true)
    expect(isPng(Buffer.from('not png'))).toBe(false)
  })

  it('falls back from wl-paste to xclip on Linux', () => {
    const written: Buffer[] = []
    expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: (command) => command === 'xclip'
        ? { status: 0, stdout: png }
        : { status: 1, stdout: Buffer.alloc(0) },
      writeFile: (_path, bytes) => { written.push(bytes) },
      readFile: () => png,
    })).toBe('/tmp/seektty-paste.png')
    expect(written[0]?.equals(png)).toBe(true)
  })

  it('returns undefined when no platform clipboard tool has a PNG', () => {
    expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: () => ({ status: 1, stdout: Buffer.alloc(0) }),
      writeFile: () => undefined,
      readFile: () => Buffer.alloc(0),
    })).toBeUndefined()
  })
})
