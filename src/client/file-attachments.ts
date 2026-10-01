/** Agent-scoped file receipts and path references: published dsh 0.2.0-rc.2. */
import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileAttachmentRef } from '@deepseek-ai/dsh-attachment/types'
import type { EncodedFileUploadRequest, FileUploadValue } from '@deepseek-ai/dsh-client-file-upload/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionOpenWorkspacePathRequest, SessionOpenWorkspacePathValue } from '@deepseek-ai/dsh-api-session-controller/types'
import { escapeTerminalText } from './theme.ts'
import { RemoteOperationScope, remoteValue } from './remote-operation.ts'

/** Exact path-only fileReferences/list response; directories are references, never uploads. */
export interface FileReferenceCandidate { readonly path: string; readonly kind: 'file' | 'directory' }
export interface FileAttachmentRemote {
  readonly fileUploads?: { upload(agentId: SessionId, request: EncodedFileUploadRequest, signal?: AbortSignal): Promise<RemoteResult<FileUploadValue>> }
  readonly fileReferences?: { list(agentId: SessionId, query: string, signal?: AbortSignal): Promise<RemoteResult<FileReferenceCandidate[]>> }
  readonly session?: { openWorkspacePath(request: SessionOpenWorkspacePathRequest, signal?: AbortSignal): Promise<RemoteResult<SessionOpenWorkspacePathValue>> }
}
export interface FileAttachmentBudget { readonly maxFileBytes: number; readonly maxTotalBytes: number; readonly maxFiles: number }
export interface StagedFile { readonly receiptId: FileUploadValue['receiptId']; readonly file: FileAttachmentRef }

/** Files intake availability is supplied by the Host composition, never inferred from a model name. */
export class FileAttachmentController {
  private readonly operations = new RemoteOperationScope()
  private readonly files: StagedFile[] = []
  private reservedBytes = 0
  private reservedCount = 0
  private generation = 0

  constructor(private remote: FileAttachmentRemote, private sessionId: SessionId,
    private filesCapability: boolean, readonly budget: FileAttachmentBudget, readonly timeoutMs = 15_000) {
    for (const limit of Object.values(budget)) if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid file budget')
  }

  get available(): boolean { return this.filesCapability && typeof this.remote.fileUploads?.upload === 'function' }
  get draft(): readonly StagedFile[] { return this.files.map(item => ({ ...item, file: { ...item.file } })) }
  get bytes(): number { return this.files.reduce((sum, item) => sum + item.file.bytes, 0) }

  clear(): void { this.generation++; this.operations.cancel(); this.files.length = 0 }
  reconnect(remote: FileAttachmentRemote, sessionId: SessionId, filesCapability: boolean): void {
    this.clear(); this.remote = remote; this.sessionId = sessionId; this.filesCapability = filesCapability
  }
  dispose(): void { this.clear(); this.operations.dispose() }
  remove(receiptId: StagedFile['receiptId']): void {
    const index = this.files.findIndex(item => item.receiptId === receiptId)
    if (index >= 0) this.files.splice(index, 1)
  }
  /** Pass these parts to official session.prompt; never send attachment ids in place of receipts. */
  promptParts(): readonly { readonly type: 'file'; readonly receiptId: StagedFile['receiptId'] }[] {
    return this.files.map(item => ({ type: 'file', receiptId: item.receiptId }))
  }

  async addPath(path: string, signal?: AbortSignal): Promise<StagedFile> {
    if (!this.available) throw new Error('Files intake unavailable')
    const upload = this.remote.fileUploads!
    const sessionId = this.sessionId
    const generation = this.generation
    let reserved = false
    let size = 0
    try { return await this.operations.run(async operationSignal => {
      // Nonblocking open lets stat reject FIFOs/devices without waiting for a writer.
      const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
      let data: string
      let bytes = 0
      try {
        operationSignal.throwIfAborted()
        const stat = await handle.stat()
        operationSignal.throwIfAborted()
        if (!stat.isFile()) throw new Error('Choose a file; directories must be referenced')
        size = stat.size
        if (size > this.budget.maxFileBytes || size + this.bytes + this.reservedBytes > this.budget.maxTotalBytes
          || this.files.length + this.reservedCount >= this.budget.maxFiles) throw new Error('File attachment budget exceeded')
        this.reservedBytes += size; this.reservedCount++; reserved = true
        // Read one extra byte so a file growing after stat cannot bypass the budget.
        const buffer = Buffer.alloc(size + 1)
        while (bytes < buffer.length) {
          operationSignal.throwIfAborted()
          const chunk = await handle.read(buffer, bytes, buffer.length - bytes, null)
          if (chunk.bytesRead === 0) break
          bytes += chunk.bytesRead
        }
        if (bytes > size) throw new Error('File changed during selection; select it again')
        operationSignal.throwIfAborted()
        data = buffer.subarray(0, bytes).toString('base64')
      } finally { await handle.close() }
      operationSignal.throwIfAborted()
      const value = remoteValue(await upload.upload(sessionId, { data, name: basename(path) }, operationSignal))
      operationSignal.throwIfAborted()
      if (generation !== this.generation) throw new Error('Attachment selection changed')
      if (value.file.bytes !== bytes || !value.receiptId || !value.file.attachmentId || !value.file.name) throw new Error('Invalid file upload receipt')
      const staged = { receiptId: value.receiptId, file: { ...value.file } }
      this.files.push(staged)
      return staged
    }, this.timeoutMs, signal) } finally {
      if (reserved) { this.reservedBytes -= size; this.reservedCount-- }
    }
  }

  async references(query: string, signal?: AbortSignal): Promise<readonly FileReferenceCandidate[]> {
    const references = this.remote.fileReferences
    if (typeof references?.list !== 'function') throw new Error('File references unavailable')
    const sessionId = this.sessionId
    return this.operations.run(async operationSignal => {
      const values = remoteValue(await references.list(sessionId, query, operationSignal))
      operationSignal.throwIfAborted()
      return values.filter(item => typeof item.path === 'string' && (item.kind === 'file' || item.kind === 'directory'))
        .map(item => ({ path: item.path, kind: item.kind }))
    }, this.timeoutMs, signal)
  }

  /** E resolves relative candidates against the Host workspace and obtains external-open consent. */
  async openPath(path: string, confirm: (path: string, signal: AbortSignal) => Promise<boolean>, signal?: AbortSignal): Promise<boolean> {
    const session = this.remote.session
    if (typeof session?.openWorkspacePath !== 'function') throw new Error('External file opening unavailable')
    return this.operations.run(async operationSignal => {
      if (!await confirm(path, operationSignal)) return false
      operationSignal.throwIfAborted()
      return remoteValue(await session.openWorkspacePath({ path }, operationSignal)).opened
    }, this.timeoutMs, signal)
  }
}

/** Live and cold durable file blocks share this view. No format is claimed as model-native. */
export function fileAttachmentLines(file: FileAttachmentRef): readonly string[] {
  return [`${escapeTerminalText(file.name)} · ${file.bytes} bytes`, 'File reference · model receives a saved-file handle']
}

export function referencePromptText(candidate: FileReferenceCandidate): string {
  // JSON quoting retains spaces, Unicode, backslashes and line breaks without inventing a wire part.
  return `@${JSON.stringify(candidate.path)}`
}
