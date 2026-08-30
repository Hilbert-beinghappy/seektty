import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  agentOriginLabel,
  createAgentTreeState,
  deriveLifecycle,
  permissionOrigin,
  reduceAgentTree,
  rootAgentAggregate,
  subagentFallbackMode,
  type AgentTreeState,
  type DirectSubagentCatalog,
} from '../src/client/subagent-presentation.ts'

const id = (value: string): SessionId => value as SessionId

describe('conservative subagent lifecycle', () => {
  it.each([
    ['completed', { kind: 'terminal', status: 'completed' } as const],
    ['failed', { kind: 'terminal', status: 'failed' } as const],
    ['cancelled', { kind: 'terminal', status: 'cancelled' } as const],
    ['waiting', { kind: 'pending-interaction', interaction: 'approval' } as const],
    ['running', { kind: 'session-running', running: true } as const],
    ['idle', { kind: 'session-running', running: false } as const],
    ['unavailable', { kind: 'catalog-diagnostic', reason: 'unavailable', parentSessionId: id('root') } as const],
  ])('derives %s only from matching public evidence', (expected, evidence) => {
    expect(deriveLifecycle([evidence]).lifecycle).toBe(expected)
  })

  it('treats an explicit completion notification as terminal but not creation return or API failure', () => {
    expect(deriveLifecycle([{ kind: 'completion-notification', completed: true }]).lifecycle).toBe('completed')
    expect(deriveLifecycle([{ kind: 'creation-returned', created: true }])).toEqual({
      lifecycle: 'unknown', partial: false, apiError: false,
    })
    expect(deriveLifecycle([{ kind: 'api-error', message: 'transport unavailable' }])).toEqual({
      lifecycle: 'unknown', partial: false, apiError: true,
    })
  })

  it('treats simultaneous public running evidence as an explicit restart over an old completion notice', () => {
    expect(deriveLifecycle([
      { kind: 'completion-notification', completed: true },
      { kind: 'session-running', running: true },
    ]).lifecycle).toBe('running')
  })

  it('keeps partial independent and lets terminal evidence outrank stale running evidence', () => {
    expect(deriveLifecycle([
      { kind: 'terminal', status: 'failed' },
      { kind: 'session-running', running: true },
      { kind: 'partial-result', present: true },
    ])).toEqual({ lifecycle: 'failed', partial: true, apiError: false })
  })

  it('distinguishes current tree, exact-address direct list, and generic fallback', () => {
    const tree = { support: 'supported' as const, value: { parentSessionId: id('root'), state: 'ready' as const, children: [], unresolved: [] } }
    const direct = { support: 'supported' as const, value: { ...tree.value, source: 'direct-address' as const } }
    const unsupported = { support: 'unsupported' as const, reason: 'catalog-unavailable' as const }
    expect(subagentFallbackMode(tree)).toBe('tree')
    expect(subagentFallbackMode(direct)).toBe('direct-list')
    expect(subagentFallbackMode(unsupported)).toBe('direct-list')
    expect(subagentFallbackMode(unsupported, true)).toBe('generic-tool')
  })
})

function originTree(): AgentTreeState {
  const catalog: DirectSubagentCatalog = {
    parentSessionId: id('root'),
    state: 'ready',
    unresolved: [],
    children: [{
      entry: { kind: 'child', id: id('child'), label: 'Researcher', mode: 'continuable', activity: 'running', hasChildren: false },
      address: { parentSessionId: id('root'), childSessionId: id('child'), mode: 'continuable' },
    }],
  }
  let state = reduceAgentTree(createAgentTreeState(id('root')), {
    kind: 'catalog', rootSessionId: id('root'), parentSessionId: id('root'), catalog,
    evidence: { source: 'catalog', observedAt: 1, revision: 1 },
  })
  state = reduceAgentTree(state, {
    kind: 'partial', rootSessionId: id('root'), sessionId: id('child'), present: true,
    evidence: { source: 'session', observedAt: 2, revision: 2 },
  })
  return state
}

describe('subagent origin and aggregate presentation', () => {
  it('uses only a Host catalog label or explicit current Session context', () => {
    const state = originTree()
    expect(agentOriginLabel(state, id('child'))).toEqual({
      sessionId: id('child'), label: 'Researcher', source: 'catalog', breadcrumb: [id('root'), id('child')],
    })
    expect(agentOriginLabel(state, id('detached'))).toBeUndefined()
    expect(agentOriginLabel(state, id('detached'), id('detached'))?.source).toBe('current-session-context')
  })

  it('aggregates activity without mixing child tool cards into the parent transcript', () => {
    expect(rootAgentAggregate(originTree())).toEqual({
      discovered: 1,
      running: 1,
      waiting: 0,
      failed: 0,
      partial: 1,
      activityPreview: [{
        sessionId: id('child'), label: 'Researcher', source: 'catalog', breadcrumb: [id('root'), id('child')],
      }],
    })
  })

  it('labels permission owners only when the owner is public or is the current child context', () => {
    const state = originTree()
    expect(permissionOrigin(state, id('child')).state).toBe('confirmed')
    expect(permissionOrigin(state, id('unknown')).state).toBe('unconfirmed')
    expect(permissionOrigin(state, undefined).state).toBe('unconfirmed')
  })
})
