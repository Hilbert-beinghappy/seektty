import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  projectRootSessions,
  RootSessionCatalogProjector,
  rootCatalogRevision,
  type RootCatalogSession,
} from '../src/client/root-session-catalog.ts'
import type { SubagentPresentationCapabilities } from '../src/client/subagent-presentation.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { OverlayQueue, SelectOverlayRequest } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

function row(
  id: string,
  options: { readonly parentId?: string; readonly origin?: 'subagent'; readonly title?: string } = {},
): RootCatalogSession & { readonly title?: string } {
  return {
    id: id as SessionId,
    ...(options.parentId === undefined ? {} : { parentId: options.parentId as SessionId }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.title === undefined ? {} : { title: options.title }),
  }
}

function capabilities(
  childrenByParent: Readonly<Record<string, readonly string[]>>,
  overrides: Partial<Pick<SubagentPresentationCapabilities, 'continuation' | 'listDirectChildren'>> = {},
): SubagentPresentationCapabilities {
  return {
    listDirectChildren: overrides.listDirectChildren ?? vi.fn(async (parentSessionId: SessionId) => ({
      support: 'supported' as const,
      value: { parentSessionId, state: 'ready' as const, children: [], unresolved: [] },
    })),
    openChild: () => ({ support: 'supported', value: { opened: false, reason: 'address-absent' } }),
    continuation: overrides.continuation ?? ((childSessionId) => {
      const parents = Object.entries(childrenByParent)
        .filter(([, children]) => children.includes(childSessionId))
        .map(([parentSessionId]) => parentSessionId as SessionId)
      if (parents.length > 1) return { support: 'supported', value: { state: 'unknown' } }
      const parentSessionId = parents[0]
      return parentSessionId === undefined
        ? { support: 'supported', value: { state: 'absent' } }
        : {
            support: 'supported',
            value: {
              state: 'absent',
              address: { parentSessionId, childSessionId, mode: 'one-shot' },
            },
          }
    }),
    publicStatusEvidence: sessionId => ({
      support: 'supported', value: { sessionId, evidence: [] },
    }),
  }
}

