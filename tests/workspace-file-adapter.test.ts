import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertLookup } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId as SessionIdentity } from '@deepseek-ai/dsh-session/types'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import type { HostFileMethod } from '../src/client/host-file-controller.ts'
import { createWorkspaceFileAdapter, nativeWorkspaceFileDescriptor } from '../src/host/workspace-file-adapter.ts'
import { workspaceDescriptor } from './fixtures/workspace-file-descriptors.ts'
const methods: HostFileMethod[] = ['read', 'stat', 'readBytes', 'list', 'changes']
declare module '@deepseek-ai/dsh-typert-protocol' { interface TypertLookupMap { workspaceFileScope: TypertLookup<{ readonly sessionId: SessionIdentity; readonly workspaceRoot: string }, SessionIdentity> } }
const owner = SessionId('synthetic-owner'), signal = () => new AbortController().signal
function fixture(method: HostFileMethod = 'read', strictConfined?: boolean) {
  let descriptor: InvocationDescriptor | undefined = workspaceDescriptor(method), root: string | undefined = '/synthetic/work', authorized: { available: boolean; reason?: string } | undefined = { available: true }
  const invoke = vi.fn<TypertGateway['invoke']>(async () => ({ absolutePath: '/synthetic/work/file', version: 'v1', text: 'native', offset: 1, lines: 1, eof: true }))
  const stream = vi.fn<TypertGateway['stream']>(async () => ({ async *[Symbol.asyncIterator]() { yield { kind: 'ready' } } }))
  const service = vi.fn(() => ({ read() {}, stat() {}, readBytes() {}, list() {}, changes() {} }))
  const adapter = createWorkspaceFileAdapter({ gateway: { invoke, stream }, local: () => ({ get: endpoint => endpoint === `workspaceFiles/${method}` ? descriptor : workspaceDescriptor(endpoint.slice('workspaceFiles/'.length) as HostFileMethod) }), service, authorize: () => authorized, workspaceRoot: () => root, ...(strictConfined === undefined ? {} : { strictConfined }) })
  return { ...adapter, invoke, stream, service, descriptor: (value: typeof descriptor) => { descriptor = value }, authorize: (value: typeof authorized) => { authorized = value }, root: (value: typeof root) => { root = value } }
}
describe('published descriptor identity and Host gate', () => {
  it('explicit strictConfined is unavailable for every native port and does not dispatch content/metadata/watch', async () => {
    const f = fixture('read', true)
    expect(f.boundary.atomicStrictConfined).toBe(false)
    for (const method of methods) expect(f.gate(method, owner)).toMatchObject({ available: false, reason: expect.stringContaining('Strict workspace confinement is unavailable') })
    for (const call of [() => f.files.read(owner, 'file', {}, signal()), () => f.files.readBytes!(owner, 'file', {}, signal()), () => f.files.stat!(owner, 'file', signal()), () => f.files.list!(owner, '', signal()), () => f.files.changes!(owner, 'file', signal())]) await expect(call()).rejects.toThrow('Strict workspace confinement is unavailable')
    expect(f.invoke).not.toHaveBeenCalled(); expect(f.stream).not.toHaveBeenCalled(); expect(f.service).not.toHaveBeenCalled()
  })
  it.each(methods)('accepts exact %s contract', method => { expect(nativeWorkspaceFileDescriptor(workspaceDescriptor(method), method)).toBe(true) })
  it.each(methods)('rejects foreign service/implementation/package, scope, arity and permissive codecs for %s', method => {
    const original = workspaceDescriptor(method)
    const invalid: InvocationDescriptor[] = [
      { ...original, service: 'unrelatedFileService' }, { ...original, implementation: 'unlinkArtifacts' }, { ...original, id: '@unrelated/plugin#workspaceFiles/read' },
      { ...original, scope: { context: 'agent', wire: 'agentId' } }, { ...original, uplink: { codec: original.result } },
      { ...original, parameters: original.parameters.slice(1) }, { ...original, parameters: [...original.parameters, original.parameters[0]!] },
      { ...original, result: { mode: 'src-json' } }, { ...original, result: { mode: 'strict', typeSymbol: original.result.mode === 'strict' ? original.result.typeSymbol : '', create: () => z.unknown() } },
      { ...original, parameters: original.parameters.map((parameter, index) => index !== 0 ? parameter : { ...parameter, wire: 'agentId' }) },
    ]
    for (const value of invalid) expect(nativeWorkspaceFileDescriptor(value, method)).toBe(false)
    const f = fixture(method); f.descriptor(invalid[0]); expect(f.gate(method, owner).available).toBe(false); expect(f.service).not.toHaveBeenCalled()
  })
  it('never dispatches unknown identity or missing permission/root; cancellation and outside paths are refused', async () => {
    const f = fixture()
    f.descriptor({ ...workspaceDescriptor('read'), service: 'unrelatedFileService', implementation: 'unlinkArtifacts' })
    await expect(f.files.read(owner, '/synthetic/work/file', {}, signal())).rejects.toThrow('descriptor')
    f.descriptor(workspaceDescriptor('read')); f.authorize(undefined)
    await expect(f.files.read(owner, '/synthetic/work/file', {}, signal())).rejects.toThrow('permission')
    f.authorize({ available: true }); f.root(undefined)
    await expect(f.files.read(owner, '/synthetic/work/file', {}, signal())).rejects.toThrow('root')
    f.root('/synthetic/work'); await expect(f.files.read(owner, '/outside', {}, signal())).rejects.toThrow('outside')
    const canceled = new AbortController(); canceled.abort(); await expect(f.files.read(owner, 'file', {}, canceled.signal)).rejects.toThrow()
    expect(f.invoke).not.toHaveBeenCalled()
  })
  it('uses exact workspaceFileScopeId wire and fences descriptor/permission/root after response', async () => {
    const f = fixture()
    await expect(f.files.read(owner, 'file', { offset: 1 }, signal())).resolves.toMatchObject({ ok: true, value: { text: 'native' } })
    expect(f.invoke.mock.calls[0]?.[0].method).toBe('stat')
    expect(f.invoke.mock.calls.at(-1)?.[0]).toMatchObject({ namespace: 'workspaceFiles', method: 'read', args: { workspaceFileScopeId: owner, path: '/synthetic/work/file', range: { offset: 1 } } })
    f.invoke.mockImplementationOnce(async () => { f.authorize(undefined); return { absolutePath: '/synthetic/work/file', version: 'v', text: 'late', offset: 1, lines: 1, eof: true } })
    await expect(f.files.read(owner, 'file', {}, signal())).rejects.toThrow('permission')
  })
  it('rejects intermediate symlink escapes after metadata and before content invocation', async () => {
    const f = fixture()
    f.invoke.mockResolvedValueOnce({ absolutePath: '/outside/secret', version: 'v' })
    await expect(f.files.read(owner, 'linked-dir/secret', {}, signal())).rejects.toThrow('outside')
    expect(f.invoke).toHaveBeenCalledTimes(1); expect(f.invoke.mock.calls[0]?.[0].method).toBe('stat')
  })
  it('closes native streams and never confirms malformed frames or changed permission', async () => {
    const f = fixture('changes'), closed = vi.fn()
    f.stream.mockImplementationOnce(async () => ({ async *[Symbol.asyncIterator]() { try { yield { kind: 'ready' }; f.authorize(undefined); yield { kind: 'ready' } } finally { closed() } } }))
    const stream = await f.files.changes!(owner, 'file', signal()), iterator = stream[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ kind: 'ready' }); await expect(iterator.next()).rejects.toThrow('permission'); expect(closed).toHaveBeenCalledTimes(1)
  })
  it('failed-open gate still returns the native iterator when its optional disposer throws', async () => {
    const f = fixture('changes'), returned = vi.fn(async () => ({ done: true as const, value: undefined }))
    const dispose = vi.fn(() => { throw new Error('fixture native disposer failed') })
    f.stream.mockImplementationOnce(async () => {
      f.authorize(undefined)
      return { dispose, [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: returned }) }
    })
    await expect(f.files.changes!(owner, 'file', signal())).rejects.toMatchObject({ cleanupUnconfirmed: true })
    expect(dispose).toHaveBeenCalledTimes(1); expect(returned).toHaveBeenCalledTimes(1)
  })
  it('preserves a supported carrier asynchronous disposer failure through the adapter', async () => {
    const f = fixture('changes'), dispose = vi.fn(async () => { throw new Error('fixture async disposer failed') })
    f.stream.mockImplementationOnce(async () => ({ dispose, async *[Symbol.asyncIterator]() { yield { kind: 'ready' } } }))
    const stream = await f.files.changes!(owner, 'file', signal())
    if (!('dispose' in stream) || typeof stream.dispose !== 'function') throw new Error('Missing fixture disposer')
    await expect(stream.dispose()).rejects.toThrow('fixture async disposer failed')
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
it('real official Gateway foreign-service counterexample stays rejected before harmless invocation', async () => {
  const ctx = new Context(), registry = new TypertRegistry(ctx)
  let calls = 0
  class Alien extends TypertRemoteService {
    constructor() { super(ctx, 'unrelatedFileService', { namespace: 'workspaceFiles' }) }
    @Remote('read')
    unlinkArtifacts(_scope: unknown, _path: string, _range: unknown, _signal: AbortSignal) { calls++; return { absolutePath: '/synthetic/work/file', version: 'v', text: 'foreign', offset: 1, lines: 1, eof: true } }
  }
  const alien = new Alien()
  const original = workspaceDescriptor('read')
  registry.register({ package: '@deepseek-ai/dsh-api-workspace-files', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: [{ ...original, service: 'unrelatedFileService', implementation: 'unlinkArtifacts' }] })
  // This fixture only resolves an inert Session header, with no Session/Agent runtime or persistence.
  registry.lookups.register('workspaceFileScope', { parameter: 'workspaceFileScope', wire: 'workspaceFileScopeId', hostTypeSymbol: '@deepseek-ai/dsh-api-workspace-files#WorkspaceFileScope', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: async () => ({ sessionId: owner, workspaceRoot: '/synthetic/work' }) })
  const gateway = new TypertGatewayService(ctx, {})
  const adapter = createWorkspaceFileAdapter({ gateway, local: () => registry.local, service: key => key === 'unrelatedFileService' ? alien : undefined, authorize: () => ({ available: true }), workspaceRoot: () => '/synthetic/work' })
  try {
    const control = await gateway.invoke({ namespace: 'workspaceFiles', method: 'read', args: { workspaceFileScopeId: owner, path: '/synthetic/work/file', range: {} }, signal: signal() })
    expect(control).toMatchObject({ text: 'foreign' }); expect(calls).toBe(1); calls = 0
    const dispatch = vi.spyOn(gateway, 'invoke')
    await expect(adapter.files.read(owner, 'file', {}, signal())).rejects.toThrow('descriptor')
    expect(calls).toBe(0); expect(dispatch).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose() }
})
