import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { workspaceFilePublicHost } from './fixtures/workspace-file-public-host.js'
import { createSessionManagementPorts } from '../src/host/session-management-bridge.ts'
import { HostFileController } from '../src/client/host-file-controller.ts'
import { TuiActions } from '../src/client/actions.ts'
import { hostFilesFixture } from './fixtures/host-files.ts'
import { scriptedOverlays } from './fixtures/optional-native-views.ts'
const stock = process.env.SEEKTTY_STOCK_NODE_MODULES ?? process.env.SEEKTTY_OFFICIAL_NODE_MODULES
const cleanup = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('public bridge resolves the canonical Host root through the real official lookup and retains actual file ports', async () => {
  const root = await mkdtemp('/tmp/seektty-host-files-public-'); cleanup.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, '正文.txt'), 'actual Host content\nsecond\n')
  const native = await workspaceFilePublicHost(stock, root); cleanup.push(native.close)
  const bridge = createSessionManagementPorts(native.ctx).artifacts
  const id = 'synthetic-host-file-session', signal = new AbortController().signal, notified = vi.fn()
  const stop = bridge.subscribe(notified); cleanup.push(stop)
  expect(bridge.gate('read', id).available).toBe(false)
  await bridge.prepareRoot(id, signal)
  expect(bridge.workspaceRoot(id)).toBe(await realpath(root)); expect(notified).toHaveBeenCalled()
  expect(bridge.gate('read', id).available).toBe(true)
  const source = { getSnapshot: () => ({ sessionId: id, generation: 1, ready: true, hostWorkspacePath: bridge.workspaceRoot(id) }), subscribe: bridge.subscribe }
  const files = new HostFileController({ source, files: bridge, capability: endpoint => bridge.gate(endpoint.split('/')[1], id) }); cleanup.push(() => files.dispose())
  expect((await files.list('', signal)).entries).toContainEqual(expect.objectContaining({ name: '正文.txt', type: 'file' }))
  expect((await files.read('正文.txt', signal)).text).toContain('actual Host content')
  expect((await files.readBytes('正文.txt', signal)).data).toBeInstanceOf(Uint8Array)
  native.unregister()
  expect(bridge.gate('read', id).available).toBe(false)
  await expect(files.read('正文.txt', signal)).rejects.toThrow(/descriptor|not confirmed/)
})
it('Host root preparation rejects unknown scope and late Session cwd changes without publishing an alias', async () => {
  const root = await mkdtemp('/tmp/seektty-host-files-public-'); cleanup.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'other'))
  const native = await workspaceFilePublicHost(stock, root); cleanup.push(native.close)
  const bridge = createSessionManagementPorts(native.ctx).artifacts, signal = new AbortController().signal
  await expect(bridge.prepareRoot('unknown-session', signal)).rejects.toThrow(/scope/)
  await bridge.prepareRoot('synthetic-host-file-session', signal)
  native.sessions.cwd = join(root, 'other')
  expect(bridge.workspaceRoot('synthetic-host-file-session')).toBeUndefined()
  expect(bridge.gate('read', 'synthetic-host-file-session').available).toBe(false)
  await bridge.prepareRoot('synthetic-host-file-session', signal)
  expect(bridge.workspaceRoot('synthetic-host-file-session')).toBe(await realpath(join(root, 'other')))
})
it('file context copies only native canonical identity, awaits clipboard, and never calls the old local reader', async () => {
  const f = hostFilesFixture(), localRead = vi.fn(), localResolve = vi.fn(), copy = vi.fn(async () => {})
  const script = scriptedOverlays([]), notice = vi.fn()
  const nav = { ...script.overlays, signal: new AbortController().signal }
  const overlays = { ...script.overlays, navigate: async callback => callback(nav) }
  const cap = { hostFiles: async () => f.options, readProducedFile: localRead, producedFilePath: localResolve }
  const actions = new TuiActions(cap, { overlays, copy, notice })
  await actions.executeContext({ target: { kind: 'file', path: '报告.md' }, actionId: 'copy-path' })
  expect(copy).toHaveBeenCalledWith('/synthetic-remote/workspace/报告.md'); expect(localRead).not.toHaveBeenCalled(); expect(localResolve).not.toHaveBeenCalled()
  expect(notice).toHaveBeenCalledWith(expect.stringMatching(/copied|已复制/), 'success')
  copy.mockRejectedValueOnce(new Error('clipboard rejected'))
  await actions.executeContext({ target: { kind: 'file', path: '报告.md' }, actionId: 'copy-path' })
  expect(notice.mock.calls.at(-1)).toEqual(['clipboard rejected', 'error'])
})

it('a cancelled delayed Host root resolution returns promptly and cannot publish its late root', async () => {
  const root = await mkdtemp('/tmp/seektty-host-files-public-'); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const native = await workspaceFilePublicHost(stock, root); cleanup.push(native.close)
  const bridge = createSessionManagementPorts(native.ctx).artifacts, abort = new AbortController()
  let release
  const original = native.fs.resolve.bind(native.fs)
  vi.spyOn(native.fs, 'resolve').mockImplementation(async (...args) => { await new Promise(done => { release = done }); return original(...args) })
  const pending = bridge.prepareRoot('synthetic-host-file-session', abort.signal)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  abort.abort()
  await expect(pending).rejects.toThrow()
  release(); await new Promise(done => setImmediate(done))
  expect(bridge.workspaceRoot('synthetic-host-file-session')).toBeUndefined()
})

it('public file context admits confirmed desktop mapping and disables absent or refused mapping', () => {
  for (const [reason, available] of [[undefined, true], ['Remote backend has no desktop mapping', false]]) {
    const actions = new TuiActions({ producedFileOpenReason: () => reason }, {})
    const row = actions.contextMenuFor({ kind: 'file', path: '报告.md' }).nodes.find(row => row.id === 'open-external')
    expect(row.disabledReason === undefined).toBe(available)
    if (!available) expect(row.disabledReason).toBe(reason)
  }
  const absent = new TuiActions({}, {})
  expect(absent.contextMenuFor({ kind: 'file', path: '报告.md' }).nodes.find(row => row.id === 'open-external').disabledReason).toContain('not confirmed')
})
