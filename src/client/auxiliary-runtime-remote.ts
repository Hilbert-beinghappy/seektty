/** Read-only auxiliary usage contract consumed through ConnectionHandle.rpc.call. */

export const AUXILIARY_RUNTIME_API_CHANNEL = '/api'
export const AUXILIARY_RUNTIME_SNAPSHOT_ENDPOINT = 'auxiliary-runtime/snapshot'

export interface AuxiliaryUsageBuckets {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

export interface AuxiliaryUsageSnapshot {
  readonly official: AuxiliaryUsageBuckets
  readonly auxiliary: AuxiliaryUsageBuckets
  readonly combined: AuxiliaryUsageBuckets
  readonly capability: {
    readonly ok: boolean
    readonly officialProjection: boolean
    readonly domain: boolean
    readonly reason?: string
  }
}

export type AuxiliaryRpcCaller = (
  channel: string,
  endpoint: string,
  payload: { readonly args: Record<string, unknown> },
  signal?: AbortSignal,
) => Promise<{ readonly ok: boolean; readonly value?: unknown; readonly error?: { readonly message?: string } }>

/**
 * Read and validate one provenance-preserving usage snapshot.
 * Absence, transport failures, and malformed values become undefined so an
 * optional consumer can preserve stock UI.
 */
export async function readAuxiliaryUsageSnapshot(
  rpc: AuxiliaryRpcCaller,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AuxiliaryUsageSnapshot | undefined> {
  try {
    const result = await rpc(
      AUXILIARY_RUNTIME_API_CHANNEL,
      AUXILIARY_RUNTIME_SNAPSHOT_ENDPOINT,
      { args: { sessionId } },
      signal,
    )
    if (!result.ok) return undefined
    return parseAuxiliaryUsageSnapshot(result.value)
  } catch {
    return undefined
  }
}

export function parseAuxiliaryUsageSnapshot(value: unknown): AuxiliaryUsageSnapshot | undefined {
  const record = objectRecord(value)
  const capability = objectRecord(record?.capability)
  const official = usageBuckets(record?.official)
  const auxiliary = usageBuckets(record?.auxiliary)
  const combined = usageBuckets(record?.combined)
  if (
    capability === undefined
    || typeof capability.ok !== 'boolean'
    || typeof capability.officialProjection !== 'boolean'
    || typeof capability.domain !== 'boolean'
    || official === undefined
    || auxiliary === undefined
    || combined === undefined
    || !combinedMatches(official, auxiliary, combined)
  ) return undefined
  return {
    official,
    auxiliary,
    combined,
    capability: {
      ok: capability.ok,
      officialProjection: capability.officialProjection,
      domain: capability.domain,
      ...(typeof capability.reason === 'string' ? { reason: capability.reason } : {}),
    },
  }
}

function usageBuckets(value: unknown): AuxiliaryUsageBuckets | undefined {
  const record = objectRecord(value)
  if (record === undefined) return undefined
  const values = [
    record.uncachedInputTokens,
    record.outputTokens,
    record.cacheReadTokens,
    record.cacheWriteTokens,
  ]
  if (values.some(item => typeof item !== 'number' || !Number.isSafeInteger(item) || item < 0)) return undefined
  return {
    uncachedInputTokens: values[0] as number,
    outputTokens: values[1] as number,
    cacheReadTokens: values[2] as number,
    cacheWriteTokens: values[3] as number,
  }
}

function combinedMatches(
  official: AuxiliaryUsageBuckets,
  auxiliary: AuxiliaryUsageBuckets,
  combined: AuxiliaryUsageBuckets,
): boolean {
  for (const key of ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const) {
    const expected = official[key] + auxiliary[key]
    if (!Number.isSafeInteger(expected) || combined[key] !== expected) return false
  }
  return true
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}
