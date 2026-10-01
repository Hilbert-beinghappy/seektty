/** Deterministic native path-race counterexamples, not tests claiming the race was eliminated. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rename, symlink, realpath, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { createWorkspaceFileAdapter } from '../src/host/workspace-file-adapter.ts'

assert(process.argv[2], 'Pass the isolated unchanged official-package directory')
assert(process.env.HOME?.includes('isolated') && process.env.DSH_HOME?.includes('isolated'), 'Isolated HOME/DSH_HOME required')
const root = resolve(process.argv[2])
const integrity = {
  'dsh-api-workspace-files': 'X2mKXzaWOjTv2rBvZl4GyKsB63ZUHJZaq9KX2r+yaMJfguxMkWMCx0to6bdp2BPrzaD826X1D672hFY6Ps/0jA==',
  'dsh-fs-local': 'lDzh5VlQsXf3nI+E0+T0weYdH1VAoo+htj6Kwc62P7/Lx+xjnYSLQYTeGeaJR1d8H2iQv2FvlwaDKv60AorKdA==',
}
for (const [name, digest] of Object.entries(integrity)) {
  const tar = join(root, `${name}.tgz`)
  assert.equal(createHash('sha512').update(await readFile(tar)).digest('base64'), digest)
  for (const path of ['lib/index.js', ...(name === 'dsh-api-workspace-files' ? ['lib/typert.host.js'] : [])]) assert.deepEqual(await readFile(join(root, name, 'package', path)), execFileSync('/usr/bin/tar', ['-xOf', tar, `package/${path}`], { maxBuffer: 16 * 1024 * 1024 }))
}
const load = (name, path = 'lib/index.js') => import(pathToFileURL(join(root, name, 'package', path)).href)
const { WorkspaceFiles } = await load('dsh-api-workspace-files')
const { TYPERT } = await load('dsh-api-workspace-files', 'lib/typert.host.js')
const { LocalFileSystem } = await load('dsh-fs-local')
const results = []
for (const timing of ['before-native-locate', 'before-stream-open', 'strict-required']) {
  const fixture = await realpath(await mkdtemp(join(root, 'synthetic-path-race-')))
  const workspace = join(fixture, 'workspace'), outside = join(fixture, 'outside')
  await mkdir(join(workspace, 'nested'), { recursive: true }); await mkdir(outside)
  await writeFile(join(workspace, 'nested/report.txt'), 'inside fixture\n'); await writeFile(join(outside, 'report.txt'), 'outside fixture\n')
  class Sandbox extends Service { constructor(ctx) { super(ctx, 'sandboxPolicy'); this.workspaceRoot = workspace } }
  class Sessions extends Service { constructor(ctx) { super(ctx, 'sessions') } get(id) { return id === 'synthetic-race-owner' ? { header: { cwd: workspace } } : undefined } }
  const ctx = new Context(), registry = new TypertRegistry(ctx)
  new Sandbox(ctx); new Sessions(ctx)
  const fs = new LocalFileSystem(ctx, { cwd: workspace, diffBasisMaxBytes: 1024 })
  new WorkspaceFiles(ctx, { maxBytes: 65536, maxFileBytes: 65536, maxLines: 200, maxEntries: 100 })
  registry.register(TYPERT)
  const gateway = new TypertGatewayService(ctx, {}), calls = [], reads = []
  const replaceAncestor = async () => { await rename(join(workspace, 'nested'), join(workspace, 'old-nested')); await symlink(outside, join(workspace, 'nested')) }
  // Fixture wraps the instance timing seam only; official module files remain byte-for-byte unchanged.
  const streamText = fs.streamText.bind(fs)
  fs.streamText = async (target, signal) => {
    if (timing === 'before-stream-open') await replaceAncestor()
    reads.push(fs.processPath(target))
    return streamText(target, signal)
  }
  const adapter = createWorkspaceFileAdapter({
    gateway: { invoke: async request => { calls.push(request.method); if (timing === 'before-native-locate' && request.method === 'read') await replaceAncestor(); return gateway.invoke(request) }, stream: request => gateway.stream(request) },
    local: () => registry.local, service: key => ctx.get(key), authorize: () => ({ available: true }), workspaceRoot: () => workspace,
    strictConfined: timing === 'strict-required',
  })
  try {
    const request = () => adapter.files.read('synthetic-race-owner', join(workspace, 'nested/report.txt'), { offset: 1, limit: 200 }, new AbortController().signal)
    assert.equal(adapter.boundary.atomicStrictConfined, false)
    if (timing === 'before-native-locate') {
      await assert.rejects(request(), /outside/); assert.equal(reads.length, 1); assert.equal(reads[0], join(outside, 'report.txt')); assert.deepEqual(calls, ['stat', 'read'])
      results.push({ timing, responseRejected: true, outsideContentWasAlreadyRead: true })
    } else if (timing === 'before-stream-open') {
      const result = await request(); assert.equal(result.ok, true); assert.equal(result.value.text, 'outside fixture')
      assert.equal(result.value.absolutePath, join(workspace, 'nested/report.txt')); assert.deepEqual(calls, ['stat', 'read'])
      results.push({ timing, ordinaryAuthorizedHostReceipt: true, reportedPathInside: true, contentOutside: true, atomicConfinementClaimed: false })
    } else {
      await assert.rejects(request(), /Strict workspace confinement is unavailable/)
      await assert.rejects(adapter.files.readBytes('synthetic-race-owner', join(workspace, 'nested/report.txt'), {}, new AbortController().signal), /Strict workspace confinement is unavailable/)
      assert.deepEqual(calls, []); assert.deepEqual(reads, [])
      results.push({ timing, denied: true, contentCalls: 0, metadataCalls: 0 })
    }
  } finally { await ctx.fiber.dispose() }
}
console.log(JSON.stringify({ official: '0.2.0-rc.2', noUserFiles: true, modelRequests: 0, results }, null, 2))
