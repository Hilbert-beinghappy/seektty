/** Ephemeral parent/child view stack over Harness-owned Session selection. */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import type { TuiDraftAttachment } from './capabilities.ts'
import type { AgentTreePresentationSnapshot } from './agent-tree.ts'
import type { EditorPoint, EditorTextSelection } from './pi-tui-adapters.ts'
import type {
  TranscriptPresentationSnapshot,
  TranscriptRestoreResult,
} from './transcript.ts'

export interface ComposerViewSnapshot {
  readonly text: string
  readonly cursor: EditorPoint
  readonly selection?: EditorTextSelection
}

export interface ParentViewSnapshot {
  readonly parentSessionId: SessionId
  readonly childSessionId: SessionId
  readonly transcript: TranscriptPresentationSnapshot
  readonly composer: ComposerViewSnapshot
  readonly attachments: readonly TuiDraftAttachment[]
  readonly tree: AgentTreePresentationSnapshot
  readonly overlayId?: string
}

export type ChildComposerMode = 'continuable' | 'read-only'

export interface ChildViewOpenRequest {
  readonly parentSessionId: SessionId
  readonly childSessionId: SessionId
  readonly composerMode: ChildComposerMode
  capture(): Omit<ParentViewSnapshot, 'parentSessionId' | 'childSessionId'>
  open(sessionId: SessionId): boolean
}

export interface ChildViewCloseRequest {
  openParent(sessionId: SessionId): void
  restore(snapshot: ParentViewSnapshot): TranscriptRestoreResult
}

export interface ChildViewCloseResult {
  readonly closed: boolean
  readonly transcriptRestore?: TranscriptRestoreResult
  readonly snapshot?: ParentViewSnapshot
}

/** Owns one child view at a time; nested Agents remain tree navigation, not nested UI stacks. */
export class ChildSessionView {
  private parent: ParentViewSnapshot | undefined
  private mode: ChildComposerMode | undefined

  isOpen(): boolean { return this.parent !== undefined }

  snapshot(): ParentViewSnapshot | undefined { return this.parent }

  composerMode(): ChildComposerMode | undefined { return this.mode }

  openChildView(request: ChildViewOpenRequest): boolean {
    if (this.parent !== undefined) return false
    const frozen = request.capture()
    if (!request.open(request.childSessionId)) return false
    this.parent = {
      parentSessionId: request.parentSessionId,
      childSessionId: request.childSessionId,
      ...frozen,
    }
    this.mode = request.composerMode
    return true
  }

  closeChildView(request: ChildViewCloseRequest): ChildViewCloseResult {
    const snapshot = this.parent
    if (snapshot === undefined) return { closed: false }
    this.parent = undefined
    this.mode = undefined
    request.openParent(snapshot.parentSessionId)
    const transcriptRestore = request.restore(snapshot)
    return { closed: true, transcriptRestore, snapshot }
  }

  discard(): void {
    this.parent = undefined
    this.mode = undefined
  }
}
