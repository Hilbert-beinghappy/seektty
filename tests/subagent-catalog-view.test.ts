import { describe, expect, it, vi } from 'vitest'
import { SubagentCatalogController, subagentCatalogCommand, type SubagentDescendantPort } from '../src/client/subagent-catalog-view.ts'
import { scopedSource, freshSignal, deferred, scriptedOverlays, tick } from './fixtures/optional-native-views.ts'
const catalog = [
  { id: 'synthetic-a', parentId: 'synthetic-root', depth: 1, kind: 'child', mode: 'continuable', label: '研究 😀', activity: 'inactive', hasChildren: true },
  { id: 'synthetic-b', parentId: 'synthetic-a', depth: 2, kind: 'child', mode: 'one-shot', activity: 'running', hasChildren: false },
  { id: 'synthetic-unknown', parentId: 'synthetic-root', depth: 1, kind: 'diagnostic', reason: 'unsupported' },
  { id: 'synthetic-c', parentId: 'synthetic-unknown', depth: 2, kind: 'child', mode: 'one-shot', label: '嵌套', activity: 'inactive', hasChildren: false },
]
function fixture() {
  const scope = scopedSource(); let missing: string | undefined
  const listDescendants = vi.fn<SubagentDescendantPort['listDescendants']>(async () => catalog); const open = vi.fn<SubagentDescendantPort['open']>(() => true)
  const controller = new SubagentCatalogController(scope.source, { reason: () => missing, listDescendants, open })
  return { ...scope, controller, listDescendants, open, unavailable: (reason: string) => { missing = reason } }
}
describe('Host descendant discovery with existing child navigation', () => {
  it('preserves Host parent edges, CJK labels, one-shot missing labels, and traversal through diagnostics', async () => {
    const f = fixture(); const rows = await f.controller.read(freshSignal())
    expect(rows.map(row => row.label)).toEqual(['研究 😀', 'synthetic-b', 'synthetic-unknown · unsupported', '嵌套'])
    f.controller.open(rows[1]!); expect(f.open).toHaveBeenCalledWith({ parentSessionId: 'synthetic-a', childSessionId: 'synthetic-b', mode: 'one-shot' })
    f.controller.open(rows[3]!); expect(f.open).toHaveBeenLastCalledWith({ parentSessionId: 'synthetic-unknown', childSessionId: 'synthetic-c', mode: 'one-shot' })
    expect(rows[0]?.detail).toContain('inactive'); expect(rows[0]?.detail).not.toContain('completed')
    expect(f.listeners.size).toBe(0)
  })
  it('unknown kind/mode, orphan/depth/cycle and diagnostic entries cannot navigate', async () => {
    const f = fixture(); f.listDescendants.mockResolvedValueOnce([
      { ...catalog[0], kind: 'future' }, { ...catalog[0], mode: 'unknown' },
      { ...catalog[0], parentId: 'orphan' }, { ...catalog[0], depth: 4 }, { ...catalog[0], id: 'synthetic-root' }, catalog[2],
    ])
    const rows = await f.controller.read(freshSignal()); expect(rows.every(row => row.disabledReason !== undefined)).toBe(true)
    for (const row of rows) expect(() => f.controller.open(row)).toThrow()
    expect(f.open).not.toHaveBeenCalled()
  })
  it('repeated identities block original and conflicting edges rather than guessing a parent', async () => {
    const f = fixture(); f.listDescendants.mockResolvedValueOnce([catalog[0], { ...catalog[0], label: 'conflict' }])
    const rows = await f.controller.read(freshSignal())
    expect(rows.every(row => row.address === undefined)).toBe(true)
    for (const row of rows) expect(() => f.controller.open(row)).toThrow()
    expect(f.open).not.toHaveBeenCalled()
  })
  it('repeated ancestors revoke earlier/later descendants and a third duplicate cannot rehabilitate them', async () => {
    const f = fixture(); f.listDescendants.mockResolvedValueOnce([catalog[0], catalog[1], catalog[0], catalog[0], catalog[1]])
    const rows = await f.controller.read(freshSignal())
    expect(rows.every(row => row.address === undefined)).toBe(true)
    for (const row of rows) expect(() => f.controller.open(row)).toThrow()
    expect(f.open).not.toHaveBeenCalled()
  })
  it('missing capability and root failure never synthesize an empty successful catalog', async () => {
    const f = fixture(); f.unavailable('Host service not mounted'); await expect(f.controller.read(freshSignal())).rejects.toThrow('not mounted'); expect(f.listDescendants).not.toHaveBeenCalled()
    const g = fixture(); g.listDescendants.mockRejectedValueOnce(new Error('Root catalog corrupt')); await expect(g.controller.read(freshSignal())).rejects.toThrow('corrupt')
  })
  it('disconnected/changed scope invalidates cached selection and aborts pending listing', async () => {
    const f = fixture(); const rows = await f.controller.read(freshSignal()); const pending = deferred<unknown>(); f.listDescendants.mockReturnValueOnce(pending.promise)
    const work = f.controller.read(freshSignal()); f.set({ ready: false }); await expect(work).rejects.toThrow()
    expect(f.listDescendants.mock.calls[1]?.[1].aborted).toBe(true); expect(() => f.controller.open(rows[0]!)).toThrow()
    pending.resolve(catalog); await tick(); expect(f.listeners.size).toBe(0); expect(f.open).not.toHaveBeenCalled()
  })
  it('cancelled listing releases observer and does not retry', async () => {
    const f = fixture(); f.listDescendants.mockReturnValueOnce(new Promise(() => {})); const abort = new AbortController()
    const work = f.controller.read(abort.signal); abort.abort(); await expect(work).rejects.toThrow(); expect(f.listeners.size).toBe(0); expect(f.listDescendants).toHaveBeenCalledTimes(1)
  })
  it('withdrawing capability or existing child-view refusal cannot report open success', async () => {
    const f = fixture(); const rows = await f.controller.read(freshSignal()); f.unavailable('Plugin disabled'); expect(() => f.controller.open(rows[0]!)).toThrow('disabled'); expect(f.open).not.toHaveBeenCalled()
    const g = fixture(); const rows2 = await g.controller.read(freshSignal()); g.open.mockReturnValueOnce(false); expect(() => g.controller.open(rows2[0]!)).toThrow('refused')
  })
  it('terminal entry calls the existing parent/child address path, and refresh rereads Host', async () => {
    const f = fixture(); const view = scriptedOverlays(['refresh', '1']); await subagentCatalogCommand(f.controller, view.overlays)
    expect(f.listDescendants).toHaveBeenCalledTimes(2); expect(view.details[0]?.content).toContain('one-shot'); expect(f.open).toHaveBeenCalledWith({ parentSessionId: 'synthetic-a', childSessionId: 'synthetic-b', mode: 'one-shot' })
  })
})
