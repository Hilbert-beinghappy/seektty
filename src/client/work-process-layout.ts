/** Terminal rows over the unchanged published rc.2 Turn and group memberships. */
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/node-client'
import type { NativeProcessSnapshot } from '../../vendor/ui-chat-process/snapshot-adapter.js'
import { workProcessGroupPresentation, workProcessNodeHidden, workProcessTurnPresentation,
  type WorkProcessPolicy, type WorkProcessTurnDisclosure } from './work-process-display.ts'

export interface WorkProcessControl { readonly id: string; readonly label: string; readonly open: boolean; readonly kind: 'turn' | 'group' }
export type WorkProcessEntry = { readonly node: ChatConversationViewNode } | { readonly control: WorkProcessControl }
export interface WorkProcessLayout { readonly entries: readonly WorkProcessEntry[]; readonly controls: readonly WorkProcessControl[] }
const processKinds = new Set(['assistant-step', 'tool-call', 'manual-compaction', 'context', 'request-prompt'])
function failed(node: ChatConversationViewNode): boolean {
  const data = node.data
  if (typeof data !== 'object' || data === null) return false
  if (Reflect.get(data, 'status') === 'interrupted') return true
  const root = Reflect.get(data, 'root')
  return root !== null && typeof root === 'object' && Reflect.get(root, 'isError') === true
}
function part(node: ChatConversationViewNode, groupPart: 'reasoning' | 'response' | undefined): ChatConversationViewNode {
  if (groupPart === undefined || node.kind !== 'assistant-step' || typeof node.data !== 'object' || node.data === null) return node
  const blocks = Reflect.get(node.data, 'blocks')
  if (!Array.isArray(blocks)) return node
  return { ...node, ...(groupPart === 'reasoning' ? { key: `${node.key}/process/reasoning` } : {}), data: { ...node.data, blocks: blocks.filter(block =>
    typeof block === 'object' && block !== null && (groupPart === 'reasoning' ? Reflect.get(block, 'kind') === 'reasoning' : Reflect.get(block, 'kind') !== 'reasoning')) } }
}
export function workProcessLayout(
  nodes: readonly ChatConversationViewNode[], projected: NativeProcessSnapshot | undefined, policy: WorkProcessPolicy | undefined,
  turns: ReadonlyMap<number, WorkProcessTurnDisclosure>, groups: ReadonlySet<string>, searchReveal = false,
): WorkProcessLayout {
  if (projected === undefined || policy === undefined) return { entries: nodes.filter(node => node.kind !== 'turn-process').map(node => ({ node })), controls: [] }
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const entries: WorkProcessEntry[] = []; const controls: WorkProcessControl[] = []; const consumed = new Set<string>()
  const control = (value: WorkProcessControl) => { controls.push(value); entries.push({ control: value }) }
  const emit = (key: string, groupPart?: 'reasoning' | 'response') => {
    const node = byKey.get(key); if (node === undefined) return
    consumed.add(key)
    const location = node.location
    const turn = location.kind === 'turn' || location.kind === 'step' ? projected.evidence.get(location.turn.turn) : undefined
    const disclosure = turn === undefined ? undefined : turns.get(turn.turn)
    if (node.kind === 'turn-process') {
      const state = workProcessTurnPresentation(policy, turn, disclosure)
      if (!state.foldable || turn === undefined || turn.hasExternalProcess !== true && turn.inlineReasoning !== true) return
      const data = node.data as Record<string, unknown>
      control({ id: `turn:${turn.turn}`, kind: 'turn', open: searchReveal || state.open,
        label: `Turn ${turn.turn} process · ${String(data.toolCallCount ?? 0)} tools · ${String(data.messageCount ?? 0)} messages` })
      return
    }
    const step = typeof node.data === 'object' && node.data !== null ? Reflect.get(node.data, 'step') : undefined
    if (!searchReveal && !failed(node) && workProcessNodeHidden(policy, turn,
      { kind: node.kind, anchorSeq: node.anchorSeq, ...(typeof step === 'number' ? { step } : {}),
        ...(groupPart === undefined ? {} : { groupPart }), knownProcessMember: processKinds.has(node.kind) }, disclosure)) return
    entries.push({ node: part(node, groupPart) })
  }
  for (const entry of projected.entries) {
    if (entry.kind === 'node') { emit(entry.key, entry.groupPart); continue }
    const group = projected.groups.get(entry.key); if (group === undefined) continue
    const turn = projected.evidence.get(group.data.turn)
    const mandatory = group.members.some(member => {
      const node = byKey.get(member.key)
      return node !== undefined && (failed(node) || !processKinds.has(node.kind))
    })
    const state = workProcessGroupPresentation(policy, turn, group.data.closed, groups.has(group.key) || mandatory || searchReveal, turns.get(group.data.turn))
    if (state.headerVisible && !searchReveal) {
      const counts = group.data.summary.counts.map(row => `${row.kind} ${row.count}`).join(' · ')
      const detail = state.showRunningDetail ? group.data.summary.runningDetail : ''
      const reasoning = state.showSettledReasoningPreview && group.data.closed ? group.members.flatMap(member => {
        const data = byKey.get(member.key)?.data
        const blocks = data !== null && typeof data === 'object' ? Reflect.get(data, 'blocks') : undefined
        if (!Array.isArray(blocks)) return []
        return blocks.filter(block => block?.kind === 'reasoning' && typeof block.text === 'string').map(block => block.text)
      }).find(text => text.trim() !== '')?.split(/\r?\n[\t ]*\r?\n/)[0]?.replace(/\s+/gu, ' ').trim() : undefined
      const preview = reasoning === undefined ? '' : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(reasoning), part => part.segment).slice(0, 160).join('')
      control({ id: `group:${group.key}`, kind: 'group', open: state.bodyVisible,
        label: `${group.data.closed ? 'Process' : group.data.summary.preparing ? 'Preparing' : 'Working'}${counts ? ` · ${counts}` : ''}${detail ? ` · ${detail}` : ''}${preview ? ` · ${preview}` : ''}` })
    }
    for (const member of group.members) {
      consumed.add(member.key)
      const node = byKey.get(member.key)
      if (node !== undefined && (state.bodyVisible || searchReveal || failed(node) || !processKinds.has(node.kind))) emit(member.key, member.groupPart)
    }
  }
  // Extensions and partial evidence omitted by the native grouping are never dropped.
  for (const node of nodes) if (!consumed.has(node.key)) emit(node.key)
  return { entries, controls }
}
