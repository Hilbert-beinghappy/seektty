import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  createAgentTreeState,
  orderedAgentChildren,
  reduceAgentTree,
  type AgentLifecycle,
  type AgentTreeEvent,
  type AgentTreeState,
  type DirectSubagentCatalog,
  type EvidenceRef,
} from '../src/client/subagent-presentation.ts'

const root = 'root' as SessionId
const child = 'child' as SessionId

function evidence(
  id: string,
  revision?: number,
  source: EvidenceRef['source'] = 'catalog',
): EvidenceRef {
  return {
    id,
    source,
    observedAt: revision ?? 1,
    ...(revision === undefined ? {} : { revision }),
  }
}

function catalog(
  parentSessionId: SessionId,
  children: readonly {
    readonly id: string
    readonly activity?: 'running' | 'inactive'
    readonly hasChildren?: boolean
    readonly mode?: 'one-shot' | 'continuable'
    readonly label?: string
  }[],
  ref = evidence(`catalog:${parentSessionId}`, 1),
  rootSessionId = root,
): AgentTreeEvent {
  const value: DirectSubagentCatalog = {
    parentSessionId,
    state: 'ready',
    children: children.map(entry => ({
      entry: entry.mode === 'continuable'
        ? {
            kind: 'child',
            id: entry.id as SessionId,
            activity: entry.activity ?? 'inactive',
            hasChildren: entry.hasChildren ?? false,
            mode: 'continuable',
            label: entry.label ?? entry.id,
          }
        : {
            kind: 'child',
            id: entry.id as SessionId,
            activity: entry.activity ?? 'inactive',
            hasChildren: entry.hasChildren ?? false,
            mode: 'one-shot',
            ...(entry.label === undefined ? {} : { label: entry.label }),
          },
    })),
    unresolved: [],
  }
  return { kind: 'catalog', rootSessionId, parentSessionId, catalog: value, evidence: ref }
}

function lifecycle(
  sessionId: SessionId,
  value: AgentLifecycle,
  ref: EvidenceRef,
  restart = false,
): AgentTreeEvent {
  return {
    kind: 'lifecycle',
    rootSessionId: root,
    sessionId,
    lifecycle: value,
    ...(restart ? { restart: true } : {}),
    evidence: ref,
  }
}

function apply(state: AgentTreeState, ...events: readonly AgentTreeEvent[]): AgentTreeState {
  return events.reduce(reduceAgentTree, state)
}

