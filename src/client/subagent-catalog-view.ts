/** Optional Host descendant-discovery view; existing ChildSessionView owns navigation/restoration. */
import { z } from 'zod'
import type { SubagentAddress } from '@deepseek-ai/dsh-api-remotes/node-client'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { OverlayPrompts } from './overlays.ts'
import { OptionalViewLifetime, domainCommand, domainProgress, type OptionalViewSource } from './optional-view-lifetime.ts'
const identity = z.string().min(1)
const edge = { id: identity, parentId: identity, depth: z.number().int().positive() }
const row = z.union([
  z.object({ ...edge, kind: z.literal('child'), activity: z.enum(['running', 'inactive']), hasChildren: z.boolean(), mode: z.literal('one-shot'), label: z.string().optional() }),
  z.object({ ...edge, kind: z.literal('child'), activity: z.enum(['running', 'inactive']), hasChildren: z.boolean(), mode: z.literal('continuable'), label: z.string() }),
  z.object({ ...edge, kind: z.literal('diagnostic'), reason: z.enum(['corrupt', 'unsupported', 'unavailable']) }),
])
export interface DescendantViewRow {
  readonly id: string; readonly parentId?: string; readonly depth?: number; readonly label: string
  readonly detail: string; readonly disabledReason?: string; readonly address?: SubagentAddress
}
export interface SubagentDescendantPort {
  reason(): string | undefined
  /** Exact published Host subagents.listDescendants(rootSessionId, signal). Not subagents/list Remote. */
  listDescendants(rootSessionId: string, signal: AbortSignal): Promise<unknown>
  /** Load only the selected row's direct-parent catalog before existing runtime navigation. */
  prepare?(address: SubagentAddress, signal: AbortSignal): Promise<void>
  /** Must call the existing child-view path. It owns draft/viewport restoration and composer eligibility. */
  open(address: SubagentAddress): boolean
}
export class SubagentCatalogController {
  private readonly lifetime: OptionalViewLifetime
  private snapshotKey: string | undefined
  private snapshotRows: readonly DescendantViewRow[] = []
  constructor(source: OptionalViewSource, private readonly port: SubagentDescendantPort, timeoutMs?: number) { this.lifetime = new OptionalViewLifetime(source, timeoutMs) }
  key(): string { return this.lifetime.key() }
  async read(signal: AbortSignal): Promise<readonly DescendantViewRow[]> {
    const reason = this.port.reason(); if (reason !== undefined) throw new Error(reason)
    const key = this.key(); const root = this.lifetime.scope().sessionId
    const values = z.array(z.unknown()).parse(await this.lifetime.run(signal, current => this.port.listDescendants(root, current)))
    const rows: DescendantViewRow[] = []
    // Detect duplicate ancestors before traversal so descendants cannot retain a revoked edge.
    const identities = new Set<string>(); const repeated = new Set<string>()
    for (const value of values) {
      const parsed = row.safeParse(value); if (!parsed.success) continue
      if (identities.has(parsed.data.id)) repeated.add(parsed.data.id)
      identities.add(parsed.data.id)
    }
    // Validate edge structure without inventing ancestry for malformed/unknown rows.
    const parents = new Map<string, number>([[root, 0]])
    for (let index = 0; index < values.length; index++) {
      const parsed = row.safeParse(values[index])
      if (!parsed.success) { rows.push({ id: `diagnostic:${index}`, label: 'Unsupported/malformed catalog row', detail: JSON.stringify(values[index], null, 2), disabledReason: 'Unknown kind, mode, or edge; cannot navigate' }); continue }
      const entry = parsed.data
      const parentDepth = parents.get(entry.parentId)
      if (entry.id === root || entry.depth !== (parentDepth === undefined ? -1 : parentDepth + 1)) {
        rows.push({ id: `diagnostic:${index}`, label: entry.id, detail: JSON.stringify(entry, null, 2), disabledReason: 'Catalog ancestry is unconfirmed' }); continue
      }
      if (repeated.has(entry.id)) {
        rows.push({ id: `diagnostic:${index}`, label: entry.id, detail: JSON.stringify(entry), disabledReason: 'Repeated catalog identity; ancestry is unconfirmed' }); continue
      }
      // Diagnostics may precede descendants of an unknown-mode node. They prove a traversal edge only.
      parents.set(entry.id, entry.depth)
      if (entry.kind === 'diagnostic') rows.push({ id: entry.id, parentId: entry.parentId, depth: entry.depth, label: `${entry.id} · ${entry.reason}`, detail: JSON.stringify(entry, null, 2), disabledReason: `Host branch diagnostic: ${entry.reason}` })
      else rows.push({ id: entry.id, parentId: entry.parentId, depth: entry.depth, label: entry.label || entry.id, detail: JSON.stringify(entry, null, 2), address: { parentSessionId: SessionId(entry.parentId), childSessionId: SessionId(entry.id), mode: entry.mode } })
    }
    this.snapshotKey = key; this.snapshotRows = rows
    return structuredClone(rows)
  }
  async prepare(selected: DescendantViewRow, signal: AbortSignal): Promise<void> {
    this.requireSelection(selected)
    if (this.port.prepare !== undefined && selected.address !== undefined) {
      await this.lifetime.run(signal, current => this.port.prepare!(selected.address!, current))
    }
    this.requireSelection(selected)
  }
  private requireSelection(selected: DescendantViewRow): void {
    if (this.snapshotKey !== this.key() || !this.snapshotRows.some(row => JSON.stringify(row) === JSON.stringify(selected))) throw new Error('Child selection is stale; refresh required')
    const reason = this.port.reason(); if (reason !== undefined) throw new Error(reason)
    if (selected.address === undefined || selected.disabledReason !== undefined) throw new Error(selected.disabledReason ?? 'Child address unavailable')
  }
  open(selected: DescendantViewRow): void {
    this.requireSelection(selected)
    if (selected.address === undefined) throw new Error('Child address unavailable')
    if (!this.port.open(selected.address)) throw new Error('Existing child-view navigation refused this address')
  }
}
async function subagentCatalogCommandFlow(controller: SubagentCatalogController, overlays: OverlayPrompts): Promise<void> {
  const scope = controller.key()
  let rows: readonly DescendantViewRow[] | undefined
  while (controller.key() === scope) {
    rows ??= await domainProgress(overlays, 'Descendant catalogs', signal => controller.read(signal))
    if (rows === undefined) return
    const choice = await overlays.select({ title: 'Descendant catalogs', detail: 'Host catalog traversal only. Inactive is a residency observation, not completion. Team membership is separate.', choices: [
      ...rows.map((entry, index) => ({ id: String(index), label: `${'  '.repeat(Math.min(entry.depth ?? 0, 8))}${entry.label}`, description: entry.address === undefined ? entry.detail : `${entry.address.mode} · parent ${entry.parentId}`, ...(entry.disabledReason === undefined ? {} : { disabledReason: entry.disabledReason }) })),
      { id: 'refresh', label: 'Refresh from Host' },
    ] })
    if (choice === undefined || controller.key() !== scope) return
    if (choice.id === 'refresh') { rows = undefined; continue }
    const entry = rows[Number(choice.id)]; if (entry === undefined) continue
    await overlays.detail({ title: entry.label, content: entry.detail })
    if (controller.key() !== scope) return
    try {
      const prepared = await domainProgress(overlays, 'Check direct-parent address', async signal => { await controller.prepare(entry, signal); return true })
      if (prepared !== true || controller.key() !== scope) return
      controller.open(entry)
    } catch (error) { await overlays.detail({ title: 'Open child', content: String(error) }); continue }
    return
  }
}

export async function subagentCatalogCommand(controller: SubagentCatalogController, overlays: OverlayPrompts): Promise<void> {
  await domainCommand(overlays, 'Descendant catalogs', () => subagentCatalogCommandFlow(controller, overlays))
}