describe('root Session catalog projection', () => {
  it('hides only an uninterrupted authoritative subagent tree', () => {
    const catalog = [
      row('root'),
      row('child', { parentId: 'root', origin: 'subagent' }),
      row('grandchild', { parentId: 'child', origin: 'subagent' }),
      row('fork', { parentId: 'root' }),
      row('fork-child', { parentId: 'fork', origin: 'subagent' }),
    ]
    const result = projectRootSessions(catalog, rootCatalogRevision(catalog))

    expect(result.support).toBe('lineage')
    expect(result.roots.map(candidate => candidate.id)).toEqual(['root', 'fork'])
    expect(result.hidden).toEqual(['child', 'grandchild', 'fork-child'])
    expect(result.unresolved).toEqual([])
  })

  it('keeps orphan and cyclic rows visible instead of guessing a root', () => {
    const catalog = [
      row('root'),
      row('orphan', { parentId: 'missing', origin: 'subagent' }),
      row('cycle-a', { parentId: 'cycle-b', origin: 'subagent' }),
      row('cycle-b', { parentId: 'cycle-a', origin: 'subagent' }),
    ]
    const result = projectRootSessions(catalog, rootCatalogRevision(catalog))

    expect(result.roots.map(candidate => candidate.id)).toEqual([
      'root', 'orphan', 'cycle-a', 'cycle-b',
    ])
    expect(result.hidden).toEqual([])
    expect(result.unresolved).toEqual(expect.arrayContaining([
      { sessionId: 'orphan', parentSessionId: 'missing', reason: 'missing-parent' },
      { sessionId: 'cycle-a', reason: 'cycle' },
      { sessionId: 'cycle-b', reason: 'cycle' },
    ]))
  })

  it('uses retained navigation addresses and preserves ordinary sessions', async () => {
    const catalog = [row('root'), row('child'), row('grandchild'), row('ordinary')]
    const projector = new RootSessionCatalogProjector()
    const result = await projector.project(
      catalog,
      rootCatalogRevision(catalog),
      capabilities({ root: ['child'], child: ['grandchild'] }),
    )

    expect(result.support).toBe('navigation')
    expect(result.roots.map(candidate => candidate.id)).toEqual(['root', 'ordinary'])
    expect(result.hidden).toEqual(['child', 'grandchild'])
  })

  it('keeps unresolved navigation rows visible while hiding authoritative children', async () => {
    const catalog = [row('root'), row('known'), row('unknown')]
    const base = capabilities({ root: ['known'] })
    const result = await new RootSessionCatalogProjector().project(
      catalog,
      rootCatalogRevision(catalog),
      capabilities({ root: ['known'] }, {
        continuation: sessionId => sessionId === 'unknown'
          ? { support: 'supported', value: { state: 'unknown' } }
          : base.continuation(sessionId),
      }),
    )

    expect(result.support).toBe('partial')
    expect(result.roots.map(candidate => candidate.id)).toEqual(['root', 'unknown'])
    expect(result.hidden).toEqual(['known'])
    expect(result.unresolved).toContainEqual({ sessionId: 'unknown', reason: 'navigation-unresolved' })
  })

  it('keeps a child visible when catalog lineage conflicts with its navigation address', async () => {
    const catalog = [row('a'), row('b'), row('child', { parentId: 'a', origin: 'subagent' })]
    const result = await new RootSessionCatalogProjector().project(
      catalog,
      rootCatalogRevision(catalog),
      capabilities({ b: ['child'] }),
    )

    expect(result.roots.map(candidate => candidate.id)).toEqual(['a', 'b', 'child'])
    expect(result.hidden).toEqual([])
    expect(result.unresolved).toContainEqual({
      sessionId: 'child', parentSessionId: 'b', reason: 'conflicting-parent',
    })
  })

  it('never refreshes every direct-child catalog before opening the Session directory', async () => {
    const catalog = Array.from({ length: 12 }, (_, index) => row(`s${String(index)}`))
    const list = vi.fn<SubagentPresentationCapabilities['listDirectChildren']>()

    await new RootSessionCatalogProjector().project(
      catalog,
      rootCatalogRevision(catalog),
      capabilities({}, { listDirectChildren: list }),
    )

    expect(list).not.toHaveBeenCalled()
  })

  it('does not retain stale navigation evidence for an unchanged Session catalog', async () => {
    const projector = new RootSessionCatalogProjector()
    const catalog = [row('root'), row('child')]
    let addressed = true
    const adapter = capabilities({}, {
      continuation: childSessionId => childSessionId === 'child' && addressed
        ? {
            support: 'supported',
            value: {
              state: 'absent',
              address: { parentSessionId: 'root' as SessionId, childSessionId, mode: 'one-shot' },
            },
          }
        : { support: 'supported', value: { state: 'absent' } },
    })
    const revision = rootCatalogRevision(catalog)

    expect((await projector.project(catalog, revision, adapter)).hidden).toEqual(['child'])
    addressed = false
    expect((await projector.project(catalog, revision, adapter)).hidden).toEqual([])
  })

  it('retains the whole catalog when navigation support is absent', async () => {
    const catalog = [row('root'), row('unknown')]
    const unsupported = capabilities({}, {
      continuation: () => ({ support: 'unsupported', reason: 'navigation-unavailable' }),
    })
    const result = await new RootSessionCatalogProjector().project(
      catalog,
      rootCatalogRevision(catalog),
      unsupported,
    )

    expect(result.support).toBe('unsupported')
    expect(result.roots).toEqual(catalog)
    expect(result.hidden).toEqual([])
  })

  it('uses the root projection for both the Session directory and search results', async () => {
    const requests: SelectOverlayRequest[] = []
    const root = {
      id: 'root' as SessionId,
      displayTitle: 'Root',
      updatedAt: 2,
      running: false,
      blank: false,
    }
    const hidden = {
      id: 'child' as SessionId,
      displayTitle: 'Child',
      updatedAt: 1,
      running: false,
      blank: false,
      parentId: 'root' as SessionId,
      origin: 'subagent' as const,
    }
    const capabilities = {
      active: () => undefined,
      listSessions: () => [root, hidden],
      listRootSessions: async () => ({
        roots: [root],
        support: 'lineage',
        unresolved: [],
        hidden: [hidden.id],
        lineageRevision: 'r1',
      }),
      searchSessions: async () => ({
        items: [
          { sessionId: root.id, snippet: 'root hit' },
          { sessionId: hidden.id, snippet: 'hidden hit' },
        ],
        hasMore: false,
      }),
      openSession: vi.fn(),
    } as unknown as HarnessTuiCapabilities
    const host = {
      overlays: {
        select: vi.fn(async (request: SelectOverlayRequest) => {
          requests.push(request)
          return undefined
        }),
      } as unknown as OverlayQueue,
      transcript: { followLatest: vi.fn() } as unknown as Transcript,
      notice: vi.fn(),
      refresh: vi.fn(),
      refreshHeader: vi.fn(),
      applyTheme: vi.fn(),
      applyAppearance: vi.fn(),
      applyLocale: vi.fn(),
      setEditor: vi.fn(),
      copy: vi.fn(),
      close: vi.fn(),
      restart: vi.fn(),
      requireRestart: vi.fn(),
    } satisfies TuiActionHost
    const actions = new TuiActions(capabilities, host)

    await actions.execute('sessions', '')
    await actions.execute('sessions', 'hit')

    expect(requests).toHaveLength(2)
    expect(requests[0]?.choices.map(choice => choice.id)).toEqual(['root'])
    expect(requests[1]?.choices.map(choice => choice.id)).toEqual(['root'])
  })

  it('labels the compatibility list when hierarchy support is unavailable', async () => {
    let request: SelectOverlayRequest | undefined
    const root = {
      id: 'root' as SessionId,
      displayTitle: 'Root',
      updatedAt: 1,
      running: false,
      blank: false,
    }
    const capabilities = {
      active: () => undefined,
      listSessions: () => [root],
      listRootSessions: async () => ({
        roots: [root],
        support: 'unsupported',
        unresolved: [{ sessionId: root.id, reason: 'query-unsupported' }],
        hidden: [],
        lineageRevision: 'r1',
      }),
    } as unknown as HarnessTuiCapabilities
    const host = {
      overlays: {
        select: vi.fn(async (next: SelectOverlayRequest) => { request = next; return undefined }),
      } as unknown as OverlayQueue,
      transcript: { followLatest: vi.fn() } as unknown as Transcript,
      notice: vi.fn(),
      refresh: vi.fn(),
      refreshHeader: vi.fn(),
      applyTheme: vi.fn(),
      applyAppearance: vi.fn(),
      applyLocale: vi.fn(),
      setEditor: vi.fn(),
      copy: vi.fn(),
      close: vi.fn(),
      restart: vi.fn(),
      requireRestart: vi.fn(),
    } satisfies TuiActionHost

    await new TuiActions(capabilities, host).execute('sessions', '')

    expect(request?.detail).toContain('保留兼容列表')
  })
})
