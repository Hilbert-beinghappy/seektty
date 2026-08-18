/** Aggregate produced workspace paths across every visible conversation turn. */

import { sessionLogSnapshot } from './conversation-markdown.ts'
import { producedForClosing } from './compat/deliverables-rc6.ts'

export interface ProducedFileGroup {
  readonly turn: number
  readonly paths: readonly string[]
}

export interface ProducedChatNode {
  readonly visibility: string
  readonly location: {
    readonly kind: string
    readonly turn?: {
      readonly turn: number
      readonly data: { get(key: 'deliverables'): unknown }
    }
  }
  readonly data: unknown
}

function isAssistantMessage(value: unknown): value is { readonly seq: number } {
  return typeof value === 'object' && value !== null
    && 'kind' in value && value.kind === 'assistant'
    && 'seq' in value && typeof value.seq === 'number'
}

/**
 * Walk chat order oldest-first and keep the first occurrence of each path.
 * @param order - chat node keys in display order.
 * @param nodeOf - lookup for one chat node.
 * @returns non-empty turn groups.
 */
export function groupProducedFiles(
  order: readonly string[],
  nodeOf: (key: string) => ProducedChatNode | undefined,
): readonly ProducedFileGroup[] {
  const seen = new Set<string>()
  const groups: ProducedFileGroup[] = []
  for (const key of order) {
    const node = nodeOf(key)
    if (node === undefined || node.visibility !== 'visible') continue
    if (node.location.kind === 'session' || node.location.kind === 'unresolved') continue
    if (node.location.turn === undefined || !isAssistantMessage(node.data)) continue
    const fresh: string[] = []
    for (const path of producedForClosing(
      node.location.turn.data.get('deliverables') as Parameters<typeof producedForClosing>[0],
      node.data.seq,
    )) {
      if (seen.has(path)) continue
      seen.add(path)
      fresh.push(path)
    }
    if (fresh.length === 0) continue
    const existing = groups.find(group => group.turn === node.location.turn?.turn)
    if (existing === undefined) {
      groups.push({ turn: node.location.turn.turn, paths: fresh })
    } else {
      groups[groups.indexOf(existing)] = { turn: existing.turn, paths: [...existing.paths, ...fresh] }
    }
  }
  return groups
}

/**
 * Flatten grouped produced paths in first-seen order.
 * @param groups - turn-grouped unique paths.
 */
export function flattenProducedFiles(groups: readonly ProducedFileGroup[]): readonly string[] {
  return groups.flatMap(group => group.paths)
}

/**
 * Read the Host Session-log produced-file index.
 * Accepts `{ producedFiles: [{ turn, paths }] }` or conversation nodes with deliverables.
 * @param bytes - authoritative Session-log body.
 */
export function producedFilesFromSessionLog(bytes: Uint8Array): readonly ProducedFileGroup[] {
  const snapshot = sessionLogSnapshot(bytes)
  if (typeof snapshot !== 'object' || snapshot === null) return []
  const record = snapshot as Record<string, unknown>
  if (Array.isArray(record.producedFiles)) {
    return record.producedFiles.flatMap((row) => {
      if (typeof row !== 'object' || row === null) return []
      const group = row as Record<string, unknown>
      if (typeof group.turn !== 'number' || !Array.isArray(group.paths)) return []
      const paths = group.paths.filter((path): path is string => typeof path === 'string')
      return paths.length === 0 ? [] : [{ turn: group.turn, paths }]
    })
  }
  return []
}
