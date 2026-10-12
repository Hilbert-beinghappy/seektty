/** Human management of Host-owned schedules, tested contract dsh-schedule 0.2.0-rc.2. */
import { z } from 'zod'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { OverlayPrompts } from './overlays.ts'
import { OptionalViewLifetime, endpointReason, domainCommand, domainProgress, type OptionalViewSource } from './optional-view-lifetime.ts'
const id = z.string().min(1)
const base = { id, title: z.string(), prompt: z.string(), scheduledAt: z.string() }
export const scheduleRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('after'), afterSeconds: z.number() }),
  z.object({ ...base, kind: z.literal('at') }),
  z.object({ ...base, kind: z.literal('every'), everySeconds: z.number() }),
  z.object({ ...base, kind: z.literal('daily'), time: z.string(), timeZone: z.string() }),
  z.object({ ...base, kind: z.literal('weekly'), time: z.string(), timeZone: z.string(), weekdays: z.array(z.number()) }),
  z.object({ ...base, kind: z.literal('cron'), expression: z.string(), timeZone: z.string() }),
])
const receipt = z.object({ scheduledAt: z.string(), deliveredAt: z.string(), messageId: id })
const catalogEntry = scheduleRecordSchema.and(z.object({ sessionId: id, status: z.enum(['active', 'inactive']), lastDelivery: receipt.optional() }))
export type ScheduleRecord = z.infer<typeof scheduleRecordSchema>
export type ScheduleCatalogEntry = z.infer<typeof catalogEntry>
const localAt = z.object({ date: z.string(), time: z.string(), time_zone: z.string() }).strict()
const daily = z.object({ time: z.string(), time_zone: z.string() }).strict()
export const scheduleEditSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(), prompt: z.string().trim().min(1).optional(),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('at'), at: z.union([z.string(), localAt]) }).strict(),
    z.object({ kind: z.literal('every'), every_seconds: z.number().int().min(60) }).strict(),
    z.object({ kind: z.literal('daily'), daily }).strict(),
    z.object({ kind: z.literal('weekly'), weekly: daily.extend({ weekdays: z.array(z.number().int().min(1).max(7)).min(1) }).strict() }).strict(),
    z.object({ kind: z.literal('cron'), cron: z.object({ expression: z.string(), time_zone: z.string() }).strict() }).strict(),
  ]).optional(),
}).strict().refine(value => value.title !== undefined || value.prompt !== undefined || value.change !== undefined, 'No edit supplied')
export type ScheduleEdit = z.infer<typeof scheduleEditSchema>
const historyPage = z.object({ id, records: z.array(receipt.extend({ prompt: z.string().optional() })), earlierRecordsUnavailable: z.boolean(), earlierRecordsPruned: z.boolean(), retention: z.object({ days: z.number(), records: z.number() }), nextBefore: id.optional() })
export type ScheduleHistoryPage = z.infer<typeof historyPage>
/** Existing published Remote parameter shapes. String brands are validated by the Host descriptor. */
export interface ScheduleRemote {
  catalog(): Promise<RemoteResult<unknown>>
  list(request: { sessionId: string }): Promise<RemoteResult<unknown>>
  history(request: { sessionId: string; id: string; limit: number; before?: string }): Promise<RemoteResult<unknown>>
  update(request: { sessionId: string; id: string; expected: ScheduleRecord } & ScheduleEdit, signal?: AbortSignal): Promise<RemoteResult<unknown>>
  delete(request: { sessionId: string; id: string }, signal?: AbortSignal): Promise<RemoteResult<unknown>>
}
function value(result: RemoteResult<unknown>): unknown {
  if (result.ok !== true) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
const miss = z.object({ id, code: z.enum(['schedule_not_found', 'schedule_ended', 'schedule_conflict', 'delivery_cursor_not_found']), updated: z.literal(false).optional() })
const toolError = z.object({ code: z.enum(['invalid_prompt', 'invalid_selector', 'invalid_rule', 'invalid_time_zone', 'not_future', 'time_out_of_range', 'frequency_too_high', 'internal_error']), message: z.string() })
function failure(data: unknown): void {
  const error = toolError.safeParse(data); if (error.success) throw new Error(`${error.data.code}: ${error.data.message}`)
  const absent = miss.safeParse(data); if (absent.success) throw new Error(`${absent.data.code}; refresh before retrying`)
}
export class ScheduleController {
  private readonly lifetime: OptionalViewLifetime
  private snapshotKey: string | undefined
  private entries: readonly ScheduleCatalogEntry[] = []
  constructor(private readonly source: OptionalViewSource, private readonly remote: ScheduleRemote, private readonly methods: () => ReadonlySet<string> | undefined, timeoutMs?: number) { this.lifetime = new OptionalViewLifetime(source, timeoutMs) }
  key(): string { return this.lifetime.key() }
  reason(method: string): string | undefined { return endpointReason(this.source, this.methods(), `schedule/${method}`) }
  private require(method: string): void { const reason = this.reason(method); if (reason !== undefined) throw new Error(reason) }
  private current(entry: ScheduleCatalogEntry): void {
    if (this.snapshotKey !== this.key() || !this.entries.some(row => JSON.stringify(row) === JSON.stringify(entry))) throw new Error('Schedule selection is stale; refresh required')
  }
  async catalog(signal: AbortSignal): Promise<readonly ScheduleCatalogEntry[]> {
    this.require('catalog'); const key = this.key()
    const entries = z.array(catalogEntry).parse(value(await this.lifetime.run(signal, () => this.remote.catalog())))
    if (new Set(entries.map(row => row.id)).size !== entries.length) throw new Error('Duplicate Schedule identity in Host catalog')
    this.snapshotKey = key; this.entries = entries
    return structuredClone(entries)
  }
  async list(signal: AbortSignal): Promise<readonly ScheduleRecord[]> {
    this.require('list'); const sessionId = this.lifetime.scope().sessionId
    return z.array(scheduleRecordSchema).parse(value(await this.lifetime.run(signal, () => this.remote.list({ sessionId }))))
  }
  async history(entry: ScheduleCatalogEntry, signal: AbortSignal, before?: string, limit = 20): Promise<ScheduleHistoryPage> {
    this.require('history'); this.current(entry)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('History limit must be 1–100')
    const data = value(await this.lifetime.run(signal, () => this.remote.history({ sessionId: entry.sessionId, id: entry.id, limit, ...(before === undefined ? {} : { before }) })))
    failure(data); const page = historyPage.parse(data)
    if (page.id !== entry.id || page.nextBefore !== undefined && (page.nextBefore === before || page.records.at(-1)?.messageId !== page.nextBefore)) throw new Error('Host history identity/cursor is invalid; refresh required')
    return page
  }
  async update(entry: ScheduleCatalogEntry, edit: ScheduleEdit, signal: AbortSignal): Promise<ScheduleRecord> {
    this.require('update'); this.current(entry)
    if (entry.status !== 'active') throw new Error('Schedule has ended; native update is unavailable')
    const fields = scheduleEditSchema.parse(edit)
    const expected = scheduleRecordSchema.parse(entry)
    this.snapshotKey = undefined // Any dispatched write, including an unknown outcome, requires a fresh catalog.
    const data = value(await this.lifetime.run(signal, current => { this.require('update'); return this.remote.update({ sessionId: entry.sessionId, id: entry.id, expected, ...fields }, current) }, true))
    failure(data)
    const result = z.object({ id, updated: z.boolean(), record: scheduleRecordSchema }).parse(data)
    if (result.id !== entry.id || result.record.id !== entry.id) throw new Error('Unconfirmed Schedule update identity; refresh required')
    // updated=false with record is an authoritative no-op, not a conflict or assumed mutation.
    return result.record
  }
  async delete(entry: ScheduleCatalogEntry, signal: AbortSignal): Promise<void> {
    this.require('delete'); this.current(entry)
    this.snapshotKey = undefined
    const data = value(await this.lifetime.run(signal, current => { this.require('delete'); return this.remote.delete({ sessionId: entry.sessionId, id: entry.id }, current) }, true))
    failure(data)
    const result = z.object({ id, deleted: z.literal(true) }).parse(data)
    if (result.id !== entry.id) throw new Error('Unconfirmed Schedule delete identity; refresh required')
  }
}
/** Collect human edits; occurrence calculation and IANA/rule validation remain with the Host. */
async function scheduleEditInput(entry: ScheduleCatalogEntry, overlays: OverlayPrompts): Promise<ScheduleEdit | undefined> {
  const field = await overlays.select({ title: 'Edit schedule', choices: [
    { id: 'title', label: 'Name' }, { id: 'prompt', label: 'Reminder instruction' }, { id: 'timing', label: 'Timing' },
  ] })
  if (field === undefined) return undefined
  if (field.id === 'title') { const title = await overlays.input({ title: 'Schedule name', initialValue: entry.title }); return title === undefined ? undefined : scheduleEditSchema.parse({ title }) }
  if (field.id === 'prompt') { const prompt = await overlays.multilineInput({ title: 'Reminder instruction', initialValue: entry.prompt }); return prompt === undefined ? undefined : scheduleEditSchema.parse({ prompt }) }
  const kind = await overlays.select({ title: 'Timing rule', choices: [
    { id: 'at', label: 'One time at an instant' }, { id: 'every', label: 'Every interval' },
    { id: 'daily', label: 'Daily local time' }, { id: 'weekly', label: 'Weekly local time' }, { id: 'cron', label: 'Cron expression' },
  ] })
  if (kind === undefined) return undefined
  if (kind.id === 'at') { const at = await overlays.input({ title: 'Future instant', detail: 'RFC 3339 with explicit offset, for example 2030-01-01T08:00:00+08:00', initialValue: entry.scheduledAt }); return at === undefined ? undefined : scheduleEditSchema.parse({ change: { kind: 'at', at } }) }
  if (kind.id === 'every') { const raw = await overlays.input({ title: 'Interval in seconds', detail: 'Minimum 60 seconds', initialValue: String(entry.kind === 'every' ? entry.everySeconds : 60) }); return raw === undefined ? undefined : scheduleEditSchema.parse({ change: { kind: 'every', every_seconds: Number(raw) } }) }
  const time = kind.id === 'cron' ? undefined : await overlays.input({ title: 'Local time', detail: 'HH:mm:ss', ...('time' in entry ? { initialValue: entry.time } : {}) })
  if (time === undefined && kind.id !== 'cron') return undefined
  const zone = await overlays.input({ title: 'Time zone', detail: 'Explicit IANA zone, for example Asia/Shanghai or UTC', ...('timeZone' in entry ? { initialValue: entry.timeZone } : {}) })
  if (zone === undefined) return undefined
  if (kind.id === 'daily') return scheduleEditSchema.parse({ change: { kind: 'daily', daily: { time, time_zone: zone } } })
  if (kind.id === 'weekly') {
    const weekdays = await overlays.input({ title: 'Weekdays', detail: 'Comma-separated ISO weekdays: Monday 1 through Sunday 7', ...(entry.kind === 'weekly' ? { initialValue: entry.weekdays.join(',') } : {}) })
    return weekdays === undefined ? undefined : scheduleEditSchema.parse({ change: { kind: 'weekly', weekly: { time, time_zone: zone, weekdays: weekdays.split(',').map(day => Number(day.trim())) } } })
  }
  const expression = await overlays.input({ title: 'Cron expression', detail: 'Five fields: minute hour day-of-month month day-of-week', ...(entry.kind === 'cron' ? { initialValue: entry.expression } : {}) })
  return expression === undefined ? undefined : scheduleEditSchema.parse({ change: { kind: 'cron', cron: { expression, time_zone: zone } } })
}
async function scheduleCommandFlow(controller: ScheduleController, overlays: OverlayPrompts): Promise<void> {
  const scope = controller.key()
  let entries: readonly ScheduleCatalogEntry[] | undefined
  while (controller.key() === scope) {
    entries ??= await domainProgress(overlays, 'Host schedules', signal => controller.catalog(signal))
    if (entries === undefined) return
    const choice = await overlays.select({ title: 'Host schedules', detail: 'Original Session bindings and Host time zones. No published pause/resume operation.', choices: [
      ...entries.map((entry, index) => ({ id: String(index), label: entry.title, description: `${entry.status} · ${entry.kind} · ${entry.scheduledAt} · ${entry.sessionId}` })),
      { id: 'list', label: 'Active schedules for current Session', ...(controller.reason('list') === undefined ? {} : { disabledReason: controller.reason('list')! }) },
      { id: 'refresh', label: 'Refresh catalog' },
    ] })
    if (choice === undefined || controller.key() !== scope) return
    if (choice.id === 'refresh') { entries = undefined; continue }
    if (choice.id === 'list') { const rows = await domainProgress(overlays, choice.label, signal => controller.list(signal)); if (rows !== undefined) await overlays.detail({ title: choice.label, content: JSON.stringify(rows, null, 2) }); continue }
    const entry = entries[Number(choice.id)]; if (entry === undefined) continue
    const action = await overlays.select({ title: entry.title, detail: JSON.stringify(entry, null, 2), choices: ['history', 'update', 'delete'].map(method => ({ id: method, label: method === 'update' ? 'Edit title / instruction / timing' : method, ...(controller.reason(method) !== undefined ? { disabledReason: controller.reason(method)! } : method === 'update' && entry.status !== 'active' ? { disabledReason: 'Schedule has ended' } : {}) })) })
    if (action === undefined || controller.key() !== scope) continue
    if (action.id === 'history') {
      let before: string | undefined; const seen = new Set<string>()
      while (controller.key() === scope) {
        const page = await domainProgress(overlays, 'Saved deliveries', signal => controller.history(entry, signal, before))
        if (page === undefined) break
        await overlays.detail({ title: entry.title, content: JSON.stringify(page, null, 2), footer: 'Missing legacy/pruned prompts are unavailable; they are never reconstructed.' })
        if (page.nextBefore === undefined) break
        const next = await overlays.select({ title: 'Delivery history', choices: [{ id: 'next', label: 'Older saved deliveries' }] })
        if (next === undefined || controller.key() !== scope) break
        if (seen.has(page.nextBefore)) { await overlays.detail({ title: 'Delivery history', content: 'Repeated cursor; refresh required' }); break }
        before = page.nextBefore; seen.add(before)
      }
    } else if (action.id === 'update') {
      let edit: ScheduleEdit | undefined
      try { edit = await scheduleEditInput(entry, overlays) } catch (error) { await overlays.detail({ title: 'Invalid edit', content: String(error) }); continue }
      if (edit === undefined || controller.key() !== scope) continue
      const reviewedEdit = edit
      if (!await overlays.confirm('Update Host schedule', `${JSON.stringify(edit, null, 2)}\nOriginal Session: ${entry.sessionId}\nCompare against observed record; conflicts require refresh.`) || controller.key() !== scope) continue
      await domainProgress(overlays, 'Update Host schedule', signal => controller.update(entry, reviewedEdit, signal)); entries = undefined
    } else if (action.id === 'delete') {
      if (!await overlays.confirm('Delete Host schedule', `Delete ${entry.title} from ${entry.sessionId}. Saved delivery history is removed; queued messages remain.`) || controller.key() !== scope) continue
      await domainProgress(overlays, 'Delete Host schedule', signal => controller.delete(entry, signal)); entries = undefined
    }
  }
}

export async function scheduleCommand(controller: ScheduleController, overlays: OverlayPrompts): Promise<void> {
  await domainCommand(overlays, 'Host schedules', () => scheduleCommandFlow(controller, overlays))
}
