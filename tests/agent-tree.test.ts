import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { AgentTreeDock, owningAgentRoot, type AgentTreeSummary } from '../src/client/agent-tree.ts'
import type {
  DirectSubagentCatalog,
  SubagentPresentationCapabilities,
} from '../src/client/subagent-presentation.ts'

const id = (value: string): SessionId => value as SessionId

function catalog(parent: string, children: readonly { id: string; label?: string; hasChildren?: boolean; running?: boolean }[]): DirectSubagentCatalog {
  return {
    parentSessionId: id(parent),
    state: 'ready',
    unresolved: [],
    children: children.map(child => ({
      entry: {
        kind: 'child',
        id: id(child.id),
        activity: child.running === true ? 'running' : 'inactive',
        hasChildren: child.hasChildren === true,
        mode: 'continuable',
        label: child.label ?? child.id,
      },
      address: { parentSessionId: id(parent), childSessionId: id(child.id), mode: 'continuable' },
    })),
  }
}

function presentation(catalogs: Readonly<Record<string, DirectSubagentCatalog>>): SubagentPresentationCapabilities {
  return {
    listDirectChildren: vi.fn(async parent => ({
      support: 'supported' as const,
      value: catalogs[parent] ?? catalog(parent, []),
    })),
    openChild: vi.fn(sessionId => ({
      support: 'supported' as const,
      value: { opened: true, address: { parentSessionId: id('root'), childSessionId: sessionId, mode: 'continuable' as const } },
    })),
    continuation: vi.fn(sessionId => sessionId === id('grandchild')
      ? { support: 'supported' as const, value: { state: 'available' as const, address: { parentSessionId: id('child'), childSessionId: sessionId, mode: 'continuable' as const } } }
      : sessionId === id('child')
        ? { support: 'supported' as const, value: { state: 'available' as const, address: { parentSessionId: id('root'), childSessionId: sessionId, mode: 'continuable' as const } } }
        : { support: 'supported' as const, value: { state: 'absent' as const } }),
    publicStatusEvidence: vi.fn(sessionId => ({
      support: 'supported' as const,
      value: { sessionId, evidence: [{ kind: 'session-running' as const, running: sessionId === id('running') }] },
    })),
  }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('AgentTreeDock', () => {
  it('opens idempotently, preserves the draft, and renders stable full-mode hit identities', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const adapter = presentation({
      root: catalog('root', [
        { id: 'running', label: '正在运行的子 Agent', running: true },
        { id: 'child', label: '超长中文节点名称' },
      ]),
    })
    const dock = new AgentTreeDock({ presentation: adapter, requestRender: vi.fn(), maxVisibleRows: 4 })

    dock.openOrFocus(id('root'), id('child'), '保留的草稿')
    dock.openOrFocus(id('root'), id('running'), '不应覆盖')
    await settle()

    expect(adapter.listDirectChildren).toHaveBeenCalledTimes(1)
    expect(dock.selectedNode()?.sessionId).toBe(id('running'))
    expect(dock.render(22).every(line => line.replace(/\u001B\[[0-9;:]*m/gu, '').length <= 22)).toBe(true)
    const full = dock.hitRegions({ col: 0, row: 5, width: 22, height: 3 }, 'full')
    expect(full.map(region => region.id)).toEqual([
      'agent-tree:entry:root',
      'agent:running',
      'agent:child',
    ])
    expect(dock.hitRegions({ col: 0, row: 5, width: 80, height: 3 }, 'native')).toEqual([])
    expect(dock.render(80)).toBeDefined()
    expect(dock.hitRegions({ col: 0, row: 5, width: 80, height: 3 }, 'full').map(region => region.id))
      .toEqual(full.map(region => region.id))
    dock.selectText({ col: 0, row: 5, width: 80, height: 3 }, { row: 6 }, { row: 7 })
    expect(dock.copySelectionText()).toContain('正在运行的子 Agent')
    expect(dock.copySelectionText()).toContain('超长中文节点名称')

    dock.collapse()
    expect(dock.restoreComposerSnapshot()).toBe('保留的草稿')
    expect(dock.restoreComposerSnapshot()).toBeUndefined()
    dock.dispose()
  })

  it('loads nested children lazily and gives chevron clicks precedence over row opening', async () => {
    const adapter = presentation({
      root: catalog('root', [{ id: 'child', hasChildren: true }]),
      child: catalog('child', [{ id: 'grandchild' }]),
    })
    const dock = new AgentTreeDock({ presentation: adapter, requestRender: vi.fn() })
    dock.openOrFocus(id('root'))
    await settle()

    expect(adapter.listDirectChildren).toHaveBeenCalledTimes(1)
    expect(dock.handleClick('row', id('child'), 1)).toEqual({ consumed: true })
    expect(dock.handleClick('chevron', id('child'), 1)).toEqual({ consumed: true })
    await settle()
    expect(adapter.listDirectChildren).toHaveBeenCalledTimes(2)
    expect(dock.visibleRows().map(row => row.sessionId)).toEqual([id('child'), id('grandchild')])
    expect(dock.handleClick('row', id('grandchild'), 2)).toEqual({ consumed: true, openedSessionId: id('grandchild') })
    dock.dispose()
  })

  it('consumes tree Enter and arrows while leaving unrelated keys alone', async () => {
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'a' }, { id: 'b' }]) }),
      requestRender: vi.fn(),
    })
    dock.openOrFocus(id('root'))
    await settle()

    expect(dock.handleInput('\u001B[B')).toEqual({ consumed: true })
    expect(dock.handleInput('\r')).toEqual({ consumed: true, openedSessionId: id('b') })
    expect(dock.handleInput('x')).toEqual({ consumed: false })
    expect(dock.handleInput('\u001B')).toEqual({ consumed: true, collapsed: true })
    dock.dispose()
  })

  it('discards a late catalog response after switching roots', async () => {
    let resolveOld!: (value: ReturnType<typeof catalog>) => void
    const old = new Promise<DirectSubagentCatalog>((resolve) => { resolveOld = resolve })
    const adapter = presentation({ fresh: catalog('fresh', [{ id: 'fresh-child' }]) })
    vi.mocked(adapter.listDirectChildren).mockImplementation(async parent => ({
      support: 'supported',
      value: parent === id('old') ? await old : catalog('fresh', [{ id: 'fresh-child' }]),
    }))
    const dock = new AgentTreeDock({ presentation: adapter, requestRender: vi.fn() })

    dock.openOrFocus(id('old'))
    dock.openOrFocus(id('fresh'))
    resolveOld(catalog('old', [{ id: 'stale-child' }]))
    await settle()

    expect(dock.owningRootId()).toBe(id('fresh'))
    expect(dock.visibleRows().map(row => row.sessionId)).toEqual([id('fresh-child')])
    dock.dispose()
  })

  it('renders and summarizes only the visible window for a 1000-node tree', async () => {
    const children = Array.from({ length: 1_000 }, (_, index) => ({ id: `child-${index}` }))
    const loadSummary = vi.fn(async (sessionId: SessionId): Promise<AgentTreeSummary> => ({ text: `summary:${sessionId}` }))
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', children) }),
      requestRender: vi.fn(),
      loadSummary,
      maxVisibleRows: 7,
    })
    dock.openOrFocus(id('root'))
    await settle()

    expect(dock.visibleRows()).toHaveLength(7)
    await settle()
    expect(loadSummary).toHaveBeenCalledTimes(7)
    expect(dock.render(60)).toHaveLength(8)
    expect(dock.render(60)[0]).toContain('1,000')
    dock.dispose()
  })

  it('coalesces presentation renders to at most one per 50 ms', async () => {
    vi.useFakeTimers()
    const requestRender = vi.fn()
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'a' }]) }),
      requestRender,
    })
    dock.openOrFocus(id('root'))
    await settle()
    dock.refreshVisibleStatus()
    dock.focus()
    expect(requestRender).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(requestRender).toHaveBeenCalledTimes(1)
    dock.dispose()
  })
})

describe('owningAgentRoot', () => {
  it('walks exact public parent addresses and stops safely on roots', () => {
    const adapter = presentation({})
    expect(owningAgentRoot(adapter, id('grandchild'))).toBe(id('root'))
    expect(owningAgentRoot(adapter, id('root'))).toBe(id('root'))
  })
})
