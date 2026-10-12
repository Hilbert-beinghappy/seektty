/** Synthetic projected boundaries and groups. No user Session/config data. */
import type { WorkProcessTurnEvidence, WorkProcessNodeEvidence } from '../../src/client/work-process-display.ts'
export const completedProcessTurn: WorkProcessTurnEvidence = { turn: 3, status: 'closed', endReason: 'completed', hasInterleavedInput: false, spec: { turn: 3, processStartSeq: 11, answerAnchorSeq: 20, answerStep: 4 } }
export const runningProcessTurn: WorkProcessTurnEvidence = { turn: 3, status: 'open', hasInterleavedInput: false, spec: { turn: 3, processStartSeq: 11, answerAnchorSeq: null, answerStep: null } }
export const processNodes: readonly (WorkProcessNodeEvidence & { readonly key: string })[] = [
  { key: 'opening-input', kind: 'user', anchorSeq: 10, knownProcessMember: false },
  { key: 'reasoning-1', kind: 'assistant-step', anchorSeq: 11, step: 1, groupPart: 'reasoning', knownProcessMember: true },
  { key: 'tool-1', kind: 'tool-call', anchorSeq: 12, knownProcessMember: true },
  { key: 'reply-1', kind: 'assistant-step', anchorSeq: 15, step: 2, groupPart: 'response', knownProcessMember: true },
  { key: 'tool-2', kind: 'tool-call', anchorSeq: 17, knownProcessMember: true },
  { key: 'final-reasoning', kind: 'assistant-step', anchorSeq: 20, step: 4, groupPart: 'reasoning', knownProcessMember: true },
  { key: 'final-response', kind: 'assistant-step', anchorSeq: 20, step: 4, groupPart: 'response', knownProcessMember: true },
  { key: 'tail', kind: 'turn-tail', anchorSeq: 21, knownProcessMember: false },
]
/** Existing business groups retain these members and parts under every presentation mode. */
export const projectedProcessGroups = Object.freeze([
  Object.freeze({ key: 'process-1', members: Object.freeze(['reasoning-1', 'tool-1']), closed: true }),
  Object.freeze({ key: 'process-2', members: Object.freeze(['tool-2', 'final-reasoning']), closed: true }),
])
