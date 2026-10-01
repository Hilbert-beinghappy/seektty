import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-config-editor'
import type { TuiPrivacyEntry, TuiPrivacySnapshot } from '../protocol.ts'

function plainScalar(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function') return value.get()
  return value
}

/** Read only known policy scalars from actual mounted instances, never credentials or endpoints. */
export function readPrivacySnapshot(ctx: Context): TuiPrivacySnapshot {
  const entries: TuiPrivacyEntry[] = []
  for (const { entry } of ctx.configEditor.configuration()) {
    const name = entry.options.name
    const channel = name === '@deepseek-ai/dsh-session-log-deepseek' ? 'session-log'
      : name === '@deepseek-ai/dsh-session-telemetry-otel' ? 'feedback-otel' : undefined
    if (channel === undefined) continue
    const active = entry.fiber?.state === 2
    const config: unknown = active ? entry.fiber?.config : undefined
    const values = typeof config === 'object' && config !== null ? config as Record<string, unknown> : {}
    const policy = plainScalar(values[channel === 'session-log' ? 'enabled' : 'mode'])
    const maxBytes = plainScalar(values[channel === 'session-log' ? 'maxBytes' : 'maxRequestBytes'])
    entries.push({ channel, entryId: entry.options.id, active,
      policy: channel === 'session-log' ? policy === true ? 'enabled' : policy === false ? 'disabled' : 'unknown'
        : policy === 'FEEDBACK_ONLY' ? 'feedback-only' : policy === 'DISABLED' ? 'disabled' : 'unknown',
      ...(typeof maxBytes === 'number' && Number.isFinite(maxBytes) ? { maxBytes } : {}),
    })
  }
  return { profile: ctx.profileContext.name, entries }
}
