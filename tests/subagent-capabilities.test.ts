import { describe, expect, it, vi } from 'vitest'
import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  createSubagentPresentationCapabilities,
  type SubagentRuntimeLike,
} from '../src/client/subagent-presentation.ts'
import { CURRENT_DSH_SUBAGENT_PRESENTATION_CONTRACT } from '../src/dsh-compat.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { OverlayQueue, SelectOverlayRequest } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

const parent = 'parent' as SessionId
const child = 'child' as SessionId

function currentRuntime(options: {
  readonly parentAvailable?: boolean
  readonly address?: SubagentAddress
} = {}) {
  const address = options.address ?? {
    parentSessionId: parent,
    childSessionId: child,
    mode: 'continuable',
  }
  const snapshot = {
    byId: {
      [child]: {
        displayTitle: 'Research session',
        running: true,
        pendingInteraction: 'approval',
        completed: true,
        projectionValues: {
          subagentTiming: {
            settledMs: 8120,
            active: { since: 100, through: 240 },
          },
        },
      },
    },
    subagentsByParent: {
      [parent]: {
        state: 'ready',
        error: null,
        parentAvailable: options.parentAvailable ?? true,
        entries: [{
          kind: 'child',
          id: child,
          activity: 'running',
          hasChildren: true,
          mode: 'continuable',
          label: 'Researcher',
          futureField: 'ignored',
        }],
      },
    },
  }
  return {
    list: { getSnapshot: () => snapshot },
    refreshSubagents: vi.fn(async () => undefined),
    openSubagent: vi.fn(),
    subagentAddress: (id: SessionId) => id === child ? address : undefined,
    navigationAddress: (id: SessionId) => id === child ? address : undefined,
    binding: () => ({
      session: {
        getSnapshot: () => ({
          subagent: { address, parentAvailable: options.parentAvailable ?? true },
        }),
      },
    }),
  }
}

