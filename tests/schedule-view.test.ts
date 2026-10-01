import { describe, expect, it, vi } from 'vitest'
import { ScheduleController, scheduleCommand, scheduleRecordSchema, scheduleEditSchema, type ScheduleRemote } from '../src/client/schedule-view.ts'
import { scopedSource, freshSignal, deferred, scriptedOverlays, syntheticSchedules, tick } from './fixtures/optional-native-views.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
const methods = new Set(['catalog', 'list', 'history', 'update', 'delete'].map(name => `schedule/${name}`))
function fixture() {
  const scope = scopedSource(); let directory: ReadonlySet<string> | undefined = methods
  const remote = {
    catalog: vi.fn<ScheduleRemote['catalog']>(async () => ({ ok: true, value: syntheticSchedules })),
    list: vi.fn<ScheduleRemote['list']>(async () => ({ ok: true, value: [scheduleRecordSchema.parse(syntheticSchedules[0])] })),
    history: vi.fn<ScheduleRemote['history']>(async ({ id }) => ({ ok: true, value: { id, records: [{ scheduledAt: '2030-01-01T00:00:00Z', deliveredAt: '2030-01-01T00:00:02Z', messageId: 'delivery-1' }], earlierRecordsUnavailable: true, earlierRecordsPruned: false, retention: { days: 30, records: 200 } } })),
    update: vi.fn<ScheduleRemote['update']>(async request => ({ ok: true, value: { id: request.id, updated: true, record: { ...request.expected, title: request.title ?? request.expected.title } } })),
    delete: vi.fn<ScheduleRemote['delete']>(async request => ({ ok: true, value: { id: request.id, deleted: true } })),
  }
  const controller = new ScheduleController(scope.source, remote, () => directory)
  return { ...scope, controller, remote, methods: (value: ReadonlySet<string> | undefined) => { directory = value } }
}
async function selection(f: ReturnType<typeof fixture>) { return (await f.controller.catalog(freshSignal()))[0]! }
describe('Host Schedule catalog and CAS management', () => {
  it('catalog retains active/inactive original Session/timeZone and list selects current Session', async () => {
    const f = fixture(); const entries = await f.controller.catalog(freshSignal())
    expect(entries).toEqual(syntheticSchedules); await f.controller.list(freshSignal())
    expect(f.remote.list).toHaveBeenCalledWith({ sessionId: 'synthetic-root' }); expect(f.listeners.size).toBe(0)
  })
  it.each([undefined, new Set<string>()])('unknown/missing capability cannot dispatch %s', async directory => {
    const f = fixture(); f.methods(directory); await expect(f.controller.catalog(freshSignal())).rejects.toThrow(); expect(f.remote.catalog).not.toHaveBeenCalled()
  })
  it('preserves the complete observed record and original binding in content update', async () => {
    const f = fixture(); const entry = await selection(f); await f.controller.update(entry, { title: '新名称' }, freshSignal())
    const request = f.remote.update.mock.calls[0]![0]
    expect(request).toEqual({ sessionId: 'synthetic-other', id: entry.id, expected: scheduleRecordSchema.parse(entry), title: '新名称' })
    expect('timeZone' in request.expected && request.expected.timeZone).toBe('Asia/Shanghai')
    expect(request).not.toHaveProperty('change'); expect(request.expected).not.toHaveProperty('status')
    await expect(f.controller.update(entry, { title: 'retry' }, freshSignal())).rejects.toThrow('stale')
  })
  it('passes native timing shape without computing or replacing Host time zone', async () => {
    const f = fixture(); const entry = await selection(f)
    await f.controller.update(entry, { change: { kind: 'weekly', weekly: { time: '09:30:00', time_zone: 'Europe/London', weekdays: [1, 5] } } }, freshSignal())
    expect(f.remote.update.mock.calls[0]?.[0].change).toEqual({ kind: 'weekly', weekly: { time: '09:30:00', time_zone: 'Europe/London', weekdays: [1, 5] } })
  })
  it.each(['schedule_conflict', 'schedule_not_found', 'schedule_ended'])('native non-mutating outcome %s requires refresh', async code => {
    const f = fixture(); const entry = await selection(f); f.remote.update.mockResolvedValueOnce({ ok: true, value: { id: entry.id, updated: false, code } })
    await expect(f.controller.update(entry, { title: 'new' }, freshSignal())).rejects.toThrow(code)
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('stale')
  })
  it('false updated with current record is a native no-op; absent updated/record is not success', async () => {
    const f = fixture(); let entry = await selection(f); f.remote.update.mockResolvedValueOnce({ ok: true, value: { id: entry.id, updated: false, record: scheduleRecordSchema.parse(entry) } })
    await expect(f.controller.update(entry, { title: entry.title }, freshSignal())).resolves.toEqual(scheduleRecordSchema.parse(entry))
    entry = await selection(f); f.remote.update.mockResolvedValueOnce({ ok: true, value: { id: entry.id } }); await expect(f.controller.update(entry, { title: 'new' }, freshSignal())).rejects.toThrow()
  })
  it('ended records cannot update; title/interval/selector validation does not dispatch', async () => {
    const f = fixture(); const entries = await f.controller.catalog(freshSignal())
    await expect(f.controller.update(entries[1]!, { title: 'new' }, freshSignal())).rejects.toThrow('ended')
    expect(scheduleEditSchema.safeParse({ change: { kind: 'every', every_seconds: 59 } }).success).toBe(false)
    expect(scheduleEditSchema.safeParse({ title: '', pause: true }).success).toBe(false)
    expect(scheduleEditSchema.safeParse({}).success).toBe(false); expect(f.remote.update).not.toHaveBeenCalled()
  })
  it('delete false/not found and mismatched receipts are failures, not success', async () => {
    const f = fixture(); let entry = await selection(f); f.remote.delete.mockResolvedValueOnce({ ok: true, value: { id: entry.id, deleted: false, code: 'schedule_not_found' } })
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('schedule_not_found')
    entry = await selection(f); f.remote.delete.mockResolvedValueOnce({ ok: true, value: { id: 'foreign', deleted: true } })
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('identity')
  })
  it('delete preserves original binding and requires refresh before repeat', async () => {
    const f = fixture(); const entry = await selection(f); await f.controller.delete(entry, freshSignal())
    expect(f.remote.delete.mock.calls[0]?.[0]).toEqual({ sessionId: entry.sessionId, id: entry.id })
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('stale')
  })
  it('history retains unavailable/pruned legacy evidence, original binding, limit and exclusive cursor', async () => {
    const f = fixture(); const entry = await selection(f); const page = await f.controller.history(entry, freshSignal(), 'delivery-0', 25)
    expect(page.records[0]).not.toHaveProperty('prompt'); expect(page.earlierRecordsUnavailable).toBe(true)
    expect(f.remote.history.mock.calls[0]?.[0]).toEqual({ sessionId: entry.sessionId, id: entry.id, limit: 25, before: 'delivery-0' })
    await expect(f.controller.history(entry, freshSignal(), undefined, 101)).rejects.toThrow('1–100')
  })
  it('history miss or repeated/mismatched cursor never implies an empty valid page', async () => {
    const f = fixture(); const entry = await selection(f)
    f.remote.history.mockResolvedValueOnce({ ok: true, value: { id: entry.id, code: 'delivery_cursor_not_found' } })
    await expect(f.controller.history(entry, freshSignal())).rejects.toThrow('delivery_cursor_not_found')
    f.remote.history.mockResolvedValueOnce({ ok: true, value: { id: entry.id, records: [], nextBefore: 'bad', earlierRecordsUnavailable: false, earlierRecordsPruned: true, retention: { days: 1, records: 2 } } })
    await expect(f.controller.history(entry, freshSignal())).rejects.toThrow('cursor')
  })
  it.each([{ ready: false }, { generation: 2 }, { sessionId: 'synthetic-new' }])('scope reset refuses old selections and late catalog results %s', async patch => {
    const f = fixture(); const entry = await selection(f); const pending = deferred<RemoteResult<unknown>>(); f.remote.catalog.mockReturnValueOnce(pending.promise)
    const work = f.controller.catalog(freshSignal()); f.set(patch); await expect(work).rejects.toThrow(); pending.resolve({ ok: true, value: syntheticSchedules }); await tick()
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow(); expect(f.remote.delete).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0)
  })
  it('cancelled dispatched write reports unknown outcome and never reuses its observation', async () => {
    const f = fixture(); const entry = await selection(f); const pending = deferred<RemoteResult<unknown>>(); f.remote.update.mockReturnValueOnce(pending.promise)
    const abort = new AbortController(); const work = f.controller.update(entry, { title: 'new' }, abort.signal); abort.abort()
    await expect(work).rejects.toThrow('may have completed'); expect(f.remote.update.mock.calls[0]?.[1]?.aborted).toBe(true)
    pending.reject(new Error('Late error')); await tick(); await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('stale')
    expect(f.remote.update).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(0)
  })
  it('permission errors propagate and reject repeated write until refresh', async () => {
    const f = fixture(); const entry = await selection(f); f.remote.delete.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Permission denied', {}) })
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('Permission denied')
    await expect(f.controller.delete(entry, freshSignal())).rejects.toThrow('stale')
  })
  it.each([
    ['at', ['2030-02-01T00:00:00Z'], { kind: 'at', at: '2030-02-01T00:00:00Z' }],
    ['every', ['120'], { kind: 'every', every_seconds: 120 }],
    ['daily', ['09:00:00', 'Asia/Shanghai'], { kind: 'daily', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } }],
    ['weekly', ['10:00:00', 'Europe/London', '1,5'], { kind: 'weekly', weekly: { time: '10:00:00', time_zone: 'Europe/London', weekdays: [1, 5] } }],
    ['cron', ['UTC', '0 9 * * 1'], { kind: 'cron', cron: { expression: '0 9 * * 1', time_zone: 'UTC' } }],
  ])('guided terminal timing edit %s sends the published selector', async (kind, inputs, change) => {
    const f = fixture(); const view = scriptedOverlays(['0', 'update', 'timing', String(kind), undefined], inputs as string[], [true])
    await scheduleCommand(f.controller, view.overlays)
    expect(f.remote.update.mock.calls[0]?.[0].change).toEqual(change)
  })
  it('dismissing edit input or declining review does not perform a write', async () => {
    const f = fixture(); const cancel = scriptedOverlays(['0', 'update', 'title', undefined], [undefined])
    await scheduleCommand(f.controller, cancel.overlays)
    const decline = scriptedOverlays(['0', 'update', 'title', undefined], ['synthetic edit'], [false])
    await scheduleCommand(f.controller, decline.overlays)
    expect(f.remote.update).not.toHaveBeenCalled(); expect(f.remote.delete).not.toHaveBeenCalled()
  })
  it('terminal catalog/list/history/update/delete entries are reachable without create/pause or timers', async () => {
    const f = fixture(); const view = scriptedOverlays(['list', '0', 'history', '0', 'update', 'title', '0', 'delete', undefined], ['synthetic edited'], [true, true])
    await scheduleCommand(f.controller, view.overlays)
    expect(f.remote.list).toHaveBeenCalledTimes(1); expect(f.remote.history).toHaveBeenCalledTimes(1); expect(f.remote.update).toHaveBeenCalledTimes(1); expect(f.remote.delete).toHaveBeenCalledTimes(1)
    expect(view.details.some(row => row.content.includes('earlierRecordsUnavailable'))).toBe(true)
    expect(view.selects.flatMap(page => page.choices).some(row => /create|pause|resume/.test(row.id))).toBe(false)
  })
})
