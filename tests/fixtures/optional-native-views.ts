/** Synthetic data shaped against npm rc.2 contracts; no real profiles/history/schedules/messages. */
import type { OptionalViewScope, OptionalViewSource } from '../../src/client/optional-view-lifetime.ts'
import type { TeamLeadJournal } from '../../src/client/team-view.ts'
import type { ScheduleCatalogEntry } from '../../src/client/schedule-view.ts'
import type { OverlayPrompts, SelectOverlayRequest, DetailOverlayRequest } from '../../src/client/overlays.ts'
export function scopedSource() {
  let state: OptionalViewScope = { sessionId: 'synthetic-root', generation: 1, ready: true }
  const listeners = new Set<() => void>()
  const source: OptionalViewSource = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  return { source, listeners, set: (patch: Partial<OptionalViewScope>): void => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() } }
}
export function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
export const freshSignal = (): AbortSignal => new AbortController().signal
export const tick = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve() }
export const syntheticTeamBoard = {
  membership: { id: 'synthetic-lead', rootSessionId: 'synthetic-lead', role: 'teammate', name: '研究 😀' },
  members: [{ id: 'synthetic-lead', name: 'lead', role: 'lead', status: 'inactive', diagnostics: [] }, { id: 'synthetic-member', name: '研究 😀', role: 'teammate', status: 'running', provider: 'synthetic-provider', context: 'fork', diagnostics: ['Advisory warning'] }],
  tasks: [{ id: 'task-1', revision: 2, subject: '阅读资料', description: 'Synthetic task only', status: 'in_progress', blockedBy: ['task-0'], writeScopes: ['src/example.ts'], ownerName: '研究 😀', ready: false, writeScopeWarnings: ['overlap with task-0'] }],
}
export const syntheticLeadJournal: TeamLeadJournal = { teamId: 'synthetic-lead', complete: true, events: [
  { seq: 1, type: 'team/message/queued', data: { version: 2, teamId: 'synthetic-lead', message: { id: 'message-1', senderId: 'synthetic-lead', senderName: 'lead', targetId: 'synthetic-member', content: [{ type: 'text', text: 'Synthetic peer payload' }] } } },
  { seq: 2, type: 'team/message/delivered', data: { version: 2, teamId: 'synthetic-lead', messageId: 'message-1', targetId: 'synthetic-member' } },
  { seq: 3, type: 'team/message/queued', data: { version: 2, teamId: 'synthetic-lead', message: { id: 'message-2', senderId: 'synthetic-member', senderName: '研究 😀', targetId: 'synthetic-lead', content: [{ type: 'text', text: 'Synthetic pending payload' }] } } },
] }
export const syntheticSchedules: readonly ScheduleCatalogEntry[] = [
  { id: 'schedule-daily', sessionId: 'synthetic-other', kind: 'daily', title: '每日 synthetic', prompt: 'Synthetic reminder', time: '08:00:00.000', timeZone: 'Asia/Shanghai', scheduledAt: '2030-01-01T00:00:00.000Z', status: 'active' },
  { id: 'schedule-ended', sessionId: 'synthetic-root', kind: 'after', title: 'Ended synthetic', prompt: 'Synthetic legacy reminder', afterSeconds: 60, scheduledAt: '2030-01-01T00:00:00.000Z', status: 'inactive', lastDelivery: { scheduledAt: '2030-01-01T00:00:00.000Z', deliveredAt: '2030-01-01T00:00:05.000Z', messageId: 'synthetic-delivery' } },
]
export function scriptedOverlays(selections: readonly (string | undefined)[], inputs: readonly (string | undefined)[] = [], confirmations: readonly boolean[] = []) {
  const selects: SelectOverlayRequest[] = []; const details: DetailOverlayRequest[] = []; let selected = 0; let entered = 0; let confirmed = 0
  const nextInput = async (): Promise<string | undefined> => inputs[entered++]
  const overlays: OverlayPrompts = {
    select: async request => { selects.push(request); const id = selections[selected++]; return id === undefined ? undefined : request.choices.find(choice => choice.id === id) },
    input: nextInput, multilineInput: nextInput, secretInput: async () => undefined, secretTransaction: async () => undefined,
    multiSelect: async () => [], detail: async request => { details.push(request) }, confirm: async () => confirmations[confirmed++] ?? false,
    progress: async request => request.work(() => {}, freshSignal()),
  }
  return { overlays, selects, details }
}
