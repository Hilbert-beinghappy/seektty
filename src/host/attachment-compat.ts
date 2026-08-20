/** SeekTTY Host adapter for official dsh 0.1.0-rc.6–rc.8 imageLimits. */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'seektty-attachment-compat'

/**
 * Wait for the official attachments store. This plugin is listed immediately
 * before `api-gateway` in `cordis.patch.yml` so, once `attachments` exists, it
 * becomes ACTIVE before `@deepseek-ai/dsh-host-apiproxy` registers the rc.8
 * `imageLimits` projection that reads `ctx.attachments.imageLimits`.
 */
export const inject = ['attachments']

const REQUIRED_POSITIVE_INTS = [
  'maxImageBytes',
  'maxImagesPerMessage',
  'maxMessageImageBytes',
  'maxImagePixels',
] as const

interface AttachmentLimitsHost {
  imageLimits: unknown
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * True only for the exact valid legacy capability: official rc.6/rc.7
 * `ImageAttachmentLimits` fields are present and well-typed, and
 * `maxImageDimension` is absent. Any other shape is left to rc.8 schema.
 */
export function isLegacyImageLimits(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  if ('maxImageDimension' in row) return false
  for (const key of REQUIRED_POSITIVE_INTS) {
    if (!isPositiveInt(row[key])) return false
  }
  return isStringArray(row.mediaTypes)
}

/**
 * Conservative per-side bound implied by a positive pixel count: a 1×N image
 * has one dimension equal to `maxImagePixels`.
 * @param maxImagePixels - already-validated positive integer pixel count.
 */
export function deriveMaxImageDimension(maxImagePixels: number): number {
  return maxImagePixels
}

/**
 * Return a new object only for the exact valid legacy shape. Native rc.8
 * objects and malformed/unknown shapes keep the same identity.
 * @param value - live `attachments.imageLimits`.
 */
export function normalizeLegacyImageLimits<T>(value: T): T {
  if (!isLegacyImageLimits(value)) return value
  return {
    ...value,
    maxImageDimension: deriveMaxImageDimension(value.maxImagePixels as number),
  }
}

/**
 * Replace `attachments.imageLimits` when the official store still publishes
 * the frozen rc.6/rc.7 capability. Official `LocalAttachmentStore` freezes
 * that object, so the field is replaced rather than mutated. The fiber
 * disposer restores the original reference only while `imageLimits` is
 * still strictly identical to the normalized object.
 * @param ctx - Host context that already has `attachments`.
 */
export function apply(ctx: Context): void {
  const attachments = ctx.get('attachments') as AttachmentLimitsHost | undefined
  if (attachments === undefined) return
  const original = attachments.imageLimits
  const next = normalizeLegacyImageLimits(original)
  if (next === original) return
  attachments.imageLimits = next
  ctx.effect(() => () => {
    if (attachments.imageLimits === next) attachments.imageLimits = original
  }, 'seektty/attachment-compat: restore imageLimits')
}
