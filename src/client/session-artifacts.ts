/** Read-only event references for the exact published dsh 0.2.0-rc.2 vocabulary. */
export interface ArtifactEvent { readonly seq: number; readonly type: string; readonly data: unknown; readonly view?: unknown }
export interface SessionArtifact {
  readonly id: string
  readonly seq: number
  readonly kind: 'plan' | 'delivery' | 'changes' | 'result' | 'attachment' | 'link' | 'unknown'
  readonly title: string
  readonly detail: string
  readonly turn?: number
  readonly path?: string
  readonly url?: string
  readonly callId?: string
  readonly index?: number
  readonly isError?: boolean
  /** Opaque attachment storage identity. Never interpreted as a file path. */
  readonly attachmentId?: string
}
export function artifactRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined
}
export function artifactJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return '[Unserializable recorded value]' }
}
function argsOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'string') return artifactRecord(value)
  try { return artifactRecord(JSON.parse(value)) } catch { return undefined }
}
function attachments(content: unknown, seq: number, prefix: string): SessionArtifact[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((value, index) => {
    const block = artifactRecord(value)
    if (block === undefined || block.type === 'text' || block.type === 'reasoning') return []
    const ref = artifactRecord(block.attachment)
    const attachmentId = typeof ref?.attachmentId === 'string' ? ref.attachmentId : undefined
    return [{
      id: `${prefix}:${seq}:${index}`, seq, kind: attachmentId === undefined ? 'unknown' as const : 'attachment' as const,
      title: typeof ref?.name === 'string' ? ref.name : `Recorded ${String(block.type ?? 'unknown')} block`,
      detail: artifactJson(block), ...(attachmentId === undefined ? {} : { attachmentId }),
    }]
  })
}

