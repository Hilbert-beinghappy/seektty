import { describe, expect, it, vi } from 'vitest'
import { TeamBoardController, teamMailbox, teamBoardCommand, type TeamBoardPort } from '../src/client/team-view.ts'
import { scopedSource, freshSignal, deferred, scriptedOverlays, syntheticTeamBoard, syntheticLeadJournal } from './fixtures/optional-native-views.ts'
function fixture() {
  const scope = scopedSource(); let missing: string | undefined
  const read = vi.fn<TeamBoardPort['read']>(async () => syntheticTeamBoard)
  const journal = vi.fn<TeamBoardPort['readLeadJournal']>(async () => syntheticLeadJournal)
  const controller = new TeamBoardController(scope.source, { reason: () => missing, read, readLeadJournal: journal })
  return { ...scope, controller, read, journal, unavailable: (reason: string) => { missing = reason } }
}
describe('experimental Team read-only board', () => {
  it('uses exact membership Team identity rather than selected Session ancestry', async () => {
    const f = fixture(); const board = await f.controller.read(freshSignal())
    expect(f.journal).toHaveBeenCalledWith('synthetic-lead', expect.any(AbortSignal))
    expect(board.members[1]).toMatchObject({ name: '研究 😀', status: 'running', context: 'fork' })
    expect(board.tasks[0]).toMatchObject({ revision: 2, ready: false, writeScopeWarnings: ['overlap with task-0'] })
    expect(f.listeners.size).toBe(0)
  })
  it.each(['Experimental plugin disabled', 'Exact live Agent missing', 'TEAM_UNAUTHORIZED'])('missing/disabled/permission gates precede reads: %s', async reason => {
    const f = fixture(); f.unavailable(reason); await expect(f.controller.read(freshSignal())).rejects.toThrow(reason)
    expect(f.read).not.toHaveBeenCalled(); expect(f.journal).not.toHaveBeenCalled()
  })
  it('does not convert invalid membership/status/task revisions to success', async () => {
    const f = fixture(); f.read.mockResolvedValueOnce({ ...syntheticTeamBoard, membership: { ...syntheticTeamBoard.membership, rootSessionId: 'foreign' } })
    await expect(f.controller.read(freshSignal())).rejects.toThrow('root identity')
    f.read.mockResolvedValueOnce({ ...syntheticTeamBoard, members: [{ ...syntheticTeamBoard.members[0], status: 'completed' }] })
    await expect(f.controller.read(freshSignal())).rejects.toThrow(); expect(f.journal).not.toHaveBeenCalled()
  })
  it('read-only mailbox distinguishes committed delivery from queued evidence and partial absence', () => {
    expect(teamMailbox(syntheticLeadJournal).rows.map(row => row.status)).toEqual(['delivered', 'queued'])
    expect(teamMailbox({ ...syntheticLeadJournal, complete: false }).rows.map(row => row.status)).toEqual(['delivered', 'delivery-unobserved'])
    const partial = teamMailbox({ ...syntheticLeadJournal, complete: false, events: [syntheticLeadJournal.events[1]!] })
    expect(partial.rows[0]?.status).toBe('unconfirmed'); expect(partial.complete).toBe(false); expect(partial.diagnostics).toHaveLength(1)
  })
  it('wrong target, foreign Team, malformed version and conflicting seqs never prove delivery', () => {
    const queue = syntheticLeadJournal.events[0]!
    const bad = teamMailbox({ ...syntheticLeadJournal, events: [queue,
      { seq: 2, type: 'team/message/delivered', data: { version: 2, teamId: 'synthetic-lead', messageId: 'message-1', targetId: 'foreign' } },
      { seq: 2, type: 'team/message/delivered', data: { version: 2, teamId: 'synthetic-lead', messageId: 'message-1', targetId: 'synthetic-member' } },
      { seq: 3, type: 'team/message/queued', data: { version: 1 } },
      { ...queue, seq: 4, data: { version: 2, teamId: 'foreign', message: { id: 'foreign', senderId: 'x', senderName: 'x', targetId: 'y', content: [] } } },
    ] })
    expect(bad.rows[0]?.status).toBe('unconfirmed'); expect(bad.complete).toBe(false); expect(bad.diagnostics).toHaveLength(4)
  })
  it.each([false, true])('same-sequence delivery conflict is unconfirmed in either replay order (%s)', reversed => {
    const correct = syntheticLeadJournal.events[1]!
    const wrong = { ...correct, data: { version: 2, teamId: 'synthetic-lead', messageId: 'message-1', targetId: 'foreign' } }
    const view = teamMailbox({ ...syntheticLeadJournal, events: [syntheticLeadJournal.events[0]!, ...(reversed ? [wrong, correct] : [correct, wrong])] })
    expect(view.rows[0]?.status).toBe('unconfirmed'); expect(view.complete).toBe(false)
    expect(view.diagnostics).toContain('Conflicting mailbox sequence 2')
  })
  it('conflicting queue sequences revoke delivery evidence for both implicated identities', () => {
    const original = syntheticLeadJournal.events[0]!
    const other = { ...original, data: { version: 2, teamId: 'synthetic-lead', message: { id: 'message-2', senderId: 'a', senderName: 'a', targetId: 'b', content: [] } } }
    const view = teamMailbox({ ...syntheticLeadJournal, events: [original, other, syntheticLeadJournal.events[1]!] })
    expect(view.rows[0]?.status).toBe('unconfirmed')
  })
  it('conflicting repeated message identity cannot retain delivered success', () => {
    const view = teamMailbox({ ...syntheticLeadJournal, events: [...syntheticLeadJournal.events, { ...syntheticLeadJournal.events[0]!, seq: 4 }] })
    expect(view.rows[0]?.status).toBe('unconfirmed'); expect(view.complete).toBe(false)
  })
  it('repeated identical replay events do not duplicate messages', () => {
    const original = JSON.stringify(syntheticLeadJournal)
    expect(teamMailbox({ ...syntheticLeadJournal, events: [...syntheticLeadJournal.events, ...syntheticLeadJournal.events] })).toEqual(teamMailbox(syntheticLeadJournal))
    expect(JSON.stringify(syntheticLeadJournal)).toBe(original)
  })
  it('refuses a journal for another Team', async () => {
    const f = fixture(); f.journal.mockResolvedValueOnce({ ...syntheticLeadJournal, teamId: 'foreign' })
    await expect(f.controller.read(freshSignal())).rejects.toThrow('different Team')
  })
  it('cancels journal observation on generation switch, without any delivery action', async () => {
    const f = fixture(); const pending = deferred<Awaited<ReturnType<TeamBoardPort['readLeadJournal']>>>(); f.journal.mockReturnValueOnce(pending.promise)
    const work = f.controller.read(freshSignal()); await Promise.resolve(); f.set({ generation: 2 })
    await expect(work).rejects.toThrow(); expect(f.listeners.size).toBe(0); expect(f.journal.mock.calls[0]?.[1].aborted).toBe(true)
    pending.resolve(syntheticLeadJournal)
  })
  it('terminal roster/task/mailbox and refresh actions are reachable and carry diagnostics', async () => {
    const f = fixture(); const view = scriptedOverlays(['roster', '1', 'tasks', '0', 'mailbox', 'refresh', undefined])
    await teamBoardCommand(f.controller, view.overlays)
    expect(view.details[0]?.content).toContain('研究 😀'); expect(view.details[1]?.content).toContain('writeScopeWarnings'); expect(view.details[2]?.content).toContain('queued')
    expect(f.read).toHaveBeenCalledTimes(2)
    expect(view.selects.flatMap(page => page.choices).some(choice => /send|spawn|claim|delete/.test(choice.id))).toBe(false)
  })
})
