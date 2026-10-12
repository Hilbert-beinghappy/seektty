/** Exact published dsh-api-workspace-files 0.2.0-rc.2 contracts over the existing Gateway. */
import type { InvocationDescriptor, TypertCodec, TypertLocalRegistry, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import type { HostFilePorts, HostFileMethod, HostFileStat, HostFileText, HostFileBytes, HostDirectory } from '../client/host-file-controller.ts'
import { containedHostPath, HOST_FILE_READ_BOUNDARY, strictFileConfinementReason } from '../client/host-file-controller.ts'
import { closeHostFileStream, HostFileStreamCleanupFailure } from '../client/host-file-stream-lifetime.ts'

const packageName = '@deepseek-ai/dsh-api-workspace-files'
const symbols = `${packageName}/types#`
const results = { read: 'WorkspaceFileText', stat: 'WorkspaceFileStat', readBytes: 'WorkspaceFileBytes', list: 'WorkspaceDirectoryListing', changes: 'WorkspaceFileWatchFrame' } as const
function strict(codec: TypertCodec, symbol: string, binary = false): boolean {
  return codec.mode === 'strict' && codec.typeSymbol === symbol && typeof codec.create === 'function'
    && (binary ? typeof codec.decode === 'function' && typeof codec.encode === 'function' : codec.decode === undefined && codec.encode === undefined)
}
export function nativeWorkspaceFileDescriptor(descriptor: InvocationDescriptor | undefined, method: HostFileMethod): boolean {
  if (descriptor === undefined || descriptor.id !== `${packageName}#workspaceFiles/${method}`
    || descriptor.namespace !== 'workspaceFiles' || descriptor.service !== 'workspaceFiles' || descriptor.method !== method
    || (descriptor.implementation ?? method) !== method || descriptor.invocation.kind !== 'direct'
    || descriptor.scope !== undefined || descriptor.uplink !== undefined || descriptor.mode !== (method === 'changes' ? 'stream' : undefined)
    || descriptor.cancellation?.parameter !== 'signal') return false
  const fields = [
    ['workspaceFileScope', 'workspaceFileScopeId', 'lookup', 'workspaceFileScope', '@deepseek-ai/dsh-session/types#SessionId'],
    ['path', 'path', 'json', undefined, `${packageName}#workspaceFiles/${method}:path`],
    ...(method === 'read' ? [['range', 'range', 'json', undefined, `${symbols}WorkspaceFileRange`]] : []),
    ...(method === 'readBytes' ? [['options', 'options', 'json', undefined, `${symbols}WorkspaceByteReadOptions`]] : []),
  ] as const
  if (descriptor.parameters.length !== fields.length || !descriptor.parameters.every((parameter, index) => {
    const field = fields[index]!
    return parameter.name === field[0] && parameter.wire === field[1] && parameter.source === field[2]
      && parameter.lookup === field[3] && parameter.acceptsUndefined === undefined && strict(parameter.codec, field[4]!)
  }) || !strict(descriptor.result, `${symbols}${results[method]}`, method === 'readBytes')) return false
  try {
    // Inert values detect permissive/unknown codecs retaining official type labels.
    for (const parameter of descriptor.parameters) {
      if (parameter.codec.mode !== 'strict') return false
      const schema = parameter.codec.create()
      schema.parse(parameter.name === 'range' || parameter.name === 'options' ? {} : 'synthetic-file')
      for (const invalid of [undefined, null, 1, false]) { try { schema.parse(invalid); return false } catch { /* strict rejection */ } }
      const nestedInvalid = parameter.name === 'range' ? [{ offset: false }, { limit: 'all' }]
        : parameter.name === 'options' ? [{ baseFile: false }, { range: 'all' }, { range: { offset: false } }, { range: { length: 'all' } }] : []
      for (const invalid of nestedInvalid) { try { schema.parse(invalid); return false } catch { /* strict rejection */ } }
    }
    if (descriptor.result.mode !== 'strict') return false
    const schema = descriptor.result.create()
    const stat = { absolutePath: '/synthetic/file', version: 'opaque-v1' }
    const valid = method === 'stat' ? stat : method === 'read' ? { ...stat, offset: 1, text: 'synthetic', lines: 1, eof: true }
      : method === 'readBytes' ? { ...stat, offset: 0, data: new Uint8Array([1]), eof: true }
      : method === 'list' ? { path: '', entries: [], truncated: false } : { kind: 'ready' }
    schema.parse(valid)
    for (const invalid of [undefined, null, true, {}, { absolutePath: 1, version: false }]) { try { schema.parse(invalid); return false } catch { /* strict rejection */ } }
    return true
  } catch { return false }
}
export interface WorkspaceFileAdapterOptions {
  readonly gateway: Pick<TypertGateway, 'invoke' | 'stream'>
  local(): Pick<TypertLocalRegistry, 'get'> | undefined
  service(name: string): unknown
  /** Existing authenticated surface authorization; absent/unknown denies. Not a second permission engine. */
  authorize(method: HostFileMethod, sessionId: string): { readonly available: boolean; readonly reason?: string } | undefined
  /** Session-header cwd, resolved by the existing Host owner; never client cwd or a request field. */
  workspaceRoot(sessionId: string): string | undefined
  /** Explicit strong requirement, refused by the tested native path-based contract. Never inferred from sandboxMode. */
  readonly strictConfined?: boolean
}
export function createWorkspaceFileAdapter(options: WorkspaceFileAdapterOptions): {
  readonly files: HostFilePorts
  readonly boundary: typeof HOST_FILE_READ_BOUNDARY
  gate(method: HostFileMethod, sessionId: string): { readonly available: boolean; readonly reason?: string }
} {
  function gate(method: HostFileMethod, sessionId: string): { available: boolean; reason?: string } {
    const confinement = strictFileConfinementReason(options.strictConfined)
    if (confinement !== undefined) return { available: false, reason: confinement }
    const authorization = options.authorize(method, sessionId)
    if (authorization?.available !== true) return { available: false, reason: authorization?.reason ?? 'Host file permission is not confirmed' }
    const descriptor = options.local()?.get(`workspaceFiles/${method}`)
    if (!nativeWorkspaceFileDescriptor(descriptor, method)) return { available: false, reason: `Official rc.2 workspaceFiles/${method} descriptor is absent or unknown` }
    const service = options.service('workspaceFiles')
    if (service === null || typeof service !== 'object' || typeof Reflect.get(service, method) !== 'function') {
      return { available: false, reason: `Official rc.2 workspaceFiles/${method} descriptor/service is absent or unknown` }
    }
    try { containedHostPath('', options.workspaceRoot(sessionId)) } catch (error) { return { available: false, reason: error instanceof Error ? error.message : String(error) } }
    if (method === 'read' || method === 'readBytes' || method === 'changes') {
      const identity = gate('stat', sessionId)
      if (!identity.available) return { available: false, reason: `Canonical Host file stat is required before content reads: ${identity.reason ?? 'not confirmed'}` }
    }
    return { available: true }
  }
  const require = (method: HostFileMethod, sessionId: string, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const current = gate(method, sessionId)
    if (!current.available) throw new Error(current.reason)
  }
  async function invoke<T>(method: HostFileMethod, sessionId: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<RemoteResult<T>> {
    require(method, sessionId, signal)
    const root = options.workspaceRoot(sessionId)
    if (typeof args.path !== 'string') throw new Error('Invalid Host path argument')
    // Ports consume canonical Host references; baseFile resolution belongs to the client controller.
    let path = containedHostPath(args.path, root)
    if (method === 'readBytes' && typeof args.options === 'object' && args.options !== null && Reflect.get(args.options, 'baseFile') !== undefined) throw new Error('Resolve baseFile through the Host file controller before dispatch')
    try {
      let version: string | undefined
      if (method === 'read' || method === 'readBytes') {
        // Best-effort metadata filter catches an already redirected path. Native opens
        // are still path-based: a later directory/symlink swap can evade these checks.
        const identity = await invoke<HostFileStat>('stat', sessionId, { path }, signal)
        if (!identity.ok) return identity
        path = identity.value.absolutePath; version = identity.value.version
        require(method, sessionId, signal)
        if (options.workspaceRoot(sessionId) !== root) throw new Error('Host workspace changed during canonical file stat')
      }
      const value = await options.gateway.invoke({ namespace: 'workspaceFiles', method, args: { workspaceFileScopeId: sessionId, ...args, path }, ...(signal === undefined ? {} : { signal }) })
      require(method, sessionId, signal)
      if (options.workspaceRoot(sessionId) !== root) throw new Error('Host Session workspace changed during file read')
      const descriptor = options.local()?.get(`workspaceFiles/${method}`)
      if (descriptor?.result.mode !== 'strict') throw new Error('Workspace file result contract changed')
      const parsed = descriptor.result.create().parse(value)
      if (parsed !== null && typeof parsed === 'object') {
        const absolutePath = Reflect.get(parsed, 'absolutePath')
        if (typeof absolutePath === 'string') containedHostPath(absolutePath, root)
        if (version !== undefined && Reflect.get(parsed, 'version') !== version) throw new Error('Host file changed after stat; refresh before reading another page')
        if (method === 'list' && (typeof Reflect.get(parsed, 'path') !== 'string' || containedHostPath(Reflect.get(parsed, 'path'), root) !== path)) throw new Error('Host listing belongs to another workspace directory')
      }
      return { ok: true as const, value: parsed as T }
    } catch (error) { const failure = remoteErrorOf(error); if (failure === undefined) throw error; return { ok: false as const, error: failure } }
  }
  return { gate, boundary: HOST_FILE_READ_BOUNDARY, files: {
    read: (sessionId, path, range, signal) => invoke<HostFileText>('read', sessionId, { path, range }, signal),
    stat: (sessionId, path, signal) => invoke<HostFileStat>('stat', sessionId, { path }, signal),
    readBytes: (sessionId, path, options, signal) => invoke<HostFileBytes>('readBytes', sessionId, { path, options }, signal),
    list: (sessionId, path, signal) => invoke<HostDirectory>('list', sessionId, { path }, signal),
    changes: async (sessionId, path, signal) => {
      require('changes', sessionId, signal)
      const root = options.workspaceRoot(sessionId)
      const target = containedHostPath(path, root)
      const identity = await invoke<HostFileStat>('stat', sessionId, { path: target }, signal)
      if (!identity.ok) throw identity.error
      require('changes', sessionId, signal)
      if (options.workspaceRoot(sessionId) !== root) throw new Error('Host workspace changed while resolving observation target')
      const stream = await options.gateway.stream({ namespace: 'workspaceFiles', method: 'changes', args: { workspaceFileScopeId: sessionId, path: identity.value.absolutePath }, signal })
      const dispose = () => { if ('dispose' in stream && typeof stream.dispose === 'function') return stream.dispose() }
      try { require('changes', sessionId, signal); if (options.workspaceRoot(sessionId) !== root) throw new Error('Host workspace changed while opening observation') }
      catch (error) {
        try { await closeHostFileStream(stream) }
        catch (cleanup) { throw new HostFileStreamCleanupFailure([error, cleanup]) }
        throw error
      }
      return { dispose, async *[Symbol.asyncIterator]() {
        try {
          for await (const frame of stream) {
            require('changes', sessionId, signal)
            if (options.workspaceRoot(sessionId) !== root) throw new Error('Host Session workspace changed during observation')
            const descriptor = options.local()?.get('workspaceFiles/changes')
            if (descriptor?.result.mode !== 'strict') throw new Error('Workspace file watch contract changed')
            const parsed = descriptor.result.create().parse(frame)
            if (parsed !== null && typeof parsed === 'object' && Reflect.get(parsed, 'kind') === 'change') {
              const change = Reflect.get(parsed, 'change')
              if (change !== null && typeof change === 'object') containedHostPath(Reflect.get(change, 'absolutePath'), root)
            }
            yield parsed
          }
        } finally { await dispose() }
      } }
    },
  } }
}
