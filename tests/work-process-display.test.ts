import { describe, expect, it } from 'vitest'
import { DEFAULT_TUI_BEHAVIOR, TUI_BEHAVIOR_SETTINGS_NAMESPACE } from '../src/protocol.ts'
import { normalizeBehavior } from '../src/client/behavior.ts'
import {
  WORK_PROCESS_MODES, WORK_PROCESS_DISPLAY_FIELD, cycleWorkProcessMode, normalizeWorkProcessMode,
  resolveWorkProcessDisplay, workProcessGroupPresentation, workProcessNodeHidden, workProcessPolicy,
  workProcessReasoningPreview, workProcessSettingsMutation, workProcessTurnPresentation,
  type WorkProcessTurnEvidence, type WorkProcessSettingsMutation,
} from '../src/client/work-process-display.ts'
import { completedProcessTurn, runningProcessTurn, processNodes, projectedProcessGroups } from './fixtures/work-process-display.ts'

const expandedTurn = { turn: 3, answerStep: 4 }
const leaf = { toolCards: DEFAULT_TUI_BEHAVIOR.toolCards, showReasoning: DEFAULT_TUI_BEHAVIOR.showReasoning,
  toolOutputLineLimit: DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit, diffContextLines: DEFAULT_TUI_BEHAVIOR.diffContextLines }

