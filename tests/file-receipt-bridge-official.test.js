import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { officialFileReceiptFixture } from './fixtures/file-receipt-official.js'
import { createFileReceiptPort } from '../src/host/file-receipt-bridge.ts'
import { FileAttachmentController, referencePromptText } from '../src/client/file-attachments.ts'

const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
// Explicit official fixture path prevents probing arbitrary user Profiles or accounts.
describe.skipIf(!stock)('published rc.2 receipt service → Host bridge → controller → native prompt', () => {
  let root, host
  const budget = { maxFileBytes: 8, maxTotalBytes: 16, maxFiles: 3 }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'seektty-official-file-'))
    host = await officialFileReceiptFixture(stock, root)
  })
  afterEach(async () => { try { await host?.dispose() } finally { await rm(root, { recursive: true, force: true }) } })
  const scoped = host => {
    let scope = { sessionId: host.primary.id, generation: 1, ready: true, files: true }
    const port = createFileReceiptPort(host.ctx, scope, () => scope, 500)
    const controller = new FileAttachmentController(port.remote, scope.sessionId, true, budget, 500)
    return { port, controller, reconnect: () => { scope = { ...scope, generation: 2 }; controller.clear() } }
  }
  async function prompt(content, agent = host.primary, requestId = 'fixture-send') {
    return host.gateway.invoke({ namespace: 'session', method: 'prompt', args: { request: {
      sessionId: agent.id, requestId, content, mode: 'queue',
    } } })
  }
  it.each(['document.bin', 'voice.mp3', 'movie.mp4'])('stores %s exact bytes and sends its real receipt through the official prompt controller', async name => {
    const { controller, port } = scoped(host)
    expect(port.gate('upload').available).toBe(true)
    const path = join(root, name); await writeFile(path, Buffer.from([0, 1, 255, 4]))
    const staged = await controller.addPath(path)
    expect(await readFile(host.attachments.fileHostPath(staged.file))).toEqual(Buffer.from([0, 1, 255, 4]))
    const content = [{ type: 'text', text: 'fixture prompt' }, ...controller.promptParts()]
    expect(content[1]).toEqual({ type: 'file', receiptId: staged.receiptId })
    expect(await prompt(content)).toEqual({ accepted: true })
    expect(host.primary.inbox.nextTurn[0].content[1]).toEqual({ type: 'file', attachment: staged.file })
    // Receipt retirement is Host-owned and scoped to the accepted request only.
    const untouched = await port.remote.fileUploads.upload(host.primary.id, { data: 'eA==', name: 'other' })
    host.uploads.retirePrompt(host.primary, 'fixture-send')
    expect(host.uploads.resolve(host.primary, staged.receiptId)).toBeUndefined()
    expect(host.uploads.resolve(host.primary, untouched.value.receiptId)).toEqual(untouched.value.file)
    controller.clear(); controller.dispose()
  })
  it('queries actual Host workspace references and sends path text without uploading the target', async () => {
    const { controller } = scoped(host)
    await mkdir(join(root, '目录')); await writeFile(join(root, '目录', 'my file.txt'), 'fixture')
    const candidates = await controller.references('目录/')
    const selected = candidates.find(value => value.path === '目录/my file.txt')
    expect(selected).toEqual({ path: '目录/my file.txt', kind: 'file' })
    expect(controller.promptParts()).toEqual([])
    expect(await prompt([{ type: 'text', text: referencePromptText(selected) }])).toEqual({ accepted: true })
    expect(host.primary.inbox.nextTurn[0].content).toEqual([{ type: 'text', text: '@"目录/my file.txt"' }])
    controller.dispose()
  })
  it('refuses foreign receipts and rejects reconnect reuse before a second upload', async () => {
    const f = scoped(host); const path = join(root, 'fixture'); await writeFile(path, 'abc')
    const staged = await f.controller.addPath(path)
    await expect(prompt(f.controller.promptParts(), host.foreign)).rejects.toThrow('not uploaded for this session')
    expect(host.foreign.inbox.nextTurn).toEqual([])
    expect(host.uploads.resolve(host.primary, staged.receiptId)).toEqual(staged.file)
    f.reconnect()
    await expect(f.controller.addPath(path)).rejects.toThrow('changed')
    expect(f.controller.draft).toEqual([])
    f.controller.dispose()
  })
  it('enforces bytes/count budgets before reaching the actual official store', async () => {
    const f = scoped(host); const store = vi.spyOn(host.attachments, 'saveFile')
    const oversized = join(root, 'oversized'); await writeFile(oversized, Buffer.alloc(9))
    await expect(f.controller.addPath(oversized)).rejects.toThrow('budget')
    expect(store).not.toHaveBeenCalled()
    const path = join(root, 'small'); await writeFile(path, '12345678')
    await f.controller.addPath(path); await f.controller.addPath(path)
    await expect(f.controller.addPath(path)).rejects.toThrow('budget')
    expect(store).toHaveBeenCalledTimes(2)
    const limited = new FileAttachmentController(f.port.remote, host.primary.id, true, { ...budget, maxFiles: 1 })
    await limited.addPath(path); await expect(limited.addPath(path)).rejects.toThrow('budget')
    expect(store).toHaveBeenCalledTimes(3)
    limited.dispose(); f.controller.dispose()
  })
  it('propagates a real official storage refusal without staging or retrying', async () => {
    const f = scoped(host); const path = join(root, 'fixture'); await writeFile(path, 'abc')
    const store = vi.spyOn(host.attachments, 'saveFile').mockRejectedValueOnce(new Error('fixture storage denied'))
    await expect(f.controller.addPath(path)).rejects.toThrow('failed to store file upload')
    expect(store).toHaveBeenCalledOnce(); expect(f.controller.draft).toEqual([])
    f.controller.dispose()
  })
  it('bounds a Host store that ignores cancellation; a late receipt remains Host-owned and is not staged or retried', async () => {
    const scope = { sessionId: host.primary.id, generation: 1, ready: true, files: true }
    const port = createFileReceiptPort(host.ctx, scope, () => scope, 10)
    const controller = new FileAttachmentController(port.remote, host.primary.id, true, budget, 500)
    const path = join(root, 'fixture'); await writeFile(path, 'abc')
    const save = host.attachments.saveFile.bind(host.attachments)
    const pause = Promise.withResolvers(); const late = Promise.withResolvers()
    const store = vi.spyOn(host.attachments, 'saveFile').mockImplementation(async input => { await pause.promise; return save(input) })
    const upload = host.uploads.upload.bind(host.uploads)
    vi.spyOn(host.uploads, 'upload').mockImplementation(async (...args) => { const value = await upload(...args); late.resolve(value); return value })
    await expect(controller.addPath(path)).rejects.toThrow('outcome unknown')
    expect(controller.draft).toEqual([]); expect(controller.bytes).toBe(0)
    pause.resolve(); const result = await late.promise
    expect(host.uploads.resolve(host.primary, result.receiptId)).toEqual(result.file)
    expect(controller.draft).toEqual([]); expect(store).toHaveBeenCalledOnce()
    controller.clear(); controller.clear(); controller.dispose(); controller.dispose()
  })
  it('cancels a delayed official store write, discards only this draft and never pretends to revoke the Host receipt', async () => {
    const f = scoped(host); const path = join(root, 'fixture'); await writeFile(path, 'abc')
    const prior = await f.port.remote.fileUploads.upload(host.primary.id, { data: 'eA==', name: 'prior' })
    const saved = host.attachments.saveFile.bind(host.attachments)
    const pause = Promise.withResolvers(); const started = Promise.withResolvers(); const stored = Promise.withResolvers()
    host.attachments.saveFile = async input => { started.resolve(); await pause.promise; const value = await saved(input); stored.resolve(); return value }
    const abort = new AbortController(); const pending = f.controller.addPath(path, abort.signal)
    const rejected = expect(pending).rejects.toThrow()
    await started.promise; abort.abort(new Error('fixture cancel')); await rejected
    pause.resolve(); await stored.promise; await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.controller.draft).toEqual([]); expect(f.controller.bytes).toBe(0)
    expect(host.uploads.resolve(host.primary, prior.value.receiptId)).toEqual(prior.value.file)
    // The official service has no receipt revoke Remote; persistent bytes stay Host-owned.
    f.controller.dispose()
  })
  it('uses the existing official raw-byte HTTP route on loopback, then submits its receipt natively', async () => {
    const route = host.routes.get('/api/session/uploadFileBinary')
    expect(route.requestBody).toBe('streaming')
    const server = createServer(async (req, res) => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk)
        // Fixture admission only, operator scope; production Connection owns auth.
        const response = await route.fetch(new Request(`http://127.0.0.1${req.url}`, {
          method: req.method, headers: req.headers, body: Buffer.concat(chunks),
        }))
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
      } catch (error) { res.writeHead(500); res.end(String(error)) }
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/session/uploadFileBinary?sessionId=${host.primary.id}&name=clip.mp4`, {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from([0, 255, 7]),
      })
      const result = await response.json(); expect(result.ok).toBe(true)
      expect(await readFile(host.attachments.fileHostPath(result.value.file))).toEqual(Buffer.from([0, 255, 7]))
      expect(await prompt([{ type: 'file', receiptId: result.value.receiptId }])).toEqual({ accepted: true })
    } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
})
