import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT } from '@deepseek-ai/dsh-client-file-upload/typert'
import { TYPERT as SESSION } from '@deepseek-ai/dsh-api-session-controller/typert'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { createFileReceiptPort, type FileReceiptScope } from '../src/host/file-receipt-bridge.ts'

const id = 'file-fixture' as SessionId
const receipt = { receiptId: 'receipt', file: { attachmentId: 'stored', name: 'voice.mp3', bytes: 4 } }
const request = { data: 'YWJjZA==', name: 'voice.mp3' }
function fixture(timeout = 100) {
  let scope: FileReceiptScope | undefined = { sessionId: id, generation: 7, ready: true, files: true }
  const descriptors = new Map([...(TYPERT as { invocations: readonly InvocationDescriptor[] }).invocations,
    ...(SESSION as { invocations: readonly InvocationDescriptor[] }).invocations].map(row => [`${row.namespace}/${row.method}`, row]))
  const invoke = vi.fn(async ({ namespace }: { namespace: string }) => namespace === 'fileUploads' ? receipt : [{ path: '目录/my file', kind: 'file' }])
  const services: Record<string, unknown> = { typert: { local: { get: (endpoint: string) => descriptors.get(endpoint) } },
    typertGateway: { invoke }, fileUploads: { upload() {} }, sessionFileReferences: { list() {} } }
  const ctx = { get: (key: string) => services[key], typertGateway: services.typertGateway } as unknown as Context
  const port = createFileReceiptPort(ctx, scope, () => scope, timeout)
  return { port, invoke, descriptors, services, setScope: (value: FileReceiptScope | undefined) => { scope = value },
    scope: () => scope! }
}

