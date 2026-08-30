import { describe, expect, it, vi } from 'vitest'
import type { ChatConversationViewNode, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'
import { Transcript } from '../src/client/transcript.ts'

function user(key: string, text: string): ChatConversationViewNode {
  return {
    key,
    kind: 'fixture',
    id: key,
    target: 'chat',
    anchorSeq: 1,
    location: { kind: 'session' },
    visibility: 'visible',
    data: { kind: 'user', seq: 1, time: 1, source: null, content: [{ type: 'text', text }] },
  }
}

function snapshot(sessionId: string, nodes: readonly ChatConversationViewNode[]): ConversationSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    sessionId,
    views: { get: () => undefined },
    chat: {
      order: nodes.map(node => node.key),
      nodes: { get: (key: string) => byKey.get(key), values: () => nodes },
      locations: { getTurn: () => [], getStep: () => [] },
      timeline: { turnOrder: [], turns: new Map() },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
    },
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, subagent: null, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false, promptError: null,
    blank: false, lastAgentError: null,
  } as unknown as ConversationSnapshot
}

describe('child Session viewport restoration', () => {
  it('restores the parent semantic viewport and selection after rendering a child', () => {
    const render = vi.fn()
    const transcript = new Transcript(() => 3, render)
    const parent = snapshot('root', [
      user('u1', '第一段\n第二段\n第三段\n第四段'),
      user('u2', '最新段'),
    ])
    transcript.update(parent)
    transcript.render(30)
    transcript.scrollBy(2)
    transcript.render(30)
    transcript.setSelection({
      anchor: { surface: 'transcript', ownerKey: 'u1', textOffset: 1, affinity: 'before' },
      focus: { surface: 'transcript', ownerKey: 'u1', textOffset: 5, affinity: 'after' },
      granularity: 'character',
    })
    const frozen = transcript.snapshotPresentation()

    transcript.update(snapshot('child', [user('c1', '子会话')]))
    transcript.render(30)
    transcript.update(parent)
    transcript.render(30)

    expect(transcript.restorePresentation(frozen)).toBe('exact')
    expect(transcript.snapshotPresentation().viewportAnchor).toEqual(frozen.viewportAnchor)
    expect(transcript.currentSelection()).toEqual(frozen.selection)
  })

  it('falls back to the nearest loaded semantic anchor when parent history changed', () => {
    const transcript = new Transcript(() => 3)
    transcript.update(snapshot('root', [user('old', '旧节点')]))
    transcript.render(30)
    transcript.scrollBy(1)
    transcript.setSelection({
      anchor: { surface: 'transcript', ownerKey: 'old', textOffset: 0, affinity: 'before' },
      focus: { surface: 'transcript', ownerKey: 'old', textOffset: 1, affinity: 'after' },
      granularity: 'character',
    })
    const frozen = transcript.snapshotPresentation()

    transcript.update(snapshot('child', [user('child', '子节点')]))
    transcript.update(snapshot('root', [user('new', '新节点')]))
    transcript.render(30)

    expect(transcript.restorePresentation(frozen)).toBe('nearest')
    expect(transcript.currentSelection()).toBeUndefined()
    expect(transcript.snapshotPresentation().viewportAnchor.blockKey).not.toBe('old')
  })

  it('rejects restoration into a different active Session', () => {
    const transcript = new Transcript(() => 3)
    transcript.update(snapshot('root', [user('u1', '父')]))
    const frozen = transcript.snapshotPresentation()
    transcript.update(snapshot('other', [user('u2', '其他')]))
    expect(transcript.restorePresentation(frozen)).toBe('session-mismatch')
  })
})
