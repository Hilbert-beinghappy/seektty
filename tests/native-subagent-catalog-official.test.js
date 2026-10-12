import { Context, Service } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { readNativeSubagentCatalog } from '../src/host/native-subagent-catalog.ts'
const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
it.skipIf(!stock)('maps the actual published listDescendants algorithm, not durable listChildren identities, into terminal rows', async () => {
  const require = createRequire(join(stock, '..', 'seektty-catalog-fixture.cjs'))
  const { SubagentRuntime } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-subagent')).href)
  const ctx = new Context(), parent = { id: 'root' }, released = []
  const durable = new Map([
    ['root', [{ id: 'hot', createdAt: 123, mode: 'continuable', label: '真实热 Child' },
      { id: 'cold', createdAt: 124, mode: 'one-shot' }, { id: 'future', createdAt: 125, mode: 'unknown' }]],
    ['hot', [{ id: 'grandchild', createdAt: 126, mode: 'one-shot' }]], ['cold', []], ['future', []], ['grandchild', []],
  ])
  const sessions = new Service(ctx, 'sessions'); sessions.get = id => ['root', 'hot'].includes(id) ? {} : undefined
  const agents = new Service(ctx, 'agents'); agents.get = id => id === 'root' ? parent : undefined
  const query = new Service(ctx, 'sessionQuery')
  query.observeSession = async (id, options) => {
    options?.signal?.throwIfAborted()
    return { projections: { values: { subagentCatalog: durable.get(id) } }, [Symbol.dispose]: () => released.push(id) }
  }
  const subagents = new Service(ctx, 'subagents'); subagents.list = vi.fn(() => ['provider-name'])
  subagents.listChildren = SubagentRuntime.prototype.listChildren
  subagents.listDescendants = SubagentRuntime.prototype.listDescendants
  try {
    expect(await ctx.get('subagents').listChildren('root')).toEqual(durable.get('root'))
    expect(await readNativeSubagentCatalog(ctx, { parentSessionId: 'root' }, new AbortController().signal)).toEqual({
      parentAvailable: true, entries: [
        { kind: 'child', id: 'hot', mode: 'continuable', label: '真实热 Child', activity: 'running', hasChildren: true },
        { kind: 'child', id: 'cold', mode: 'one-shot', activity: 'inactive', hasChildren: false },
        { kind: 'diagnostic', id: 'future', reason: 'unsupported' },
      ],
    })
    expect(subagents.list).not.toHaveBeenCalled(); expect(released).toContain('grandchild')
  } finally { await ctx.fiber.dispose() }
})
