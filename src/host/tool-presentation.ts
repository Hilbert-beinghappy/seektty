/** Render-intent adapter for the raw event journal in dsh 0.1.5-rc.1. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type { ToolEventView } from '../../vendor/api-contract/api/events.js'
import type { ToolPresenterScope } from './tool-presenter-scope.ts'

/** Native follow/page no longer decorate tool events; invoke the scoped registered presenter. */
export function presentToolEvent(ctx: Context, event: SessionEvent,
  history: readonly SessionEvent[], scope: ToolPresenterScope): ToolEventView | undefined {
  if (event.type !== 'tool/call' && event.type !== 'tool/result') return undefined
  try {
    if (event.type === 'tool/call') {
      const view = ctx.tools.get(event.data.name, scope)?.presentCall?.(JSON.parse(event.data.arguments))
      return view === undefined ? undefined : { for: 'call', view }
    }
    if (event.type !== 'tool/result') return undefined
    const callId = event.data.message.source.callId
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const call = history[index]!
      if (call.seq > event.seq || call.type !== 'tool/call' || call.data.callId !== callId) continue
      const result = event.data.message.content[0]
      const view = ctx.tools.get(call.data.name, scope)?.presentResult?.(JSON.parse(call.data.arguments), {
        content: result.content, isError: result.isError === true,
        ...(event.data.meta === undefined ? {} : { meta: event.data.meta }),
      })
      return view === undefined ? undefined : { for: 'result', view }
    }
  } catch {
    // Missing/malformed presenters retain the terminal's generic raw-result card.
  }
  return undefined
}
