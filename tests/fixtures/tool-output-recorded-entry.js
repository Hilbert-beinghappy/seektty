// Runs against E's committed public wiring in an isolated git archive. Kept as a
// fixture because this branch does not contain E's Session/artifact integration.
import { expect, it, vi } from 'vitest'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'

export function registerRecordedSpillEntryTest({ Session, HarnessTuiCapabilities, TuiActions }) {
  it('public /trajectory full record retains >200-line official spill notice and omitted preview middle', async () => {
    const notice = '(Omitted 98765 bytes. Omitted 2 images. Full formatted result stored at: /isolated-fixture/session-owned/spill.txt. Use read with offset/limit, or grep this path to search within it.)'
    const text = [...Array.from({ length: 300 }, (_, i) => `retained-${i + 1} 中文🙂`), '', notice].join('\n')
    const message = createToolResultMessage({ callId: ToolCallId('spill-fixture'), content: [{ type: 'text', text }], isError: false })
    const events = [{ event: { type: 'tool/result', seq: 0, time: 1, data: { turn: 1, step: 1, message } } }]
    const session = new Session('fixture-session', { sessions: { history: async () => ({ result: { ok: true, value: { events, hasMore: false, projections: { asOfSeq: 0, values: {} }, assistantStream: { revision: 0 } } } }) } }, {})
    await session.open()
    const observable = state => {
      const listeners = new Set()
      return { getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) } }
    }
    const effects = []
    const list = observable({ ids: ['fixture-session'], byId: { 'fixture-session': { id: 'fixture-session', displayTitle: 'Fixture', cwd: '/isolated-fixture', updatedAt: 1, running: false } }, phase: 'ready', current: 'fixture-session' })
    const ctx = { remote: { $on() {} }, on() {}, effect: fn => effects.push(fn()),
      connection: { hostDescription: observable({ version: '0.2.0-rc.2' }) },
      sessions: { list, subagentAddress: () => undefined, binding: () => ({ session }), open: vi.fn() },
      workspaces: { list: observable({ items: [], archivedSessionIds: [] }) } }
    const capabilities = new HarnessTuiCapabilities(ctx, {}, 'fixture', '/isolated-fixture', {})
    // Without a Trajectory projection, /trajectory directly opens recorded
    // artifacts. This tests the actual public fallback, not a fabricated menu.
    const ids = ['result:0']
    const selects = []
    const detail = vi.fn()
    const host = { overlays: { select: async request => { selects.push(request); const id = ids.shift(); return request.choices.find(row => row.id === id) }, detail }, copy: vi.fn(), notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn() }
    try {
      await new TuiActions(capabilities, host).execute('trajectory', '')
      expect(selects[0].choices.some(row => row.id === 'result:0')).toBe(true)
      expect(detail).toHaveBeenCalledOnce()
      const record = JSON.parse(detail.mock.calls[0][0].content)
      expect(record.content[0].text).toBe(text)
      expect(record.content[0].text).toContain('retained-101 中文🙂')
      expect(record.content[0].text.endsWith(notice)).toBe(true)
      expect(JSON.stringify(session.recordedEvents())).toBe(JSON.stringify(events))
      expect(host.copy).not.toHaveBeenCalled()
    } finally { for (const dispose of effects) dispose() }
  })
}
