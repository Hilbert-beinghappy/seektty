/** Published rc.2 vocabulary, exclusively synthetic. No user history, Agent runtime, or outgoing model requests. */
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { UserQuestionProjectionView, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types'
import type { ContinuedQuestionSnapshot, ContinuedQuestionSource } from '../../src/client/continued-question-view.ts'
export const syntheticContinuedProjection: UserQuestionProjectionView = {
  active: [{ callId: ToolCallId('synthetic-call'), state: 'continued', questions: [
    { id: 'choice', question: '选择下一步 😀', header: 'Synthetic choice', options: [{ label: '检查', description: 'Synthetic option' }, { label: '修复' }] },
    { id: 'notes', question: 'Synthetic notes' },
  ] }], settled: [],
}
export const syntheticContinuedAnswer: AskUserQuestionAnswer = { answers: [{ id: 'choice', selected: ['检查'] }, { id: 'notes', selected: [], custom: 'Synthetic answer' }] }
export function questionSource(sessionId = 'synthetic-question-owner') {
  let state: ContinuedQuestionSnapshot = { sessionId, generation: 1, ready: true, liveRoot: true, projection: syntheticContinuedProjection }
  const listeners = new Set<() => void>()
  const source: ContinuedQuestionSource = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  return { source, listeners, set: (patch: Partial<ContinuedQuestionSnapshot>): void => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }, settle: (answer = syntheticContinuedAnswer): void => {
    state = { ...state, projection: { active: [], settled: [{ callId: ToolCallId('synthetic-call'), answers: answer.answers }] } }; for (const listener of [...listeners]) listener()
  } }
}
