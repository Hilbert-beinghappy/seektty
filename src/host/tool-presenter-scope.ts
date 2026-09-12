/** Read-only scope resolution for native dsh 0.1.5-rc.1 tool presenters. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-tools'
import { z } from 'zod'

export type ToolPresenterScope = Parameters<Context['tools']['get']>[1]

/** A preset's standing scope restores cold presentation without creating an Agent. */
export async function toolPresenterScope(ctx: Context, sessionId: SessionId, signal: AbortSignal): Promise<ToolPresenterScope> {
  signal.throwIfAborted()
  const live = ctx.get('agents')?.get(sessionId)
  if (live !== undefined) return live
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return undefined
  using observation = await ctx.sessionQuery.observeSession(sessionId, { signal, projectionMode: 'all' })
  signal.throwIfAborted()
  // The native projection includes switches made after the immutable creation header.
  const preset = z.string().nullable().optional().parse(observation.projections?.values.agentPreset)
  try {
    const scope = await presets.standingKeyFor(preset ?? undefined)
    signal.throwIfAborted()
    return scope
  } catch {
    signal.throwIfAborted()
    // Deleted or unusable presets retain generic history, as in the former Host API.
    return undefined
  }
}