describe('published rc.2 work-process presentation', () => {
  it('uses the official table including Verbose live-detail=false', () => {
    expect(WORK_PROCESS_MODES.map(mode => workProcessPolicy(mode))).toEqual([
      { mode: 'compact', foldCompletedTurns: true, stepGrouping: 'collapsed', liveProcessDetail: false, settledReasoningPreview: false },
      { mode: 'standard', foldCompletedTurns: true, stepGrouping: 'collapsed', liveProcessDetail: true, settledReasoningPreview: true },
      { mode: 'detailed', foldCompletedTurns: true, stepGrouping: 'history', liveProcessDetail: true, settledReasoningPreview: true },
      { mode: 'verbose', foldCompletedTurns: false, stepGrouping: 'none', liveProcessDetail: false, settledReasoningPreview: true },
    ])
  })

  it.each([undefined, null, 'future-mode', '', 5, {}, ['compact']])('preserves existing terminal defaults for unknown/absent %j', value => {
    expect(resolveWorkProcessDisplay(value, leaf)).toEqual({ mode: undefined, policy: undefined, source: 'terminal-default', leaf })
    expect(workProcessNodeHidden(undefined, completedProcessTurn, processNodes[1]!)).toBe(false)
  })

  it.each(['normal', 'expanded'])('adopts the official legacy alias %s without changing leaf preferences or source', value => {
    const before = { value, leaf: { ...leaf, toolCards: 'hidden' as const, showReasoning: true } }
    const result = resolveWorkProcessDisplay(before.value, before.leaf)
    expect(result).toEqual({ mode: 'detailed', policy: workProcessPolicy('detailed'), source: 'legacy-alias', leaf: before.leaf })
    expect(before.value).toBe(value)
    expect(result.leaf).not.toBe(before.leaf)
  })

  it('does not confuse old expanded toolCards with an explicit work-process mode', () => {
    const old = normalizeBehavior({ toolCards: 'expanded', showReasoning: true, toolOutputLineLimit: 47, diffContextLines: 2 })
    expect(resolveWorkProcessDisplay(undefined, old)).toMatchObject({ source: 'terminal-default', mode: undefined,
      leaf: { toolCards: 'expanded', showReasoning: true, toolOutputLineLimit: 47, diffContextLines: 2 } })
    for (const mode of WORK_PROCESS_MODES) expect(resolveWorkProcessDisplay(mode, old).leaf).toEqual({
      toolCards: 'expanded', showReasoning: true, toolOutputLineLimit: 47, diffContextLines: 2,
    })
  })

  it.each([
    ['compact', true, false], ['standard', true, true], ['detailed', false, false], ['verbose', false, false],
  ] as const)('%s live grouping/detail matches the published policy', (mode, grouped, detail) => {
    expect(workProcessGroupPresentation(workProcessPolicy(mode), runningProcessTurn, false)).toEqual({ grouped,
      headerVisible: grouped, bodyVisible: !grouped, outerHidden: false, showRunningDetail: detail,
      showSettledReasoningPreview: mode !== 'compact', openingEdge: 'bottom' })
    expect(workProcessGroupPresentation(workProcessPolicy(mode), runningProcessTurn, false, true).bodyVisible).toBe(true)
    expect(workProcessTurnPresentation(workProcessPolicy(mode), runningProcessTurn)).toEqual({ foldable: false, open: true })
  })

  it.each(WORK_PROCESS_MODES)('%s settled process opens independently of inner group disclosure', mode => {
    const policy = workProcessPolicy(mode)
    const grouped = mode !== 'verbose'
    const hidden = workProcessGroupPresentation(policy, completedProcessTurn, true)
    expect(hidden.outerHidden).toBe(grouped)
    expect(hidden.bodyVisible).toBe(!grouped)
    const revealed = workProcessGroupPresentation(policy, completedProcessTurn, true, false, expandedTurn)
    expect(revealed).toMatchObject({ grouped, outerHidden: false, bodyVisible: !grouped, headerVisible: grouped, openingEdge: 'top' })
    expect(workProcessGroupPresentation(policy, completedProcessTurn, true, true, expandedTurn).bodyVisible).toBe(true)
  })

  it.each(WORK_PROCESS_MODES)('%s preserves native immutable membership across switches', mode => {
    const before = JSON.stringify(projectedProcessGroups)
    for (const group of projectedProcessGroups) workProcessGroupPresentation(workProcessPolicy(mode), completedProcessTurn, group.closed, true, expandedTurn)
    expect(JSON.stringify(projectedProcessGroups)).toBe(before)
  })

  it.each(['aborted', 'error'])('keeps %s Turns visibly open', endReason => {
    const turn = { ...completedProcessTurn, endReason }
    expect(workProcessTurnPresentation(workProcessPolicy('compact'), turn)).toEqual({ foldable: false, open: true })
    expect(processNodes.map(node => workProcessNodeHidden(workProcessPolicy('compact'), turn, node))).toEqual(processNodes.map(() => false))
  })

  it('keeps interleaved input visible and invalidates disclosure when the answer changes', () => {
    expect(workProcessTurnPresentation(workProcessPolicy('standard'), { ...completedProcessTurn, hasInterleavedInput: true })).toEqual({ foldable: false, open: true })
    expect(workProcessTurnPresentation(workProcessPolicy('standard'), completedProcessTurn, { turn: 3, answerStep: 2 }).open).toBe(false)
    expect(workProcessTurnPresentation(workProcessPolicy('standard'), completedProcessTurn, { turn: 4, answerStep: 4 }).open).toBe(false)
    expect(workProcessTurnPresentation(workProcessPolicy('standard'), completedProcessTurn, expandedTurn).open).toBe(true)
  })

  const incomplete: readonly (WorkProcessTurnEvidence | undefined)[] = [undefined,
    { ...completedProcessTurn, status: 'unknown' },
    { turn: 3, status: 'closed', endReason: 'completed', hasInterleavedInput: false },
    { ...completedProcessTurn, hasInterleavedInput: undefined },
    { turn: 3, status: 'closed', hasInterleavedInput: false, spec: completedProcessTurn.spec! },
    { ...completedProcessTurn, spec: { ...completedProcessTurn.spec!, turn: 4 } },
    { ...completedProcessTurn, spec: { ...completedProcessTurn.spec!, processStartSeq: -1 } },
    { ...completedProcessTurn, spec: { ...completedProcessTurn.spec!, answerAnchorSeq: 8 } },
    { ...completedProcessTurn, spec: { ...completedProcessTurn.spec!, answerStep: Number.NaN } },
  ]
  it.each(incomplete)('keeps content visible until native boundary evidence is confirmed: %j', turn => {
    const policy = workProcessPolicy('compact')
    expect(workProcessTurnPresentation(policy, turn)).toMatchObject({ foldable: false, open: true, unavailableReason: expect.any(String) })
    expect(workProcessGroupPresentation(policy, turn, true)).toMatchObject({ grouped: false, bodyVisible: true, outerHidden: false })
    expect(workProcessNodeHidden(policy, turn, processNodes[1]!)).toBe(false)
  })
  it('does not hide an unknown group even when its outer Turn could be folded', () => {
    expect(workProcessGroupPresentation(workProcessPolicy('compact'), completedProcessTurn, undefined)).toMatchObject({ grouped: false, outerHidden: false, bodyVisible: true })
  })

  it('folds only known process parts and retains final answer, input and status', () => {
    const policy = workProcessPolicy('detailed')
    expect(processNodes.filter(node => workProcessNodeHidden(policy, completedProcessTurn, node)).map(node => node.key)).toEqual([
      'reasoning-1', 'tool-1', 'reply-1', 'tool-2', 'final-reasoning',
    ])
    for (const kind of ['system-prompt', 'user', 'steering', 'turn-trigger', 'turn-process', 'turn-error', 'turn-max-tokens', 'turn-tail']) {
      expect(workProcessNodeHidden(policy, completedProcessTurn, { kind, anchorSeq: 12, knownProcessMember: true })).toBe(false)
    }
    expect(workProcessNodeHidden(policy, completedProcessTurn, { kind: 'extension', anchorSeq: 12, knownProcessMember: undefined })).toBe(false)
    expect(workProcessNodeHidden(policy, completedProcessTurn, { kind: 'tool-call', anchorSeq: 21, knownProcessMember: true })).toBe(false)
    expect(workProcessNodeHidden(policy, completedProcessTurn, { kind: 'tool-call', anchorSeq: 10, knownProcessMember: true })).toBe(false)
    expect(workProcessNodeHidden(policy, completedProcessTurn, { kind: 'assistant-step', anchorSeq: 20, step: 4, knownProcessMember: true })).toBe(false)
    expect(processNodes.some(node => workProcessNodeHidden(policy, completedProcessTurn, node, expandedTurn))).toBe(false)
    expect(processNodes.some(node => workProcessNodeHidden(workProcessPolicy('verbose'), completedProcessTurn, node))).toBe(false)
  })

  it.each(WORK_PROCESS_MODES)('%s previews reasoning independently of full reasoning visibility', mode => {
    const policy = workProcessPolicy(mode)
    expect(workProcessReasoningPreview(policy, true, false, 'Synthetic thought')).toBe(true)
    expect(workProcessReasoningPreview(policy, false, false, 'Synthetic thought')).toBe(mode !== 'compact')
    expect(workProcessReasoningPreview(policy, true, true, 'Synthetic thought')).toBe(false)
    expect(workProcessReasoningPreview(policy, false, true, 'Synthetic thought')).toBe(false)
    expect(workProcessReasoningPreview(policy, true, false, '')).toBe(false)
    expect(resolveWorkProcessDisplay(mode, leaf).leaf.showReasoning).toBe(false)
  })
})