/** A pure view index, not a Session state fold; cold and live input use the same B-owned journal. */
export function sessionArtifacts(events: readonly ArtifactEvent[]): readonly SessionArtifact[] {
  const rows: SessionArtifact[] = []
  const seen = new Set<number>()
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!Number.isSafeInteger(event.seq) || event.seq < 0 || seen.has(event.seq)) continue
    seen.add(event.seq)
    const decorated = artifactRecord(event.view)
    const presenter = decorated?.for === 'result' ? artifactRecord(decorated.view) : undefined
    if (presenter?.card === 'web') {
      const sources = presenter.kind === 'fetch' ? [{ url: presenter.url, title: presenter.title }]
        : presenter.kind === 'search' && Array.isArray(presenter.sources) ? presenter.sources : []
      sources.forEach((value, index) => {
        const source = artifactRecord(value)
        if (typeof source?.url !== 'string') return
        rows.push({ seq: event.seq, id: `link:${event.seq}:${index}`, kind: 'link', url: source.url,
          title: typeof source.title === 'string' ? source.title : source.url, detail: artifactJson(source) })
      })
    }
    const data = artifactRecord(event.data)
    if (data === undefined) continue
    const turn = Number.isSafeInteger(data.turn) ? data.turn as number : undefined
    const base = { seq: event.seq, ...(turn === undefined ? {} : { turn }) }
    if (event.type === 'tool/call' || event.type === 'tool/ptc-dispatch-start') {
      if (data.name !== 'exit_plan_mode') continue
      const args = argsOf(data.arguments)
      const callId = typeof data.callId === 'string' ? data.callId : typeof data.subCallId === 'string' ? data.subCallId : undefined
      rows.push({ ...base, id: `plan:${event.seq}`, kind: typeof args?.plan === 'string' ? 'plan' : 'unknown',
        title: 'Recorded plan review', detail: typeof args?.plan === 'string' ? args.plan : artifactJson(data),
        ...(callId === undefined ? {} : { callId }) })
    } else if (event.type === 'deliverables/presented') {
      if (!Array.isArray(data.files)) {
        rows.push({ ...base, id: `unknown:${event.seq}`, kind: 'unknown', title: 'Invalid delivery record', detail: artifactJson(data) })
        continue
      }
      data.files.forEach((value, index) => {
        const file = artifactRecord(value)
        const path = typeof file?.path === 'string' && file.path !== '' ? file.path : undefined
        rows.push({ ...base, id: `delivery:${event.seq}:${index}`, index, kind: path === undefined ? 'unknown' : 'delivery',
          title: path ?? 'Unknown delivery', detail: artifactJson(file ?? value), ...(path === undefined ? {} : { path }) })
      })
    } else if (event.type === 'workspace/changes') {
      rows.push({ ...base, id: `changes:${event.seq}`, kind: turn === undefined ? 'unknown' : 'changes',
        title: turn === undefined ? 'Invalid Review announcement' : `Review · turn ${turn}`, detail: artifactJson(data) })
    } else if (event.type === 'tool/result' || event.type === 'tool/ptc-dispatch') {
      // The native flat ToolResultMessage owns content/isError. No legacy tool-result block unwrap.
      const result = event.type === 'tool/result' ? artifactRecord(data.message) : data
      const callId = typeof data.subCallId === 'string' ? data.subCallId : artifactRecord(result?.source)?.callId
      const isError = result?.isError
      rows.push({ ...base, id: `result:${event.seq}`, kind: Array.isArray(result?.content) ? 'result' : 'unknown',
        title: `${event.type === 'tool/ptc-dispatch' ? 'PTC' : 'Tool'} result · ${isError === true ? 'error' : isError === false ? 'success' : 'status unknown'}`,
        detail: artifactJson(result ?? data), ...(typeof callId === 'string' ? { callId } : {}), ...(typeof isError === 'boolean' ? { isError } : {}) })
      rows.push(...attachments(result?.content, event.seq, 'result-attachment'))
    } else if (event.type === 'user/message' || event.type === 'assistant/message') {
      const content = event.type === 'user/message' ? data.content : artifactRecord(data.message)?.content
      rows.push(...attachments(content, event.seq, 'message-attachment'))
    } else if (event.type.startsWith('artifact/')) {
      rows.push({ ...base, id: `unknown:${event.seq}`, kind: 'unknown', title: event.type, detail: artifactJson(data) })
    }
  }
  return rows.map(row => {
    if (row.kind !== 'plan' || row.callId === undefined) return row
    const outcome = rows.findLast(candidate => candidate.kind === 'result' && candidate.callId === row.callId && candidate.seq > row.seq)
    return outcome === undefined ? { ...row, title: `${row.title} · no recorded settlement in loaded history` }
      : { ...row, title: `${row.title} · ${outcome.isError === true ? 'error/cancelled' : outcome.isError === false ? 'completed' : 'outcome unknown'}`,
        detail: `${row.detail}\n\n--- Recorded tool outcome (seq ${outcome.seq}) ---\n${outcome.detail}`,
        ...(outcome.isError === undefined ? {} : { isError: outcome.isError }) }
  })
}

/** Host-owned persisted mode/todo values. undefined/null/invalid remain distinguishable. */
export function persistedPlanDetail(projections: Readonly<Record<string, unknown>>): string {
  const plan = artifactRecord(projections.plan)
  const lines = [plan === undefined ? 'Plan projection absent: plan-mode is not composed or its baseline has not arrived.'
    : typeof plan.active !== 'boolean' || typeof plan.pending !== 'boolean' ? `Invalid Plan projection: ${artifactJson(plan)}`
      : `Plan mode: ${plan.active ? 'active' : 'inactive'}${plan.pending ? ' · selection pending' : ''}`]
  const todos = projections.todos
  lines.push(todos === undefined ? 'Todo projection absent: todo plugin is not composed or its baseline has not arrived.'
    : todos === null ? 'No todo snapshot has been written.' : artifactJson(todos))
  return lines.join('\n\n')
}
