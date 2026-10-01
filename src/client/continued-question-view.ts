/** Continued timed question recovery, exactly dsh-user-questions 0.2.0-rc.2. */
import { z } from 'zod'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import type {} from '@deepseek-ai/dsh-user-questions/remote'
import type { TypertRemoteMap } from '@deepseek-ai/dsh-typert-protocol'
import type { OverlayPrompts } from './overlays.ts'
import { ui } from './locale.ts'
import { OptionalViewLifetime, domainCommand, domainProgress, endpointReason, type OptionalViewScope, type OptionalViewSource } from './optional-view-lifetime.ts'
export interface ContinuedQuestionSnapshot extends OptionalViewScope {
  readonly projection: unknown
  /** Derived from actual Host registry identity + roots(), never Session lineage or cached activity. */
  readonly liveRoot?: boolean | undefined
  readonly liveRootReason?: string
}
export interface ContinuedQuestionSource extends OptionalViewSource { getSnapshot(): ContinuedQuestionSnapshot }
export interface ContinuedQuestionRemote { answer: TypertRemoteMap['userQuestions/answer'] }
const answerItem = z.object({ id: z.string(), selected: z.array(z.string()), custom: z.string().optional() })
const question = z.object({ id: z.string().min(1), question: z.string(), detail: z.string().optional(), header: z.string().optional(), options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional(), multiSelect: z.boolean().optional(), intent: z.object({ kind: z.literal('plan-review'), approve: z.string(), callId: z.string().optional() }).optional() })
const pending = z.object({ callId: z.string().min(1), questions: z.array(question).min(1), state: z.enum(['open', 'continued']) })
const settled = z.object({ callId: z.string().min(1), answers: z.array(answerItem) })
const projection = z.object({ active: z.array(z.unknown()), settled: z.array(z.unknown()) })
export type ContinuedQuestionStatus = 'open' | 'continued' | 'submitting' | 'queued' | 'unknown' | 'settled' | 'invalid'
export interface ContinuedQuestionRow {
  readonly id: string; readonly callId?: string; readonly ownerSessionId: string; readonly scopeKey: string
  readonly status: ContinuedQuestionStatus; readonly title: string; readonly detail: string
  readonly questions?: readonly AskUserQuestionItem[]; readonly answers?: readonly z.infer<typeof answerItem>[]
  readonly evidence?: string; readonly fingerprint?: string
}
interface Submission { readonly state: 'submitting' | 'queued' | 'unknown'; readonly evidence: string }
export function continuedQuestionError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined
  const message = error instanceof Error ? error.message : String(error)
  return code === undefined ? message : `${code}: ${message}`
}
/** Validate the entire human batch, preserving exact question identities and option labels. */
export function validateContinuedAnswer(questions: readonly AskUserQuestionItem[], answer: AskUserQuestionAnswer): AskUserQuestionAnswer {
  const parsed = z.object({ answers: z.array(answerItem) }).parse(answer)
  const ids = new Set(parsed.answers.map(item => item.id))
  if (ids.size !== questions.length || parsed.answers.length !== questions.length || !questions.every(item => ids.has(item.id))) throw new Error('BAD_ANSWER: Answer each recorded question exactly once')
  for (const item of parsed.answers) {
    const original = questions.find(question => question.id === item.id)!
    const labels = new Set(original.options?.map(option => option.label) ?? [])
    if (new Set(item.selected).size !== item.selected.length || item.selected.some(label => !labels.has(label))
      || item.custom !== undefined && !item.custom.trim()
      || original.multiSelect !== true && (item.selected.length > 1 || item.selected.length > 0 && item.custom !== undefined)) throw new Error('BAD_ANSWER: Invalid selection or custom answer')
  }
  return { answers: parsed.answers.map(({ id, selected, custom }) => ({ id, selected, ...(custom === undefined ? {} : { custom }) })) }
}
/** Per-instance UI observations only; native projection alone establishes settlement. */
export class ContinuedQuestionController {
  private readonly lifetime: OptionalViewLifetime
  private readonly local = new Map<string, Submission>()
  private readonly listeners = new Set<() => void>()
  private readonly disposedSignal = new AbortController()
  private readonly stopSource: () => void
  constructor(private readonly source: ContinuedQuestionSource, private readonly remote: ContinuedQuestionRemote, private readonly methods: () => ReadonlySet<string> | undefined, timeoutMs?: number) {
    this.lifetime = new OptionalViewLifetime(source, timeoutMs)
    this.stopSource = source.subscribe(() => this.notify())
  }
  private notify(): void { for (const listener of [...this.listeners]) { try { listener() } catch { /* A UI observer cannot settle or poison an answer operation. */ } } }
  subscribe(listener: () => void): () => void { if (this.disposedSignal.signal.aborted) throw new Error('Question view disposed'); this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  dispose(): void { if (this.disposedSignal.signal.aborted) return; this.disposedSignal.abort(); this.stopSource(); this.listeners.clear() }
  key(): string { if (this.disposedSignal.signal.aborted) throw new Error('Question view disposed'); return this.lifetime.key() }
  private localKey(owner: string, callId: string): string { return JSON.stringify([owner, callId]) }
  reason(): string | undefined {
    if (this.disposedSignal.signal.aborted) return 'Question view disposed'
    const reason = endpointReason(this.source, this.methods(), 'userQuestions/answer'); if (reason !== undefined) return reason
    const state = this.source.getSnapshot()
    return state.liveRoot === true ? undefined : state.liveRootReason ?? (state.liveRoot === false ? 'CALLER_NOT_LIVE / DELEGATED_CALLER: An exact live root Agent is required' : 'Exact live root Agent identity is unknown')
  }
  rows(): readonly ContinuedQuestionRow[] {
    const scopeKey = this.key(); const snapshot = this.source.getSnapshot(); const ownerSessionId = snapshot.sessionId
    if (snapshot.projection === undefined) throw new Error('Timed userQuestions projection is absent; this Profile may use the existing blocking question tool')
    const view = projection.parse(snapshot.projection)
    const rows: ContinuedQuestionRow[] = []; const identities = new Set<string>()
    const base = { ownerSessionId, scopeKey }
    for (const [index, value] of view.active.entries()) {
      const parsed = pending.safeParse(value)
      if (!parsed.success) { rows.push({ ...base, id: `invalid:active:${index}`, status: 'invalid', title: 'Unknown question state or malformed batch', detail: JSON.stringify(value, null, 2) }); continue }
      const item = parsed.data
      if (identities.has(item.callId)) throw new Error('Conflicting active question identity; answers disabled')
      identities.add(item.callId)
      if (new Set(item.questions.map(question => question.id)).size !== item.questions.length || item.questions.some(question => question.intent !== undefined && !question.options?.some(option => option.label === question.intent!.approve))) {
        rows.push({ ...base, id: item.callId, callId: item.callId, status: 'invalid', title: 'Invalid question identities or plan-review choices', detail: JSON.stringify(item, null, 2) }); continue
      }
      const local = this.local.get(this.localKey(ownerSessionId, item.callId))
      // A stale continued observation cannot override a current open state.
      const status = item.state === 'open' ? 'open' : local?.state ?? 'continued'
      rows.push({ ...base, id: item.callId, callId: item.callId, status, title: item.questions[0]!.header ?? item.questions[0]!.question,
        questions: item.questions.map(question => ({ id: question.id, question: question.question,
          ...(question.detail === undefined ? {} : { detail: question.detail }), ...(question.header === undefined ? {} : { header: question.header }),
          ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
          ...(question.options === undefined ? {} : { options: question.options.map(option => ({ label: option.label, ...(option.description === undefined ? {} : { description: option.description }) })) }),
          ...(question.intent === undefined ? {} : { intent: { kind: question.intent.kind, approve: question.intent.approve, ...(question.intent.callId === undefined ? {} : { callId: ToolCallId(question.intent.callId) }) } }),
        })),
        detail: JSON.stringify(item, null, 2), fingerprint: JSON.stringify(item), ...(local === undefined ? {} : { evidence: local.evidence }) })
    }
    for (const [index, value] of view.settled.entries()) {
      const parsed = settled.safeParse(value)
      if (!parsed.success) { rows.push({ ...base, id: `invalid:settled:${index}`, status: 'invalid', title: 'Malformed settled question', detail: JSON.stringify(value, null, 2) }); continue }
      if (identities.has(parsed.data.callId)) throw new Error('Question appears both active and settled; answers disabled')
      identities.add(parsed.data.callId)
      rows.push({ ...base, id: parsed.data.callId, callId: parsed.data.callId, status: 'settled', title: ui('官方已确认回答', 'Answer confirmed by native projection'), answers: parsed.data.answers, detail: JSON.stringify(parsed.data, null, 2) })
    }
    return rows
  }
  answerReason(row: ContinuedQuestionRow): string | undefined {
    const reason = this.reason(); if (reason !== undefined) return reason
    if (row.ownerSessionId !== this.source.getSnapshot().sessionId || row.scopeKey !== this.key()) return 'Question owner/generation changed; reread the current projection'
    if (row.status === 'open') return 'Foreground question belongs to the existing question surface; answer Remote only handles continued questions'
    if (row.status === 'queued') return 'A reply is queued; wait for native projection settlement. Do not submit again.'
    if (row.status === 'submitting') return 'Answer submission is still pending'
    if (row.status === 'unknown') return 'Submission outcome is unknown; reread the projection. Do not blindly retry.'
    if (row.status !== 'continued' || row.questions === undefined || row.callId === undefined) return 'Only a known continued question can take an answer'
    return undefined
  }
  async answer(selected: ContinuedQuestionRow, answer: AskUserQuestionAnswer, parent: AbortSignal): Promise<'queued' | 'settled'> {
    parent.throwIfAborted(); const rows = this.rows()
    const row = rows.find(row => row.id === selected.id)
    if (row === undefined || row.fingerprint !== selected.fingerprint || row.scopeKey !== selected.scopeKey || row.ownerSessionId !== selected.ownerSessionId) throw new Error('Question selection is stale; reread the projection')
    const reason = this.answerReason(row); if (reason !== undefined) throw new Error(reason)
    const callId = row.callId!; const normalized = validateContinuedAnswer(row.questions!, answer)
    const key = this.localKey(row.ownerSessionId, callId)
    const signal = AbortSignal.any([parent, this.disposedSignal.signal])
    let dispatched = false
    this.local.set(key, { state: 'submitting', evidence: 'Submitting the human answer; not settled' }); this.notify()
    try {
      const result = await this.lifetime.run(signal, async () => {
        // Reentrant source listeners and UI notifications may withdraw identity/capability.
        const current = this.rows().find(item => item.callId === callId)
        const missing = this.reason()
        if (missing !== undefined || current === undefined || current.fingerprint !== row.fingerprint || current.ownerSessionId !== row.ownerSessionId || current.scopeKey !== row.scopeKey) throw new Error(missing ?? 'Question changed before dispatch')
        dispatched = true
        return this.remote.answer(SessionId(row.ownerSessionId), ToolCallId(callId), normalized)
      }, true)
      if (this.key() !== row.scopeKey) throw new Error('Question generation changed after dispatch')
      if (result.ok !== true) throw result.error
      if (result.value !== true) {
        if (result.value !== false) throw new Error('Native answer returned an unknown receipt')
        this.local.delete(key); this.notify()
        throw new Error('Native question is no longer continued; reread the projection')
      }
      this.local.set(key, { state: 'queued', evidence: 'Native answer true: reply steered into the inbox. It is not settled until the native projection confirms admission.' }); this.notify()
      return this.rows().some(item => item.callId === callId && item.status === 'settled') ? 'settled' : 'queued'
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (!dispatched || code === 'BAD_ANSWER' || code === 'CALLER_NOT_LIVE' || code === 'DELEGATED_CALLER') this.local.delete(key)
      else if (code === 'REPLY_QUEUED') this.local.set(key, { state: 'queued', evidence: continuedQuestionError(error) })
      else if (this.local.get(key)?.state === 'submitting') this.local.set(key, { state: 'unknown', evidence: `${continuedQuestionError(error)}; dispatched answer may be queued. Refresh before any further action.` })
      this.notify(); throw new Error(continuedQuestionError(error), { cause: error })
    }
  }
}
async function questionBatch(questions: readonly AskUserQuestionItem[], overlays: OverlayPrompts): Promise<AskUserQuestionAnswer | undefined> {
  const answers: AskUserQuestionAnswer['answers'] = []
  for (const question of questions) {
    if (question.detail !== undefined) await overlays.detail({ title: question.header ?? question.question, content: question.detail })
    const choices = question.options?.map((option, index) => ({ id: String(index), label: option.label, ...(option.description === undefined ? {} : { description: option.description }) })) ?? []
    const action = await overlays.select({ title: question.question, choices: [
      ...(question.multiSelect === true && choices.length > 0 ? [{ id: 'multiple', label: ui('选择多个选项', 'Select multiple options') }] : choices),
      { id: 'custom', label: ui('填写回答', 'Write an answer') }, { id: 'skip', label: ui('跳过此问题', 'Skip this question') },
    ] })
    if (action === undefined) return undefined
    if (action.id === 'custom') {
      const custom = await overlays.multilineInput({ title: question.question }); if (custom === undefined) return undefined
      answers.push({ id: question.id, selected: [], custom })
    } else if (action.id === 'multiple') {
      const selected = await overlays.multiSelect({ title: question.question, choices }); if (selected === undefined) return undefined
      answers.push({ id: question.id, selected: selected.map(item => item.label) })
    } else answers.push({ id: question.id, selected: action.id === 'skip' ? [] : [choices[Number(action.id)]!.label] })
  }
  return { answers }
}
async function continuedQuestionFlow(controller: ContinuedQuestionController, overlays: OverlayPrompts): Promise<void> {
  const scope = controller.key()
  while (controller.key() === scope) {
    const rows = controller.rows()
    const choice = await overlays.select({ title: ui('后台待回答问题', 'Continued questions'), detail: ui('关页不会取消问题；入队后等待官方确认', 'Closing this page does not cancel a question; queued replies await native confirmation'),
      choices: [...rows.map(row => ({ id: `question:${row.id}`, label: row.title, description: `${row.status}${row.evidence === undefined ? '' : ` · ${row.evidence}`}` })), { id: 'refresh', label: ui('重新读取官方状态', 'Reread native state') }],
      refreshChoices: async () => ({ choices: [...controller.rows().map(row => ({ id: `question:${row.id}`, label: row.title, description: row.status })), { id: 'refresh', label: ui('重新读取官方状态', 'Reread native state') }] }),
    })
    if (choice === undefined || controller.key() !== scope) return
    if (choice.id === 'refresh') continue
    const row = controller.rows().find(row => `question:${row.id}` === choice.id); if (row === undefined) continue
    const reason = controller.answerReason(row)
    const action = await overlays.select({ title: row.title, detail: `${row.status}\n${row.evidence ?? ''}`, choices: [
      { id: 'record', label: ui('查看官方记录', 'View native record') }, { id: 'answer', label: ui('回答后台问题', 'Answer continued question'), ...(reason === undefined ? {} : { disabledReason: reason }) },
    ] })
    if (action === undefined || controller.key() !== scope) continue
    if (action.id === 'record') { await overlays.detail({ title: row.title, content: row.detail }); continue }
    if (reason !== undefined || row.questions === undefined) continue
    const answer = await questionBatch(row.questions, overlays)
    if (answer === undefined || controller.key() !== scope) return
    if (!await overlays.confirm(ui('发送回答', 'Submit answer'), JSON.stringify(answer, null, 2)) || controller.key() !== scope) continue
    const outcome = await domainProgress(overlays, ui('提交回答', 'Submit answer'), signal => controller.answer(row, answer, signal))
    if (outcome !== undefined) await overlays.detail({ title: row.title, content: outcome === 'settled' ? ui('官方投影已确认回答', 'Native projection confirms the answer') : ui('回复已入队，等待官方确认；不会自动重试', 'Reply queued, awaiting native confirmation; no automatic retry') })
  }
}
export async function continuedQuestionCommand(controller: ContinuedQuestionController, overlays: OverlayPrompts): Promise<void> {
  await domainCommand(overlays, ui('后台待回答问题', 'Continued questions'), () => continuedQuestionFlow(controller, overlays))
}
