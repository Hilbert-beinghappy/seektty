/** Read-only, leased scope resolution for native dsh 0.2.0-rc.2 presenters. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-tools'
import { z } from 'zod'

export type ToolPresenterScope = Parameters<Context['tools']['get']>[1]
export interface ToolPresenterLease extends AsyncDisposable {
  readonly scope: ToolPresenterScope
}

/** A preset's standing scope restores cold presentation without creating an Agent. */
export async function toolPresenterScope(ctx: Context, sessionId: SessionId, signal: AbortSignal): Promise<ToolPresenterLease> {
  signal.throwIfAborted()
  const unleased = (scope: ToolPresenterScope): ToolPresenterLease => ({ scope, async [Symbol.asyncDispose]() {} })
  const live = ctx.get('agents')?.get(sessionId)
  if (live !== undefined) return unleased(live)
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return unleased(undefined)
  using observation = await ctx.sessionQuery.observeSession(sessionId, { signal, projectionMode: 'all' })
  signal.throwIfAborted()
  // The native projection includes switches made after the immutable creation header.
  const preset = z.string().nullable().optional().parse(observation.projections?.values.agentPreset)
  try {
    const lease = await presets.acquireScope(preset ?? undefined)
    if (signal.aborted) {
      await lease[Symbol.asyncDispose]()
      signal.throwIfAborted()
    }
    return { scope: lease.key, [Symbol.asyncDispose]: () => lease[Symbol.asyncDispose]() }
  } catch {
    signal.throwIfAborted()
    // Deleted or unusable presets retain generic history, as in the former Host API.
    return unleased(undefined)
  }
}
