import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { AgentTreeDock, owningAgentRoot, type AgentTreeSummary } from '../src/client/agent-tree.ts'
import { interaction, setTheme } from '../src/client/theme.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
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
  setTheme(BUILT_IN_THEMES.dark)
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('AgentTreeDock', () => {
  it('does not reserve collapsed rows until the Session has a subagent', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', []) }),
      requestRender: vi.fn(),
    })

    dock.showCollapsedRoot(id('root'))
    await dock.loadChildren(id('root'))
    expect(dock.render(80)).toEqual([])
    expect(dock.hitRegions({ col: 0, row: 5, width: 80, height: 0 }, 'full')).toEqual([])

    dock.openOrFocus(id('root'))
    await dock.loadChildren(id('root'))
    const explicit = dock.render(80).join('\n')
    expect(explicit).toContain('当前没有子 Agent')
    expect(explicit).toContain('[Enter 打开]')
    expect(explicit).toContain('[Esc 关闭]')
    const open = dock.hitRegions({ col: 0, row: 5, width: 80, height: dock.render(80).length }, 'full')
      .find(region => region.id === 'agent-tree:footer-open')
    expect(open).toMatchObject({ role: 'button', enabled: false, hover: 'none' })
    dock.dispose()
  })

  it('loads and maintains the direct-root aggregate while collapsed without opening details', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const adapter = presentation({
      root: catalog('root', [
        { id: 'running', label: '运行节点', running: true },
        { id: 'idle', label: '完成节点' },
      ]),
    })
    const dock = new AgentTreeDock({ presentation: adapter, requestRender: vi.fn() })

    dock.showCollapsedRoot(id('root'))
    await settle()

    expect(adapter.listDirectChildren).toHaveBeenCalledTimes(1)
    expect(adapter.listDirectChildren).toHaveBeenCalledWith(id('root'), { refresh: true })
    const collapsed = dock.render(100).join('\n')
    expect(collapsed).toContain('代理树 · 2 个节点')
    expect(collapsed).toContain('运行 1')
    expect(collapsed).toContain('等待 0')
    expect(collapsed).toContain('失败 0')
    expect(collapsed).toContain('/subagents')
    expect(dock.visibleRows()).toEqual([])
    dock.dispose()
  })

  it('discovers a new direct child from the cached catalog subscription while collapsed', async () => {
    vi.stubEnv('NO_COLOR', '1')
    let current = catalog('root', [{ id: 'first' }])
    let catalogChanged: (() => void) | undefined
    const adapter = presentation({})
    adapter.listDirectChildren = vi.fn(async (_parent, options) => ({
      support: 'supported' as const,
      value: current,
      options,
    })) as SubagentPresentationCapabilities['listDirectChildren']
    adapter.subscribeDirectChildren = (_parent, listener) => {
      catalogChanged = listener
      return { support: 'supported', value: () => undefined }
    }
    adapter.publicStatusEvidence = sessionId => ({
      support: 'supported',
      value: { sessionId, evidence: [{ kind: 'session-running', running: sessionId === id('second') }] },
    })
    const dock = new AgentTreeDock({ presentation: adapter, requestRender: vi.fn() })
    dock.showCollapsedRoot(id('root'))
    await dock.loadChildren(id('root'))
    expect(dock.render(80).join('\n')).toContain('1 个节点')

    current = catalog('root', [{ id: 'first' }, { id: 'second', running: true }])
    catalogChanged?.()
    await dock.loadChildren(id('root'))
    const updated = dock.render(80).join('\n')
    expect(updated).toContain('2 个节点')
    expect(updated).toContain('运行 1')
    expect(adapter.listDirectChildren).toHaveBeenLastCalledWith(id('root'), { refresh: false })
    dock.dispose()
  })

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
    const renderedHeight = dock.render(22).length
    const full = dock.hitRegions({ col: 0, row: 5, width: 22, height: renderedHeight }, 'full')
    expect(full.map(region => region.id)).toEqual([
      'agent-tree:entry:root',
      'agent:running',
      'agent:child',
      'agent-tree:footer-open',
      'agent-tree:footer-close',
    ])
    expect(dock.hitRegions({ col: 0, row: 5, width: 80, height: renderedHeight }, 'native')).toEqual([])
    expect(dock.render(80)).toBeDefined()
    expect(dock.hitRegions({ col: 0, row: 5, width: 80, height: dock.render(80).length }, 'full').map(region => region.id))
      .toEqual(full.map(region => region.id))
    dock.selectText({ col: 0, row: 5, width: 80, height: dock.render(80).length }, { row: 7 }, { row: 8 })
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

  it('renders the target hierarchy, status and summary columns, selected row, footer, and narrow fallback', async () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const adapter = presentation({
      root: catalog('root', [
        { id: 'running', label: '调研协调器', running: true, hasChildren: true },
        { id: 'waiting', label: '终端渲染' },
      ]),
      running: catalog('running', [{ id: 'completed', label: 'dsh 能力审计' }]),
    })
    adapter.publicStatusEvidence = vi.fn(sessionId => ({
      support: 'supported' as const,
      value: {
        sessionId,
        evidence: sessionId === id('running')
          ? [{ kind: 'session-running' as const, running: true }]
          : sessionId === id('waiting')
            ? [{ kind: 'pending-interaction' as const, interaction: 'approval' as const }]
            : [{ kind: 'turn-timing' as const, settledMs: 10, active: false }],
      },
    }))
    adapter.publicSummary = vi.fn(sessionId => ({
      support: 'supported' as const,
      value: { text: `摘要:${sessionId}`, source: 'displayTitle' as const },
    }))
    const dock = new AgentTreeDock({
      presentation: adapter,
      requestRender: vi.fn(),
      mouseMode: () => 'full',
    })
    dock.openOrFocus(id('root'))
    await dock.loadChildren(id('root'))
    dock.handleClick('chevron', id('running'), 1)
    await dock.loadChildren(id('running'))
    dock.render(100)
    await settle()

    const wide = dock.render(100)
    const plain = wide.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
    expect(plain).toContain('代理树 · 3 个节点 · 运行 1  等待 1  失败 0')
    expect(plain).toContain('├─ ▾')
    expect(plain).toContain('│  └─')
    expect(plain).toContain('运行中')
    expect(plain).toContain('等待中')
    expect(plain).toContain('已完成')
    expect(plain).toContain('摘要:completed')
    expect(plain).toContain('[Enter 打开]  [Esc 关闭]')
    expect(wide[2]).toMatch(/\u001B\[48;2;/u)
    expect(wide[1]).toContain('\u001B[38;2;34;211;238m运行 1')
    expect(wide[1]).toContain('\u001B[38;2;250;204;21m等待 1')
    expect(wide[1]).toContain('\u001B[38;2;248;113;113m失败 0')
    expect(wide[2]).toContain('\u001B[38;2;34;211;238m●')
    expect(wide[2]).toContain('\u001B[38;2;34;211;238m运行中')

    setTheme(BUILT_IN_THEMES.light)
    const light = dock.render(100)
    expect(light[1]).toContain('\u001B[38;2;12;100;120m运行 1')
    expect(light[1]).toContain('\u001B[38;2;133;77;14m等待 1')
    expect(light[1]).toContain('\u001B[38;2;185;28;28m失败 0')
    expect(light[2]).toContain('\u001B[38;2;12;100;120m●')

    const narrow = dock.render(30).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
    expect(narrow).toContain('3 节点 · 运行1 等待1 失败0')
    expect(narrow).not.toContain('摘要:')
    dock.dispose()
  })

  it('does not claim the collapsed bar is clickable in native mouse mode', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'child' }]) }),
      requestRender: vi.fn(),
      mouseMode: () => 'native',
    })
    dock.showCollapsedRoot(id('root'))
    await dock.loadChildren(id('root'))
    const text = dock.render(80).join('\n')
    expect(text).toContain('/subagents')
    expect(text).not.toContain('点击展开')
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

  it('routes footer buttons through the same actions as Enter and Escape', async () => {
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'child' }]) }),
      requestRender: vi.fn(),
    })
    dock.openOrFocus(id('root'), id('child'))
    await settle()
    const rendered = dock.render(80)
    const hits = dock.hitRegions({ col: 3, row: 5, width: 80, height: rendered.length }, 'full')
    const openHit = hits.find(region => region.id === 'agent-tree:footer-open')
    expect(openHit).toMatchObject({
      role: 'button', enabled: true, action: { kind: 'agent-tree', command: 'footer-open' },
    })
    expect(hits.find(region => region.id === 'agent-tree:footer-close')).toMatchObject({
      role: 'button', enabled: true, action: { kind: 'agent-tree', command: 'footer-close' },
    })
    const footer = rendered.at(-1)?.replace(/\u001B\[[0-9;:]*m/gu, '') ?? ''
    expect(openHit?.rect.col).toBe(3 + footer.indexOf('[Enter'))
    expect(openHit?.rect.row).toBe(5 + rendered.length - 1)
    expect(dock.handleClick('footer-open', undefined, 1)).toEqual(dock.handleInput('\r'))
    expect(dock.handleHover('footer-close')).toBe(true)
    expect(dock.handleHover('footer-close')).toBe(false)
    expect(dock.handleClick('footer-close', undefined, 1)).toEqual({ consumed: true, collapsed: true })
    dock.dispose()
  })

  it('renders stable hover states for every agent-tree pointer target', async () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'child', hasChildren: true }]) }),
      requestRender: vi.fn(),
      mouseMode: () => 'full',
    })
    dock.openOrFocus(id('root'))
    await settle()

    const idle = dock.render(80)
    expect(dock.handleHover('bar', id('root'))).toBe(true)
    expect(dock.render(80)[1]).not.toBe(idle[1])
    expect(dock.render(80)[1]).toContain(interaction.hover('▾ 代理树 · 1 个节点 · '))

    expect(dock.handleHover('row', id('child'))).toBe(true)
    const hoveredRow = dock.render(80)[2] ?? ''
    expect(hoveredRow).not.toBe(idle[2])
    expect(hoveredRow).toContain(interaction.hover('child'))
    dock.handleClick('row', id('child'), 1)
    const selectedHoveredRow = dock.render(80)[2] ?? ''
    expect(selectedHoveredRow).toMatch(/\u001B\[48;2;/u)
    expect(selectedHoveredRow).toContain(interaction.hover('child'))
    expect(dock.handleHover(undefined)).toBe(true)
    const selectedIdle = dock.render(80)

    expect(dock.handleHover('chevron', id('child'))).toBe(true)
    const hoveredChevron = dock.render(80)[2] ?? ''
    expect(hoveredChevron).not.toBe(hoveredRow)
    expect(hoveredChevron).toContain(interaction.hover('▸'))

    expect(dock.handleHover('footer-close')).toBe(true)
    expect(dock.render(80).at(-1)).toContain(interaction.hover('[Esc 关闭]'))
    expect(dock.handleHover('footer-close')).toBe(false)
    expect(dock.handleHover(undefined)).toBe(true)
    expect(dock.render(80)).toEqual(selectedIdle)
    dock.dispose()
  })

  it('limits the expansion target to its chevron and exposes rows as options', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const dock = new AgentTreeDock({
      presentation: presentation({ root: catalog('root', [{ id: 'child', hasChildren: true }]) }),
      requestRender: vi.fn(),
    })
    dock.openOrFocus(id('root'))
    await settle()

    const rendered = dock.render(80)
    const origin = { col: 4, row: 7, width: 80, height: rendered.length }
    const hits = dock.hitRegions(origin, 'full')
    const row = hits.find(region => region.id === 'agent:child')
    const chevron = hits.find(region => region.id === 'agent:child:chevron')
    const chevronCol = (rendered[2] ?? '').indexOf('▸')
    expect(row).toMatchObject({ role: 'option', action: { kind: 'agent-tree', command: 'row', sessionId: id('child') } })
    expect(chevron?.rect).toEqual({ col: origin.col + chevronCol, row: origin.row + 2, width: 1, height: 1 })
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
    expect(dock.render(60)).toHaveLength(10)
    expect(dock.render(60)[1]).toContain('1,000')
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
