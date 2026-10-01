/** Same-process rc.2 Files composition, scoped to an exact ordinary live Agent. */
import { symbols, type Context } from '@deepseek-ai/cordis'
import { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionOpenWorkspacePathValue } from '@deepseek-ai/dsh-api-session-controller/types'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-session-controller/remote'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { TuiManagementBridge } from '../protocol.ts'
import { createFileReceiptPort, type FileReceiptScope } from './file-receipt-bridge.ts'

const openDescriptor = TYPERT_REMOTE.descriptors.find(row => row.id === '@deepseek-ai/dsh-api-session-controller#session/openWorkspacePath')!
function descriptorContract(d: InvocationDescriptor): string {
  const codec = (c: InvocationDescriptor['result']) => c.mode === 'strict'
    ? { mode: c.mode, typeSymbol: c.typeSymbol, factory: typeof c.create === 'function' } : { mode: c.mode }
  return JSON.stringify({ id: d.id, service: d.service, namespace: d.namespace, method: d.method,
    implementation: d.implementation, invocation: d.invocation, scope: d.scope, mode: d.mode, uplink: d.uplink,
    parameters: d.parameters.map(p => ({ name: p.name, wire: p.wire, source: p.source, lookup: p.lookup,
      acceptsUndefined: p.acceptsUndefined, codec: codec(p.codec) })), cancellation: d.cancellation, result: codec(d.result) })
}
function original(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, symbols.original) ?? value : value
}
export function createFileIntakeManagement(ctx: Context): Pick<TuiManagementBridge, 'fileReceipts'> {
  const owners = new WeakMap<object, { uploads: unknown; store: unknown; generation: number; token: object }>()
  let generation = 0
  const read = (sessionId: string): { scope: FileReceiptScope; owner?: object } => {
    const agents = ctx.get('agents'), agent = agents?.get(SessionId(sessionId))
    const live = agent !== undefined && agent.id === sessionId
      && agents?.roots().some(root => original(root) === original(agent)) === true
    const rawAgent = original(agent), uploads = original(ctx.get('fileUploads' as never))
    const store = original(agent?.ctx.get('attachments'))
    const key = live && typeof rawAgent === 'object' && rawAgent !== null ? rawAgent : undefined
    let owner = key === undefined ? undefined : owners.get(key)
    if (key !== undefined && (owner === undefined || owner.uploads !== uploads || owner.store !== store)) {
      owner = { uploads, store, generation: ++generation, token: {} }
      owners.set(key, owner)
    }
    // The abstract provider exposes saveFile but deliberately rejects it. An
    // actual provider override confirms composition, not guaranteed write success.
    const files = store instanceof AttachmentStore && store.saveFile !== AttachmentStore.prototype.saveFile
    return { scope: { sessionId: SessionId(sessionId), generation: owner?.generation ?? -1,
      ready: live && ctx.get('typertGateway') !== undefined, files }, ...(owner === undefined ? {} : { owner: owner.token }) }
  }
  return { fileReceipts: { forSession: sessionId => {
    const port = () => {
      const current = read(sessionId)
      return createFileReceiptPort(ctx, current.scope, () => read(sessionId).scope)
    }
    return {
      owner: () => read(sessionId).owner,
      reason: () => port().gate('upload').reason,
      referencesReason: () => port().gate('references').reason,
      // Rebind each operation to the current Host lifecycle, not UI selection.
      // Returning to the same Agent preserves its valid unsent receipt draft.
      remote: {
        fileUploads: { upload: (id, request, signal) => port().remote.fileUploads!.upload(id, request, signal) },
        fileReferences: { list: (id, query, signal) => port().remote.fileReferences!.list(id, query, signal) },
        session: { openWorkspacePath: async (request, signal) => {
          signal?.throwIfAborted()
          const scope = read(sessionId)
          if (!scope.scope.ready) throw new Error('Exact live ordinary Agent is unavailable')
          const endpoint = ctx.get('typert')?.local.get('session/openWorkspacePath')
          if (endpoint === undefined || descriptorContract(endpoint) !== descriptorContract(openDescriptor)) throw new Error('Native external file opening is unavailable')
          const result = openDescriptor.result, parameter = openDescriptor.parameters[0]!.codec
          if (result.mode !== 'strict' || parameter.mode !== 'strict') throw new Error('Native external-open codec is unknown')
          const value = result.create().parse(await ctx.typertGateway.invoke({ namespace: 'session', method: 'openWorkspacePath',
            args: { request: parameter.create().parse(request) }, ...(signal === undefined ? {} : { signal }) })) as SessionOpenWorkspacePathValue
          signal?.throwIfAborted()
          if (read(sessionId).owner !== scope.owner) throw new Error('External file opening outcome unknown: Agent changed')
          return { ok: true, value }
        } },
      },
    }
  } } }
}
