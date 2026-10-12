/** Pure terminal presentation adapter, exactly dsh-client-ui-chat 0.2.0-rc.2. No Host state or I/O. */
import { TUI_BEHAVIOR_SETTINGS_NAMESPACE, type TuiBehaviorSettings, type TuiSettingsDocument, type TuiSettingsPathOp } from '../protocol.ts'
export const WORK_PROCESS_MODES = ['compact', 'standard', 'detailed', 'verbose'] as const
export type WorkProcessMode = typeof WORK_PROCESS_MODES[number]
/** SeekTTY field. Absence preserves the pre-existing terminal preferences; it is not a fifth official mode. */
export const WORK_PROCESS_DISPLAY_FIELD = 'workProcessDisplay'
export interface WorkProcessPolicy {
  readonly mode: WorkProcessMode
  readonly foldCompletedTurns: boolean
  readonly stepGrouping: 'collapsed' | 'history' | 'none'
  readonly liveProcessDetail: boolean
  readonly settledReasoningPreview: boolean
}
const policies: Readonly<Record<WorkProcessMode, WorkProcessPolicy>> = Object.freeze({
  compact: Object.freeze({ mode: 'compact', foldCompletedTurns: true, stepGrouping: 'collapsed', liveProcessDetail: false, settledReasoningPreview: false }),
  standard: Object.freeze({ mode: 'standard', foldCompletedTurns: true, stepGrouping: 'collapsed', liveProcessDetail: true, settledReasoningPreview: true }),
  detailed: Object.freeze({ mode: 'detailed', foldCompletedTurns: true, stepGrouping: 'history', liveProcessDetail: true, settledReasoningPreview: true }),
  verbose: Object.freeze({ mode: 'verbose', foldCompletedTurns: false, stepGrouping: 'none', liveProcessDetail: false, settledReasoningPreview: true }),
})
export function workProcessPolicy(mode: WorkProcessMode): WorkProcessPolicy { return policies[mode] }
export function isWorkProcessMode(value: unknown): value is WorkProcessMode { return typeof value === 'string' && WORK_PROCESS_MODES.some(mode => mode === value) }
/** Official old normal/expanded aliases; adopting them never requests a migration write. */
export function normalizeWorkProcessMode(value: unknown): WorkProcessMode | undefined {
  if (value === 'normal' || value === 'expanded') return 'detailed'
  return isWorkProcessMode(value) ? value : undefined
}
export type WorkProcessLeafPreferences = Pick<TuiBehaviorSettings, 'toolCards' | 'showReasoning' | 'toolOutputLineLimit' | 'diffContextLines'>
export interface WorkProcessDisplay {
  readonly mode: WorkProcessMode | undefined
  readonly policy: WorkProcessPolicy | undefined
  readonly source: 'explicit' | 'legacy-alias' | 'terminal-default'
  readonly leaf: WorkProcessLeafPreferences
}
/** Four modes control process containers, not leaf tool visibility, full reasoning or output budgets. */
export function resolveWorkProcessDisplay(value: unknown, leaf: WorkProcessLeafPreferences): WorkProcessDisplay {
  const mode = normalizeWorkProcessMode(value)
  return { mode, policy: mode === undefined ? undefined : workProcessPolicy(mode), source: mode === undefined ? 'terminal-default' : isWorkProcessMode(value) ? 'explicit' : 'legacy-alias',
    leaf: { toolCards: leaf.toolCards, showReasoning: leaf.showReasoning, toolOutputLineLimit: leaf.toolOutputLineLimit, diffContextLines: leaf.diffContextLines } }
}
/** Explicit keyboard action only. Unconfigured forward/backward starts at Compact/Verbose. */
export function cycleWorkProcessMode(value: unknown, direction: 1 | -1 = 1): WorkProcessMode {
  if (direction !== 1 && direction !== -1) throw new Error('Display cycle direction must be +1 or -1')
  const mode = normalizeWorkProcessMode(value)
  if (mode === undefined) return direction === 1 ? WORK_PROCESS_MODES[0] : WORK_PROCESS_MODES[3]
  const index = WORK_PROCESS_MODES.indexOf(mode)
  return WORK_PROCESS_MODES[(index + direction + WORK_PROCESS_MODES.length) % WORK_PROCESS_MODES.length]!
}
/** Thin selections from the official ChatTurnProcessPresentation / TurnProcessSpec, never reconstructed logs. */
export interface WorkProcessTurnEvidence {
  readonly turn: number
  readonly status: 'open' | 'closed' | 'unknown'
  readonly endReason?: string
  readonly hasInterleavedInput: boolean | undefined
  readonly spec?: { readonly turn: number; readonly processStartSeq: number; readonly answerAnchorSeq: number | null; readonly answerStep: number | null }
}
/** Existing UI disclosure, invalid when the final answer step changes. No durable question/Session mutation. */
export interface WorkProcessTurnDisclosure { readonly turn: number; readonly answerStep: number }
export interface WorkProcessTurnPresentation {
  readonly foldable: boolean
  readonly open: boolean
  readonly unavailableReason?: string
}
function validSpec(turn: WorkProcessTurnEvidence): boolean {
  const spec = turn.spec
  return spec !== undefined && spec.turn === turn.turn && Number.isSafeInteger(turn.turn) && turn.turn > 0
    && Number.isSafeInteger(spec.processStartSeq) && spec.processStartSeq >= 0
    && (spec.answerAnchorSeq === null || Number.isSafeInteger(spec.answerAnchorSeq) && spec.answerAnchorSeq >= spec.processStartSeq)
    && (spec.answerStep === null || Number.isSafeInteger(spec.answerStep) && spec.answerStep >= 0)
}
export function workProcessTurnPresentation(policy: WorkProcessPolicy | undefined, turn: WorkProcessTurnEvidence | undefined, disclosure?: WorkProcessTurnDisclosure): WorkProcessTurnPresentation {
  if (policy === undefined || !policy.foldCompletedTurns) return { foldable: false, open: true }
  if (turn === undefined || turn.status === 'unknown' || !validSpec(turn) || turn.hasInterleavedInput === undefined || turn.status === 'closed' && !turn.endReason) return { foldable: false, open: true, unavailableReason: 'Native Turn/process evidence is incomplete; retain visible content' }
  if (turn.status === 'open' || turn.hasInterleavedInput || turn.endReason === 'aborted' || turn.endReason === 'error') return { foldable: false, open: true }
  return { foldable: true, open: disclosure?.turn === turn.turn && disclosure.answerStep === (turn.spec!.answerStep ?? 0) }
}
export interface WorkProcessGroupPresentation {
  readonly grouped: boolean
  readonly headerVisible: boolean
  readonly bodyVisible: boolean
  readonly outerHidden: boolean
  readonly showRunningDetail: boolean
  readonly showSettledReasoningPreview: boolean
  readonly openingEdge: 'top' | 'bottom'
}
/** Consume already projected group membership unchanged. Unknown Turn/group evidence cannot hide members. */
export function workProcessGroupPresentation(policy: WorkProcessPolicy | undefined, turn: WorkProcessTurnEvidence | undefined, groupClosed: boolean | undefined, groupOpen = false, disclosure?: WorkProcessTurnDisclosure): WorkProcessGroupPresentation {
  const outer = workProcessTurnPresentation(policy, turn, disclosure)
  const known = turn !== undefined && turn.status !== 'unknown' && groupClosed !== undefined && outer.unavailableReason === undefined
  const grouped = known && policy !== undefined && (policy.stepGrouping === 'collapsed' || policy.stepGrouping === 'history' && turn.status === 'closed')
  const outerHidden = known && outer.foldable && !outer.open
  return { grouped, outerHidden, headerVisible: grouped && !outerHidden, bodyVisible: !outerHidden && (!grouped || groupOpen),
    showRunningDetail: grouped && groupClosed === false && policy?.liveProcessDetail === true,
    showSettledReasoningPreview: policy?.settledReasoningPreview === true, openingEdge: groupClosed === false ? 'bottom' : 'top' }
}
const independentKinds = new Set(['system-prompt', 'user', 'steering', 'turn-trigger', 'turn-process', 'turn-error', 'turn-max-tokens', 'turn-tail'])
export interface WorkProcessNodeEvidence {
  readonly kind: string; readonly anchorSeq: number; readonly step?: number; readonly groupPart?: 'reasoning' | 'response'
  /** True only for a known registered process node/part. Unknown extensions remain visible. */
  readonly knownProcessMember: boolean | undefined
}
/** Whole-Turn visibility over the source node/part. Final answer and independent input/status never disappear. */
export function workProcessNodeHidden(policy: WorkProcessPolicy | undefined, turn: WorkProcessTurnEvidence | undefined, node: WorkProcessNodeEvidence, disclosure?: WorkProcessTurnDisclosure): boolean {
  const outer = workProcessTurnPresentation(policy, turn, disclosure)
  if (!outer.foldable || outer.open || turn?.spec === undefined || node.knownProcessMember !== true || independentKinds.has(node.kind) || !Number.isSafeInteger(node.anchorSeq)) return false
  const spec = turn.spec
  const finalStep = node.kind === 'assistant-step' && node.step === spec.answerStep
  if (finalStep && node.groupPart !== 'reasoning') return false
  return node.anchorSeq >= spec.processStartSeq && (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq || finalStep && node.groupPart === 'reasoning')
}
export function workProcessReasoningPreview(policy: WorkProcessPolicy | undefined, running: boolean, expanded: boolean, summary: string): boolean {
  return !expanded && summary !== '' && (running || policy?.settledReasoningPreview === true)
}
export interface WorkProcessSettingsMutation {
  readonly namespace: string; readonly ops: readonly TuiSettingsPathOp[]; readonly expectedRevision: number
}
/** Pure CAS request for the existing settings.mutate API. No default/normalization writes, private storage, or retry. */
export function workProcessSettingsMutation(document: Pick<TuiSettingsDocument, 'namespace' | 'revision'>, next: WorkProcessMode | 'terminal-default', fieldAvailable: boolean | undefined): WorkProcessSettingsMutation {
  if (fieldAvailable !== true) throw new Error(fieldAvailable === undefined ? 'Work-process setting descriptor is unknown' : 'Work-process setting is not registered')
  if (document.namespace !== TUI_BEHAVIOR_SETTINGS_NAMESPACE || !Number.isSafeInteger(document.revision) || document.revision < 0) throw new Error('Authoritative behavior Settings namespace/revision is required')
  if (next !== 'terminal-default' && !isWorkProcessMode(next)) throw new Error('Only an explicit current display mode can be saved')
  return { namespace: document.namespace, expectedRevision: document.revision, ops: next === 'terminal-default' ? [{ op: 'unset', path: [WORK_PROCESS_DISPLAY_FIELD] }] : [{ op: 'set', path: [WORK_PROCESS_DISPLAY_FIELD], value: next }] }
}
