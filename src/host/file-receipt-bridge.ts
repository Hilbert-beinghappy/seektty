/** Exact dsh 0.2.0-rc.2 file receipt ports over the existing native Gateway.
 * FileAttachmentController already consumes these Native Remote signatures.
 * No upload route, receipt store, credential, retry or Host cleanup API is added.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT_REMOTE as UPLOAD } from '@deepseek-ai/dsh-client-file-upload/remote'
import { TYPERT_REMOTE as SESSION } from '@deepseek-ai/dsh-api-session-controller/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileAttachmentRemote } from '../client/file-attachments.ts'
import { RemoteOperationScope } from '../client/remote-operation.ts'

export interface FileReceiptScope {
  readonly sessionId: SessionId
  readonly generation: number
  readonly ready: boolean
  /** Confirmed Host Files intake. Missing metadata is unknown, not supported. */
  readonly files?: boolean
  /** Existing Session/connection/Surface lifetime, aborted by its owner. */
  readonly signal?: AbortSignal
}
export interface FileReceiptPort {
  readonly remote: FileAttachmentRemote
  gate(method: 'upload' | 'references'): { readonly available: boolean; readonly reason?: string }
}
const upload = UPLOAD.descriptors.find(row => row.id === '@deepseek-ai/dsh-client-file-upload#fileUploads/upload')!
const references = SESSION.descriptors.find(row => row.id === '@deepseek-ai/dsh-api-session-controller#fileReferences/list')!

function contract(descriptor: InvocationDescriptor): string {
  const codec = (value: InvocationDescriptor['result']) => value.mode === 'strict'
    ? { mode: value.mode, typeSymbol: value.typeSymbol, factory: typeof value.create === 'function' } : { mode: value.mode }
  return JSON.stringify({ id: descriptor.id, service: descriptor.service, namespace: descriptor.namespace,
    method: descriptor.method, implementation: descriptor.implementation, invocation: descriptor.invocation,
    scope: descriptor.scope, mode: descriptor.mode, uplink: descriptor.uplink,
    parameters: descriptor.parameters.map(parameter => ({ name: parameter.name, wire: parameter.wire,
      source: parameter.source, lookup: parameter.lookup, acceptsUndefined: parameter.acceptsUndefined, codec: codec(parameter.codec) })),
    cancellation: descriptor.cancellation, result: codec(descriptor.result) })
}
function decode(codec: InvocationDescriptor['result'], value: unknown): unknown {
  if (codec.mode !== 'strict') throw new Error('Expected the published strict file receipt codec')
  return codec.create().parse(value)
}

/** Bind once to the actual current Session generation; create a new port on switch/reconnect. */
export function createFileReceiptPort(ctx: Context, target: FileReceiptScope,
  current: () => FileReceiptScope | undefined, timeoutMs = 15_000): FileReceiptPort {
  const bound = { ...target }
  const gate = (method: 'upload' | 'references'): ReturnType<FileReceiptPort['gate']> => {
    const scope = current()
    if (!bound.ready || !scope?.ready || scope.sessionId !== bound.sessionId || scope.generation !== bound.generation
      || bound.signal?.aborted || scope.signal?.aborted) return { available: false, reason: 'Attachment Session/connection changed; refresh' }
    if (method === 'upload' && (bound.files !== true || scope.files !== true)) return { available: false, reason: 'Host Files intake is absent, disabled, or unconfirmed' }
    const expected = method === 'upload' ? upload : references
    try {
      const descriptor = ctx.get('typert')?.local.get(`${expected.namespace}/${expected.method}`)
      if (descriptor === undefined || contract(descriptor) !== contract(expected)) return { available: false, reason: 'Published file receipt descriptor is absent or incompatible (tested dsh 0.2.0-rc.2)' }
      const receiver: unknown = ctx.get(expected.service as never)
      if (receiver === undefined || receiver === null || typeof Reflect.get(Object(receiver), expected.implementation ?? expected.method) !== 'function'
        || typeof ctx.get('typertGateway')?.invoke !== 'function') return { available: false, reason: 'Native file receipt service/Gateway is not mounted' }
    } catch { return { available: false, reason: 'Native file receipt capability is unknown' } }
    return { available: true }
  }
  const invoke = async <T>(method: 'upload' | 'references', agentId: SessionId, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: true; value: T }> => {
    if (agentId !== bound.sessionId) throw new Error('File receipt port cannot target another Session')
    const descriptor = method === 'upload' ? upload : references
    const signals = [signal, bound.signal, current()?.signal].filter((value): value is AbortSignal => value !== undefined)
    let dispatched = false
    let refused = false
    try { return await new RemoteOperationScope().run(async inner => {
      const admission = gate(method)
      if (!admission.available) throw new Error(admission.reason)
      // Native invoke returns a business value without decoding it. Apply the
      // same published codecs the generated Remote uses, not a second schema.
      const wire = Object.fromEntries(descriptor.parameters.map(parameter => [parameter.wire,
        decode(parameter.codec, args[parameter.wire])]))
      inner.throwIfAborted()
      dispatched = true
      let value: unknown
      try {
        value = await ctx.typertGateway.invoke({ namespace: descriptor.namespace, method: descriptor.method, args: wire, signal: inner })
      } catch (error) {
        refused = remoteErrorOf(error) !== undefined
        throw error
      }
      inner.throwIfAborted()
      const completion = gate(method)
      if (!completion.available) throw new Error('Attachment result belongs to an obsolete Session/capability; upload outcome not confirmed')
      return { ok: true as const, value: decode(descriptor.result, value) as T }
    }, timeoutMs, signals.length === 0 ? undefined : AbortSignal.any(signals))
    } catch (error) {
      // Abort and transport failure cannot revoke an upload that has already
      // reached storage. Report ambiguity without retrying or deleting files.
      if (method === 'upload' && dispatched && !refused) throw new Error(`File upload outcome unknown; refresh before any explicit retry: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      throw error
    }
  }
  return { gate, remote: {
    fileUploads: { upload: (agentId, request, signal) => invoke('upload', agentId, { agentId, request }, signal) },
    fileReferences: { list: (agentId, query, signal) => invoke('references', agentId, { agentId, query }, signal) },
  } }
}
