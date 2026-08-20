import { Context } from '@deepseek-ai/cordis'
import { imageLimitsProjectionSchema } from '@deepseek-ai/dsh-host-apiproxy/api/sessions.schema'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as attachmentCompat from '../src/host/attachment-compat.ts'

const OFFICIAL_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Official rc.6/rc.7 LocalAttachmentStore shape (frozen, no maxImageDimension). */
function officialLegacyLimits(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.freeze({
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    mediaTypes: OFFICIAL_MEDIA_TYPES,
    ...extra,
  })
}

function officialRc8Limits(): Record<string, unknown> {
  return Object.freeze({
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    maxImageDimension: 8192,
    mediaTypes: OFFICIAL_MEDIA_TYPES,
  })
}

async function bootCompat(imageLimits: unknown): Promise<{
  attachments: { imageLimits: unknown }
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const attachments = { imageLimits }
  ctx.provide('attachments', attachments)
  const fiber = await ctx.plugin(attachmentCompat)
  return { attachments, dispose: () => fiber.dispose() }
}

describe('seektty/attachment-compat', () => {
  it('normalizes the exact valid legacy capability and derives maxImageDimension from maxImagePixels', async () => {
    const original = officialLegacyLimits()
    expect(imageLimitsProjectionSchema.safeParse(original).success).toBe(false)
    const { attachments, dispose } = await bootCompat(original)
    expect(attachments.imageLimits).not.toBe(original)
    expect(attachments.imageLimits).toEqual({
      ...original,
      maxImageDimension: 40_000_000,
    })
    expect(imageLimitsProjectionSchema.safeParse(attachments.imageLimits).success).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(original, 'maxImageDimension')).toBe(false)
    await dispose()
  })

  it('leaves a native rc.8 object unchanged by identity', async () => {
    const original = officialRc8Limits()
    const { attachments, dispose } = await bootCompat(original)
    expect(attachments.imageLimits).toBe(original)
    expect(imageLimitsProjectionSchema.safeParse(attachments.imageLimits).success).toBe(true)
    await dispose()
    expect(attachments.imageLimits).toBe(original)
  })

  it('does not normalize malformed objects missing or invalid required fields', async () => {
    const cases: unknown[] = [
      officialLegacyLimits({ maxImageBytes: undefined }),
      { ...officialLegacyLimits(), maxImagePixels: undefined },
      { ...officialLegacyLimits(), maxImagePixels: 0 },
      { ...officialLegacyLimits(), maxImagePixels: 1.5 },
      { ...officialLegacyLimits(), maxImagesPerMessage: '20' },
      { ...officialLegacyLimits(), mediaTypes: 'image/png' },
      { ...officialLegacyLimits(), mediaTypes: [1] },
      { ...officialLegacyLimits(), maxImageDimension: undefined },
      { ...officialLegacyLimits(), maxImageDimension: '8192' },
      { maxImagePixels: 40_000_000, mediaTypes: [...OFFICIAL_MEDIA_TYPES] },
      null,
      undefined,
      {},
    ]
    for (const original of cases) {
      const { attachments, dispose } = await bootCompat(original)
      expect(attachments.imageLimits, JSON.stringify(original)).toBe(original)
      expect(imageLimitsProjectionSchema.safeParse(attachments.imageLimits).success).toBe(false)
      await dispose()
      expect(attachments.imageLimits).toBe(original)
    }
  })

  it('restores the exact original imageLimits on cleanup', async () => {
    const original = officialLegacyLimits()
    const { attachments, dispose } = await bootCompat(original)
    expect(attachments.imageLimits).not.toBe(original)
    await dispose()
    expect(attachments.imageLimits).toBe(original)
    expect(Object.prototype.hasOwnProperty.call(original, 'maxImageDimension')).toBe(false)
  })

  it('does not clobber a newer imageLimits owner on cleanup', async () => {
    const original = officialLegacyLimits()
    const { attachments, dispose } = await bootCompat(original)
    expect(attachments.imageLimits).not.toBe(original)
    const newer = officialRc8Limits()
    attachments.imageLimits = newer
    await dispose()
    expect(attachments.imageLimits).toBe(newer)
  })

  it('preserves unknown future extra fields on a valid legacy object', async () => {
    const original = officialLegacyLimits({ futureFlag: true, extraLimit: 3 })
    const { attachments, dispose } = await bootCompat(original)
    const next = attachments.imageLimits as Record<string, unknown>
    expect(next).not.toBe(original)
    expect(next.futureFlag).toBe(true)
    expect(next.extraLimit).toBe(3)
    expect(next.maxImageDimension).toBe(40_000_000)
    expect(next.mediaTypes).toBe(OFFICIAL_MEDIA_TYPES)
    expect(original.futureFlag).toBe(true)
    await dispose()
    expect(attachments.imageLimits).toBe(original)
  })

  it('matches hosts by capability shape and does not branch on dsh versions', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/host/attachment-compat.ts'), 'utf8')
    expect(source).not.toContain('compareDshVersion')
    expect(source).not.toMatch(/from ['"]\.\.\/dsh-compat/u)
  })
})
