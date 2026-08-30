import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import { AgentTreeDock } from '../src/client/agent-tree.ts'
import type { DirectSubagentCatalog, SubagentPresentationCapabilities } from '../src/client/subagent-presentation.ts'

const id = (value: string): SessionId => value as SessionId

function direct(parent: string, children: readonly string[]): DirectSubagentCatalog {
  return {
    parentSessionId: id(parent), state: 'ready', unresolved: [],
    children: children.map(child => ({
      entry: { kind: 'child', id: id(child), label: child, mode: 'continuable', activity: 'inactive', hasChildren: false },
      address: { parentSessionId: id(parent), childSessionId: id(child), mode: 'continuable' },
    })),
  }
}

function adapter(list: SubagentPresentationCapabilities['listDirectChildren']): SubagentPresentationCapabilities {
  return {
    listDirectChildren: list,
    openChild: sessionId => ({ support: 'supported', value: { opened: true, address: { parentSessionId: id('root'), childSessionId: sessionId, mode: 'continuable' } } }),
    continuation: () => ({ support: 'supported', value: { state: 'absent' } }),
    publicStatusEvidence: sessionId => ({ support: 'supported', value: { sessionId, evidence: [] } }),
  }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('subagent lazy loading budgets', () => {
  it('shares one in-flight children request for the same parent and tree token', async () => {
    let resolve!: (value: { support: 'supported'; value: DirectSubagentCatalog }) => void
    const pending = new Promise<{ support: 'supported'; value: DirectSubagentCatalog }>((done) => { resolve = done })
    const list = vi.fn(() => pending)
    const dock = new AgentTreeDock({ presentation: adapter(list), requestRender: vi.fn() })
    dock.openOrFocus(id('root'))
    const duplicate = dock.loadChildren(id('root'))
    expect(list).toHaveBeenCalledTimes(1)
    resolve({ support: 'supported', value: direct('root', ['child']) })
    await duplicate
    expect(dock.visibleRows()).toHaveLength(1)
    dock.dispose()
  })

  it('aborts visible summary work but retains direct-root status subscriptions on collapse', async () => {
    let signal: AbortSignal | undefined
    const summary = vi.fn((_sessionId: SessionId, nextSignal: AbortSignal) => {
      signal = nextSignal
      return new Promise<undefined>(() => undefined)
    })
    const dispose = vi.fn()
    const presentation = adapter(async parent => ({ support: 'supported', value: direct(parent, ['child']) }))
    presentation.subscribePublicStatus = (_sessionId, _listener) => ({ support: 'supported', value: dispose })
    const dock = new AgentTreeDock({ presentation, requestRender: vi.fn(), loadSummary: summary })
    dock.openOrFocus(id('root'))
    await settle()
    dock.render(80)
    expect(summary).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(false)
    dock.collapse()
    expect(signal?.aborted).toBe(true)
    expect(dispose).not.toHaveBeenCalled()
    dock.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps a collapsed direct-root aggregate live and permits a completed child to restart', async () => {
    let listener: ((status: { sessionId: SessionId; evidence: readonly [{ kind: 'turn-timing'; settledMs: number; active: boolean }] }) => void) | undefined
    const presentation = adapter(async parent => ({ support: 'supported', value: direct(parent, ['child']) }))
    presentation.subscribePublicStatus = (_sessionId, next) => {
      listener = next
      return { support: 'supported', value: () => undefined }
    }
    const dock = new AgentTreeDock({ presentation, requestRender: vi.fn() })
    dock.showCollapsedRoot(id('root'))
    await dock.loadChildren(id('root'))
    expect(listener).toBeDefined()

    listener?.({ sessionId: id('child'), evidence: [{ kind: 'turn-timing', settledMs: 20, active: false }] })
    expect(dock.node(id('child'))?.lifecycle).toBe('completed')
    listener?.({ sessionId: id('child'), evidence: [{ kind: 'turn-timing', settledMs: 20, active: true }] })
    expect(dock.node(id('child'))?.lifecycle).toBe('running')
    listener?.({ sessionId: id('child'), evidence: [{ kind: 'turn-timing', settledMs: 35, active: false }] })
    expect(dock.node(id('child'))?.lifecycle).toBe('completed')
    dock.dispose()
  })

  it('retries summary errors and retains a missing summary without opening a transcript', async () => {
    const summary = vi.fn()
      .mockRejectedValueOnce(new Error('summary unavailable'))
      .mockResolvedValueOnce(undefined)
    const dock = new AgentTreeDock({
      presentation: adapter(async parent => ({ support: 'supported', value: direct(parent, []) })),
      requestRender: vi.fn(), loadSummary: summary,
    })
    dock.showCollapsedRoot(id('root'))
    dock.openOrFocus(id('root'))
    await dock.loadSummary(id('child'))
    await dock.loadSummary(id('child'))
    await dock.loadSummary(id('child'))
    expect(summary).toHaveBeenCalledTimes(2)
    dock.dispose()
  })

  it('evicts the oldest summary after the 128-entry LRU budget', async () => {
    const summary = vi.fn(async (sessionId: SessionId) => ({ text: `summary:${sessionId}` }))
    const dock = new AgentTreeDock({
      presentation: adapter(async parent => ({ support: 'supported', value: direct(parent, []) })),
      requestRender: vi.fn(), loadSummary: summary,
    })
    dock.showCollapsedRoot(id('root'))
    dock.openOrFocus(id('root'))
    for (let index = 0; index < 129; index += 1) await dock.loadSummary(id(`child-${index}`))
    await dock.loadSummary(id('child-0'))
    expect(summary).toHaveBeenCalledTimes(130)
    dock.dispose()
  })
})
