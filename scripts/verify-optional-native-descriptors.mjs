/** Read-only rc.2 npm artifact verification. Requires separately extracted official packages, not installed plugins. */
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { nativeMcpResourcePort, publishedScheduleMethods } from '../src/host/optional-native-views.ts'
import { McpResourceController } from '../src/client/mcp-resource-view.ts'
import { syntheticSchedules, scopedSource, freshSignal } from '../tests/fixtures/optional-native-views.ts'
const root = process.argv[2]
assert.ok(root, 'Pass the isolated directory containing extracted npm rc.2 artifacts')
const importArtifact = relative => import(pathToFileURL(path.resolve(root, relative)).href)
const expectedIntegrity = {
  schedule: '1eqTxT3gTs0qDynu0r63ciHIAP+tUNgOE964Y7WsfpzOyuE+CyF5FvZhxEdErVp84bakXehePUdKZ6Z+2IVIkw==',
  'agent-team': 'ds9BrnyJ+BAbxaH3J81c/+JJpk8jUtnpzUCyTXxrDW2nZOnFWqdPH/TZKAI1ttCuls218+RF4PPFPbhYaXNl6g==',
  'mcp-resources': 'ZP4B0DQPFlFpzUymv7GuZ2rwcyxTJ/xPAhn2r06yPUfUnwVFpcyt32ipOSAds8OnpHm9jEybRX4+lWzE8MK+JA==',
  subagent: '33izf4xhq03RzolYUjv223tKmeOBl8fMnvnRN15zZB3GWfNRcBTVUUxuu99rCN8TSRRt5A5ABTwYbObb1Isjqw==',
}
for (const [name, digest] of Object.entries(expectedIntegrity)) {
  assert.equal(createHash('sha512').update(await readFile(path.resolve(root, `${name}.tgz`))).digest('base64'), digest, `${name} official tarball integrity`)
  assert.equal(JSON.parse(await readFile(path.resolve(root, `${name}/package/package.json`), 'utf8')).version, '0.2.0-rc.2')
}
const { TYPERT } = await importArtifact('schedule/package/lib/typert.host.js')
assert.deepEqual(TYPERT.invocations.map(row => `${row.namespace}/${row.method}`).sort(), ['schedule/catalog', 'schedule/delete', 'schedule/history', 'schedule/list', 'schedule/update'])
for (const invocation of TYPERT.invocations) {
  assert.equal(invocation.invocation.kind, 'direct')
  assert.equal(invocation.service, 'schedule')
  assert.equal(invocation.result.mode, 'strict')
  assert.match(invocation.sourceLocation.file, /^packages\/schedule\/schedule\/src\/index.ts$/)
}
assert.deepEqual([...publishedScheduleMethods({ get: endpoint => TYPERT.invocations.find(row => `${row.namespace}/${row.method}` === endpoint) }, () => ({ catalog() {}, list() {}, history() {}, update() {}, delete() {} }))].sort(), TYPERT.invocations.map(row => `${row.namespace}/${row.method}`).sort())
const find = method => TYPERT.invocations.find(row => row.method === method)
find('catalog').result.create().parse(syntheticSchedules)
const entry = syntheticSchedules[0]
const { sessionId, status: _status, lastDelivery: _delivery, ...expected } = entry
const update = { sessionId, id: entry.id, expected, title: 'Synthetic edited', change: { kind: 'daily', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } } }
find('update').parameters[0].codec.create().parse(update)
assert.throws(() => find('update').parameters[0].codec.create().parse({ sessionId, id: entry.id }))
find('update').result.create().parse({ id: entry.id, updated: false, code: 'schedule_conflict' })
find('update').result.create().parse({ id: entry.id, updated: false, record: expected })
find('delete').result.create().parse({ id: entry.id, deleted: false, code: 'schedule_not_found' })
assert.throws(() => find('delete').result.create().parse({ id: entry.id }))
find('history').result.create().parse({ id: entry.id, records: [], earlierRecordsUnavailable: true, earlierRecordsPruned: false, retention: { days: 30, records: 200 } })
assert.equal(find('delete').cancellation.parameter, 'signal')
assert.equal(find('update').cancellation.parameter, 'signal')
const subagentDeclaration = await readFile(path.resolve(root, 'subagent/package/lib/typert.remote-client.d.ts'), 'utf8')
assert.match(subagentDeclaration, /'subagents\/prompt'/); assert.match(subagentDeclaration, /'subagents\/interruptByParent'/)
assert.doesNotMatch(subagentDeclaration, /'subagents\/list'/)
await assert.rejects(access(path.resolve(root, 'agent-team/package/lib/typert.host.js')))
await assert.rejects(access(path.resolve(root, 'mcp-resources/package/lib/typert.host.js')))
// Real official MCP resource registration + ToolRuntime pipeline, against a deterministic in-process provider.
// The Agent below is only an opaque scope key, not a live Host Agent; this proves registry/permission routing, not carrier authorization.
const require = createRequire(import.meta.url)
const toolRequire = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
const { SystemPrompt } = await import(pathToFileURL(toolRequire.resolve('@deepseek-ai/dsh-system-prompt')).href)
const { McpResourceRuntime } = await importArtifact('mcp-resources/package/lib/index.js')
const ctx = new Context(); new SystemPrompt(ctx, { includeHarnessIdentity: false, includeRuntimeContext: false }); const tools = new ToolRuntime(ctx)
const resources = new McpResourceRuntime(ctx)
let requests = 0
resources.register('synthetic', { request: async (request, exec) => { requests++; assert.equal(exec.agent.id, 'synthetic-root'); assert.equal(exec.signal.aborted, false); assert.equal(request.method, 'resources/list'); return { resources: [{ uri: 'synthetic://only-resource', name: 'Resource-only server' }] } } })
const agent = { id: 'synthetic-root' }
const port = nativeMcpResourcePort(() => tools, () => agent)
const controller = new McpResourceController(scopedSource().source, port)
assert.equal((await controller.page('synthetic', 'resources', freshSignal())).items[0].name, 'Resource-only server')
assert.equal(requests, 1)
resources.register('resource.only', { request: async request => request.method === 'resources/read' ? { contents: [{ uri: 'synthetic://only-resource', text: 'Dotted provider text' }] } : { resources: [{ uri: 'synthetic://only-resource', name: 'Dotted resource-only server' }] } })
assert.equal((await controller.page('resource.only', 'resources', freshSignal())).items[0].name, 'Dotted resource-only server')
assert.match(await controller.read('resource.only', 'synthetic://only-resource', freshSignal()), /Dotted provider text/)
const deny = ctx.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'Synthetic permission denial' }))
await assert.rejects(controller.page('synthetic', 'resources', freshSignal()), /Synthetic permission denial/)
assert.equal(requests, 1); deny()
await assert.rejects(controller.page('foreign-scope-server', 'resources', freshSignal()))
assert.equal(requests, 1)
const { createScope } = await import(pathToFileURL(toolRequire.resolve('@deepseek-ai/dsh-scope')).href)
const scope = createScope(ctx, agent)
const restoreNative = scope.ctx.tools.presentAs('ptc')
await assert.rejects(controller.page('synthetic', 'resources', freshSignal()))
assert.equal(requests, 1); restoreNative()
let scopedRequests = 0
scope.ctx.mcpResources.register('agent-only', { request: async () => { scopedRequests++; return { resources: [] } } })
await controller.page('agent-only', 'resources', freshSignal())
const foreignPort = nativeMcpResourcePort(() => tools, () => ({ id: 'synthetic-foreign' }))
const foreign = new McpResourceController(scopedSource().source, foreignPort)
await assert.rejects(foreign.page('agent-only', 'resources', freshSignal()))
assert.equal(scopedRequests, 1)
await scope.dispose()
await ctx.fiber.dispose()
console.log('Official rc.2 tarball integrity, Schedule descriptors/codecs, absent Team/MCP/list Remotes, and shared-resource permission loopback passed')
