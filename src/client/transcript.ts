/** Harness ConversationSnapshot presentation for the terminal Surface. */

import {
  Image,
  Key,
  Markdown,
  matchesKey,
  Text,
  visibleWidth,
  type Component,
  type Focusable,
} from '@mariozechner/pi-tui'
import type {
  AssistantBlock,
  ChatConversationViewNode,
  ConversationNode,
  ConversationSnapshot,
  RunningToolCall,
  ToolCallBlock,
  ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import type {
  AssistantChatData,
  ManualCompactionChatData,
  RetryChatData,
  ToolChatData,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  WorkflowRunChatData,
  WorkflowRunMemberData,
  WorkflowRunPhaseData,
} from '@deepseek-ai/dsh-client-ui-workflow-run/projection'
import { producedForClosing } from './compat/deliverables-rc6.ts'
import { color, escapeTerminalText, markdownTheme, terminalColorLevel } from './theme.ts'

const PULSE_FRAME_MS = 160

/** User-visible tool-card posture; display only, never a model/runtime mutation. */
export type ToolVisibility = 'collapsed' | 'expanded' | 'hidden'

interface TranscriptPreferences {
  readonly tools: ToolVisibility
  readonly reasoning: boolean
}

type TranscriptImageAttachment = Extract<AssistantBlock, { kind: 'image' }>['attachment']

/** Bytes resolved through the active Harness Session attachment face. */
export interface TranscriptImagePayload {
  readonly attachment: TranscriptImageAttachment
  readonly data: string
}

/** Read one durable attachment without exposing the Store or transport to the renderer. */
export type TranscriptImageLoader = (
  attachment: TranscriptImageAttachment,
) => Promise<TranscriptImagePayload>

type TranscriptRow = ({
  readonly format: 'markdown'
  readonly text: string
} | {
  readonly format: 'plain'
  readonly text: string
} | {
  readonly format: 'image'
  readonly key: string
  readonly attachment: TranscriptImageAttachment
}) & {
  /** Separate durable conversation nodes without spacing every content block. */
  readonly gapBefore?: boolean
  /** Mark the first rendered row of one durable user turn. */
  readonly userTurn?: boolean
  /** Animate one active marker without changing row geometry or surrounding text. */
  readonly pulse?: 'thinking' | 'marker'
}

function thinkingRow(): TranscriptRow {
  return { format: 'plain', text: '正在思考…', pulse: 'thinking' }
}

class PulsingRow implements Component {
  constructor(
    private readonly text: string,
    private readonly mode: 'thinking' | 'marker',
    private readonly frame: () => number,
  ) {}

  render(width: number): string[] {
    const marker = color.pulse('◆', this.frame())
    const safeText = escapeTerminalText(this.text)
    const text = this.mode === 'thinking'
      ? `${marker} ${color.muted(safeText)}`
      : safeText.replace('◆', marker)
    return new Text(text, 0, 0).render(width)
  }

  invalidate(): void {}
}

function imageAttachment(value: unknown): TranscriptImageAttachment | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  return typeof row.attachmentId === 'string'
    && typeof row.mediaType === 'string'
    && typeof row.bytes === 'number'
    && typeof row.width === 'number'
    && typeof row.height === 'number'
    ? value as TranscriptImageAttachment
    : undefined
}

function imageRow(attachment: TranscriptImageAttachment): TranscriptRow {
  return {
    format: 'image',
    key: String(attachment.attachmentId),
    attachment,
  }
}

function imageLabel(attachment: TranscriptImageAttachment): string {
  const name = attachment.name ?? String(attachment.attachmentId)
  return `[图片 · ${name} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} 字节]`
}

function jsonText(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return String(value)
  try {
    const rendered = JSON.stringify(value, null, 2)
    return rendered.length > 8_000 ? `${rendered.slice(0, 8_000)}\n…（终端显示已截断）` : rendered
  } catch {
    return typeof value === 'bigint' ? value.toString() : '[内容无法序列化]'
  }
}

function contentBlockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return String(block)
  const value = block as Record<string, unknown>
  if (value.type === 'text' || value.type === 'reasoning') {
    return typeof value.text === 'string' ? value.text : `[${value.type}]`
  }
  if (value.type === 'image') return '[图片附件]'
  if (value.type === 'tool-result') return '[工具结果]'
  return `[${typeof value.type === 'string' ? value.type : '内容'}]`
}

function permissionCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'permission' || node.outcome?.kind !== 'success') return undefined
  const preset = /^preset\s+(\S+)/u.exec(node.outcome.text ?? '')?.[1] ?? node.args?.trim()
  if (preset === undefined || preset === '') return color.success('权限已切换')
  const label = preset === 'read-only'
    ? '只读'
    : preset === 'workspace-write' ? '工作区' : preset === 'danger-full-access' ? '完全访问' : preset
  return color.success(`权限已切换为${label}`)
}

function planCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'plan') return undefined
  if (node.outcome === null) return color.warning('正在切换计划模式')
  if (node.outcome.kind !== 'success') {
    return color.danger(`计划模式切换失败${node.outcome.text === undefined ? '' : `\n${node.outcome.text}`}`)
  }
  const text = node.outcome.text ?? ''
  if (node.args?.trim() === 'off') {
    if (text.includes('entry cancelled')) return color.success('已取消进入计划模式')
    if (text.includes('already inactive')) return color.muted('计划模式未开启')
    if (text.startsWith('Leaving ')) return color.success('计划模式将在下一步关闭')
    return color.success('计划模式已关闭')
  }
  return color.success(text.startsWith('Entering ')
    ? '计划模式将在下一步开启'
    : '计划模式已开启')
}

function goalCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'goal') return undefined
  if (node.outcome === null) return color.warning('正在处理目标')
  const args = node.args?.trim() ?? ''
  const action = args.toLowerCase()
  if (node.outcome.kind !== 'success') {
    if (node.outcome.text?.startsWith('A goal is already ') === true) {
      return color.danger('已有进行中的目标；可编辑或清除后重新创建')
    }
    if (action === 'edit') return color.danger('请提供新的目标内容')
    if (node.outcome.text?.startsWith('No goal is currently set') === true) return color.danger('当前没有目标')
    return color.danger('当前状态不能执行此目标操作')
  }
  if (action === 'clear') {
    return color.success(node.outcome.text === 'No goal to clear.' ? '当前没有目标' : '目标已清除')
  }
  if (action === 'pause') return color.success('目标已暂停')
  if (action === 'resume') return color.success('目标已继续')
  if (action.startsWith('edit ')) return color.success(`目标已更新：${args.slice(5).trim()}`)
  if (args !== '') return color.success(`目标已创建：${args}`)
  if (node.outcome.text?.startsWith('No goal is currently set.') === true) return color.muted('当前没有目标')
  const objective = /^Objective: (.*)$/mu.exec(node.outcome.text ?? '')?.[1]
  const phase = /^Status: (\S+)$/mu.exec(node.outcome.text ?? '')?.[1]
  const blocker = /^Blocker: (.*)$/mu.exec(node.outcome.text ?? '')?.[1]
  const phaseLabel = phase === 'active'
    ? '进行中'
    : phase === 'paused' ? '已暂停' : phase === 'blocked' ? '受阻' : phase === 'complete' ? '已完成' : undefined
  return [
    objective === undefined ? '当前目标' : `目标：${objective}`,
    ...(phaseLabel === undefined ? [] : [`状态：${phaseLabel}`]),
    ...(blocker === undefined ? [] : [`阻塞原因：${blocker}`]),
  ].join('\n')
}

function contentText(content: readonly unknown[]): string {
  return content.map(contentBlockText).join('\n').trim()
}

function contentRows(content: readonly unknown[]): TranscriptRow[] {
  return content.flatMap((block): TranscriptRow[] => {
    if (typeof block !== 'object' || block === null) return [{ format: 'plain', text: String(block) }]
    const value = block as Record<string, unknown>
    if (value.type === 'text' && typeof value.text === 'string') {
      return value.text === '' ? [] : [{ format: 'markdown', text: value.text }]
    }
    if (value.type === 'image') {
      const attachment = imageAttachment(value.attachment)
      return attachment === undefined
        ? [{ format: 'plain', text: color.warning('[图片附件元数据无效]') }]
        : [imageRow(attachment)]
    }
    return [{ format: 'plain', text: contentBlockText(block) }]
  })
}

function userContentRows(content: readonly unknown[], steering = false): TranscriptRow[] {
  const rows = contentRows(content).map(row => row.format === 'markdown'
    ? { ...row, format: 'plain' as const }
    : row)
  const prefix = steering
    ? `${color.brand('>')} ${color.muted('引导')} `
    : `${color.brand('>')} `
  const first = rows[0]
  if (first === undefined) return [{ format: 'plain', text: prefix.trimEnd(), userTurn: true }]
  if (first.format === 'image') {
    return [{ format: 'plain', text: prefix.trimEnd(), userTurn: true }, ...rows]
  }
  return [{ ...first, text: `${prefix}${first.text}`, userTurn: true }, ...rows.slice(1)]
}

function assistantBlockText(block: AssistantBlock, preferences: TranscriptPreferences): string {
  switch (block.kind) {
    case 'text': return block.text
    case 'reasoning': return preferences.reasoning ? color.muted(`思考\n${block.text}`) : ''
    case 'image': return color.muted('[图片附件]')
    case 'tool-call':
      if (preferences.tools === 'hidden') return ''
      return color.accent(`◆ ${block.name}${preferences.tools === 'expanded' ? `\n${prettyArgs(block.argsRaw)}` : ''}`)
    case 'other': return color.muted('模型扩展内容 · /trajectory 查看详情')
  }
}

function assistantBlockRows(block: AssistantBlock, preferences: TranscriptPreferences): TranscriptRow[] {
  switch (block.kind) {
    case 'text': return block.text === '' ? [] : [{ format: 'markdown', text: block.text }]
    case 'reasoning':
      if (!preferences.reasoning || block.text === '') return []
      return [{
        format: 'markdown',
        text: `> **思考**\n>\n${block.text.split('\n').map(line => `> ${line}`).join('\n')}`,
      }]
    case 'image': return [imageRow(block.attachment)]
    case 'tool-call':
      if (preferences.tools === 'hidden') return []
      return [{
        format: 'plain',
        text: color.accent(`◆ ${block.name}${preferences.tools === 'expanded' ? `\n${prettyArgs(block.argsRaw)}` : ''}`),
      }]
    case 'other': return [{ format: 'plain', text: color.muted('模型扩展内容 · /trajectory 查看详情') }]
  }
}

function prettyArgs(argsRaw: string): string {
  try { return jsonText(JSON.parse(argsRaw)) } catch { return argsRaw }
}

function contentLines(text: string): string[] {
  if (text === '') return []
  return (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n')
}

function diffText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return jsonText(value)
  const rows: string[] = []
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return jsonText(value)
    const { path, oldText, newText } = item as Record<string, unknown>
    if (typeof path !== 'string' || (oldText !== null && typeof oldText !== 'string') || typeof newText !== 'string') {
      return jsonText(value)
    }
    paths.add(path)
    rows.push(color.accent(path))
    if (oldText !== null) {
      for (const line of contentLines(oldText)) {
        rows.push(color.danger(`- ${line}`))
        removed += 1
      }
    }
    for (const line of contentLines(newText)) {
      rows.push(color.success(`+ ${line}`))
      added += 1
    }
  }
  const visible = rows.length <= 80
    ? rows
    : [...rows.slice(0, 40), color.muted(`… 省略 ${rows.length - 80} 行 …`), ...rows.slice(-40)]
  visible.push(color.muted(`└ +${added} -${removed} · ${paths.size} 个文件`))
  return visible.join('\n')
}

