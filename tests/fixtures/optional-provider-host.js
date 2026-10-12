/** Unmodified official Host services and runtime; only the child MCP driver is synthetic. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
export async function optionalProviderHost(nodeModules, kind, log) {
  const require = createRequire(join(nodeModules, '..', 'package.json'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context }, { ToolRuntime }, { createScope, scopeTarget }, browser, computer, mcp, cua] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-tools'), load('@deepseek-ai/dsh-scope'),
    load('@deepseek-ai/dsh-browser-use'), load('@deepseek-ai/dsh-computer-use'),
    load('@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'), load('@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'),
  ])
  const ctx = new Context(), agents = new Map()
  try {
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    ctx.provide('agents', { get: id => agents.get(id) })
    const tools = new ToolRuntime(ctx)
    const registry = kind === 'browser' ? new browser.BrowserUseRegistry(ctx) : new computer.ComputerUseRegistry(ctx)
    const server = fileURLToPath(new URL('./optional-driver-stdio.mjs', import.meta.url))
    let fiber
    if (kind === 'browser') {
      fiber = await ctx.plugin({ name: 'synthetic-browser-provider', apply: child => mcp.mountSessionMcp(child, {
        name: 'synthetic-browser', exclusive: false, command: process.execPath, args: [server, log], toolCallTimeoutMs: 3000,
      }) })
    } else {
      fiber = await ctx.plugin(cua, cua.Config({ command: process.execPath, args: [server, log], reconnect: { enabled: false }, toolCallTimeoutMs: 3000 }))
    }
    await fiber.await()
    const agent = async id => {
      const value = { id, session: { header: {}, requestHeader: () => ({ config: { provider: 'synthetic', model: 'synthetic' } }) } }
      value.ctx = createScope(ctx, value).ctx; agents.set(id, value)
      await ctx.serial('agent/created', { agent: value, signal: new AbortController().signal })
      return value
    }
    const primary = await agent('synthetic-primary'), foreign = await agent('synthetic-foreign')
    const prefix = kind === 'browser' ? 'mcp__synthetic-browser__' : 'mcp__cua-driver-mcp__'
    let sequence = 0
    return { ctx, tools, registry, primary, foreign, agent, scopeTarget,
      enableImages: async home => {
        const { LocalAttachmentStore, Config } = await load('@deepseek-ai/dsh-attachment-local')
        const store = new LocalAttachmentStore(ctx, Config({ dshHome: home }))
        ctx.provide('llm', { resolveModelInfo: async () => ({ inputModalities: ['image'] }) })
        return store
      },
      run: (name, owner = primary, signal = new AbortController().signal) => tools.execute({ agent: owner, name: `${prefix}${name}`, callId: `synthetic-call-${sequence++}`, arguments: {}, signal }),
      unload: () => fiber.dispose(), dispose: () => ctx.fiber.dispose(),
    }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
