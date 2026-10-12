import { Context, Service } from '@deepseek-ai/cordis'
import { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { TYPERT_REMOTE as UPLOAD } from '@deepseek-ai/dsh-client-file-upload/remote'
import { TYPERT_REMOTE as SESSION } from '@deepseek-ai/dsh-api-session-controller/remote'
import { expect, it, vi } from 'vitest'
import { createFileIntakeManagement } from '../src/host/file-intake-management.ts'

async function fixture(files = true) {
  const ctx = new Context()
  class Store extends AttachmentStore {
    saveFile() { return Promise.resolve({ attachmentId: 'synthetic-digest', name: 'file', bytes: 1 }) }
  }
  const store = files ? new Store(ctx) : new AttachmentStore(ctx)
  const descriptors = new Map([...UPLOAD.descriptors, ...SESSION.descriptors].map(d => [`${d.namespace}/${d.method}`, d]))
  let agent = { id: 'root', ctx }
  const agents = new Service(ctx, 'agents'); agents.get = id => id === 'root' ? agent : undefined; agents.roots = () => agent ? [agent] : []
  const uploads = new Service(ctx, 'fileUploads'); uploads.upload = () => {}
  const references = new Service(ctx, 'sessionFileReferences'); references.list = () => {}
  const controller = new Service(ctx, 'sessionController'); controller.openWorkspacePath = () => {}
  const typert = new Service(ctx, 'typert'); typert.local = { get: id => descriptors.get(id) }
  const gateway = new Service(ctx, 'typertGateway')
  gateway.invoke = vi.fn(async request => request.namespace === 'fileUploads' ? { receiptId: 'receipt', file: { attachmentId: 'digest', name: 'file', bytes: 1 } }
    : request.namespace === 'fileReferences' ? [{ path: '目录/f.txt', kind: 'file' }] : { opened: true })
  return { ctx, bridge: createFileIntakeManagement(ctx).fileReceipts, store, gateway, agents, descriptors,
    replace: () => { agent = { id: 'root', ctx } }, remove: () => { agent = undefined } }
}
it('confirms a real AttachmentStore override and preserves an owner across fresh contextual proxies', async () => {
  const f = await fixture()
  try {
    const first = f.bridge.forSession('root'), second = f.bridge.forSession('root')
    expect(first.reason()).toBeUndefined(); expect(first.owner()).toBe(second.owner())
    expect(await first.remote.fileUploads.upload('root', { data: 'eA==', name: 'x' })).toMatchObject({ ok: true, value: { receiptId: 'receipt' } })
    expect(f.gateway.invoke).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'fileUploads', args: { agentId: 'root', request: { data: 'eA==', name: 'x' } } }))
  } finally { await f.ctx.fiber.dispose() }
})
it('does not confuse the abstract images-only store with Files, while allowing independent path references', async () => {
  const f = await fixture(false)
  try {
    const port = f.bridge.forSession('root')
    expect(port.reason()).toContain('Files intake'); expect(port.referencesReason()).toBeUndefined()
    await expect(port.remote.fileUploads.upload('root', { data: 'eA==' })).rejects.toThrow('Files intake')
    expect(await port.remote.fileReferences.list('root', 'f')).toMatchObject({ ok: true, value: [{ path: '目录/f.txt' }] })
    expect(f.gateway.invoke).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
it('rebinds later operations to a fresh Agent and rejects earlier late receipts after owner replacement', async () => {
  const f = await fixture(), port = f.bridge.forSession('root'); let finish
  try {
    const before = port.owner()
    f.gateway.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = port.remote.fileUploads.upload('root', { data: 'eA==' })
    const rejected = expect(pending).rejects.toThrow('unknown')
    await vi.waitFor(() => expect(f.gateway.invoke).toHaveBeenCalledOnce())
    f.replace(); expect(port.owner()).not.toBe(before)
    finish({ receiptId: 'late', file: { attachmentId: 'digest', name: 'file', bytes: 1 } }); await rejected
    await expect(port.remote.fileUploads.upload('root', { data: 'eA==' })).resolves.toMatchObject({ ok: true })
  } finally { await f.ctx.fiber.dispose() }
})
it('withholds delegated/cold receivers without resuming Agents', async () => {
  const f = await fixture()
  try {
    f.agents.roots = () => []; expect(f.bridge.forSession('root').reason()).toContain('changed')
    f.remove(); expect(f.bridge.forSession('root').owner()).toBeUndefined()
    await expect(f.bridge.forSession('root').remote.fileReferences.list('root', '')).rejects.toThrow()
    expect(f.gateway.invoke).not.toHaveBeenCalled()
  } finally { await f.ctx.fiber.dispose() }
})
it('external-open uses the published request envelope/codec and refuses foreign descriptors before Gateway dispatch', async () => {
  const f = await fixture()
  try {
    const port = f.bridge.forSession('root')
    expect(await port.remote.session.openWorkspacePath({ path: '/synthetic/path' })).toEqual({ ok: true, value: { opened: true } })
    expect(f.gateway.invoke).toHaveBeenCalledWith({ namespace: 'session', method: 'openWorkspacePath', args: { request: { path: '/synthetic/path' } } })
    const descriptor = f.descriptors.get('session/openWorkspacePath')
    f.descriptors.set('session/openWorkspacePath', { ...descriptor, service: 'foreign' })
    await expect(port.remote.session.openWorkspacePath({ path: '/synthetic/path' })).rejects.toThrow('unavailable')
    expect(f.gateway.invoke).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