const PRODUCT_TOOL_TITLES: Readonly<Record<string, string>> = {
  ask_user_question: '向用户提问',
  create_goal: '创建目标',
  exit_plan_mode: '计划审查',
  get_goal: '查看目标',
  job_kill: '停止后台任务',
  job_list: '查看后台任务',
  job_output: '读取后台任务',
  subagent: '子 Agent',
  todo_write: '更新任务清单',
  update_goal: '更新目标',
  workflow: '工作流',
}

function toolTitle(node: ToolResultNode | RunningToolCall): string {
  const name = 'kind' in node ? node.call?.name : node.name
  const productTitle = name === undefined ? undefined : PRODUCT_TOOL_TITLES[name]
  if (productTitle !== undefined) return productTitle
  if ('kind' in node) {
    return node.resultView?.title ?? node.callView?.title ?? node.call?.name ?? node.callId
  }
  return node.callView?.title ?? node.name
}

function settledToolFailed(node: ToolResultNode): boolean {
  if (node.isError) return true
  const result = node.resultView
  return result?.card === 'terminal'
    && ((result.exitCode !== undefined && result.exitCode !== 0) || result.signal !== undefined)
}

function viewDetails(node: ToolResultNode): string[] {
  const details: string[] = []
  const call = node.callView
  if (call === null && node.call?.argsRaw !== undefined) details.push(prettyArgs(node.call.argsRaw))
  if (call?.card === 'generic' && call.rawInput !== undefined) details.push(jsonText(call.rawInput))
  if (call?.card === 'terminal') {
    if (call.description !== undefined) details.push(call.description)
    details.push(`${call.cwd ?? '(当前工作区)'}\n$ ${call.title}`)
  }
  if (call?.card === 'diff') details.push(diffText(call.diffs))
  const result = node.resultView
  if (result?.card === 'terminal') {
    if (result.output !== undefined) details.push(result.output)
    if (result.exitCode !== undefined) details.push(`退出码 ${result.exitCode}`)
    if (result.signal !== undefined) details.push(`信号 ${result.signal}`)
  } else if (result?.card === 'diff') {
    details.push(diffText(result.diffs))
  } else if (result?.card === 'generic' && result.content !== undefined) {
    details.push(contentText(result.content))
  } else if (result !== null) {
    details.push(jsonText(result))
  } else {
    const raw = contentText(node.content)
    if (raw !== '') details.push(raw)
  }
  if (node.meta !== undefined) details.push(`元数据\n${jsonText(node.meta)}`)
  return details.filter(value => value !== '')
}

function runningViewDetails(node: RunningToolCall): string[] {
  const view = node.callView
  if (view?.card === 'terminal') {
    return [
      ...(view.description === undefined ? [] : [view.description]),
      `${view.cwd ?? '(当前工作区)'}\n$ ${view.title}`,
    ]
  }
  if (view?.card === 'diff') return [diffText(view.diffs)]
  if (view?.card === 'generic' && view.rawInput !== undefined) return [jsonText(view.rawInput)]
  return [prettyArgs(node.argsRaw)]
}

function toolBlockText(block: ToolCallBlock, preferences: TranscriptPreferences, depth: number): string {
  const prefix = depth === 0 ? '◆ ' : `${'  '.repeat(depth)}↳ `
  if ('kind' in block) {
    const duration = block.callTime === null ? '' : ` · ${Math.max(0, block.time - block.callTime)} ms`
    const state = settledToolFailed(block) ? color.danger('失败') : color.success('完成')
    const detail = preferences.tools === 'expanded' ? viewDetails(block).join('\n') : ''
    const children = block.subCalls.map(child => toolBlockText(child, preferences, depth + 1)).filter(Boolean)
    return `${prefix}${color.accent(toolTitle(block))} · ${state}${duration}${detail === '' ? '' : `\n${detail}`}${children.length === 0 ? '' : `\n${children.join('\n')}`}`
  }
  const detail = preferences.tools === 'expanded' ? `\n${runningViewDetails(block).join('\n')}` : ''
  const children = block.subCalls.map(child => toolBlockText(child, preferences, depth + 1)).filter(Boolean)
  return `${prefix}${color.accent(toolTitle(block))} · ${color.warning('运行中')}${detail}${children.length === 0 ? '' : `\n${children.join('\n')}`}`
}

