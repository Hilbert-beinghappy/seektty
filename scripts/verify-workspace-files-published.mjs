/** Official Local + synthetic remote filesystem through the actual rc.2 registry/Gateway. No SSH/model/user data. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, symlink, realpath } from 'node:fs/promises'
import { join, resolve, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { SessionId } from '@deepseek-ai/dsh-session'
import { HostFileController } from '../src/client/host-file-controller.ts'
import { WorkspaceFileObserver } from '../src/client/workspace-file-observer.ts'
import { createWorkspaceFileAdapter, nativeWorkspaceFileDescriptor } from '../src/host/workspace-file-adapter.ts'
import { nativeFileLoopback } from '../tests/fixtures/native-file-loopback.mjs'

const root = resolve(process.argv[2] ?? '')
assert(process.argv[2], 'Pass the isolated extracted official package directory')
assert(process.env.HOME?.includes('isolated') && process.env.DSH_HOME?.includes('isolated'), 'Run with isolated HOME and DSH_HOME')
const integrity = {
  'dsh-api-workspace-files': 'X2mKXzaWOjTv2rBvZl4GyKsB63ZUHJZaq9KX2r+yaMJfguxMkWMCx0to6bdp2BPrzaD826X1D672hFY6Ps/0jA==',
  'dsh-fs': 'PuVcI7drTwa19Key54DROoqnDFTTFkl8TPlyrTnS3BSnykm+jKbB13ES/PQEJoRunNdQkNZa12jtbUI4BP/EHw==',
  'dsh-fs-local': 'lDzh5VlQsXf3nI+E0+T0weYdH1VAoo+htj6Kwc62P7/Lx+xjnYSLQYTeGeaJR1d8H2iQv2FvlwaDKv60AorKdA==',
  'dsh-fs-observation-policy': 'YPqpJ+WPhYUHS6PtUN4abjUx/dK6bexUiQdFGeQ81F0CEWbIfxyT1QzadKPvU5PrjxpG5e+UtjoEmAQKSCrsiA==',
}
const evidence = []
for (const [name, digest] of Object.entries(integrity)) {
  const tar = join(root, `${name}.tgz`)
  assert.equal(createHash('sha512').update(await readFile(tar)).digest('base64'), digest, name)
  const files = execFileSync('/usr/bin/tar', ['-tzf', tar], { encoding: 'utf8' }).trim().split('\n')
  for (const file of files) if (file === 'package/package.json' || file.startsWith('package/lib/') && !file.endsWith('/')) {
    assert.deepEqual(await readFile(join(root, name, file)), execFileSync('/usr/bin/tar', ['-xOf', tar, file], { maxBuffer: 32 * 1024 * 1024 }), `${name}:${file} must be unmodified`)
  }
  const pkg = JSON.parse(await readFile(join(root, name, 'package/package.json'), 'utf8'))
  assert.equal(pkg.name, `@deepseek-ai/${name}`); assert.equal(pkg.version, '0.2.0-rc.2')
  evidence.push(`${name}: integrity and all lib artifacts unchanged`)
}
const load = (name, path = 'lib/index.js') => import(pathToFileURL(join(root, name, 'package', path)).href)
const { WorkspaceFiles } = await load('dsh-api-workspace-files')
const { TYPERT } = await load('dsh-api-workspace-files', 'lib/typert.host.js')
const { LocalFileSystem } = await load('dsh-fs-local')
const { FileSystem, FsTargetKey, FsVersion } = await load('dsh-fs')
for (const descriptor of TYPERT.invocations) assert(nativeWorkspaceFileDescriptor(descriptor, descriptor.method), descriptor.method)
assert.equal(TYPERT.package, '@deepseek-ai/dsh-api-workspace-files'); assert.equal(TYPERT.face, 'host'); assert.equal(TYPERT.invocations.length, 5)
const fixtureRoot = await realpath(await mkdtemp(join(root, 'synthetic-workspace-')))
const owner = SessionId('synthetic-file-owner')
const signal = () => new AbortController().signal
async function eventually(predicate, label) {
  const deadline = Date.now() + 4000
  while (!predicate()) { assert(Date.now() < deadline, `Timed out: ${label}`); await new Promise(done => setTimeout(done, 10)) }
}
class Sandbox extends Service { constructor(ctx, workspaceRoot) { super(ctx, 'sandboxPolicy'); this.workspaceRoot = workspaceRoot } }
class Sessions extends Service { constructor(ctx, workspaceRoot) { super(ctx, 'sessions'); this.root = workspaceRoot } get(id) { return id === owner ? { header: { cwd: this.root } } : undefined } }
async function assembly(workspaceRoot, makeFs) {
  const ctx = new Context(), registry = new TypertRegistry(ctx)
  new Sandbox(ctx, workspaceRoot); new Sessions(ctx, workspaceRoot)
  const fs = makeFs(ctx)
  new WorkspaceFiles(ctx, { maxBytes: 65536, maxFileBytes: 65536, maxLines: 200, maxEntries: 100 })
  const unregister = registry.register(TYPERT)
  const gateway = new TypertGatewayService(ctx, {})
  let gatewayPort = gateway
  const nativeCalls = []
  let scope = { sessionId: owner, generation: 1, ready: true, hostWorkspacePath: workspaceRoot }
  const listeners = new Set(), source = { getSnapshot: () => scope, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  const update = patch => { scope = { ...scope, ...patch }; for (const listener of [...listeners]) listener() }
  const adapter = createWorkspaceFileAdapter({ gateway: { invoke: request => { nativeCalls.push(request.method); return gatewayPort.invoke(request) }, stream: request => gatewayPort.stream(request) }, local: () => registry.local, service: key => ctx.get(key), authorize: (_method, id) => ({ available: id === owner }), workspaceRoot: id => id === owner ? workspaceRoot : undefined })
  const options = { source, files: adapter.files, capability: endpoint => adapter.gate(endpoint.split('/')[1], owner), timeoutMs: 2000 }
  const files = new HostFileController(options)
  await Promise.resolve(); await Promise.resolve()
  return { ctx, fs, files, options, source, update, registry, gateway, adapter, unregister, nativeCalls, setGateway: value => { gatewayPort = value } }
}

// The only real OS files used are synthetic files inside this newly created isolated fixture directory.
const localRoot = join(fixtureRoot, 'local'); await mkdir(localRoot)
await writeFile(join(localRoot, '报告 A.md'), 'official local正文\nsecond\n')
await writeFile(join(localRoot, 'binary.bin'), new Uint8Array([0, 1, 255]))
await writeFile(join(fixtureRoot, 'outside.md'), 'outside synthetic fixture')
await symlink(join(fixtureRoot, 'outside.md'), join(localRoot, 'outside-link.md'))
await mkdir(join(fixtureRoot, 'outside-directory')); await writeFile(join(fixtureRoot, 'outside-directory', 'synthetic.txt'), 'synthetic outside content')
await symlink(join(fixtureRoot, 'outside-directory'), join(localRoot, 'linked-directory'))
const local = await assembly(localRoot, ctx => new LocalFileSystem(ctx, { cwd: localRoot, diffBasisMaxBytes: 10 * 1024 * 1024 }))
let observer
try {
  assert.equal((await local.files.read('报告 A.md', signal())).text, 'official local正文\nsecond')
  assert.deepEqual((await local.files.readBytes('binary.bin', signal())).data, new Uint8Array([0, 1, 255]))
  assert((await local.files.list('', signal())).entries.some(entry => entry.name === '报告 A.md'))
  await assert.rejects(local.files.read('binary.bin', signal()), /not-text/)
  await assert.rejects(local.files.stat('outside-link.md', signal()), /not-regular-file|outside/)
  await assert.rejects(local.files.list('..', signal()), /outside/)
  const beforeEscape = local.nativeCalls.length
  await assert.rejects(local.files.read('linked-directory/synthetic.txt', signal()), /outside/)
  assert.deepEqual(local.nativeCalls.slice(beforeEscape), ['stat'], 'No outside content invocation through intermediate symlink')
  observer = new WorkspaceFileObserver('报告 A.md', local.options)
  await eventually(() => observer.getSnapshot().page?.text === 'official local正文\nsecond', 'Local ready → stat → read')
  assert.equal(observer.getSnapshot().mode, 'watching', JSON.stringify(observer.getSnapshot()))
  await writeFile(join(localRoot, '报告 A.md'), 'official watched update\n')
  await eventually(() => observer.getSnapshot().page?.text === 'official watched update', 'actual Local chokidar invalidation')
  local.update({ ready: false }); assert.equal(observer.getSnapshot().mode, 'disconnected')
  await writeFile(join(localRoot, '报告 A.md'), 'reconnected update\n')
  local.update({ ready: true, generation: 2 })
  await eventually(() => observer.getSnapshot().page?.text === 'reconnected update', 'reconnect reread')
  observer.dispose(); await observer.closed(); assert.equal(observer.getSnapshot().mode, 'closed')
  // Original foreign descriptor counterexample, actual Gateway, harmless counter only.
  const published = TYPERT.invocations.find(row => row.method === 'read')
  const alien = { ...published, service: 'unrelatedFileService', implementation: 'unlinkArtifacts' }
  await local.unregister(); local.registry.register({ ...TYPERT, invocations: [alien] })
  assert.equal(local.adapter.gate('read', owner).available, false)
  await assert.rejects(local.adapter.files.read(owner, join(localRoot, '报告 A.md'), {}, signal()), /descriptor/)
  evidence.push('Official Local: text/bytes/list, binary/escape rejection, actual watch ready/change/close/reconnect; foreign descriptor denied')
} finally { observer?.dispose(); if (observer) await observer.closed(); local.files.dispose(); await local.ctx.fiber.dispose() }

// A remote execution world deliberately uses the same absolute path as a real local trap file.
const remoteRoot = join(fixtureRoot, 'remote'); await mkdir(remoteRoot)
await writeFile(join(remoteRoot, 'same-name.md'), 'CLIENT LOCAL TRAP — must never appear')
class SyntheticRemote extends FileSystem {
  constructor(ctx) { super(ctx); this.revision = 1; this.text = 'SYNTHETIC REMOTE正文\n'; this.reads = 0 }
  async resolve(path, options = {}) { options.signal?.throwIfAborted(); const processPath = posix.resolve(options.cwd ?? remoteRoot, path); return { targetKey: FsTargetKey(`remote:${processPath}`), displayPath: processPath } }
  processPath(target) { return target.displayPath }
  fileUrl(target) { return `file://synthetic-remote${pathToFileURL(target.displayPath).pathname}` }
  contains(parent, child) { const relative = posix.relative(parent.displayPath, child.displayPath); return relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative) }
  async stat(target) { if (target.displayPath === remoteRoot) return { type: 'directory', version: FsVersion(`directory-${this.revision}`) }; if (target.displayPath === join(remoteRoot, 'same-name.md')) return { type: 'file', version: FsVersion(`remote-${this.revision}`), size: new TextEncoder().encode(this.text).length }; return undefined }
  async lstat(path, options) { return this.stat(await this.resolve(path, options)) }
  async readText() { this.reads++; return this.text }
  async streamText() { const text = await this.readText(); return { async *[Symbol.asyncIterator]() { yield text } } }
  async readBytes() { return new TextEncoder().encode(await this.readText()) }
  async readByteRange(_target, range) { return new TextEncoder().encode(await this.readText()).slice(range.offset, range.offset + range.length) }
  async listDir() { return [{ name: 'same-name.md', type: 'file', target: await this.resolve('same-name.md'), version: FsVersion(`remote-${this.revision}`) }] }
  // Base FileSystem.watch is the genuine official unsupported-provider implementation (as SSH currently inherits).
}
const remote = await assembly(remoteRoot, ctx => new SyntheticRemote(ctx))
const loopback = await nativeFileLoopback(remote.gateway)
remote.setGateway(loopback.gateway)
try {
  observer = new WorkspaceFileObserver('same-name.md', remote.options)
  await eventually(() => observer.getSnapshot().mode === 'manual' && observer.getSnapshot().page !== undefined, 'remote unsupported watch/manual read')
  assert.match(observer.getSnapshot().reason, /watch-unsupported/)
  assert.match(observer.getSnapshot().page.text, /SYNTHETIC REMOTE/)
  assert.doesNotMatch(observer.getSnapshot().page.text, /LOCAL TRAP/)
  assert.equal((await remote.files.stat('same-name.md', signal())).version, 'remote-1')
  assert.match(new TextDecoder().decode((await remote.files.readBytes('same-name.md', signal())).data), /SYNTHETIC REMOTE/)
  assert.equal((await remote.files.list('', signal())).entries[0].name, 'same-name.md')
  const before = remote.fs.reads; remote.fs.text = 'manual remote update\n'; remote.fs.revision++
  await new Promise(done => setTimeout(done, 30)); assert.equal(remote.fs.reads, before)
  observer.refresh(); await eventually(() => observer.getSnapshot().page?.text === 'manual remote update', 'explicit remote refresh')
  observer.dispose(); await observer.closed()
  assert(loopback.requests.includes('read') && loopback.requests.includes('stat') && loopback.requests.includes('readBytes') && loopback.requests.includes('list') && loopback.requests.includes('changes'))
  evidence.push('Synthetic remote over HTTP loopback/actual Gateway/official base FS: Host text/stat/bytes/list, same-name local trap isolation, watch-unsupported, no polling, explicit refresh')
} finally { observer?.dispose(); if (observer) await observer.closed(); remote.files.dispose(); await loopback.close(); await remote.ctx.fiber.dispose() }
console.log(JSON.stringify({ official: '0.2.0-rc.2', fixtureRoot, evidence, realSSH: false, modelRequests: 0 }, null, 2))
