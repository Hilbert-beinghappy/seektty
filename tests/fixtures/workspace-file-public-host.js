/** Real unchanged rc.2 WorkspaceFiles/Gateway, disposable synthetic Session and Host backend. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
export async function workspaceFilePublicHost(nodeModules, cwd) {
  // Default to normal project dependency resolution; an explicit fixture root is portable.
  const require = nodeModules ? createRequire(join(nodeModules, '..', 'package.json')) : createRequire(import.meta.url)
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context, Service }, { TypertRegistry }, { TypertGatewayService }, { WorkspaceFiles }, { TYPERT }, { LocalFileSystem }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'),
    load('@deepseek-ai/dsh-api-workspace-files'), load('@deepseek-ai/dsh-api-workspace-files/typert'), load('@deepseek-ai/dsh-fs-local'),
  ])
  const ctx = new Context(), registry = new TypertRegistry(ctx)
  class Sessions extends Service {
    constructor() { super(ctx, 'sessions'); this.cwd = cwd }
    get(id) { return id === 'synthetic-host-file-session' ? { header: { cwd: this.cwd } } : undefined }
  }
  const sessions = new Sessions()
  ctx.provide('sandboxPolicy', { workspaceRoot: cwd })
  const fs = new LocalFileSystem(ctx, { cwd, diffBasisMaxBytes: 10 * 1024 * 1024 })
  const files = new WorkspaceFiles(ctx, { maxBytes: 65536, maxFileBytes: 65536, maxLines: 200, maxEntries: 100 })
  const unregister = registry.register(TYPERT)
  new TypertGatewayService(ctx, {})
  await Promise.resolve(); await Promise.resolve()
  return { ctx, sessions, fs, files, unregister, close: async () => { unregister(); await ctx.fiber.dispose() } }
}