function nodeText(node: ConversationNode, preferences: TranscriptPreferences): string {
  switch (node.kind) {
    case 'user':
      return `${color.brand('>')} ${contentText(node.content)}`
    case 'steering':
      return `${color.brand('>')} ${color.muted('引导')} ${contentText(node.content)}`
    case 'context':
      return `${color.muted(`${node.provenance.role === 'recall' ? '召回' : '上下文'}${node.provenance.label === null ? '' : ` · ${node.provenance.label}`}${node.form === null ? ' · 未知格式' : ` · ${node.form}`}`)}\n${contentText(node.content)}`
    case 'assistant':
      return `${node.blocks.map((block: AssistantBlock) => assistantBlockText(block, preferences)).filter(Boolean).join('\n')}${node.interrupted === true ? color.warning('\n已停止') : ''}`
    case 'command':
      return permissionCommandText(node) ?? planCommandText(node) ?? goalCommandText(node) ?? (node.outcome === null
        ? color.warning(`命令 /${node.name ?? 'unknown'}${node.args ?? ''} · 执行中`)
        : `${node.outcome.kind === 'success' ? color.success('命令完成') : color.danger('命令失败')} /${node.name ?? 'unknown'}${node.args ?? ''}${node.outcome.text === undefined ? '' : `\n${node.outcome.text}`}`)
    case 'tool-result':
      return preferences.tools === 'hidden' ? '' : toolBlockText(node, preferences, 0)
    case 'compaction':
      return color.muted(`上下文已压缩${node.shadowedItemCount === null ? '' : ` · ${node.shadowedItemCount} 项`}${node.shadowedTokenCount === null ? '' : ` · 约 ${node.shadowedTokenCount} Token`}${node.summary === null ? '' : `\n${node.summary}`}`)
    case 'model-retry':
      return color.warning(`模型请求${node.retryState === 'scheduled' ? '等待重试' : node.retryState === 'started' ? '正在重试' : '重试已取消'} · ${node.provider} · 第 ${node.retry} 次${node.mode === 'normal' ? `/${node.maxRetries}` : ''} · ${node.delayMs} ms`)
    case 'turn-error':
      return color.danger(`本轮执行失败${node.code === undefined ? '' : ` [${node.code}]`}\n${node.message}`)
    case 'turn-max-tokens':
      return color.warning('本轮已达到最大 Token 数')
    case 'unknown':
      return color.muted(`未知事件 ${node.type} · /trajectory 查看详情`)
    default:
      return color.muted('未知会话事件 · /trajectory 查看详情')
  }
}

function textProperty(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('text' in value)) return undefined
  return typeof value.text === 'string' ? value.text : undefined
}

const CONVERSATION_KINDS = new Set([
  'user', 'assistant', 'steering', 'context', 'model-retry', 'turn-error',
  'turn-max-tokens', 'tool-result', 'command', 'compaction', 'unknown',
])

function isConversationNode(value: unknown): value is ConversationNode {
  return typeof value === 'object' && value !== null
    && 'kind' in value && typeof value.kind === 'string'
    && CONVERSATION_KINDS.has(value.kind)
}

function workflowStatusLabel(status: string): string {
  switch (status) {
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    case 'interrupted': return '已中断'
    default: return escapeTerminalText(status)
  }
}

function workflowStatusText(status: string): string {
  const label = workflowStatusLabel(status)
  switch (status) {
    case 'completed': return color.success(label)
    case 'failed': return color.danger(label)
    case 'cancelled':
    case 'interrupted': return color.warning(label)
    case 'running': return color.accent(label)
    default: return color.muted(label)
  }
}

function workflowMemberLabel(member: WorkflowRunMemberData): string {
  const safe = escapeTerminalText(member.label.trim())
  if (safe === '') return `成员 ${member.seq}`
  const generated = /^agent-([a-z0-9]+)$/iu.exec(safe)
  return generated === null ? safe : `Agent ${generated[1] ?? String(member.seq)}`
}

function workflowText(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const workflow = value as Partial<WorkflowRunChatData>
  if (typeof workflow.name !== 'string' || typeof workflow.status !== 'string' || !Array.isArray(workflow.phases)) {
    return undefined
  }
  const phases = workflow.phases as readonly WorkflowRunPhaseData[]
  const rows = phases.flatMap((phase: WorkflowRunPhaseData) => {
    const phaseLabel = phase.phase === null
      ? undefined
      : escapeTerminalText(phase.phase.trim()) || '未命名阶段'
    const members = phase.members.map((member: WorkflowRunMemberData) =>
      `    ${workflowStatusText(member.status)} · ${workflowMemberLabel(member)}`)
    return phaseLabel === undefined ? members.map(row => row.slice(2)) : [`  ${color.muted(phaseLabel)}`, ...members]
  })
  const name = escapeTerminalText(workflow.name)
  return `${color.accent(`工作流 · ${name}`)} · ${workflowStatusText(workflow.status)}${rows.length === 0 ? '' : `\n${rows.join('\n')}`}`
}

function deliverablesText(node: ChatConversationViewNode, data: unknown): string {
  if (!isConversationNode(data) || data.kind !== 'assistant') return ''
  const location = node.location
  if (location.kind !== 'turn' && location.kind !== 'step') return ''
  const produced = producedForClosing(
    location.turn.data.get('deliverables'),
    data.seq,
  )
  return produced.length === 0 ? '' : `\n${color.success(`生成文件 · ${produced.join(' · ')}`)}`
}

