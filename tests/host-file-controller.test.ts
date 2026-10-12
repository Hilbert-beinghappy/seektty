import { describe, expect, it } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { containedHostPath, HostFileController, HOST_FILE_READ_BOUNDARY } from '../src/client/host-file-controller.ts'
import { deferred, flush, hostFilesFixture } from './fixtures/host-files.ts'
const signal = () => new AbortController().signal
describe('Host file authority and rc.2 bounded reads', () => {
  it('explicit strictConfined rejects before any Remote call, without denying default authorized reads', async () => {
    const f = hostFilesFixture(), strict = new HostFileController({ ...f.options, strictConfined: true })
    expect(HOST_FILE_READ_BOUNDARY.atomicStrictConfined).toBe(false)
    try {
      for (const call of [() => strict.read('报告.md', signal()), () => strict.readBytes('报告.md', signal()), () => strict.stat('报告.md', signal()), () => strict.list('', signal())]) await expect(call()).rejects.toThrow('Strict workspace confinement is unavailable')
      expect(f.read).not.toHaveBeenCalled(); expect(f.stat).not.toHaveBeenCalled(); expect(f.readBytes).not.toHaveBeenCalled(); expect(f.list).not.toHaveBeenCalled()
    } finally { strict.dispose() }
    const native = new HostFileController({ ...f.options, strictConfined: false })
    try { expect((await native.read('报告.md', signal())).text).toContain('remote正文') } finally { native.dispose() }
  })
  it.each(['../outside', '/another/workspace/file', '~/secret', 'file:///tmp/input', 'ssh://alias/path', 'C:relative', 'x\u0000y', 'a\\..\\secret'])('rejects ambiguous/outside reference %s before dispatch', async path => {
    const f = hostFilesFixture(), c = new HostFileController(f.options)
    try { await expect(c.read(path, signal())).rejects.toThrow(); expect(f.read).not.toHaveBeenCalled() } finally { c.dispose() }
  })
  it('requires Host root; preserves Chinese/spaces and Windows coordinates', () => {
    expect(() => containedHostPath('/tmp/file', undefined)).toThrow('root')
    expect(containedHostPath('报告 A.md', '/remote/work')).toBe('/remote/work/报告 A.md')
    expect(containedHostPath('报告 A.md', 'D:\\remote\\work')).toBe('D:\\remote\\work\\报告 A.md')
    expect(() => containedHostPath('C:\\local.txt', 'D:\\remote\\work')).toThrow('outside')
  })
  it.each([undefined, { available: false, reason: 'permission denied' }])('does not infer unknown/denied permissions %s', async capability => {
    const f = hostFilesFixture(); f.gates.set('workspaceFiles/read', capability); const c = new HostFileController(f.options)
    try { await expect(c.read('报告.md', signal())).rejects.toThrow(); expect(f.read).not.toHaveBeenCalled() } finally { c.dispose() }
  })
  it('returns Host text/stat/bytes/list with explicit separate vocabularies', async () => {
    const f = hostFilesFixture(), c = new HostFileController(f.options)
    try {
      expect((await c.read('报告.md', signal())).text).toContain('remote正文')
      expect((await c.stat('报告.md', signal())).version).toBe('opaque-v1')
      expect((await c.readBytes('报告.md', signal())).data).toEqual(new Uint8Array([0, 255]))
      expect(f.readBytes.mock.calls[0]?.[2]).toEqual({ range: { offset: 0, length: 65536 } })
      expect((await c.list('', signal())).entries[0]?.name).toBe('报告.md')
      expect(f.read.mock.calls[0]?.[1]).toBe('/synthetic-remote/workspace/报告.md')
    } finally { c.dispose() }
  })
  it('resolves binary baseFile in Host coordinates and rejects escaping/URI before dispatch', async () => {
    const f = hostFilesFixture(), c = new HostFileController(f.options)
    try {
      await c.readBytes('../asset.bin', signal(), { baseFile: 'nested/index.md', range: { length: 2 } })
      expect(f.readBytes.mock.calls[0]?.[1]).toBe('/synthetic-remote/workspace/asset.bin')
      await expect(c.readBytes('file:///tmp/input', signal(), { baseFile: 'nested/index.md' })).rejects.toThrow()
      await expect(c.readBytes('../../escape', signal(), { baseFile: 'nested/index.md' })).rejects.toThrow()
      expect(f.readBytes).toHaveBeenCalledTimes(1)
    } finally { c.dispose() }
  })
  it('rejects canonical symlink escapes, malformed pages/list entries and version drift', async () => {
    const f = hostFilesFixture(), c = new HostFileController(f.options)
    try {
      f.stat.mockResolvedValueOnce({ ok: true, value: { absolutePath: '/outside/link-target', version: 'v' } })
      await expect(c.stat('link/file', signal())).rejects.toThrow('outside')
      await expect(c.read('报告.md', signal(), {}, 'wrong-version')).rejects.toThrow('changed')
      f.list.mockResolvedValueOnce({ ok: true, value: { path: '', entries: [{ name: '../escape', type: 'file' }], truncated: false } })
      await expect(c.list('', signal())).rejects.toThrow('entry')
      await expect(c.read('报告.md', signal(), { limit: 201 })).rejects.toThrow('page')
      await expect(c.readBytes('报告.md', signal(), { range: { length: 65537 } })).rejects.toThrow('byte')
    } finally { c.dispose() }
  })
  it('propagates business errors without local fallback or retry', async () => {
    const f = hostFilesFixture(), c = new HostFileController(f.options)
    f.read.mockResolvedValue({ ok: false, error: new RemoteError('gateway/bad-request', 'denied', {}) })
    try { await expect(c.read('/synthetic-remote/workspace/报告.md', signal())).rejects.toThrow('denied'); expect(f.read).toHaveBeenCalledTimes(1) } finally { c.dispose() }
  })
  it.each(['disconnect', 'generation', 'session', 'root', 'close', 'cancel', 'permission'])('rejects a late read after %s', async action => {
    const f = hostFilesFixture(), c = new HostFileController(f.options), request = new AbortController()
    const pending = deferred<Awaited<ReturnType<typeof f.read>>>()
    f.read.mockImplementationOnce(() => pending.promise)
    const read = c.read('报告.md', request.signal); const rejected = expect(read).rejects.toThrow()
    await flush()
    if (action === 'disconnect') f.change({ ready: false })
    else if (action === 'generation') f.change({ generation: 2 })
    else if (action === 'session') f.change({ sessionId: SessionId('synthetic-other-owner') })
    else if (action === 'root') f.change({ hostWorkspacePath: '/other-root' })
    else if (action === 'close') c.dispose()
    else if (action === 'cancel') request.abort()
    else f.gates.set('workspaceFiles/read', undefined)
    pending.resolve({ ok: true, value: { absolutePath: '/synthetic-remote/workspace/报告.md', version: 'v', text: 'late', lines: 1, offset: 1, eof: true } })
    await rejected; c.dispose(); expect(f.listeners.size).toBe(0)
  })
})
