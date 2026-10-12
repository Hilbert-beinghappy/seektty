import type { ChatSnapshot } from '../client-runtime/client/index.js';
import type { WorkProcessTurnEvidence } from '../../src/client/work-process-display.ts';
export interface NativeProcessMember { readonly kind: 'node'; readonly key: string; readonly groupPart?: 'reasoning' | 'response' }
export interface NativeProcessGroup {
  readonly key: string; readonly members: readonly NativeProcessMember[];
  readonly data: { readonly turn: number; readonly closed: boolean;
    readonly summary: { readonly counts: readonly { readonly kind: string; readonly count: number }[]; readonly running?: string; readonly runningDetail: string; readonly preparing?: true } };
}
export interface NativeProcessSnapshot {
  readonly entries: readonly (NativeProcessMember | { readonly kind: 'group'; readonly key: string })[];
  readonly groups: ReadonlyMap<string, NativeProcessGroup>;
  readonly evidence: ReadonlyMap<number, WorkProcessTurnEvidence & { readonly hasExternalProcess: boolean; readonly inlineReasoning: boolean }>;
}
export declare class NativeProcessSnapshotAdapter { replace(chat: ChatSnapshot): NativeProcessSnapshot; apply(chat: ChatSnapshot, upserts: readonly import('../client-runtime/client/index.js').ChatConversationViewNode[]): NativeProcessSnapshot }
export declare function nativeProcessSnapshot(chat: ChatSnapshot): NativeProcessSnapshot | undefined;
