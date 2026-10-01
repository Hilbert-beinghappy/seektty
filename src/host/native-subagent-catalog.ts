/** rc.2 listChildren is a durable identity projection, while listDescendants
 * supplies native UI activity/diagnostic rows. subagents.list lists provider names. */
import { symbols, type Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { subagentListRequestSchema, subagentListValueSchema } from '../../vendor/api-contract/api/subagents.schema.js'

function identity(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, symbols.original) ?? value : value
}
export async function readNativeSubagentCatalog(ctx: Context, payload: unknown, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted()
  const { parentSessionId } = subagentListRequestSchema.parse(payload)
  const service: unknown = ctx.get('subagents' as never)
  if (service === undefined || service === null) throw new Error('Native Subagent catalog service is unavailable')
  const list: unknown = Reflect.get(Object(service), 'listDescendants')
  if (typeof list !== 'function') throw new Error('Native listDescendants Host method is unavailable (tested dsh 0.2.0-rc.2)')
  const agents = ctx.get('agents')
  if (agents === undefined) throw new Error('Native Agent residency is unavailable')
  const parent = agents.get(SessionId(parentSessionId)), parentIdentity = identity(parent), serviceIdentity = identity(service)
  if (parent !== undefined && parent.id !== parentSessionId) throw new Error('Native parent identity mismatch')
  const descendants: unknown = await Reflect.apply(list, service, [parentSessionId, signal])
  if (!Array.isArray(descendants)) throw new Error('Malformed native descendant catalog')
  const entries = descendants.filter(row => {
    if (typeof row !== 'object' || row === null) throw new Error('Malformed native descendant row')
    const parent: unknown = Reflect.get(row, 'parentId'), depth: unknown = Reflect.get(row, 'depth')
    if (typeof parent !== 'string' || !Number.isSafeInteger(depth) || (depth as number) < 1) throw new Error('Malformed native descendant address')
    if ((parent === parentSessionId) !== (depth === 1)) throw new Error('Inconsistent native direct-parent address')
    return parent === parentSessionId
  })
  signal.throwIfAborted()
  const current = ctx.get('agents')?.get(SessionId(parentSessionId))
  if (identity(ctx.get('subagents' as never)) !== serviceIdentity || identity(current) !== parentIdentity) throw new Error('Subagent catalog scope changed; refresh required')
  // Residency is an observation, not proof of completion. Never warm a cold parent just to list its children.
  return subagentListValueSchema.parse({ entries, parentAvailable: current !== undefined })
}
