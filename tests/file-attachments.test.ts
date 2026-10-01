import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileUploadValue } from '@deepseek-ai/dsh-client-file-upload/types'
import { FileAttachmentController, fileAttachmentLines, referencePromptText } from '../src/client/file-attachments.ts'

const sessionId = 'fixture-session' as SessionId
const ok = <T>(value: T) => ({ ok: true as const, value })
const receipt = (bytes: number, name = 'clip.mp4'): FileUploadValue => ({ receiptId: 'receipt' as never,
  file: { attachmentId: 'digest' as never, name, bytes } })
const budget = { maxFileBytes: 8, maxTotalBytes: 10, maxFiles: 2 }
let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'seektty-files-fixture-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function file(name = '中文 clip.mp4', bytes = 6): Promise<string> {
  const path = join(root, name); await writeFile(path, Buffer.alloc(bytes, 0x61)); return path
}

describe('generic attachment receipts', () => {
  it('uploads exact bounded bytes, uses receipts for prompts and preserves audio/video as generic files', async () => {
    const upload = vi.fn(async (_id, request) => ok(receipt(Buffer.from(request.data, 'base64').length, request.name)))
    const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget)
    const staged = await controller.addPath(await file())
    expect(upload).toHaveBeenCalledWith(sessionId, { data: 'YWFhYWFh', name: '中文 clip.mp4' }, expect.any(AbortSignal))
    expect(controller.promptParts()).toEqual([{ type: 'file', receiptId: staged.receiptId }])
    expect(fileAttachmentLines(staged.file).join('\n')).toContain('saved-file handle')
    controller.remove(staged.receiptId); expect(controller.draft).toEqual([])
    await controller.addPath(await file('voice.mp3'))
    expect(controller.draft[0]?.file.name).toBe('voice.mp3')
  })
  it('gates missing Files composition or upload method before filesystem/network access', async () => {
    const upload = vi.fn()
    await expect(new FileAttachmentController({ fileUploads: { upload } }, sessionId, false, budget).addPath('/missing')).rejects.toThrow('unavailable')
    await expect(new FileAttachmentController({}, sessionId, true, budget).addPath('/missing')).rejects.toThrow('unavailable')
    expect(upload).not.toHaveBeenCalled()
  })
  it('enforces single, total and count budgets, including concurrent pending uploads', async () => {
    let finish!: (value: ReturnType<typeof ok<FileUploadValue>>) => void
    const upload = vi.fn(() => new Promise<ReturnType<typeof ok<FileUploadValue>>>(resolve => { finish = resolve }))
    const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget)
    await expect(controller.addPath(await file('too-large', 9))).rejects.toThrow('budget')
    const pending = controller.addPath(await file())
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce())
    await expect(controller.addPath(await file('another', 6))).rejects.toThrow('budget')
    finish(ok(receipt(6))); await pending
    await expect(controller.addPath(await file('another', 6))).rejects.toThrow('budget')
    const counted = new FileAttachmentController({ fileUploads: { upload: async () => ok(receipt(0)) } }, sessionId, true, { ...budget, maxFiles: 1 })
    await counted.addPath(await file('empty', 0))
    await expect(counted.addPath(join(root, 'empty'))).rejects.toThrow('budget')
  })
  it('rejects missing files and directories without uploading', async () => {
    const upload = vi.fn()
    const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget)
    await expect(controller.addPath(root)).rejects.toThrow('directories')
    await expect(controller.addPath(join(root, 'missing'))).rejects.toThrow('ENOENT')
    expect(upload).not.toHaveBeenCalled()
  })
  it.skipIf(process.platform === 'win32')('rejects a FIFO without hanging on its open', async () => {
    const path = join(root, 'pipe'); execFileSync('mkfifo', [path])
    const upload = vi.fn()
    const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget, 50)
    await expect(controller.addPath(path)).rejects.toThrow('directories must be referenced')
    expect(upload).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'timeout', 'reconnect'] as const)('releases pending budgets and ignores late receipts after %s', async mode => {
    let finish!: (value: ReturnType<typeof ok<FileUploadValue>>) => void
    const upload = vi.fn(() => new Promise<ReturnType<typeof ok<FileUploadValue>>>(resolve => { finish = resolve }))
    const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget, 80)
    const abort = new AbortController()
    const pending = controller.addPath(await file(), abort.signal)
    const rejected = expect(pending).rejects.toThrow(mode === 'timeout' ? 'timed out' : 'cancelled')
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce())
    if (mode === 'cancel') abort.abort(new Error('cancelled'))
    if (mode === 'reconnect') controller.reconnect({}, 'next-session' as SessionId, true)
    await rejected
    finish(ok(receipt(6))); await new Promise(resolve => setTimeout(resolve, 0))
    expect(controller.draft).toEqual([])
    controller.reconnect({ fileUploads: { upload: async () => ok(receipt(6)) } }, sessionId, true)
    await controller.addPath(join(root, '中文 clip.mp4'))
    expect(controller.bytes).toBe(6)
  })
  it('surfaces Remote rejection, thrown carrier errors and malformed receipts', async () => {
    const path = await file()
    for (const upload of [async () => { throw new Error('carrier failed') }, async () => ({ ok: false as const, error: new Error('denied') as never }),
      async () => ok(receipt(99))]) {
      const controller = new FileAttachmentController({ fileUploads: { upload } }, sessionId, true, budget)
      await expect(controller.addPath(path)).rejects.toThrow()
      expect(controller.draft).toEqual([])
    }
  })
  it('queries official path-only references and quotes Unicode/directory paths without uploading', async () => {
    const list = vi.fn(async () => ok([{ path: '目录/my file', kind: 'directory' as const }]))
    const controller = new FileAttachmentController({ fileReferences: { list } }, sessionId, false, budget)
    const values = await controller.references('目录')
    expect(list).toHaveBeenCalledWith(sessionId, '目录', expect.any(AbortSignal))
    expect(referencePromptText(values[0]!)).toBe('@"目录/my file"')
    await expect(new FileAttachmentController({}, sessionId, false, budget).references('')).rejects.toThrow('unavailable')
  })
  it('bounds an unresponsive reference carrier and rejects after disposal', async () => {
    const controller = new FileAttachmentController({ fileReferences: { list: () => new Promise(() => {}) } }, sessionId, false, budget, 5)
    await expect(controller.references('')).rejects.toThrow('timed out')
    controller.dispose()
    await expect(controller.references('')).rejects.toThrow('disposed')
  })
  it('keeps all binary formats eligible for confirmed external opening and surfaces opener failures', async () => {
    const openWorkspacePath = vi.fn(async () => ok({ opened: true as const }))
    const controller = new FileAttachmentController({ session: { openWorkspacePath } }, sessionId, false, budget, 10)
    expect(await controller.openPath('/fixture/中文 sheet.xlsx', async () => false)).toBe(false)
    expect(openWorkspacePath).not.toHaveBeenCalled()
    expect(await controller.openPath('/fixture/中文 sheet.xlsx', async () => true)).toBe(true)
    expect(openWorkspacePath).toHaveBeenCalledWith({ path: '/fixture/中文 sheet.xlsx' }, expect.any(AbortSignal))
    openWorkspacePath.mockRejectedValue(new Error('no association'))
    await expect(controller.openPath('/fixture/unknown.bin', async () => true)).rejects.toThrow('no association')
    let approve!: (value: boolean) => void
    openWorkspacePath.mockClear()
    await expect(controller.openPath('/fixture/file', () => new Promise(resolve => { approve = resolve }))).rejects.toThrow('timed out')
    approve(true); await Promise.resolve(); expect(openWorkspacePath).not.toHaveBeenCalled()
  })
})