describe('Agent Tree presentation reducer', () => {
  it('builds stable direct and nested parent edges without flattening grandchildren', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [
        { id: 'a', activity: 'running', hasChildren: true, mode: 'continuable', label: 'A' },
        { id: 'b' },
      ]),
      catalog('a' as SessionId, [{ id: 'a1', activity: 'running' }], evidence('catalog:a', 2)),
    )

    expect(orderedAgentChildren(state, root).map(node => node.sessionId)).toEqual(['a', 'b'])
    expect(orderedAgentChildren(state, 'a' as SessionId).map(node => node.sessionId)).toEqual(['a1'])
    expect(state.nodes.get('a1' as SessionId)?.parentSessionId).toBe('a')
    expect(state.nodes).toHaveLength(3)
  })

  it('keeps one node when Started/catalog evidence is replayed', () => {
    const started = lifecycle(child, 'running', evidence('started', 2, 'session'))
    const first = apply(createAgentTreeState(root), catalog(root, [{ id: child }]), started)
    const replayed = reduceAgentTree(first, started)

    expect(replayed).toBe(first)
    expect(replayed.nodes).toHaveLength(1)
    expect(replayed.nodes.get(child)?.evidence.map(item => item.id)).toEqual(['catalog:root', 'started'])
  })

  it('retains late status until the authoritative catalog supplies its parent', () => {
    const state = apply(
      createAgentTreeState(root),
      lifecycle(child, 'running', evidence('status', 3, 'session')),
      catalog(root, [{ id: child, activity: 'inactive' }], evidence('late-catalog', 2)),
    )

    expect(state.nodes.get(child)).toMatchObject({
      parentSessionId: root,
      lifecycle: 'running',
    })
  })

  it('merges late continuation without letting an older catalog regress it', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child, mode: 'continuable' }], evidence('catalog', 1)),
      {
        kind: 'continuation',
        rootSessionId: root,
        sessionId: child,
        continuation: 'available',
        evidence: evidence('continuation', 3, 'continuation'),
      },
      catalog(root, [{ id: child, mode: 'continuable' }], evidence('replayed-catalog', 2)),
    )

    expect(state.nodes.get(child)?.continuation).toBe('available')
  })

  it('protects terminal state from old or unversioned Started but allows explicit newer restart', () => {
    const terminal = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child }]),
      lifecycle(child, 'failed', evidence('failed', 5, 'trajectory')),
      lifecycle(child, 'running', evidence('old-running', 4, 'session')),
      lifecycle(child, 'running', { id: 'unversioned', source: 'session', observedAt: 99 }),
    )
    expect(terminal.nodes.get(child)?.lifecycle).toBe('failed')

    const restarted = reduceAgentTree(
      terminal,
      lifecycle(child, 'running', evidence('new-turn', 6, 'session'), true),
    )
    expect(restarted.nodes.get(child)?.lifecycle).toBe('running')
  })

  it('keeps partial output independent from lifecycle', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child, activity: 'running' }]),
      {
        kind: 'partial', rootSessionId: root, sessionId: child, present: true,
        evidence: evidence('partial', 2, 'trajectory'),
      },
      lifecycle(child, 'waiting', evidence('waiting', 3, 'session')),
    )

    expect(state.nodes.get(child)).toMatchObject({ partial: true, lifecycle: 'waiting' })
  })

  it('orders running then waiting while preserving Harness order for all remaining states', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: 'idle-a' }, { id: 'running' }, { id: 'waiting' }, { id: 'idle-b' }]),
      lifecycle('idle-a' as SessionId, 'idle', evidence('idle-a', 2, 'session')),
      lifecycle('running' as SessionId, 'running', evidence('running', 2, 'session')),
      lifecycle('waiting' as SessionId, 'waiting', evidence('waiting', 2, 'session')),
      lifecycle('idle-b' as SessionId, 'completed', evidence('idle-b', 2, 'trajectory')),
    )

    expect(orderedAgentChildren(state, root).map(node => node.sessionId)).toEqual([
      'running', 'waiting', 'idle-a', 'idle-b',
    ])
  })

  it('marks parent conflicts, cycles, diagnostics, and cross-root edges unavailable', () => {
    const parentConflict = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child, hasChildren: true }]),
      catalog('other' as SessionId, [{ id: child }], evidence('conflict', 2)),
    )
    expect(parentConflict.nodes.get(child)).toMatchObject({
      lifecycle: 'unavailable', issue: 'parent-conflict', parentSessionId: root,
    })

    const cycle = apply(
      createAgentTreeState(root),
      catalog('a' as SessionId, [{ id: 'b', hasChildren: true }], evidence('a-b', 2)),
      catalog('b' as SessionId, [{ id: 'a' }], evidence('b-a', 3)),
    )
    expect(cycle.nodes.get('a' as SessionId)?.issue).toBe('cycle')
    expect(cycle.nodes.get('b' as SessionId)?.issue).toBe('cycle')

    const diagnosticCatalog: DirectSubagentCatalog = {
      parentSessionId: root,
      state: 'ready',
      children: [{ entry: { kind: 'diagnostic', id: child, reason: 'corrupt' } }],
      unresolved: [],
    }
    const diagnostic = reduceAgentTree(createAgentTreeState(root), {
      kind: 'catalog', rootSessionId: root, parentSessionId: root,
      catalog: diagnosticCatalog, evidence: evidence('diagnostic', 1, 'diagnostic'),
    })
    expect(diagnostic.nodes.get(child)).toMatchObject({ lifecycle: 'unavailable', issue: 'diagnostic' })

    const crossRoot = reduceAgentTree(createAgentTreeState(root), catalog(
      'another-root' as SessionId,
      [{ id: 'x' }, { id: 'y' }],
      evidence('cross-root', 1),
      'another-root' as SessionId,
    ))
    expect([...crossRoot.nodes.values()].map(node => node.issue)).toEqual(['cross-root', 'cross-root'])
  })

  it('keeps a newer child-load error when an older leaf catalog arrives', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child, hasChildren: true }], evidence('first', 1)),
      {
        kind: 'children-state', rootSessionId: root, sessionId: child, state: 'error',
        evidence: evidence('load-error', 3, 'catalog'),
      },
      catalog(root, [{ id: child, hasChildren: false }], evidence('old-leaf', 2)),
    )

    expect(state.nodes.get(child)?.children).toBe('error')
  })

  it('does not regress node metadata or root load state from an old catalog replay', () => {
    const state = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child, label: 'New', mode: 'continuable' }], evidence('new', 4)),
      {
        kind: 'children-state', rootSessionId: root, state: 'error',
        evidence: evidence('root-error', 5, 'catalog'),
      },
      catalog(root, [{ id: child, label: 'Old' }], evidence('old', 3)),
    )

    expect(state.nodes.get(child)).toMatchObject({
      label: 'New', continuation: 'unknown', harnessOrder: 0,
    })
    expect(state.rootChildren).toBe('error')
  })

  it('clears a diagnostic issue when a newer healthy catalog row arrives', () => {
    const diagnosticCatalog: DirectSubagentCatalog = {
      parentSessionId: root,
      state: 'ready',
      children: [{ entry: { kind: 'diagnostic', id: child, reason: 'unavailable' } }],
      unresolved: [],
    }
    const state = apply(
      createAgentTreeState(root),
      {
        kind: 'catalog', rootSessionId: root, parentSessionId: root,
        catalog: diagnosticCatalog, evidence: evidence('unavailable', 1, 'diagnostic'),
      },
      catalog(root, [{ id: child, activity: 'running' }], evidence('healthy', 2)),
    )

    expect(state.nodes.get(child)?.issue).toBeUndefined()
    expect(state.nodes.get(child)?.lifecycle).toBe('running')
  })

  it('models cancel, retry, and replay without using creation-tool results', () => {
    const cancelled = apply(
      createAgentTreeState(root),
      catalog(root, [{ id: child }]),
      lifecycle(child, 'cancelled', evidence('cancelled', 4, 'trajectory')),
    )
    const retried = reduceAgentTree(cancelled, lifecycle(
      child, 'running', evidence('retry', 5, 'session'), true,
    ))
    const replayed = reduceAgentTree(retried, lifecycle(
      child, 'running', evidence('retry', 5, 'session'), true,
    ))

    expect(retried.nodes.get(child)?.lifecycle).toBe('running')
    expect(replayed).toBe(retried)
    expect(JSON.stringify([...replayed.nodes.values()])).not.toMatch(/spawn|wait_agent|creation returned/u)
  })
})
