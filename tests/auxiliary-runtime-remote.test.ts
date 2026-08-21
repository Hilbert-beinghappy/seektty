import { describe, expect, it, vi } from 'vitest'
import {
  AUXILIARY_RUNTIME_API_CHANNEL,
  AUXILIARY_RUNTIME_SNAPSHOT_ENDPOINT,
  parseAuxiliaryUsageSnapshot,
  readAuxiliaryUsageSnapshot,
} from '../src/client/auxiliary-runtime-remote.ts'

const official = {
  uncachedInputTokens: 10,
  outputTokens: 2,
  cacheReadTokens: 3,
  cacheWriteTokens: 1,
}
const auxiliary = {
  uncachedInputTokens: 5,
  outputTokens: 7,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}
const combined = {
  uncachedInputTokens: 15,
  outputTokens: 9,
  cacheReadTokens: 3,
  cacheWriteTokens: 1,
}

function snapshot(overrides: Record<string, unknown> = {}): unknown {
  return {
    official,
    auxiliary,
    combined,
    capability: { ok: true, officialProjection: true, domain: true },
    ...overrides,
  }
}

describe('auxiliary runtime usage Remote', () => {
  it('reads the public snapshot endpoint without manufacturing a projection', async () => {
    const rpc = vi.fn(async () => ({ ok: true, value: snapshot() }))
    await expect(readAuxiliaryUsageSnapshot(rpc, 'session-1')).resolves.toEqual(snapshot())
    expect(rpc).toHaveBeenCalledWith(
      AUXILIARY_RUNTIME_API_CHANNEL,
      AUXILIARY_RUNTIME_SNAPSHOT_ENDPOINT,
      { args: { sessionId: 'session-1' } },
      undefined,
    )
  })

  it('silently treats absence and transport failure as optional capability loss', async () => {
    await expect(readAuxiliaryUsageSnapshot(async () => ({ ok: false } as const), 'session-1')).resolves.toBeUndefined()
    await expect(readAuxiliaryUsageSnapshot(async () => { throw new Error('offline') }, 'session-1')).resolves.toBeUndefined()
  })

  it('rejects malformed, negative, unsafe, or client-inconsistent combined values', () => {
    expect(parseAuxiliaryUsageSnapshot(null)).toBeUndefined()
    expect(parseAuxiliaryUsageSnapshot(snapshot({
      auxiliary: { ...auxiliary, outputTokens: -1 },
    }))).toBeUndefined()
    expect(parseAuxiliaryUsageSnapshot(snapshot({
      combined: { ...combined, outputTokens: combined.outputTokens + 1 },
    }))).toBeUndefined()
    expect(parseAuxiliaryUsageSnapshot(snapshot({
      official: { ...official, uncachedInputTokens: Number.MAX_SAFE_INTEGER },
    }))).toBeUndefined()
  })

  it('parses degraded capability without presenting it as healthy', () => {
    expect(parseAuxiliaryUsageSnapshot(snapshot({
      capability: { ok: false, officialProjection: false, domain: true, reason: 'projection unavailable' },
    }))).toMatchObject({
      capability: { ok: false, officialProjection: false, domain: true, reason: 'projection unavailable' },
    })
  })
})
