import { describe, expect, it } from 'vitest'
import {
  PNG_MAGIC,
  captureClipboardImage,
  createClipboardImageWorkspace,
  isPng,
  readCapturedClipboardImage,
} from '../src/client/clipboard-image.ts'

const png = Buffer.concat([PNG_MAGIC, Buffer.from('payload')])

describe('clipboard image capture', () => {
  it('creates a 0700 private workspace and 0600 dest, then deletes after read', () => {
    const created: Array<{ path: string; mode: number }> = []
    const removed: string[] = []
    const workspace = createClipboardImageWorkspace({
      tmpdir: '/tmp',
      mkdir: (path, mode) => { created.push({ path, mode }) },
      destName: 'paste.png',
    })
    expect(created).toEqual([{ path: workspace.dir, mode: 0o700 }])
    expect(workspace.dest.endsWith('paste.png')).toBe(true)
    const bytes = readCapturedClipboardImage(workspace, {
      readFile: path => {
        expect(path).toBe(workspace.dest)
        return png
      },
      chmod: (path, mode) => { created.push({ path, mode }) },
      unlink: path => { removed.push(path) },
      rmdir: path => { removed.push(path) },
    })
    expect(bytes.equals(png)).toBe(true)
    expect(created).toContainEqual({ path: workspace.dest, mode: 0o600 })
    expect(removed).toEqual([workspace.dest, workspace.dir])
  })

  it('kills a hung clipboard image probe after the deadline', async () => {
    const started = Date.now()
    await expect(captureClipboardImage({
      platform: 'darwin',
      dest: '/tmp/seektty-paste.png',
      deadlineMs: 40,
      spawn: () => new Promise(() => undefined),
    })).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('writes pngpaste output on macOS and wl-paste stdout on Linux', async () => {
    const written: Array<{ path: string; bytes: Buffer }> = []
    await expect(captureClipboardImage({
      platform: 'darwin',
      dest: '/tmp/seektty-paste.png',
      spawn: (command, args) => {
        expect(command).toBe('pngpaste')
        expect(args).toEqual(['/tmp/seektty-paste.png'])
        return { status: 0, stdout: Buffer.alloc(0) }
      },
      writeFile: (path, bytes) => { written.push({ path, bytes }) },
      readFile: () => png,
    })).resolves.toBe('/tmp/seektty-paste.png')
    expect(written).toEqual([])

    await expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: (command) => command === 'wl-paste'
        ? { status: 0, stdout: png }
        : { status: 1, stdout: Buffer.alloc(0) },
      writeFile: (path, bytes) => { written.push({ path, bytes }) },
      readFile: () => png,
    })).resolves.toBe('/tmp/seektty-paste.png')
    expect(written[0]?.path).toBe('/tmp/seektty-paste.png')
    expect(isPng(png)).toBe(true)
    expect(isPng(Buffer.from('not png'))).toBe(false)
  })

  it('falls back from wl-paste to xclip on Linux', async () => {
    const written: Buffer[] = []
    await expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: (command) => command === 'xclip'
        ? { status: 0, stdout: png }
        : { status: 1, stdout: Buffer.alloc(0) },
      writeFile: (_path, bytes) => { written.push(bytes) },
      readFile: () => png,
    })).resolves.toBe('/tmp/seektty-paste.png')
    expect(written[0]?.equals(png)).toBe(true)
  })

  it('returns undefined when no platform clipboard tool has a PNG', async () => {
    await expect(captureClipboardImage({
      platform: 'linux',
      dest: '/tmp/seektty-paste.png',
      spawn: () => ({ status: 1, stdout: Buffer.alloc(0) }),
      writeFile: () => undefined,
      readFile: () => Buffer.alloc(0),
    })).resolves.toBeUndefined()
  })

  it('falls back to osascript on macOS when pngpaste is missing', async () => {
    const commands: string[] = []
    await expect(captureClipboardImage({
      platform: 'darwin',
      dest: '/tmp/seektty-paste.png',
      spawn: (command, args) => {
        commands.push(command)
        if (command === 'pngpaste') return { status: null, stdout: Buffer.alloc(0) }
        expect(command).toBe('osascript')
        expect(args.join(' ')).toContain('/tmp/seektty-paste.png')
        return { status: 0, stdout: Buffer.alloc(0) }
      },
      writeFile: () => undefined,
      readFile: () => png,
    })).resolves.toBe('/tmp/seektty-paste.png')
    expect(commands).toEqual(['pngpaste', 'osascript'])
  })
})
