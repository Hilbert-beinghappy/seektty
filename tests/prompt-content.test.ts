import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { TuiClientContext } from '../src/client/context.ts'

const temporaryDirs: string[] = []

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function pngWithSize(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24)
  bytes[0] = 0x89
  bytes[1] = 0x50
  bytes[2] = 0x4e
  bytes[3] = 0x47
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function jpegWithSize(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(20)
  bytes[0] = 0xff
  bytes[1] = 0xd8
  bytes[2] = 0xff
  bytes[3] = 0xc0
  bytes.writeUInt16BE(11, 4)
  bytes[6] = 8
  bytes.writeUInt16BE(height, 7)
  bytes.writeUInt16BE(width, 9)
  return bytes
}

function generousLimits(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    maxImageBytes: 20 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 200 * 1024 * 1024,
    maxImagePixels: 64_000_000,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    ...extra,
  }
}

function capabilitiesFor(workspace: string, limits: Record<string, unknown> | undefined): HarnessTuiCapabilities {
  const sessionId = 'session-1'
  const ctx = {
    remote: { $on() { return undefined } },
    on() { return undefined },
    sessions: {
      list: {
        getSnapshot: () => ({
          current: sessionId,
          byId: { [sessionId]: { cwd: workspace } },
        }),
      },
      binding: () => ({
        session: {
          projections: {
            faceOf: (key: string) => ({
              getSnapshot: () => key === 'imageLimits' ? limits : undefined,
            }),
          },
        },
      }),
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: [] }) },
    },
  }
  return new HarnessTuiCapabilities(ctx as unknown as TuiClientContext, {} as never, 'tui', workspace)
}

function assertImageWire(
  part: { type: string },
  expected: { mediaType: string; data: string; name: string },
  absolutePath: string,
): void {
  expect(part).toEqual({
    type: 'image',
    mediaType: expected.mediaType,
    data: expected.data,
    name: expected.name,
  })
  expect(Object.keys(part).sort()).toEqual(['data', 'mediaType', 'name', 'type'])
  expect(JSON.stringify(part)).not.toContain(absolutePath)
  expect(JSON.stringify(part)).not.toContain('path')
}

describe('promptContent wire', () => {
  it('sends PNG image-only and JPEG image+text with mediaType/data/name only', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'seektty-prompt-'))
    temporaryDirs.push(workspace)
    const pngPath = join(workspace, 'shot.png')
    const jpegPath = join(workspace, 'photo.jpg')
    const png = pngWithSize(2, 2)
    const jpeg = jpegWithSize(3, 2)
    writeFileSync(pngPath, png)
    writeFileSync(jpegPath, jpeg)
    const capabilities = capabilitiesFor(workspace, generousLimits())

    await capabilities.addAttachment(pngPath)
    const imageOnly = capabilities.promptContent('')
    expect(imageOnly).toHaveLength(1)
    assertImageWire(imageOnly[0] as { type: string }, {
      mediaType: 'image/png',
      data: png.toString('base64'),
      name: 'shot.png',
    }, pngPath)

    capabilities.clearAttachments()
    await capabilities.addAttachment(jpegPath)
    const withText = capabilities.promptContent('what is this')
    expect(withText[0]).toEqual({ type: 'text', text: 'what is this' })
    expect(Object.keys(withText[0] as object).sort()).toEqual(['text', 'type'])
    assertImageWire(withText[1] as { type: string }, {
      mediaType: 'image/jpeg',
      data: jpeg.toString('base64'),
      name: 'photo.jpg',
    }, jpegPath)
  })
})

describe('client maxImageDimension preflight', () => {
  it('rejects a longer side when Host ImageLimits includes maxImageDimension', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'seektty-dimension-'))
    temporaryDirs.push(workspace)
    const path = join(workspace, 'wide.png')
    writeFileSync(path, pngWithSize(4, 2))
    const capabilities = capabilitiesFor(workspace, generousLimits({ maxImageDimension: 3 }))
    await expect(capabilities.addAttachment(path)).rejects.toThrow(/边长|side|dimension/u)
  })

  it('accepts the same image when the longest side is within maxImageDimension', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'seektty-dimension-ok-'))
    temporaryDirs.push(workspace)
    const path = join(workspace, 'ok.png')
    writeFileSync(path, pngWithSize(4, 2))
    const capabilities = capabilitiesFor(workspace, generousLimits({ maxImageDimension: 4 }))
    await expect(capabilities.addAttachment(path)).resolves.toMatchObject({ name: 'ok.png' })
  })

  it('does not treat a snapshot as ImageLimits when maxImageDimension is present but not a positive integer', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'seektty-dimension-bad-'))
    temporaryDirs.push(workspace)
    const path = join(workspace, 'wide.png')
    writeFileSync(path, pngWithSize(4, 2))
    for (const maxImageDimension of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
      const capabilities = capabilitiesFor(workspace, generousLimits({
        maxImageBytes: 1,
        maxImageDimension,
      }))
      await expect(capabilities.addAttachment(path), String(maxImageDimension)).resolves.toMatchObject({
        name: 'wide.png',
      })
    }
  })
})
