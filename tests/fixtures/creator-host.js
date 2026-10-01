/** Published Host services over a disposable synthetic Profile. No model or npm operation. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
export async function creatorHost(nodeModules, root) {
  const require = createRequire(join(nodeModules, '..', 'package.json'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context }, { default: Loader }, { default: Include, applyEntryPatches, entryListSchema }, yaml,
    { ToolRuntime }, { SessionStore }, { ApprovalService }, { createScope },
    { PluginManager }, pluginTools, inspectTools, inspectHost, { CordisInspectRegistryService }, { default: AgentPreset }, { readProfilePatches }] = await Promise.all([
      load('@deepseek-ai/cordis'), load('@deepseek-ai/cordis-plugin-loader'), load('@deepseek-ai/cordis-plugin-include'), load('js-yaml'),
      load('@deepseek-ai/dsh-tools'), load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-user-approval'), load('@deepseek-ai/dsh-scope'),
      load('@deepseek-ai/dsh-plugin-manager'), load('@deepseek-ai/dsh-plugin-manager/tools'), load('@deepseek-ai/dsh-tool-cordis'),
      load('@deepseek-ai/dsh-tool-cordis/host'), load('@deepseek-ai/dsh-cordis-host-runner'), load('@deepseek-ai/dsh-agent-preset'), load('@deepseek-ai/dsh-app-boot'),
    ])
  const ctx = new Context()
  try {
    const profile = join(root, 'profile'), patchPath = join(profile, 'cordis.patch.yml')
    mkdirSync(profile, { recursive: true }); mkdirSync(join(root, 'home'))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
    const entryFile = join(root, 'entry.mjs'); writeFileSync(entryFile, "export const name = 'synthetic-safe-plugin'; export function apply() {}\n")
    const patch = [{ insert: [{ id: 'synthetic-entry', name: pathToFileURL(entryFile).href }] }]
    writeFileSync(patchPath, yaml.dump(patch)); writeFileSync(join(root, 'entries.yml'), '[]\n')
    ctx.provide('profileContext', { name: 'synthetic', dir: profile, patchPath, installAnchor: join(profile, 'package.json'), cwd: root,
      home: join(root, 'home'), startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, context: () => () => {}, getSectionOrder: () => 0, getContextOrder: () => 0 })
    const tools = new ToolRuntime(ctx), sessions = new SessionStore(ctx)
    new ApprovalService(ctx, { policy: 'ask' })
    ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write' }) })
    let approval = 'rejected'
    const asks = []; ctx.on('approval/request', request => { asks.push(request); return approval })
    await ctx.plugin(Loader, { baseUrl: pathToFileURL(join(root, 'package.json')).href })
    await ctx.loader.create({ id: 'include', name: require.resolve('@deepseek-ai/cordis-plugin-include'), config: { path: join(root, 'entries.yml'), patches: patch } })
    await ctx.loader.await()
    await ctx.plugin(PluginManager, PluginManager.Config({})); const manager = ctx.get('pluginManager')
    new CordisInspectRegistryService(ctx, 100)
    inspectHost.apply(ctx)
    const owner = id => { const agent = { id, session: sessions.create(id, { meta: {} }) }; agent.session.append('turn/start', { turn: 1 }); agent.ctx = createScope(ctx, agent).ctx; return agent }
    const creator = owner('synthetic-creator'), standard = owner('synthetic-standard')
    await creator.ctx.plugin(pluginTools); await creator.ctx.plugin(inspectTools)
    let sequence = 0
    return { ctx, tools, manager, creator, standard, asks, inspectHost, AgentPreset, yaml, entryListSchema, applyEntryPatches, require,
      restartEnabled: async () => {
        const restarted = new Context()
        try {
          await restarted.plugin(Loader, { baseUrl: pathToFileURL(join(root, 'package.json')).href })
          await restarted.loader.create({ id: 'include', name: require.resolve('@deepseek-ai/cordis-plugin-include'),
            config: { path: join(root, 'entries.yml'), patches: readProfilePatches('dsh', ctx.get('profileContext')) } })
          await restarted.loader.await()
          const entry = [...restarted.loader.entries()].find(row => row.options.id === 'synthetic-entry')
          if (!entry) throw new Error('Restart lost the persisted plugin entry')
          return !entry.disabled
        } finally { await restarted.fiber.dispose() }
      },
      approve: value => { approval = value }, patch: () => readFileSync(patchPath, 'utf8'),
      run: (name, arguments_, agent = creator, signal = new AbortController().signal) => tools.execute({ agent, name, arguments: arguments_, callId: `creator-fixture-${sequence++}`, signal }),
      dispose: () => ctx.fiber.dispose(),
    }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