describe('published file receipt Host port (dsh 0.2.0-rc.2)', () => {
  it('uses the exact official namespace/wire arguments and wraps decoded business values', async () => {
    const f = fixture()
    expect(f.port.gate('upload')).toEqual({ available: true })
    expect(await f.port.remote.fileUploads!.upload(id, request)).toEqual({ ok: true, value: receipt })
    expect(f.invoke).toHaveBeenCalledWith({ namespace: 'fileUploads', method: 'upload', args: { agentId: id, request }, signal: expect.any(AbortSignal) })
    expect(await f.port.remote.fileReferences!.list(id, '目录')).toEqual({ ok: true, value: [{ path: '目录/my file', kind: 'file' }] })
    expect(f.invoke).toHaveBeenLastCalledWith({ namespace: 'fileReferences', method: 'list', args: { agentId: id, query: '目录' }, signal: expect.any(AbortSignal) })
  })
  it.each([undefined, false])('rejects unconfirmed Files=%s but preserves path-only reference lookup', async files => {
    const f = fixture(); const { files: _files, ...rest } = f.scope()
    f.setScope({ ...rest, ...(files === undefined ? {} : { files }) })
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toThrow('unconfirmed')
    expect(f.invoke).not.toHaveBeenCalled()
    expect(f.port.gate('references').available).toBe(true)
  })
  it.each(['id', 'service', 'implementation', 'namespace', 'method', 'invocation', 'scope', 'parameters', 'cancellation', 'result'] as const)('rejects mismatched descriptor %s before dispatch', async key => {
    const f = fixture(); const original = f.descriptors.get('fileUploads/upload')!
    const changes = { id: 'src:fileUploads/upload', service: 'other', implementation: 'other', namespace: 'other', method: 'other',
      invocation: { kind: 'context', context: 'agent', wire: 'agentId', codec: { mode: 'src-json' } }, scope: { context: 'agent', wire: 'sessionId' },
      parameters: original.parameters.slice(1), cancellation: undefined, result: { mode: 'src-json' } }
    f.descriptors.set('fileUploads/upload', { ...original, [key]: changes[key] } as typeof original)
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toThrow('descriptor')
    expect(f.invoke).not.toHaveBeenCalled()
  })
  it.each(['descriptor', 'receiver', 'method', 'gateway'])('rejects missing %s rather than guessing another service', async missing => {
    const f = fixture()
    if (missing === 'descriptor') f.descriptors.delete('fileUploads/upload')
    else if (missing === 'gateway') delete f.services.typertGateway
    else f.services.fileUploads = missing === 'receiver' ? undefined : {}
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toThrow()
    expect(f.invoke).not.toHaveBeenCalled()
  })
  it('requires the actual sessionFileReferences service, not a similarly named resolver', () => {
    const f = fixture(); delete f.services.sessionFileReferences
    f.services.fileReferences = { list() {} }; f.services.sessionReferenceResolver = { candidates() {} }
    expect(f.port.gate('references').available).toBe(false)
  })
  it('rejects invalid published inputs and foreign Session IDs without invocation', async () => {
    const f = fixture()
    await expect(f.port.remote.fileUploads!.upload('foreign' as SessionId, request)).rejects.toThrow('another Session')
    await expect(f.port.remote.fileUploads!.upload(id, { data: 2 } as never)).rejects.toThrow()
    expect(f.invoke).not.toHaveBeenCalled()
  })
  it.each(['switch', 'reconnect', 'unready', 'absent'] as const)('rejects admission after %s', async change => {
    const f = fixture(); const previous = f.scope()
    f.setScope(change === 'absent' ? undefined : { ...previous,
      ...(change === 'switch' ? { sessionId: 'other' as SessionId } : {}),
      ...(change === 'reconnect' ? { generation: previous.generation + 1 } : {}),
      ...(change === 'unready' ? { ready: false } : {}) })
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toThrow('changed')
    expect(f.invoke).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'timeout', 'lifetime', 'generation', 'capability'] as const)('discards a late upload after %s without retry or foreign cleanup', async mode => {
    const f = fixture(mode === 'timeout' ? 10 : 200)
    const pendingValue = Promise.withResolvers<typeof receipt>()
    f.invoke.mockImplementationOnce(() => pendingValue.promise)
    const abort = new AbortController()
    const pending = f.port.remote.fileUploads!.upload(id, request, abort.signal)
    const rejected = expect(pending).rejects.toThrow('outcome unknown')
    await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledOnce())
    if (mode === 'cancel') abort.abort(new Error('cancelled'))
    if (mode === 'lifetime') {
      const lifetime = new AbortController(); f.setScope({ ...f.scope(), signal: lifetime.signal }); lifetime.abort()
    }
    if (mode === 'generation') f.setScope({ ...f.scope(), generation: 8 })
    if (mode === 'capability') f.setScope({ ...f.scope(), files: false })
    // A lifetime introduced after dispatch is rechecked on completion; owners
    // must also abort the lifetime captured when binding for prompt cancellation.
    if (mode !== 'timeout' && mode !== 'cancel') pendingValue.resolve(receipt)
    await rejected
    pendingValue.resolve(receipt); await Promise.resolve()
    expect(f.invoke).toHaveBeenCalledOnce()
    expect(Object.keys(f.port.remote)).toEqual(['fileUploads', 'fileReferences'])
  })
  it('bounds a nonresponsive carrier on an already bound lifetime abort', async () => {
    const f = fixture(); const lifetime = new AbortController(); f.setScope({ ...f.scope(), signal: lifetime.signal })
    f.invoke.mockImplementationOnce(() => new Promise(() => {}))
    const pending = f.port.remote.fileUploads!.upload(id, request)
    const rejected = expect(pending).rejects.toThrow('outcome unknown')
    await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledOnce())
    lifetime.abort(new Error('disconnected')); await rejected
    expect(f.invoke).toHaveBeenCalledOnce()
  })
  it('preserves an explicit official rejection without claiming successful cancellation', async () => {
    const f = fixture(); const denial = new RemoteError('session/attachment-invalid', 'refused', { reason: 'fixture' })
    f.invoke.mockRejectedValueOnce(denial)
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toBe(denial)
    expect(f.invoke).toHaveBeenCalledOnce()
  })
  it.each(['carrier', 'malformed'])('reports %s response ambiguity and does not retry', async failure => {
    const f = fixture()
    if (failure === 'carrier') f.invoke.mockRejectedValueOnce(new Error('lost reply'))
    else f.invoke.mockResolvedValueOnce({ receiptId: 'only' } as never)
    await expect(f.port.remote.fileUploads!.upload(id, request)).rejects.toThrow('outcome unknown')
    expect(f.invoke).toHaveBeenCalledOnce()
  })
  it('bounds an unresponsive reference query and consumes its late rejection', async () => {
    const f = fixture(5); const late = Promise.withResolvers<never>()
    f.invoke.mockImplementationOnce(() => late.promise)
    await expect(f.port.remote.fileReferences!.list(id, '')).rejects.toThrow('timed out')
    late.reject(new Error('late carrier error')); await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.invoke).toHaveBeenCalledOnce()
  })
})
