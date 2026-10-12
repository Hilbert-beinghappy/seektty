import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_IMAGE_BYTE_LIMIT,
  PNG_MAGIC,
  captureClipboardImage,
  createClipboardImageWorkspace,
  cleanupClipboardImageWorkspace,
  isPng,
  readCapturedClipboardImage,
} from '../src/client/clipboard-image.ts'

const png = Buffer.concat([PNG_MAGIC, Buffer.from('payload')])

describe('clipboard image capture', () => {
  it.each(['linux', 'darwin'] as const)('rejects over-budget %s image bytes and cleans failed captures', async (platform) => {
    const removed: string[] = []
    const writeFile = vi.fn()
    const oversized = Buffer.concat([PNG_MAGIC, Buffer.alloc(9)])
    await expect(captureClipboardImage({
      platform, dest: '/tmp/seektty-image-budget.png', maxBytes: 16,
      spawn: () => ({ status: 0, stdout: platform === 'linux' ? oversized : Buffer.alloc(0) }),
      readFile: () => oversized, writeFile,
      unlink: path => { removed.push(path) },
    })).resolves.toBeUndefined()
    expect(writeFile).not.toHaveBeenCalled()
    expect(removed).toHaveLength(4)
  })

  it('accepts an image exactly at the byte budget', async () => {
    const written: Buffer[] = []
    await expect(captureClipboardImage({
      platform: 'linux', dest: '/tmp/seektty-image-boundary.png', maxBytes: png.length,
      spawn: () => ({ status: 0, stdout: png }),
      writeFile: (_path, bytes) => { written.push(bytes) }, unlink: () => undefined,
    })).resolves.toBe('/tmp/seektty-image-boundary.png')
    expect(written).toEqual([png])
    expect(CLIPBOARD_IMAGE_BYTE_LIMIT).toBe(20 * 1024 * 1024)
  })

  it('falls back after a throwing helper or partial file write and removes the partial destination', async () => {
    const workspace = createClipboardImageWorkspace()
    try {
      let writes = 0
      await expect(captureClipboardImage({
        platform: 'linux', dest: workspace.dest,
        spawn: () => ({ status: 0, stdout: png }),
        writeFile: (path, bytes) => {
          writes += 1
          if (writes === 1) {
            writeFileSync(path, bytes.subarray(0, 3))
            throw new Error('partial write')
          }
          expect(existsSync(path)).toBe(false)
          writeFileSync(path, bytes)
        },
      })).resolves.toBe(workspace.dest)
      expect(readFileSync(workspace.dest)).toEqual(png)
      await expect(captureClipboardImage({
        platform: 'darwin', dest: workspace.dest,
        spawn: () => { writeFileSync(workspace.dest, png); throw new Error('helper failed') },
      })).resolves.toBeUndefined()
      expect(existsSync(workspace.dest)).toBe(false)
    } finally {
      cleanupClipboardImageWorkspace(workspace)
    }
    expect(existsSync(workspace.dir)).toBe(false)
  })

  it('bounds real captured-file reads and always cleans the private workspace on rejection', () => {
    const workspace = createClipboardImageWorkspace()
    writeFileSync(workspace.dest, Buffer.concat([PNG_MAGIC, Buffer.alloc(20)]))
    expect(() => readCapturedClipboardImage(workspace, { maxBytes: 16 })).toThrow(/limit/u)
    expect(existsSync(workspace.dir)).toBe(false)
    const injected = createClipboardImageWorkspace()
    expect(() => readCapturedClipboardImage(injected, {
      chmod: () => undefined, readFile: () => png, maxBytes: png.length - 1,
    })).toThrow(/limit/u)
    expect(existsSync(injected.dir)).toBe(false)
  })

  it('bounds a real stdout helper, kills a timed-out file writer, and handles ENOENT', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seektty-image-helper-'))
    const workspace = createClipboardImageWorkspace()
    try {
      writeFileSync(join(dir, 'wl-paste'), `#!${process.execPath}\nprocess.stdout.write(Buffer.from([${PNG_MAGIC.join(',')}])); setInterval(() => process.stdout.write(Buffer.alloc(65536)), 1)\n`, { mode: 0o700 })
      vi.stubEnv('PATH', dir)
      await expect(captureClipboardImage({ platform: 'linux', dest: workspace.dest, maxBytes: 16 }))
        .resolves.toBeUndefined()
      expect(existsSync(workspace.dest)).toBe(false)
      writeFileSync(join(dir, 'pngpaste'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.argv[2], Buffer.from([${PNG_MAGIC.join(',')}])); setInterval(() => {}, 1000)\n`, { mode: 0o700 })
      await expect(captureClipboardImage({ platform: 'darwin', dest: workspace.dest, deadlineMs: 100 }))
        .resolves.toBeUndefined()
      expect(existsSync(workspace.dest)).toBe(false)
      rmSync(join(dir, 'pngpaste'))
      await expect(captureClipboardImage({ platform: 'darwin', dest: workspace.dest })).resolves.toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
      cleanupClipboardImageWorkspace(workspace)
      rmSync(dir, { recursive: true, force: true })
    }
  })

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