describe('current dsh subagent presentation contract', () => {
  it('names the exact audited range and keeps unsupported future fields explicit', () => {
    expect(CURRENT_DSH_SUBAGENT_PRESENTATION_CONTRACT.tested).toBe('0.1.1-rc.2')
    expect(CURRENT_DSH_SUBAGENT_PRESENTATION_CONTRACT.required).toContain('SubagentAddress.childSessionId')
    expect(CURRENT_DSH_SUBAGENT_PRESENTATION_CONTRACT.unsupported).toContain('terminalLifecycle')
    expect(CURRENT_DSH_SUBAGENT_PRESENTATION_CONTRACT.unsupported).toContain('permissionOwnerSessionId')
  })

  it('projects direct children with exact identity and ignores unknown future fields', async () => {
    const runtime = currentRuntime()
    const adapter = createSubagentPresentationCapabilities(runtime)
    const result = await adapter.listDirectChildren(parent, { refresh: true })

    expect(runtime.refreshSubagents).toHaveBeenCalledWith(parent)
    expect(result.support).toBe('supported')
    if (result.support !== 'supported') return
    expect(result.value.children).toEqual([{
      entry: {
        kind: 'child',
        id: child,
        activity: 'running',
        hasChildren: true,
        mode: 'continuable',
        label: 'Researcher',
      },
      address: { parentSessionId: parent, childSessionId: child, mode: 'continuable' },
    }])
    expect(result.value.state).toBe('ready')
    expect(result.value.parentAvailable).toBe(true)
    expect(result.value.unresolved).toEqual([])
    expect(JSON.stringify(result.value)).not.toContain('futureField')
  })

  it('opens only a retained exact address and reports absent addresses explicitly', () => {
    const runtime = currentRuntime()
    const adapter = createSubagentPresentationCapabilities(runtime)

    expect(adapter.openChild(child)).toEqual({
      support: 'supported',
      value: {
        opened: true,
        address: { parentSessionId: parent, childSessionId: child, mode: 'continuable' },
      },
    })
    expect(runtime.openSubagent).toHaveBeenCalledWith({
      parentSessionId: parent,
      childSessionId: child,
      mode: 'continuable',
    })
    expect(adapter.openChild('missing' as SessionId)).toEqual({
      support: 'supported',
      value: { opened: false, reason: 'address-absent' },
    })
  })

  it('opens a freshly catalog-discovered child before the Runtime retains its transport address', async () => {
    const runtime = currentRuntime()
    runtime.subagentAddress = () => undefined
    const adapter = createSubagentPresentationCapabilities(runtime)

    const catalog = await adapter.listDirectChildren(parent, { refresh: true })
    expect(catalog.support).toBe('supported')
    expect(adapter.openChild(child)).toEqual({
      support: 'supported',
      value: {
        opened: true,
        address: { parentSessionId: parent, childSessionId: child, mode: 'continuable' },
      },
    })
    expect(runtime.openSubagent).toHaveBeenCalledWith({
      parentSessionId: parent,
      childSessionId: child,
      mode: 'continuable',
    })
    expect(adapter.continuation(child)).toMatchObject({
      support: 'supported',
      value: {
        state: 'available',
        address: { parentSessionId: parent, childSessionId: child, mode: 'continuable' },
      },
    })
  })

  it('keeps catalog navigation readable when the parent is unavailable', async () => {
    const runtime = currentRuntime({ parentAvailable: false })
    runtime.subagentAddress = () => undefined
    const adapter = createSubagentPresentationCapabilities(runtime)

    await adapter.listDirectChildren(parent, { refresh: true })
    expect(adapter.openChild(child)).toMatchObject({ support: 'supported', value: { opened: true } })
    expect(adapter.continuation(child)).toMatchObject({
      support: 'supported',
      value: { state: 'stale' },
    })
  })

  it('distinguishes available, stale, absent, and unknown continuation', () => {
    expect(createSubagentPresentationCapabilities(currentRuntime()).continuation(child)).toMatchObject({
      support: 'supported', value: { state: 'available' },
    })
    expect(createSubagentPresentationCapabilities(currentRuntime({ parentAvailable: false })).continuation(child)).toMatchObject({
      support: 'supported', value: { state: 'stale' },
    })
    expect(createSubagentPresentationCapabilities(currentRuntime({
      address: { parentSessionId: parent, childSessionId: child, mode: 'one-shot' },
    })).continuation(child)).toMatchObject({
      support: 'supported', value: { state: 'absent' },
    })
    expect(createSubagentPresentationCapabilities({
      subagentAddress: () => ({ parentSessionId: parent, childSessionId: child, mode: 'continuable' }),
    }).continuation(child)).toMatchObject({
      support: 'supported', value: { state: 'unknown' },
    })
  })

  it('returns only public status evidence without deriving lifecycle', () => {
    const result = createSubagentPresentationCapabilities(currentRuntime()).publicStatusEvidence(child)
    expect(result).toEqual({
      support: 'supported',
      value: {
        sessionId: child,
        evidence: [
          { kind: 'session-running', running: true },
          { kind: 'pending-interaction', interaction: 'approval' },
          { kind: 'completion-notification', completed: true },
          { kind: 'turn-timing', settledMs: 8120, active: true },
          { kind: 'catalog-activity', activity: 'running', parentSessionId: parent },
        ],
      },
    })
  })

  it('projects only a public Session title as the optional node summary', () => {
    expect(createSubagentPresentationCapabilities(currentRuntime()).publicSummary?.(child)).toEqual({
      support: 'supported',
      value: { text: 'Research session', source: 'displayTitle' },
    })
  })

  it('ignores a malformed active timing interval instead of misreporting a settled turn', () => {
    const runtime = currentRuntime()
    const snapshot = runtime.list.getSnapshot() as { byId: Record<string, { projectionValues: { subagentTiming: unknown } }> }
    snapshot.byId[child]!.projectionValues.subagentTiming = {
      settledMs: 8120,
      active: { since: 240, through: 100 },
    }
    const result = createSubagentPresentationCapabilities(runtime).publicStatusEvidence(child)
    expect(result.support === 'supported'
      ? result.value.evidence.some(item => item.kind === 'turn-timing')
      : true).toBe(false)
  })

  it('fails soft on old hosts and never probes future fields', async () => {
    const adapter = createSubagentPresentationCapabilities({})
    await expect(adapter.listDirectChildren(parent)).resolves.toEqual({
      support: 'unsupported', reason: 'catalog-unavailable',
    })
    expect(adapter.openChild(child)).toEqual({
      support: 'unsupported', reason: 'navigation-unavailable',
    })
    expect(adapter.continuation(child)).toEqual({
      support: 'unsupported', reason: 'navigation-unavailable',
    })
    expect(adapter.publicStatusEvidence(child)).toEqual({
      support: 'unsupported', reason: 'session-status-unavailable',
    })
    expect(adapter.publicSummary?.(child)).toEqual({
      support: 'unsupported', reason: 'session-status-unavailable',
    })
  })

  it('keeps malformed and unknown rows unresolved instead of inventing nodes', async () => {
    const runtime: SubagentRuntimeLike = {
      list: {
        getSnapshot: () => ({
          subagentsByParent: {
            [parent]: {
              entries: [
                { kind: 'future-child', id: child, status: 'completed' },
                { kind: 'child', id: 'broken', mode: 'continuable' },
              ],
            },
          },
        }),
      },
      refreshSubagents: async () => undefined,
    }
    const result = await createSubagentPresentationCapabilities(runtime).listDirectChildren(parent)
    expect(result).toEqual({
      support: 'supported',
      value: {
        parentSessionId: parent,
        state: 'unrequested',
        children: [],
        unresolved: [
          { id: child, reason: 'unknown-entry-kind' },
          { id: 'broken', reason: 'invalid-entry' },
        ],
      },
    })
  })

  it('reports hierarchy support in /status without exposing catalog contents', async () => {
    let request: SelectOverlayRequest | undefined
    const capabilities = {
      active: () => ({ sessionId: parent }),
      headerFacts: async () => ({
        hostVersion: '0.1.1-rc.2',
        nodeVersion: 'v24.0.0',
        platform: 'darwin',
        architecture: 'arm64',
        profile: 'tui',
        running: false,
        workspace: '/workspace',
        session: 'Root',
        mode: 'default',
        model: 'deepseek',
        permission: 'workspace-write',
      }),
      auxiliaryUsageStatistics: undefined,
      sessionStatistics: () => ({ lines: [] }),
      projectionEntries: () => [],
      subagentPresentation: () => ({
        listDirectChildren: async () => ({
          support: 'supported',
          value: {
            parentSessionId: parent,
            state: 'ready',
            children: [{
              entry: {
                kind: 'child',
                id: child,
                activity: 'running',
                hasChildren: false,
                mode: 'one-shot',
              },
            }],
            unresolved: [],
          },
        }),
      }),
    } as unknown as HarnessTuiCapabilities
    const host = {
      overlays: {
        selectPage: vi.fn(async (next: SelectOverlayRequest) => { request = next }),
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

    await new TuiActions(capabilities, host).execute('status', '')

    expect(request?.detail).toContain('支持直接子节点查询')
    expect(request?.detail).not.toContain(child)
  })
})
