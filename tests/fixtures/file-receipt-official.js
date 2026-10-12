/** Published rc.2 services; only Agent execution and Connection admission are fixture seams.
 * Stock node_modules is read-only, storage and workspace are newly created by the test.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function officialFileReceiptFixture(stockNodeModules, root) {
  const require = createRequire(join(stockNodeModules, '..', 'seektty-file-fixture.cjs'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { FileUploads }, { LocalAttachmentStore },
    { SessionStore }, { default: SessionProjectionService }, { SessionController }, { LocalFileReferenceService },
    { createScope }, { OperatorPeer }, { TYPERT: uploadContract }, { TYPERT: sessionContract }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'),
    load('@deepseek-ai/dsh-client-file-upload'), load('@deepseek-ai/dsh-attachment-local'),
    load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-session-projection'), load('@deepseek-ai/dsh-api-session-controller'),
    load('@deepseek-ai/dsh-file-reference-local'), load('@deepseek-ai/dsh-scope'), load('@deepseek-ai/dsh-client-connection'),
    load('@deepseek-ai/dsh-client-file-upload/typert'), load('@deepseek-ai/dsh-api-session-controller/typert'),
  ])
  const ctx = new Context()
  try {
  const routes = new Map()
  const operator = new OperatorPeer(ctx)
  ctx.provide('connection', { operator, rpc: { intercept: () => () => {} }, fetch: { register: route => {
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  } } })
  const registry = new TypertRegistry(ctx)
  registry.register(uploadContract); registry.register(sessionContract)
  const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30_000, streamInboxBytes: 1_048_576 })
  const sessions = new SessionStore(ctx)
  new SessionProjectionService(ctx)
  const attachments = new LocalAttachmentStore(ctx, { dshHome: join(root, 'isolated-home') })
  const agents = new Map()
  ctx.provide('agents', { get: id => agents.get(id), list: () => [...agents.values()] })
  // Real service enforces createScope identity; this inert Agent never runs a model.
  function agent(id) {
    const session = sessions.create(id, { meta: { cwd: root } })
    const value = { id, session, inbox: { nextStep: [], nextTurn: [] } }
    const scope = createScope(ctx, value)
    value.ctx = scope.ctx
    value.followup = message => value.inbox.nextTurn.push(message)
    value.steer = message => value.inbox.nextStep.push(message)
    agents.set(id, value)
    return value
  }
  const primary = agent('receipt-fixture')
  const foreign = agent('foreign-fixture')
  // Declaration from the published Agent provider; SessionController supplies resolver.
  registry.lookups.register('agent', { parameter: 'agent', wire: 'agentId',
    hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
    resolve: id => agents.get(id) })
  registry.contexts.registerHost('agent', { wire: 'agentId', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
    resolve: id => agents.get(id)?.ctx })
  ctx.provide('commands', { registerFileReceiptResolver: () => () => {} })
  const uploads = new FileUploads(ctx)
  new LocalFileReferenceService(ctx)
  const controller = new SessionController(ctx, { nativeOpen: false })
  await new Promise(resolve => setTimeout(resolve, 0))
  return { ctx, gateway, uploads, attachments, primary, foreign, routes, controller,
    dispose: () => ctx.fiber.dispose() }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