/** Synthetic Host-owned document/CAS fixture; this never writes any actual Settings. */
function settingsFixture() {
  let revision = 7
  const initial = { toolCards: 'expanded', showReasoning: true, toolOutputLineLimit: 35, diffContextLines: 1, otherPluginValue: { keep: true } }
  let value: Record<string, unknown> = structuredClone(initial)
  const calls: WorkProcessSettingsMutation[] = []
  return { initial, calls,
    read: () => ({ namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE, revision, value: structuredClone(value) }),
    mutate: (request: WorkProcessSettingsMutation) => {
      if (request.namespace !== TUI_BEHAVIOR_SETTINGS_NAMESPACE || request.expectedRevision !== revision) throw new Error('SETTINGS_CONFLICT')
      calls.push(request)
      for (const op of request.ops) {
        if (op.path.length !== 1 || op.path[0] !== WORK_PROCESS_DISPLAY_FIELD) throw new Error('Unexpected fixture path')
        if (op.op === 'set') value[WORK_PROCESS_DISPLAY_FIELD] = structuredClone(op.value)
        else if (op.op === 'unset') delete value[WORK_PROCESS_DISPLAY_FIELD]
        else throw new Error('Unexpected fixture operation')
      }
      revision++
    },
  }
}

describe('explicit keyboard choice and native Settings CAS handoff', () => {
  it('cycles forward/backward, including aliases, unknown and wraparound', () => {
    expect([undefined, 'compact', 'standard', 'detailed', 'verbose'].map(value => cycleWorkProcessMode(value))).toEqual(['compact', 'standard', 'detailed', 'verbose', 'compact'])
    expect([undefined, 'compact', 'standard', 'detailed', 'verbose'].map(value => cycleWorkProcessMode(value, -1))).toEqual(['verbose', 'verbose', 'compact', 'standard', 'detailed'])
    expect(cycleWorkProcessMode('normal')).toBe('verbose')
    expect(cycleWorkProcessMode('expanded', -1)).toBe('standard')
    expect(cycleWorkProcessMode('future')).toBe('compact')
    expect(normalizeWorkProcessMode('future')).toBeUndefined()
  })

  it('hands one field to Host storage, reopens accepted choices, and restores legacy defaults by unset', () => {
    const host = settingsFixture()
    for (const mode of WORK_PROCESS_MODES) {
      const before = host.read()
      const mutation = workProcessSettingsMutation(before, mode, true)
      expect(mutation.ops).toEqual([{ op: 'set', path: ['workProcessDisplay'], value: mode }])
      host.mutate(mutation)
      const reopened = host.read()
      expect(resolveWorkProcessDisplay(reopened.value[WORK_PROCESS_DISPLAY_FIELD], leaf).mode).toBe(mode)
      expect(reopened.value).toMatchObject(host.initial)
    }
    host.mutate(workProcessSettingsMutation(host.read(), 'terminal-default', true))
    expect(host.read().value).toEqual(host.initial)
    expect(resolveWorkProcessDisplay(host.read().value[WORK_PROCESS_DISPLAY_FIELD], leaf).source).toBe('terminal-default')
  })

  it('does not migrate unknown/legacy values or blindly retry a stale revision', () => {
    const host = settingsFixture()
    for (const value of ['normal', 'expanded', 'future', undefined]) resolveWorkProcessDisplay(value, leaf)
    expect(host.calls).toHaveLength(0)
    const stale = host.read()
    host.mutate(workProcessSettingsMutation(stale, 'compact', true))
    expect(() => host.mutate(workProcessSettingsMutation(stale, 'verbose', true))).toThrow('SETTINGS_CONFLICT')
    expect(host.calls).toHaveLength(1)
    expect(host.read().value[WORK_PROCESS_DISPLAY_FIELD]).toBe('compact')
  })

  it.each([undefined, false])('refuses a missing/unknown field descriptor (%j)', available => {
    const host = settingsFixture()
    expect(() => workProcessSettingsMutation(host.read(), 'compact', available)).toThrow(/descriptor is unknown|not registered/u)
    expect(host.calls).toHaveLength(0)
  })
  it.each([{ namespace: 'ui-chat', revision: 2 }, { namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE, revision: -1 },
    { namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE, revision: Number.NaN }])('refuses an unauthoritative document %j', document => {
    expect(() => workProcessSettingsMutation(document, 'compact', true)).toThrow(/namespace\/revision/u)
  })
})
