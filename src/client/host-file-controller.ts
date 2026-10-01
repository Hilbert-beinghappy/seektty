/** Host execution-world file ports, tested against dsh 0.2.0-rc.2. Never reads client files. */
import { posix, win32 } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { linkedManagementSignal, observeManagement } from './management-lifetime.ts'

export interface HostFileScope { readonly sessionId: SessionId; readonly generation: number; readonly ready: boolean; readonly hostWorkspacePath?: string }
export interface HostFileSource { getSnapshot(): HostFileScope; subscribe(listener: () => void): () => void }
export interface HostFileStat { readonly absolutePath: string; readonly version: string; readonly bytes?: number }
export interface HostFileText extends HostFileStat { readonly offset: number; readonly text: string; readonly lines: number; readonly eof: boolean }
export interface HostFileBytes extends HostFileStat { readonly offset: number; readonly data: Uint8Array; readonly eof: boolean }
export interface HostFileRange { readonly offset?: number; readonly limit?: number }
export interface HostByteOptions { readonly baseFile?: string; readonly range?: { readonly offset?: number; readonly length?: number } }
export interface HostDirectory { readonly path: string; readonly entries: readonly { readonly name: string; readonly type: 'file' | 'directory' | 'other'; readonly size?: number }[]; readonly truncated: boolean }
export type HostFileMethod = 'read' | 'stat' | 'readBytes' | 'list' | 'changes'
/** Published rc.2 boundary fact, not a capability inferred from a provider name or sandboxMode. */
export const HOST_FILE_READ_BOUNDARY = Object.freeze({ testedDsh: '0.2.0-rc.2', atomicStrictConfined: false as const })
export const HOST_FILE_READ_NOTICE = 'Host reads use backend authorization. Workspace path checks do not provide atomic confinement during directory or symlink changes.'
export function strictFileConfinementReason(strictConfined: boolean | undefined): string | undefined {
  if (strictConfined === undefined || strictConfined === false) return undefined
  if (strictConfined === true) return 'Strict workspace confinement is unavailable: official dsh 0.2.0-rc.2 file ports provide path-based reads, without an atomic confined-read handle'
  return 'Unknown strictConfined requirement; Host file operation is disabled'
}
export interface HostFilePorts {
  read(sessionId: SessionId, path: string, range: HostFileRange, signal?: AbortSignal): Promise<RemoteResult<HostFileText>>
  stat?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<HostFileStat>>
  readBytes?(sessionId: SessionId, path: string, options: HostByteOptions, signal: AbortSignal): Promise<RemoteResult<HostFileBytes>>
  list?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<HostDirectory>>
  changes?(sessionId: SessionId, path: string, signal: AbortSignal): Promise<AsyncIterable<unknown>>
}
export interface HostFileOptions {
  readonly source: HostFileSource
  readonly files: HostFilePorts
  capability(name: `workspaceFiles/${HostFileMethod}`): { readonly available: boolean; readonly reason?: string } | undefined
  readonly timeoutMs?: number
  /** Require an atomic workspace-only guarantee; rc.2 has no proven native port for it. Default keeps ordinary authorized Host reads. */
  readonly strictConfined?: boolean
}
export function hostFileScopeKey(scope: HostFileScope): string { return JSON.stringify([scope.sessionId, scope.generation, scope.hostWorkspacePath]) }
/** Navigation path filter only. Path checks cannot bind a later filesystem open atomically. */
function hostPathSyntax(path: string, root: string | undefined): typeof posix {
  const absolute = (value: string) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(value)
  if (root === undefined || !absolute(root) || /[\u0000-\u001f\u007f]/u.test(root)) throw new Error('Authoritative Host workspace root is unavailable')
  if (/[\u0000-\u001f\u007f]/u.test(path) || /^(?:~|[A-Za-z][\w+.-]*:)/u.test(path) && !/^[A-Za-z]:[\\/]/u.test(path)) throw new Error('Choose a Host workspace reference, not a client upload or URI')
  const platform = /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(root) ? win32 : posix
  if (platform === posix && (/\\/u.test(path) || /^[A-Za-z]:/u.test(path))) throw new Error('Ambiguous Host path syntax')
  return platform
}
export function containedHostPath(path: string, root: string | undefined): string {
  const platform = hostPathSyntax(path, root)
  const target = platform.resolve(root!, path)
  const relative = platform.relative(platform.resolve(root!), target)
  if (relative === '..' || relative.startsWith(`..${platform.sep}`) || platform.isAbsolute(relative)) throw new Error('Host file reference is outside the Session workspace')
  return target
}
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min
export class HostFileController {
  readonly options: HostFileOptions
  private disposed = false
  private readonly pending = new Set<AbortController>()
  private readonly unsubscribe: () => void
  private scope: string
  constructor(options: HostFileOptions) {
    this.options = options
    this.scope = hostFileScopeKey(options.source.getSnapshot())
    this.unsubscribe = options.source.subscribe(() => {
      const current = options.source.getSnapshot()
      if (!current.ready || hostFileScopeKey(current) !== this.scope) for (const request of this.pending) request.abort()
      this.scope = hostFileScopeKey(current)
    })
  }
  reason(method: HostFileMethod): string | undefined {
    if (this.disposed) return 'Host file controller is closed'
    const confinement = strictFileConfinementReason(this.options.strictConfined)
    if (confinement !== undefined) return confinement
    if (!this.options.source.getSnapshot().ready) return 'Host disconnected; refresh after reconnecting'
    const capability = this.options.capability(`workspaceFiles/${method}`)
    if (capability?.available !== true) return capability?.reason ?? `workspaceFiles/${method} capability is not confirmed`
    if (typeof this.options.files[method] !== 'function') return `No authenticated workspaceFiles/${method} port is attached`
    return undefined
  }
  path(path: string): string { return containedHostPath(path, this.options.source.getSnapshot().hostWorkspacePath) }
  private checkStat(value: HostFileStat, root: string | undefined): void {
    if (typeof value?.absolutePath !== 'string' || typeof value.version !== 'string' || value.version.length === 0
      || value.bytes !== undefined && !integer(value.bytes)) throw new Error('Invalid Host file metadata')
    if (containedHostPath(value.absolutePath, root) !== value.absolutePath) throw new Error('Host file identity is not canonical inside this workspace')
  }
  private async run<T>(method: HostFileMethod, parent: AbortSignal, work: (scope: HostFileScope, signal: AbortSignal) => Promise<T>): Promise<T> {
    parent.throwIfAborted()
    const reason = this.reason(method)
    if (reason !== undefined) throw new Error(reason)
    const scope = this.options.source.getSnapshot()
    const controller = new AbortController()
    this.pending.add(controller)
    const lifetime = linkedManagementSignal(AbortSignal.any([parent, controller.signal]), this.options.timeoutMs ?? 10_000)
    try {
      const result = await observeManagement(work(scope, lifetime.signal), lifetime.signal)
      if (!this.options.source.getSnapshot().ready || hostFileScopeKey(this.options.source.getSnapshot()) !== hostFileScopeKey(scope)) throw new Error('Host scope changed; stale file response discarded')
      const currentReason = this.reason(method)
      if (currentReason !== undefined) throw new Error(currentReason)
      return result
    } finally { lifetime.dispose(); this.pending.delete(controller) }
  }
  stat(path: string, signal: AbortSignal): Promise<HostFileStat> {
    return this.run('stat', signal, async (scope, inner) => {
      const value = unwrap(await this.options.files.stat!(scope.sessionId, containedHostPath(path, scope.hostWorkspacePath), inner))
      this.checkStat(value, scope.hostWorkspacePath)
      return value
    })
  }
  read(path: string, signal: AbortSignal, range: HostFileRange = {}, expectedVersion?: string): Promise<HostFileText> {
    const offset = range.offset ?? 1, limit = range.limit ?? 200
    if (!integer(offset, 1) || !integer(limit, 1) || limit > 200) return Promise.reject(new Error('Invalid text page; limit must be 1–200 lines'))
    return this.run('read', signal, async (scope, inner) => {
      const value = unwrap(await this.options.files.read(scope.sessionId, containedHostPath(path, scope.hostWorkspacePath), { offset, limit }, inner))
      this.checkStat(value, scope.hostWorkspacePath)
      if (typeof value.text !== 'string' || value.offset !== offset || !integer(value.lines) || value.lines > limit
        || typeof value.eof !== 'boolean' || !value.eof && value.lines === 0) throw new Error('Invalid Host text page')
      if (expectedVersion !== undefined && value.version !== expectedVersion) throw new Error('File changed between pages; refresh from start')
      return value
    })
  }
  readBytes(path: string, signal: AbortSignal, options: HostByteOptions = {}, expectedVersion?: string): Promise<HostFileBytes> {
    if (options.range !== undefined && (!integer(options.range.offset ?? 0) || !integer(options.range.length ?? 65536, 1) || (options.range.length ?? 65536) > 65536)) return Promise.reject(new Error('Invalid byte page; limit is 65536 bytes'))
    return this.run('readBytes', signal, async (scope, inner) => {
      const baseFile = options.baseFile === undefined ? undefined : containedHostPath(options.baseFile, scope.hostWorkspacePath)
      // Validate the original vocabulary before resolve() could turn an upload URI into a filename.
      hostPathSyntax(path, scope.hostWorkspacePath)
      const platform = /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(scope.hostWorkspacePath!) ? win32 : posix
      const target = baseFile === undefined ? containedHostPath(path, scope.hostWorkspacePath)
        : containedHostPath(platform.resolve(platform.dirname(baseFile), path), scope.hostWorkspacePath)
      const value = unwrap(await this.options.files.readBytes!(scope.sessionId, target, { range: { offset: options.range?.offset ?? 0, length: options.range?.length ?? 65536 } }, inner))
      this.checkStat(value, scope.hostWorkspacePath)
      if (!(value.data instanceof Uint8Array) || value.data.length > (options.range?.length ?? 65536)
        || value.offset !== (options.range?.offset ?? 0) || typeof value.eof !== 'boolean' || !value.eof && value.data.length === 0) throw new Error('Invalid Host byte page')
      if (expectedVersion !== undefined && value.version !== expectedVersion) throw new Error('File changed between byte pages; refresh from start')
      return { ...value, data: new Uint8Array(value.data) }
    })
  }
  list(path: string, signal: AbortSignal): Promise<HostDirectory> {
    return this.run('list', signal, async (scope, inner) => {
      const target = containedHostPath(path, scope.hostWorkspacePath)
      const value = unwrap(await this.options.files.list!(scope.sessionId, target, inner))
      if (typeof value?.path !== 'string' || /^(?:\/|[A-Za-z]:|\\)/u.test(value.path)
        || containedHostPath(value.path, scope.hostWorkspacePath) !== target || !Array.isArray(value.entries) || typeof value.truncated !== 'boolean') throw new Error('Invalid Host directory listing')
      const seen = new Set<string>()
      for (const entry of value.entries) {
        if (typeof entry.name !== 'string' || entry.name === '' || entry.name === '.' || entry.name === '..' || /[\\/\u0000-\u001f\u007f]/u.test(entry.name)
          || !['file', 'directory', 'other'].includes(entry.type) || entry.size !== undefined && !integer(entry.size) || seen.has(entry.name)) throw new Error('Invalid Host directory entry')
        seen.add(entry.name)
      }
      return value
    })
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.unsubscribe(); for (const request of this.pending) request.abort(); this.pending.clear() }
}
