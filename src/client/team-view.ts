/** Experimental Agent Team read-only board, exactly dsh-experimental-agent-team 0.2.0-rc.2. */
import { z } from 'zod'
import type { ArtifactEvent } from './session-artifacts.ts'
import { artifactJson } from './session-artifacts.ts'
import type { OverlayPrompts } from './overlays.ts'
import { OptionalViewLifetime, domainCommand, domainProgress, type OptionalViewSource } from './optional-view-lifetime.ts'
const id = z.string().min(1)
const membership = z.object({ id, rootSessionId: id, role: z.enum(['lead', 'teammate']), name: z.string() })
const member = z.object({ id, name: z.string(), role: z.enum(['lead', 'teammate']), status: z.enum(['running', 'inactive', 'provisioning', 'failed']), description: z.string().optional(), provider: z.string().optional(), context: z.enum(['fresh', 'fork']).optional(), model: z.string().optional(), diagnostics: z.array(z.string()) }).passthrough()
const task = z.object({ id, revision: z.number().int().positive(), subject: z.string(), description: z.string(), status: z.enum(['pending', 'in_progress', 'completed', 'deleted']), blockedBy: z.array(id), writeScopes: z.array(z.string()), ownerName: z.string().optional(), ready: z.boolean(), writeScopeWarnings: z.array(z.string()) }).passthrough()
const teamBoard = z.object({ membership, members: z.array(member), tasks: z.array(task) })
export type TeamBoard = z.infer<typeof teamBoard>
export interface TeamLeadJournal { readonly teamId: string; readonly events: readonly ArtifactEvent[]; readonly complete: boolean }
export interface TeamBoardPort {
  /** Requires mounted experimental service and exact live Agent. Absence must name the reason. */
  reason(): string | undefined
  read(signal: AbortSignal): Promise<unknown>
  /** E's B-owned journal reader; complete means from beginning, gap-free, current generation. */
  readLeadJournal(teamId: string, signal: AbortSignal): Promise<TeamLeadJournal>
}
const queued = z.object({ version: z.literal(2), teamId: id, message: z.object({ id, senderId: id, senderName: z.string(), targetId: id, content: z.array(z.unknown()) }) })
const delivered = z.object({ version: z.literal(2), teamId: id, messageId: id, targetId: id })
export interface TeamMailboxRow {
  readonly id: string; readonly targetId: string; readonly senderName?: string; readonly content?: unknown
  readonly status: 'queued' | 'delivered' | 'delivery-unobserved' | 'unconfirmed'; readonly seq: number
}
export interface TeamMailboxView { readonly rows: readonly TeamMailboxRow[]; readonly complete: boolean; readonly diagnostics: readonly string[] }
/** View-only evidence index. This never sends, drains, retries, or reconstructs a mailbox. */
export function teamMailbox(journal: TeamLeadJournal): TeamMailboxView {
  const rows = new Map<string, TeamMailboxRow>()
  const seqs = new Map<number, string>()
  const diagnostics: string[] = []
  const conflictingSeqs = new Set<number>()
  const complete = journal.complete === true
  for (const event of [...journal.events].sort((a, b) => a.seq - b.seq)) {
    if (event.type !== 'team/message/queued' && event.type !== 'team/message/delivered') continue
    if (!Number.isSafeInteger(event.seq) || event.seq < 0) { diagnostics.push('Invalid mailbox event sequence'); continue }
    const encoded = artifactJson(event)
    if (seqs.has(event.seq)) { if (seqs.get(event.seq) !== encoded) { diagnostics.push(`Conflicting mailbox sequence ${event.seq}`); conflictingSeqs.add(event.seq) }; continue }
    seqs.set(event.seq, encoded)
    if (event.type === 'team/message/queued') {
      const result = queued.safeParse(event.data)
      if (!result.success) { diagnostics.push(`Malformed queued event ${event.seq}`); continue }
      const data = result.data
      if (data.teamId !== journal.teamId) { diagnostics.push(`Foreign Team event ${event.seq}`); continue }
      const existing = rows.get(data.message.id)
      if (existing !== undefined) { diagnostics.push(`Duplicate mailbox identity ${data.message.id}`); rows.set(existing.id, { ...existing, status: 'unconfirmed' }); continue }
      rows.set(data.message.id, { ...data.message, seq: event.seq, status: complete ? 'queued' : 'delivery-unobserved' })
    } else {
      const result = delivered.safeParse(event.data)
      if (!result.success) { diagnostics.push(`Malformed delivery event ${event.seq}`); continue }
      const data = result.data
      if (data.teamId !== journal.teamId) { diagnostics.push(`Foreign Team event ${event.seq}`); continue }
      const row = rows.get(data.messageId)
      if (row === undefined || row.targetId !== data.targetId) {
        diagnostics.push(`Delivery ${data.messageId} lacks matching queued evidence`)
        if (row === undefined) rows.set(data.messageId, { id: data.messageId, targetId: data.targetId, status: 'unconfirmed', seq: event.seq })
        else rows.set(row.id, { ...row, status: 'unconfirmed' })
      } else if (row.status !== 'unconfirmed') rows.set(row.id, { ...row, status: 'delivered' })
    }
  }
  // Ambiguous sequences cannot certify either implicated identity, regardless of replay order.
  for (const event of journal.events) {
    if (!conflictingSeqs.has(event.seq)) continue
    const parsed = event.type === 'team/message/queued' ? queued.safeParse(event.data) : delivered.safeParse(event.data)
    if (!parsed.success || parsed.data.teamId !== journal.teamId) continue
    const data = parsed.data; const messageId = 'message' in data ? data.message.id : data.messageId
    const affected = rows.get(messageId)
    if (affected !== undefined) rows.set(messageId, { ...affected, status: 'unconfirmed' })
  }
  // An invalid stream cannot prove that an undelivered queued row is still pending.
  if (diagnostics.length > 0) for (const [key, row] of rows) if (row.status === 'queued') rows.set(key, { ...row, status: 'delivery-unobserved' })
  return { rows: [...rows.values()], complete: complete && diagnostics.length === 0, diagnostics }
}
export class TeamBoardController {
  private readonly lifetime: OptionalViewLifetime
  constructor(source: OptionalViewSource, private readonly port: TeamBoardPort, timeoutMs?: number) { this.lifetime = new OptionalViewLifetime(source, timeoutMs) }
  key(): string { return this.lifetime.key() }
  reason(): string | undefined { try { this.lifetime.scope() } catch (error) { return String(error) }; return this.port.reason() }
  async read(signal: AbortSignal): Promise<TeamBoard & { mailbox: TeamMailboxView }> {
    const reason = this.reason(); if (reason !== undefined) throw new Error(reason)
    return this.lifetime.run(signal, async current => {
      const board = teamBoard.parse(await this.port.read(current))
      if (board.membership.id !== board.membership.rootSessionId) throw new Error('Invalid Team root identity')
      current.throwIfAborted()
      const journal = await this.port.readLeadJournal(board.membership.id, current)
      if (journal.teamId !== board.membership.id) throw new Error('Lead journal belongs to a different Team')
      return { ...board, mailbox: teamMailbox(journal) }
    })
  }
}
async function teamBoardCommandFlow(controller: TeamBoardController, overlays: OverlayPrompts): Promise<void> {
  const scope = controller.key()
  let board: Awaited<ReturnType<TeamBoardController['read']>> | undefined
  while (controller.key() === scope) {
    board ??= await domainProgress(overlays, 'Agent Team · experimental', signal => controller.read(signal))
    if (board === undefined) return
    const choice = await overlays.select({ title: `Team ${board.membership.name} · ${board.membership.role}`, detail: 'Experimental read-only Host board. Team membership is distinct from subagent ancestry.', choices: [
      { id: 'roster', label: `Roster (${board.members.length})` }, { id: 'tasks', label: `Tasks (${board.tasks.length})` },
      { id: 'mailbox', label: `Mailbox evidence (${board.mailbox.rows.length})`, description: board.mailbox.complete ? 'Complete Lead journal' : 'Partial/invalid Lead journal; missing deliveries remain unknown' },
      { id: 'refresh', label: 'Refresh authoritative board' },
    ] })
    if (choice === undefined || controller.key() !== scope) return
    if (choice.id === 'refresh') { board = undefined; continue }
    if (choice.id === 'mailbox') { await overlays.detail({ title: 'Mailbox evidence', content: artifactJson(board.mailbox), footer: 'No send/retry/delivery actions. Payloads are recorded references.' }); continue }
    const rows = choice.id === 'roster' ? board.members : board.tasks
    const selected = await overlays.select({ title: choice.label, choices: rows.map((row, index) => ({ id: String(index), label: 'name' in row ? String(row.name) : String(row.subject), description: `${row.status}${'revision' in row ? ` · revision ${row.revision}` : ''}` })) })
    if (selected === undefined || controller.key() !== scope) continue
    const row = rows[Number(selected.id)]
    if (row !== undefined) await overlays.detail({ title: selected.label, content: artifactJson(row) })
  }
}

export async function teamBoardCommand(controller: TeamBoardController, overlays: OverlayPrompts): Promise<void> {
  await domainCommand(overlays, 'Agent Team', () => teamBoardCommandFlow(controller, overlays))
}
