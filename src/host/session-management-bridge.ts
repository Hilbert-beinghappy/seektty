/** A transient view of native Host Workspace state, never a second persistence owner. */
import { symbols, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-workspace-controller'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { WorkspaceBaseline, WorkspaceFollowFrame } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { TuiManagementBridge } from '../protocol.ts'
import { createWorkspaceFileAdapter } from './workspace-file-adapter.ts'
import { observeManagement } from '../client/management-lifetime.ts'
import { containedHostPath } from '../client/host-file-controller.ts'
import { mountedArtifactReviewReader, publishedSessionManagementMethods } from './session-management-support.ts'

export function workspaceBrowserFrame(state: WorkspaceBaseline | undefined, frame: WorkspaceFollowFrame): WorkspaceBaseline | undefined {
  if (frame.type === 'baseline') return frame.value
  if (state === undefined) return undefined
  if (frame.type === 'pinned') return { ...state, pinnedSessionIds: frame.pinnedSessionIds }
  if (frame.type === 'archived') return { ...state, archivedSessionIds: frame.archivedSessionIds }
  if (frame.type === 'remove') return { ...state, items: state.items.filter(row => row.workspaceId !== frame.workspaceId) }
  if (frame.type === 'upsert') {
    const found = state.items.some(row => row.workspaceId === frame.workspace.workspaceId)
    return { ...state, items: found ? state.items.map(row => row.workspaceId === frame.workspace.workspaceId ? frame.workspace : row) : [...state.items, frame.workspace] }
  }
  const byId = new Map(state.items.map(row => [row.workspaceId, row]))
  return { ...state, items: [...frame.workspaceIds.flatMap(id => byId.get(id) ?? []), ...state.items.filter(row => !frame.workspaceIds.includes(row.workspaceId))] }
}

export function createSessionManagementPorts(ctx: Context): Pick<TuiManagementBridge, 'sessionManagement' | 'artifacts'> {
  const service = (key: string): unknown => ctx.get(key as never)
  const local = () => ctx.get('typert')?.local
  const original = (value: unknown): unknown => typeof value === 'object' && value !== null ? Reflect.get(value, symbols.original) ?? value : value
  const roots = new Map<string, { path: string; cwd: string; fs: unknown; files: unknown; gateway: unknown; lookup: unknown; liveCwd: unknown }>()
  const scopeLookup = () => {
    const lookup = ctx.get('typert')?.lookups.get('workspaceFileScope')
    return lookup?.parameter === 'workspaceFileScope' && lookup.wire === 'workspaceFileScopeId'
      && lookup.hostTypeSymbol === '@deepseek-ai/dsh-api-workspace-files#WorkspaceFileScope'
      && lookup.wireTypeSymbol === '@deepseek-ai/dsh-session/types#SessionId' ? lookup : undefined
  }
  const liveCwd = (id: string) => ctx.get('sessions')?.get(id as never)?.header.cwd
  const workspaceRoot = (id: string): string | undefined => {
    const root = roots.get(id)
    return root !== undefined && root.fs === original(service('fs')) && root.files === original(service('workspaceFiles'))
      && root.gateway === original(service('typertGateway')) && root.lookup === scopeLookup() && root.liveCwd === liveCwd(id) ? root.path : undefined
  }
  const prepareRootWork = async (id: string, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted()
    const lookup = scopeLookup(), fs = ctx.get('fs'), files = original(service('workspaceFiles')), gateway = original(service('typertGateway'))
    if (lookup === undefined || fs === undefined || files === undefined || gateway === undefined) throw new Error('Native Host file authority is unavailable')
    const readScope = async () => {
      const value = await lookup.resolve(id)
      if (typeof value !== 'object' || value === null || Reflect.get(value, 'sessionId') !== id || typeof Reflect.get(value, 'workspaceRoot') !== 'string') throw new Error('Native Session file scope is unavailable')
      return Reflect.get(value, 'workspaceRoot') as string
    }
    const cwd = await readScope(), headerCwd = liveCwd(id)
    // Resolve inside the Host filesystem execution world. No client realpath or Agent activation.
    const target = await fs.resolve(cwd, { signal }), path = fs.processPath(target)
    containedHostPath('', path)
    signal.throwIfAborted()
    if (scopeLookup() !== lookup || original(ctx.get('fs')) !== original(fs) || original(service('workspaceFiles')) !== files
      || original(service('typertGateway')) !== gateway || headerCwd !== liveCwd(id) || await readScope() !== cwd) throw new Error('Host file scope changed while resolving its root')
    signal.throwIfAborted()
    roots.set(id, { path, cwd, fs: original(fs), files, gateway, lookup, liveCwd: headerCwd }); notify()
  }
  const prepareRoot = (id: string, signal: AbortSignal) => observeManagement(prepareRootWork(id, signal), signal)
  const nativeFiles = createWorkspaceFileAdapter({ gateway: ctx.typertGateway, local, service, workspaceRoot,
    // This same-process bridge is the mounted native operator surface. Gateway resolves
    // its OperatorPeer and file-scope lookup; filesystem providers retain actual authority.
    // Tool approval is not a fabricated permission for these Agentless file Remote methods.
    authorize: (_method, id) => ({ available: workspaceRoot(id) !== undefined && ctx.get('typertGateway') !== undefined,
      reason: 'Confirmed native operator file scope/root is unavailable' }),
  })
  const available = (endpoint: string): boolean => {
    if (endpoint.startsWith('workspaceChanges/')) {
      return mountedArtifactReviewReader(service('workspaceChanges')) !== undefined
    }
    const descriptor = local()?.get(endpoint)
    if (descriptor === undefined || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== 'direct') return false
    const receiver = service(descriptor.service)
    return receiver !== undefined && receiver !== null && typeof Reflect.get(Object(receiver), descriptor.implementation ?? descriptor.method) === 'function'
  }
  let state: WorkspaceBaseline | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  const controller = ctx.get('workspaceController')
  if (controller !== undefined) ctx.effect(() => {
    const lifetime = new AbortController()
    void (async () => {
      try {
        for await (const frame of controller.follow(lifetime.signal)) {
          if (lifetime.signal.aborted) return
          state = workspaceBrowserFrame(state, frame); notify()
        }
      } finally { state = undefined; notify() }
    })().catch(() => { /* Absence is observable; never retain a dead baseline. */ })
    return () => { lifetime.abort(); state = undefined; notify(); listeners.clear() }
  }, 'tui: native Workspace browser baseline')
  ctx.effect(() => () => { roots.clear(); notify() }, 'tui: transient Host file roots')
  return {
    sessionManagement: {
      snapshot: () => state,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      methods: () => publishedSessionManagementMethods(local(), service),
    },
    artifacts: {
      available: endpoint => endpoint.startsWith('workspaceFiles/') ? local()?.get(endpoint) !== undefined : available(endpoint),
      ...nativeFiles.files,
      gate: nativeFiles.gate,
      workspaceRoot,
      openReason: id => {
        const root = workspaceRoot(id), fs = ctx.get('fs')
        return root !== undefined && fs !== undefined && fs.processPathFromHostPath(root) !== undefined
          ? undefined : 'Host filesystem has no confirmed desktop mapping for this workspace'
      },
      prepareRoot,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      summary: (sessionId, seq) => mountedArtifactReviewReader(service('workspaceChanges'))?.summary(sessionId as never, seq),
      diff: async (sessionId, seq, index, signal) => mountedArtifactReviewReader(service('workspaceChanges'))?.diff(sessionId as never, seq, index, signal),
    },
  }
}