function grouped(rows: readonly TranscriptRow[]): TranscriptRow[] {
  return rows.map((row, index) => index === 0 ? { ...row, gapBefore: true } : row)
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function durationText(milliseconds: number): string {
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${String(Math.round(seconds * 10) / 10)}s`
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60))}m${String(whole % 60)}s`
}

function tokenText(value: number): string {
  const scaled = (number: number): string => number >= 100
    ? String(Math.round(number))
    : String(Math.round(number * 10) / 10)
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

/** Render Grok-style groups from the engine-owned completed-Turn footer. */
function turnTailText(data: unknown): string {
  const value = recordOf(data)
  if (value === undefined) return ''
  const statistics = recordOf(value.statistics)
  const usage = recordOf(value.usage)
  const groups: string[] = []
  const steps = nonnegativeNumber(statistics?.steps)
  if (steps !== undefined && steps > 0) groups.push(`1 轮 · ${tokenText(steps)} 步`)

  const llmMs = nonnegativeNumber(statistics?.llmMs)
  const toolMs = nonnegativeNumber(statistics?.toolMs)
  const durations = [
    ...(llmMs === undefined || llmMs === 0 ? [] : [`LLM ${durationText(llmMs)}`]),
    ...(toolMs === undefined || toolMs === 0 ? [] : [`工具调用 ${durationText(toolMs)}`]),
  ]
  if (durations.length > 0) groups.push(durations.join(' · '))

  const ttftMs = nonnegativeNumber(statistics?.ttftMs)
  const ttftSteps = nonnegativeNumber(statistics?.ttftSteps)
  const decodeMs = nonnegativeNumber(statistics?.decodeMs)
  const decodeTokens = nonnegativeNumber(statistics?.decodeTokens)
  const performance = [
    ...(ttftMs === undefined || ttftSteps === undefined || ttftSteps === 0
      ? []
      : [`首 token 平均 ${durationText(ttftMs / ttftSteps)}`]),
    ...(decodeMs === undefined || decodeTokens === undefined || decodeMs === 0
      ? []
      : [`${String(Math.round(decodeTokens / (decodeMs / 1_000) * 10) / 10)} tok/s`]),
  ]
  if (performance.length > 0) groups.push(performance.join(' · '))

  const uncached = nonnegativeNumber(usage?.uncachedInputTokens)
  const cacheRead = nonnegativeNumber(usage?.cacheReadTokens)
  const cacheWrite = nonnegativeNumber(usage?.cacheWriteTokens)
  const output = nonnegativeNumber(usage?.outputTokens)
  if (uncached !== undefined && cacheRead !== undefined && cacheWrite !== undefined && output !== undefined) {
    const input = uncached + cacheRead + cacheWrite
    if (input > 0) groups.push(`缓存命中 ${String(Math.round(cacheRead / input * 100))}%`)
    if (input > 0 || output > 0) groups.push(`输入 ${tokenText(input)} tok · 输出 ${tokenText(output)} tok`)
  }
  if (groups.length > 0) return color.muted(groups.join('  |  '))

  const legacy = [
    ...nonnegativeNumber(value.ttftMs) === undefined
      ? []
      : [`首 token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`],
    ...nonnegativeNumber(value.tokensPerSecond) === undefined
      ? []
      : [`${String(Math.round((nonnegativeNumber(value.tokensPerSecond) ?? 0) * 10) / 10)} tok/s`],
  ]
  return legacy.length === 0 ? '' : color.muted(legacy.join(' · '))
}

function assistantStepData(data: unknown): AssistantChatData | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value = data as Partial<AssistantChatData>
  return (value.status === 'running' || value.status === 'settled' || value.status === 'interrupted')
    && Array.isArray(value.blocks)
    ? value as AssistantChatData
    : undefined
}

function assistantStepRows(data: unknown, preferences: TranscriptPreferences): TranscriptRow[] {
  const step = assistantStepData(data)
  if (step === undefined) return []
  const content = step.blocks.flatMap(block => block.kind === 'tool-call' ? [] : assistantBlockRows(block, preferences))
  const hasFoldedReasoning = !preferences.reasoning
    && step.blocks.some(block => block.kind === 'reasoning' && block.text !== '')
  const hasAnswer = step.blocks.some(block => block.kind === 'text' && block.text !== '')
  if (content.length === 0 && step.status === 'settled' && !hasFoldedReasoning) return []
  const rows: TranscriptRow[] = []
  if (!hasAnswer && step.status === 'running' && (hasFoldedReasoning || content.length === 0)) {
    rows.push(thinkingRow())
  }
  rows.push(...content)
  if (step.status === 'interrupted') rows.push({ format: 'plain', text: color.warning('已停止') })
  return grouped(rows)
}

function toolChatData(data: unknown): ToolChatData | undefined {
  if (typeof data !== 'object' || data === null || !('root' in data)) return undefined
  const root = data.root
  if (typeof root !== 'object' || root === null
    || !('callId' in root) || typeof root.callId !== 'string'
    || !('subCalls' in root) || !Array.isArray(root.subCalls)) return undefined
  return data as ToolChatData
}

function compactContextRows(node: Extract<ConversationNode, { kind: 'context' }>): TranscriptRow[] {
  if (node.form === 'notice' && typeof node.source === 'object' && node.source !== null
    && 'kind' in node.source && node.source.kind === 'plugin'
    && 'plugin' in node.source && node.source.plugin === 'plan-mode') return []
  if (node.form === 'notice' && typeof node.source === 'object' && node.source !== null
    && 'kind' in node.source && node.source.kind === 'plugin'
    && 'plugin' in node.source && node.source.plugin === 'tool-jobs') {
    return grouped([{ format: 'plain', text: color.muted('◆ 后台任务已结束') }])
  }
  if (node.provenance.role === 'recall') {
    const source = node.provenance.label === null ? '' : ` · ${node.provenance.label}`
    return grouped([{
      format: 'plain',
      text: color.muted(`跨会话召回${source} · /trajectory 查看`),
    }])
  }
  if (node.form === 'notice' && typeof node.source === 'object' && node.source !== null
    && 'summary' in node.source && typeof node.source.summary === 'string') {
    return grouped([{ format: 'plain', text: color.muted(node.source.summary) }])
  }
  return []
}

function subagentUserRows(node: Extract<ConversationNode, { kind: 'user' }>): TranscriptRow[] | undefined {
  if (typeof node.source !== 'object' || node.source === null || !('kind' in node.source)) return undefined
  if (node.source.kind === 'subagent-settled') {
    return grouped([{
      format: 'plain',
      text: color.muted('◆ 子 Agent 已结束'),
      userTurn: true,
    }])
  }
  if (node.source.kind !== 'subagent-report') return undefined
  return grouped([
    { format: 'plain', text: `${color.brand('>')} ${color.muted('子 Agent 报告')}`, userTurn: true },
    ...contentRows(node.content.slice(1)),
  ])
}

function manualCompactionRows(data: unknown, preferences: TranscriptPreferences): TranscriptRow[] {
  if (typeof data !== 'object' || data === null || !('command' in data)) return []
  const value = data as Partial<ManualCompactionChatData>
  const rows: TranscriptRow[] = []
  if (isConversationNode(value.command)) {
    const command = nodeText(value.command, preferences)
    if (command !== '') rows.push({ format: 'plain', text: command })
  }
  if (isConversationNode(value.compaction)) {
    const compaction = nodeText(value.compaction, preferences)
    if (compaction !== '') rows.push({ format: 'plain', text: compaction })
  }
  return grouped(rows)
}

function retryRows(data: unknown, preferences: TranscriptPreferences): TranscriptRow[] {
  if (typeof data !== 'object' || data === null || !('current' in data)) return []
  const retry = (data as Partial<RetryChatData>).current
  if (!isConversationNode(retry)) return []
  const rendered = nodeText(retry, preferences)
  return rendered === '' ? [] : grouped([{ format: 'plain', text: rendered }])
}

function chatNodeRows(node: ChatConversationViewNode, preferences: TranscriptPreferences): TranscriptRow[] {
  if (node.kind === 'assistant-step') return assistantStepRows(node.data, preferences)
  if (node.kind === 'tool-call') {
    if (preferences.tools === 'hidden') return []
    const data = toolChatData(node.data)
    return data === undefined ? [] : grouped([{
      format: 'plain',
      text: toolBlockText(data.root, preferences, 0),
      ...('kind' in data.root ? {} : { pulse: 'marker' as const }),
    }])
  }
  if (node.kind === 'manual-compaction') return manualCompactionRows(node.data, preferences)
  if (node.kind === 'model-retry') return retryRows(node.data, preferences)
  if (isConversationNode(node.data)) {
    if (node.data.kind === 'user' || node.data.kind === 'steering' || node.data.kind === 'context') {
      if (node.data.kind === 'context') return compactContextRows(node.data)
      if (node.data.kind === 'user') {
        const subagent = subagentUserRows(node.data)
        if (subagent !== undefined) return subagent
      }
      return grouped(userContentRows(node.data.content, node.data.kind === 'steering'))
    }
    if (node.data.kind === 'assistant') {
      const rows: TranscriptRow[] = [
        ...node.data.blocks.flatMap((block: AssistantBlock) => assistantBlockRows(block, preferences)),
      ]
      if (node.data.interrupted === true) rows.push({ format: 'plain', text: color.warning('已停止') })
      const deliverables = deliverablesText(node, node.data)
      if (deliverables !== '') rows.push({ format: 'plain', text: deliverables.trimStart() })
      return grouped(rows)
    }
    const text = nodeText(node.data, preferences)
    return text === '' ? [] : grouped([{ format: 'plain', text }])
  }
  const commandInputText = node.kind === 'command-input' ? textProperty(node.data) : undefined
  if (commandInputText !== undefined) {
    return grouped([{ format: 'plain', text: `${color.brand('>')} ${commandInputText}`, userTurn: true }])
  }
  if (node.kind === 'workflow-run') {
    const rendered = workflowText(node.data)
    if (rendered !== undefined) return grouped([{ format: 'plain', text: rendered }])
  }
  if (node.kind === 'turn-tail') {
    const rendered = turnTailText(node.data)
    return rendered === '' ? [] : [{ format: 'plain', text: rendered }]
  }
  return grouped([{
    format: 'plain',
    text: color.muted(`扩展节点 ${node.kind} · /trajectory 查看详情`),
  }])
}

/** Mutable pi-tui component backed only by the official conversation snapshot. */
export class Transcript implements Component, Focusable {
  private components: Component[] = [new Text('', 0, 0)]
  private rows: readonly TranscriptRow[] = []
  private readonly imageComponents = new Map<string, Component>()
  private readonly pendingImages = new Set<string>()
  private imageGeneration = 0
  private imageLoader: TranscriptImageLoader | undefined
  private sessionId: string | undefined
  private toolVisibility: ToolVisibility = 'collapsed'
  private reasoningVisible = false
  private emptyState = true
  private hasMore = false
  private loadingOlder = false
  private scrollOffset = 0
  private renderedLineCount = 0
  private turnAnchors: readonly number[] = []
  private turnCursor: number | undefined
  private pulseFrame = 0
  private pulseTimer: ReturnType<typeof setInterval> | undefined
  focused = false

  /**
   * @param viewportRows - current terminal-dependent transcript height.
   * @param requestRender - schedule a TUI frame after local presentation state changes.
   * @param requestOlder - ask Harness for the preceding durable history page.
   */
  constructor(
    private readonly viewportRows: () => number = () => Number.POSITIVE_INFINITY,
    private readonly requestRender: () => void = () => undefined,
    private readonly requestOlder: () => void = () => undefined,
  ) {}

  /**
   * Cycle folded → expanded → hidden without mutating the Harness log.
   * @returns the newly active tool visibility.
   */
  cycleToolVisibility(): ToolVisibility {
    this.toolVisibility = this.toolVisibility === 'collapsed'
      ? 'expanded'
      : this.toolVisibility === 'expanded' ? 'hidden' : 'collapsed'
    return this.toolVisibility
  }

  /**
   * Toggle reasoning presentation without changing model request parameters.
   * @returns whether reasoning is now visible.
   */
  toggleReasoning(): boolean {
    this.reasoningVisible = !this.reasoningVisible
    return this.reasoningVisible
  }

  /** Follow new transcript output after the user submits from a historical viewport. */
  followLatest(): void {
    this.turnCursor = undefined
    this.scrollOffset = 0
    this.requestRender()
  }

  /**
   * Replace the transcript with non-durable empty-selection guidance.
   * @param message - guidance rendered when no Session is active.
   */
  empty(message = '在下方输入消息，或用 /help 查看命令。'): void {
    this.imageGeneration += 1
    this.imageLoader = undefined
    this.sessionId = undefined
    this.pendingImages.clear()
    this.imageComponents.clear()
    this.emptyState = true
    this.hasMore = false
    this.loadingOlder = false
    this.replace([{ format: 'plain', text: color.muted(message) }])
  }

  /**
   * Replace the rendered snapshot after a Harness observable notification.
   * @param snapshot - authoritative Session conversation projection.
   * @param imageLoader - authenticated reader for references in this Session.
   */
  update(snapshot: ConversationSnapshot, imageLoader?: TranscriptImageLoader): void {
    const sessionId = String(snapshot.sessionId)
    if (sessionId !== this.sessionId) {
      this.imageGeneration += 1
      this.pendingImages.clear()
      this.imageComponents.clear()
      this.sessionId = sessionId
    }
    this.imageLoader = imageLoader
    this.hasMore = snapshot.hasMore
    this.loadingOlder = snapshot.loadingOlder
    const preferences: TranscriptPreferences = {
      tools: this.toolVisibility,
      reasoning: this.reasoningVisible,
    }
    const visibleNodes = snapshot.chat.order.flatMap((key) => {
      const node = snapshot.chat.nodes.get(key)
      return node === undefined || node.visibility !== 'visible' ? [] : [node]
    })
    const rows: TranscriptRow[] = visibleNodes.flatMap(node => chatNodeRows(node, preferences))
    if (snapshot.partial !== null && !visibleNodes.some(node => node.kind === 'assistant-step')) {
      const partialRows = snapshot.partial.blocks.flatMap(block => assistantBlockRows(block, preferences))
      rows.push(...grouped([
        ...(partialRows.length === 0
          ? [thinkingRow()]
          : []),
        ...partialRows,
      ]))
    }
    if (preferences.tools !== 'hidden' && !visibleNodes.some(node => node.kind === 'tool-call')) {
      rows.push(...snapshot.runningCalls.flatMap(call => grouped([{
        format: 'plain' as const,
        text: toolBlockText(call, preferences, 0),
        pulse: 'marker' as const,
      }])))
    }
    this.emptyState = rows.length === 0
    if (this.emptyState) rows.push({
      format: 'plain',
      text: `${color.brand('deepseek')}\n${color.muted('探索未至之境')}\n${color.muted('直接描述你想完成的事')}`,
    })
    this.replace(rows)
  }

  invalidate(): void {
    for (const component of this.components) component.invalidate()
  }

  /** Stop pending attachment presentation updates during terminal teardown. */
  dispose(): void {
    this.stopPulseAnimation()
    this.imageGeneration += 1
    this.imageLoader = undefined
    this.pendingImages.clear()
    this.imageComponents.clear()
  }

  render(width: number): string[] {
    const inset = width >= 12 ? 2 : 0
    const contentWidth = Math.max(1, width - inset * 2)
    const withInset = (values: readonly string[]): string[] => values.map(line =>
      line === '' ? '' : `${' '.repeat(inset)}${line}`)
    const olderMarker = (count: number): string => {
      if (this.loadingOlder) return color.muted('↑ 正在加载更早内容…')
      const hint = this.focused ? 'PgUp/Home' : '滚轮上翻'
      return color.muted(count === 0
        ? `↑ 还有更早内容 · ${hint}`
        : `↑ ${String(count)} 行更早内容 · ${hint}`)
    }
    const lines: string[] = []
    const anchors: number[] = []
    for (const [index, component] of this.components.entries()) {
      if (lines.length > 0 && this.rows[index]?.gapBefore === true) lines.push('')
      if (this.rows[index]?.userTurn === true) {
        anchors.push(lines.length)
      }
      const row = this.rows[index]
      const rendered = component.render(contentWidth)
      const escaped = row?.format === 'image'
        ? rendered
        : rendered.map(escapeTerminalText)
      lines.push(...escaped)
    }
    if (this.emptyState) {
      for (const [index, line] of lines.entries()) {
        if (line === '') continue
        const content = line.trimEnd()
        lines[index] = `${' '.repeat(Math.max(0, Math.floor((contentWidth - visibleWidth(content)) / 2)))}${content}`
      }
    }
    this.renderedLineCount = lines.length
    this.turnAnchors = anchors
    const rows = Math.max(1, Math.floor(this.viewportRows()))
    if (!Number.isFinite(rows)) {
      this.scrollOffset = 0
      return withInset(lines)
    }
    if (lines.length <= rows) {
      this.scrollOffset = 0
      const remaining = rows - lines.length
      if (!this.emptyState && this.hasMore) {
        if (remaining === 0) {
          const visible = [...lines]
          visible[0] = olderMarker(0)
          return withInset(visible)
        }
        return withInset([
          ...Array.from({ length: remaining - 1 }, () => ''),
          olderMarker(0),
          ...lines,
        ])
      }
      const before = this.emptyState ? Math.floor(remaining / 2) : remaining
      return withInset([
        ...Array.from({ length: before }, () => ''),
        ...lines,
        ...Array.from({ length: remaining - before }, () => ''),
      ])
    }
    const maxOffset = Math.max(0, lines.length - rows)
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)
    const end = lines.length - this.scrollOffset
    const start = Math.max(0, end - rows)
    if (this.scrollOffset === 0 && start > 0) {
      const alignedStart = this.turnAnchors.find(anchor =>
        anchor >= start && end - anchor <= rows - 1)
      if (alignedStart !== undefined) {
        const latestTurnRows = lines.slice(alignedStart, end)
        return withInset([
          ...Array.from({ length: rows - latestTurnRows.length - 1 }, () => ''),
          olderMarker(alignedStart),
          ...latestTurnRows,
        ])
      }
    }
    const visible = lines.slice(start, end)
    if (start > 0 && visible.length > 0) {
      visible[0] = olderMarker(start)
    } else if (this.hasMore && visible.length > 0) {
      visible[0] = olderMarker(0)
    }
    if (end < lines.length && visible.length > 0) {
      const hint = this.focused ? 'PgDn/End' : '滚轮下翻'
      visible[visible.length - 1] = color.muted(`↓ ${String(lines.length - end)} 行更新内容 · ${hint}`)
    }
    return withInset(visible)
  }

  handleInput(data: string): void {
    this.turnCursor = undefined
    const rows = Math.max(1, Math.floor(this.viewportRows()))
    const maxOffset = Math.max(0, this.renderedLineCount - rows)
    if (matchesKey(data, Key.up)) this.scrollBy(1)
    else if (matchesKey(data, Key.down)) this.scrollBy(-1)
    else if (matchesKey(data, Key.pageUp)) this.scrollBy(Math.max(1, rows - 1))
    else if (matchesKey(data, Key.pageDown)) this.scrollBy(-Math.max(1, rows - 1))
    else if (matchesKey(data, Key.home)) this.scrollBy(maxOffset)
    else if (matchesKey(data, Key.end)) this.scrollBy(-this.scrollOffset)
  }

  /**
   * Move the conversation viewport while leaving the composer focus unchanged.
   * @param lines - positive for older content, negative for newer content.
   * @returns whether the viewport moved.
   */
  scrollBy(lines: number): boolean {
    this.turnCursor = undefined
    const delta = Math.trunc(lines)
    if (!Number.isFinite(delta) || delta === 0) return false
    const rows = Math.max(1, Math.floor(this.viewportRows()))
    const maxOffset = Math.max(0, this.renderedLineCount - rows)
    const nextOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta))
    if (nextOffset === this.scrollOffset) {
      if (delta > 0 && this.scrollOffset === maxOffset && this.hasMore && !this.loadingOlder) {
        this.requestOlder()
      }
      return false
    }
    this.scrollOffset = nextOffset
    this.requestRender()
    return true
  }

  /**
   * Move the viewport to an adjacent durable user-turn anchor.
   * @param offset - negative for an older turn, positive for a newer turn.
   * @returns whether an adjacent turn exists and was selected.
   */
  navigateTurn(offset: number): boolean {
    if (offset === 0 || this.turnAnchors.length === 0) return false
    const rows = Math.max(1, Math.floor(this.viewportRows()))
    const viewportTop = Math.max(0, this.renderedLineCount - this.scrollOffset - rows)
    const viewportEnd = Math.min(this.renderedLineCount, viewportTop + rows)
    const index = this.turnCursor === undefined
      ? offset < 0
        ? this.turnAnchors.findLastIndex(candidate => candidate < viewportEnd)
        : this.turnAnchors.findIndex(candidate => candidate > viewportTop)
      : this.turnCursor + Math.sign(offset)
    const anchor = this.turnAnchors[index]
    if (anchor === undefined) return false
    this.turnCursor = index
    this.scrollOffset = Math.max(0, this.renderedLineCount - (anchor + rows))
    this.requestRender()
    return true
  }

  private replace(rows: readonly TranscriptRow[]): void {
    this.rows = rows
    this.turnCursor = undefined
    this.components = rows.map(row => this.component(row))
    this.syncPulseAnimation(rows.some(row => row.pulse !== undefined))
  }

  private component(row: TranscriptRow): Component {
    if (row.format === 'markdown') return new Markdown(escapeTerminalText(row.text), 0, 0, markdownTheme)
    if (row.format === 'plain') {
      return row.pulse === undefined
        ? new Text(escapeTerminalText(row.text), 0, 0)
        : new PulsingRow(row.text, row.pulse, () => this.pulseFrame)
    }
    const cacheKey = `${this.sessionId ?? 'none'}:${row.key}`
    const cached = this.imageComponents.get(cacheKey)
    if (cached !== undefined) return cached
    const fallback = new Text(color.muted(imageLabel(row.attachment)), 0, 0)
    const loader = this.imageLoader
    if (loader === undefined || this.pendingImages.has(cacheKey)) return fallback
    this.pendingImages.add(cacheKey)
    const generation = this.imageGeneration
    void loader(row.attachment).then((payload) => {
      if (generation !== this.imageGeneration) return
      const attachment = payload.attachment
      this.imageComponents.set(cacheKey, new Image(
        payload.data,
        attachment.mediaType,
        { fallbackColor: value => color.muted(value) },
        {
          maxWidthCells: 60,
          maxHeightCells: 20,
          filename: escapeTerminalText(attachment.name ?? String(attachment.attachmentId)),
        },
        { widthPx: attachment.width, heightPx: attachment.height },
      ))
    }, (error: unknown) => {
      if (generation !== this.imageGeneration) return
      const message = error instanceof Error ? error.message : String(error)
      this.imageComponents.set(cacheKey, new Text(
        color.danger(`${imageLabel(row.attachment)} · 读取失败：${message}`),
        0,
        0,
      ))
    }).finally(() => {
      if (generation !== this.imageGeneration) return
      this.pendingImages.delete(cacheKey)
      this.components = this.rows.map(current => this.component(current))
      this.requestRender()
    })
    return fallback
  }

  private syncPulseAnimation(active: boolean): void {
    if (!active || terminalColorLevel() === 0) {
      this.stopPulseAnimation()
      return
    }
    if (this.pulseTimer !== undefined) return
    this.pulseFrame = 0
    this.pulseTimer = setInterval(() => {
      this.pulseFrame = this.pulseFrame === Number.MAX_SAFE_INTEGER ? 0 : this.pulseFrame + 1
      this.requestRender()
    }, PULSE_FRAME_MS)
    this.pulseTimer.unref()
  }

  private stopPulseAnimation(): void {
    if (this.pulseTimer !== undefined) clearInterval(this.pulseTimer)
    this.pulseTimer = undefined
    this.pulseFrame = 0
  }
}
