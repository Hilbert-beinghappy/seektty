import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { ChildSessionView, type ParentViewSnapshot } from '../src/client/child-session-view.ts'
import type { TuiDraftAttachment } from '../src/client/capabilities.ts'
import { AgentTreeDock } from '../src/client/agent-tree.ts'
import type { SubagentPresentationCapabilities } from '../src/client/subagent-presentation.ts'

const id = (value: string): SessionId => value as SessionId

function parentSnapshot(attachment: TuiDraftAttachment): Omit<ParentViewSnapshot, 'parentSessionId' | 'childSessionId'> {
  return {
    transcript: {
      sessionId: 'root',
      viewportAnchor: { blockKey: 'assistant:42', lineOffset: 7, followLatest: false },
      scrollOffset: 19,
      turnCursor: { blockKey: 'user:40', lineOffset: 0 },
      selection: {
        anchor: { surface: 'transcript', ownerKey: 'assistant:42', textOffset: 2, affinity: 'before' },
        focus: { surface: 'transcript', ownerKey: 'assistant:42', textOffset: 8, affinity: 'after' },
        granularity: 'character',
      },
      toolFocus: false,
      expandedTools: ['tool:1'],
      collapsedTools: [],
      expandedReasoning: ['assistant:42'],
      collapsedReasoning: [],
    },
    composer: {
      text: '父会话草稿\n第二行',
      cursor: { line: 1, col: 2 },
      selection: { anchor: { line: 0, col: 1 }, focus: { line: 1, col: 2 } },
    },
    attachments: [attachment],
    tree: {
      rootSessionId: id('root'),
      open: true,
      focused: true,
      selectedSessionId: id('child'),
      expandedSessionIds: [id('root'), id('child')],
      viewportOffset: 4,
    },
  }
}

describe('ChildSessionView', () => {
  it('round-trips every frozen parent field and attachment identity', () => {
    const attachment: TuiDraftAttachment = {
      path: '/tmp/image.png',
      name: 'image.png',
      mediaType: 'image/png',
      data: 'AA==',
      bytes: 1,
    }
    const frozen = parentSnapshot(attachment)
    const view = new ChildSessionView()
    const open = vi.fn(() => true)

    expect(view.openChildView({
      parentSessionId: id('root'),
      childSessionId: id('child'),
      composerMode: 'continuable',
      capture: () => frozen,
      open,
    })).toBe(true)
    expect(view.composerMode()).toBe('continuable')
    expect(open).toHaveBeenCalledWith(id('child'))

    const openParent = vi.fn()
    const restore = vi.fn(() => 'exact' as const)
    const result = view.closeChildView({ openParent, restore })

    expect(result.closed).toBe(true)
    expect(result.transcriptRestore).toBe('exact')
    expect(openParent).toHaveBeenCalledWith(id('root'))
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({
      parentSessionId: id('root'),
      childSessionId: id('child'),
      transcript: frozen.transcript,
      composer: frozen.composer,
      tree: frozen.tree,
    }))
    expect(result.snapshot?.attachments[0]).toBe(attachment)
    expect(view.isOpen()).toBe(false)
  })

  it('does not freeze a parent when child navigation is stale', () => {
    const attachment = { path: '', name: '', mediaType: 'image/png', data: '', bytes: 0 } as const
    const view = new ChildSessionView()
    expect(view.openChildView({
      parentSessionId: id('root'),
      childSessionId: id('child'),
      composerMode: 'read-only',
      capture: () => parentSnapshot(attachment),
      open: () => false,
    })).toBe(false)
    expect(view.snapshot()).toBeUndefined()
  })

  it('keeps a single parent stack and makes close idempotent', () => {
    const attachment = { path: '', name: '', mediaType: 'image/png', data: '', bytes: 0 } as const
    const view = new ChildSessionView()
    const request = {
      parentSessionId: id('root'),
      childSessionId: id('child'),
      composerMode: 'read-only' as const,
      capture: () => parentSnapshot(attachment),
      open: () => true,
    }
    expect(view.openChildView(request)).toBe(true)
    expect(view.openChildView({ ...request, childSessionId: id('grandchild') })).toBe(false)
    expect(view.closeChildView({ openParent: vi.fn(), restore: () => 'nearest' }).closed).toBe(true)
    expect(view.closeChildView({ openParent: vi.fn(), restore: () => 'exact' })).toEqual({ closed: false })
  })

  it('restores the focused parent tree on first Esc semantics and collapses only on the second', async () => {
    const presentation: SubagentPresentationCapabilities = {
      listDirectChildren: async parentSessionId => ({
        support: 'supported',
        value: { parentSessionId, state: 'ready', children: [], unresolved: [] },
      }),
      openChild: () => ({ support: 'supported', value: { opened: false, reason: 'address-absent' } }),
      continuation: () => ({ support: 'supported', value: { state: 'absent' } }),
      publicStatusEvidence: sessionId => ({ support: 'supported', value: { sessionId, evidence: [] } }),
    }
    const tree = new AgentTreeDock({ presentation, requestRender: vi.fn() })
    tree.openOrFocus(id('root'))
    await Promise.resolve()
    const frozenTree = tree.snapshotPresentation()
    tree.blur()
    const view = new ChildSessionView()
    view.openChildView({
      parentSessionId: id('root'), childSessionId: id('child'), composerMode: 'read-only',
      capture: () => ({ ...parentSnapshot({ path: '', name: '', mediaType: 'image/png', data: '', bytes: 0 }), tree: frozenTree }),
      open: () => true,
    })

    const first = view.closeChildView({
      openParent: vi.fn(),
      restore: (snapshot) => { tree.restorePresentation(snapshot.tree); return 'exact' },
    })
    expect(first.closed).toBe(true)
    expect(tree.isOpen()).toBe(true)
    expect(tree.isFocused()).toBe(true)
    expect(tree.handleInput('\u001B')).toEqual({ consumed: true, collapsed: true })
    expect(tree.isOpen()).toBe(false)
    tree.dispose()
  })
})
