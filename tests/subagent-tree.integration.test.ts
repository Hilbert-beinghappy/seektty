import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { AgentTreeDock } from '../src/client/agent-tree.ts'
import { ChildSessionView } from '../src/client/child-session-view.ts'
import { createSubagentPresentationCapabilities, subagentFallbackMode } from '../src/client/subagent-presentation.ts'

const id = (value: string): SessionId => value as SessionId

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('current dsh public tree integration', () => {
  it('keeps a grandchild under its real parent with bounded direct queries and no Conversation fetch', async () => {
    const root = id('root')
    const child = id('child')
    const grandchild = id('grandchild')
    const listeners = new Set<() => void>()
    const snapshot = {
      current: root,
      byId: {
        [root]: { displayTitle: 'Root', running: false },
        [child]: { displayTitle: 'Researcher', running: true },
        [grandchild]: { displayTitle: 'Reviewer', running: false, completed: true },
      },
      subagentsByParent: {
        [root]: {
          state: 'ready', parentAvailable: true,
          entries: [{ kind: 'child', id: child, label: 'Researcher', mode: 'continuable', activity: 'running', hasChildren: true }],
        },
        [child]: {
          state: 'ready', parentAvailable: true,
          entries: [{ kind: 'child', id: grandchild, mode: 'one-shot', activity: 'inactive', hasChildren: false }],
        },
      },
    }
    const addresses = new Map<SessionId, { parentSessionId: SessionId; childSessionId: SessionId; mode: 'continuable' | 'one-shot' }>([
      [child, { parentSessionId: root, childSessionId: child, mode: 'continuable' }],
      [grandchild, { parentSessionId: child, childSessionId: grandchild, mode: 'one-shot' }],
    ])
    const refreshSubagents = vi.fn(async () => undefined)
    const openSubagent = vi.fn()
    const conversationFetch = vi.fn()
    const presentation = createSubagentPresentationCapabilities({
      list: {
        getSnapshot: () => snapshot,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
      refreshSubagents,
      subagentAddress: sessionId => addresses.get(sessionId),
      openSubagent,
      binding: sessionId => ({
        session: { getSnapshot: () => ({ subagent: { address: addresses.get(sessionId), parentAvailable: true } }) },
      }),
    })
    const dock = new AgentTreeDock({ presentation, requestRender: vi.fn(), maxVisibleRows: 8 })

    dock.openOrFocus(root)
    await settle()
    dock.handleClick('chevron', child, 1)
    await settle()

    expect(dock.visibleRows().map(row => [row.sessionId, row.depth])).toEqual([
      [child, 0],
      [grandchild, 1],
    ])
    expect(refreshSubagents).toHaveBeenCalledTimes(2)
    expect(conversationFetch).not.toHaveBeenCalled()
    expect(listeners.size).toBe(2)

    const childView = new ChildSessionView()
    expect(childView.openChildView({
      parentSessionId: root,
      childSessionId: child,
      composerMode: 'continuable',
      capture: () => ({
        transcript: {
          sessionId: root,
          viewportAnchor: { blockKey: 'parent-anchor', lineOffset: 3, followLatest: false },
          scrollOffset: 8,
          toolFocus: false,
          expandedTools: [], collapsedTools: [], expandedReasoning: [], collapsedReasoning: [],
        },
        composer: { text: 'parent draft', cursor: { line: 0, col: 6 } },
        attachments: [],
        tree: dock.snapshotPresentation(),
      }),
      open: sessionId => presentation.openChild(sessionId).support === 'supported',
    })).toBe(true)
    expect(openSubagent).toHaveBeenCalledOnce()
    expect(childView.closeChildView({ openParent: vi.fn(), restore: () => 'exact' }).transcriptRestore).toBe('exact')

    dock.collapse()
    expect(listeners.size).toBe(0)
    dock.dispose()
  })

  it('uses exact public addresses for an old-host direct list and reports unsupported without inventing relationships', async () => {
    const root = id('root')
    const child = id('child')
    const direct = createSubagentPresentationCapabilities({
      list: { getSnapshot: () => ({ byId: { [child]: { displayTitle: 'Legacy child', running: false } } }) },
      subagentAddress: sessionId => sessionId === child
        ? { parentSessionId: root, childSessionId: child, mode: 'continuable' }
        : undefined,
      openSubagent: vi.fn(),
    })
    const directResult = await direct.listDirectChildren(root)
    expect(subagentFallbackMode(directResult)).toBe('direct-list')
    expect(directResult.support === 'supported' ? directResult.value.children[0]?.entry.id : undefined).toBe(child)

    const unsupported = createSubagentPresentationCapabilities({ list: { getSnapshot: () => ({ byId: {} }) } })
    const unavailable = await unsupported.listDirectChildren(root)
    expect(unavailable).toEqual({ support: 'unsupported', reason: 'catalog-unavailable' })
    expect(subagentFallbackMode(unavailable)).toBe('direct-list')
  })
})
