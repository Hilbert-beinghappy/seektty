/** Harness ConversationSnapshot presentation for the terminal Surface. */

import {
  Image,
  Key,
  Markdown,
  matchesKey,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
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
import {
  EMPTY_SESSION_EXAMPLES,
  emptyExampleText,
} from './empty-examples.ts'
import { translateUiText, ui } from './locale.ts'
import {
  findLineMatches,
  highlightQuery,
  nextMatchIndex,
  planLineSearch,
  scrollOffsetToContain,
  scrollOffsetToReveal,
} from './transcript-search.ts'
import {
  background,
  color,
  escapeTerminalText,
  highlightCodeLines,
  markdownTheme,
  terminalColorLevel,
} from './theme.ts'
import { syntaxLanguageForPath } from './syntax-highlighter.ts'
import { foldLineBlock } from './tool-output-limit.ts'
import { unifiedHunks } from './line-diff.ts'
import { DEFAULT_TUI_BEHAVIOR } from '@deepseek-ai/dsh-tui-protocol'

const PULSE_FRAME_MS = 160

/** Replaceable counters used by incremental-render tests. */
export const internals = {
  markdownCreated: 0,
  componentRenders: 0,
}

/** User-visible tool-card posture; display only, never a model/runtime mutation. */
export type ToolVisibility = 'collapsed' | 'expanded' | 'hidden'

interface TranscriptPreferences {
  readonly tools: ToolVisibility
  readonly reasoning: boolean
  readonly toolOutputLineLimit: number
  readonly diffContextLines: number
  readonly expandedTools: ReadonlySet<string>
  readonly collapsedTools: ReadonlySet<string>
  readonly focusedTool?: string
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
  readonly format: 'code'
  readonly text: string
  readonly language?: string
  readonly caption?: string
  readonly lineNumbers?: readonly number[]
  readonly prefix?: string
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
  /** Unix epoch ms used to render an in-flight duration beside this row. */
  readonly liveDurationSince?: number
  /** Empty-session starter prompt that Enter can submit while browsing. */
  readonly exampleId?: string
  /** Tool-card identity for per-card expand in focus mode. */
  readonly toolKey?: string
}

/** Result of Enter on the focused transcript row. */
export type TranscriptFocusAction = {
  readonly kind: 'example'
  readonly text: string
} | {
  readonly kind: 'tool'
  readonly key: string
}

function thinkingRow(): TranscriptRow {
  return { format: 'plain', text: ui('正在思考…', 'Thinking…'), pulse: 'thinking' }
}

class PulsingRow implements Component {
  constructor(
    private readonly text: string,
    private readonly mode: 'thinking' | 'marker',
    private readonly frame: () => number,
    private readonly liveDurationSince?: number,
  ) {}

  render(width: number): string[] {
    const marker = color.pulse('◆', this.frame())
    const liveDuration = this.liveDurationSince === undefined
      ? ''
      : ` · ${durationText(Math.max(0, Date.now() - this.liveDurationSince))}`
    const safeText = escapeTerminalText(`${this.text}${liveDuration}`)
    const text = this.mode === 'thinking'
      ? `${marker} ${color.muted(safeText)}`
      : safeText.replace('◆', marker)
    return new Text(text, 0, 0).render(width)
  }

  invalidate(): void {}
}

class CodeRow implements Component {
  constructor(private readonly row: Extract<TranscriptRow, { readonly format: 'code' }>) {}

  render(width: number): string[] {
    const safeWidth = Math.max(1, width)
    const requestedPrefix = escapeTerminalText(this.row.prefix ?? '')
    const prefix = visibleWidth(requestedPrefix) < safeWidth ? requestedPrefix : ''
    const prefixWidth = visibleWidth(prefix)
    const numbers = this.row.lineNumbers
    const highest = numbers?.reduce((value, number) => Math.max(value, number), 0) ?? 0
    const numberWidth = numbers !== undefined && safeWidth - prefixWidth >= 8
      ? String(highest).length + 2
      : 0
    const codeWidth = Math.max(1, safeWidth - prefixWidth - numberWidth)
    const highlighted = highlightCodeLines(this.row.text, this.row.language)
    const rows: string[] = []
    if (this.row.caption !== undefined) {
      rows.push(...new Text(`${color.muted(prefix)}${color.muted(escapeTerminalText(this.row.caption))}`, 0, 0).render(safeWidth))
    }
    for (const [index, sourceLine] of highlighted.entries()) {
      const wrapped = wrapTextWithAnsi(sourceLine, codeWidth)
      const parts = wrapped.length === 0 ? [''] : wrapped
      for (const [partIndex, part] of parts.entries()) {
        const number = numbers?.[index]
        const gutter = numberWidth === 0
          ? ''
          : color.muted(partIndex === 0 && number !== undefined
            ? `${String(number).padStart(numberWidth - 1)} `
            : ' '.repeat(numberWidth))
        const padded = `${part}${' '.repeat(Math.max(0, codeWidth - visibleWidth(part)))}`
        const connector = prefix === ''
          ? ''
          : this.row.caption === undefined && index === 0 && partIndex === 0
            ? color.muted(prefix)
            : ' '.repeat(prefixWidth)
        rows.push(`${connector}${gutter}${background.code(padded)}`)
      }
    }
    return rows
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
  return ui(
    `[图片 · ${name} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} 字节]`,
    `[Image · ${name} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} bytes]`,
  )
}

function jsonText(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return String(value)
  try {
    const rendered = JSON.stringify(value, null, 2)
    return rendered.length > 8_000
      ? `${rendered.slice(0, 8_000)}\n${ui('…（终端显示已截断）', '… (terminal display truncated)')}`
      : rendered
  } catch {
    return typeof value === 'bigint' ? value.toString() : ui('[内容无法序列化]', '[content cannot be serialized]')
  }
}

function contentBlockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return String(block)
  const value = block as Record<string, unknown>
  if (value.type === 'text' || value.type === 'reasoning') {
    return typeof value.text === 'string' ? value.text : `[${value.type}]`
  }
  if (value.type === 'image') return ui('[图片附件]', '[image attachment]')
  if (value.type === 'tool-result') return ui('[工具结果]', '[tool result]')
  return `[${typeof value.type === 'string' ? value.type : ui('内容', 'content')}]`
}

function permissionCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'permission' || node.outcome?.kind !== 'success') return undefined
  const preset = /^preset\s+(\S+)/u.exec(node.outcome.text ?? '')?.[1] ?? node.args?.trim()
  if (preset === undefined || preset === '') return color.success(ui('权限已切换', 'Permission changed'))
  const label = preset === 'read-only'
    ? ui('只读', 'Read only')
    : preset === 'workspace-write'
      ? ui('工作区', 'Workspace')
      : preset === 'danger-full-access' ? ui('完全访问', 'Full access') : preset
  return color.success(ui(`权限已切换为${label}`, `Permission changed to ${label}`))
}

function planCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'plan') return undefined
  if (node.outcome === null) return color.warning(ui('正在切换计划模式', 'Switching plan mode'))
  if (node.outcome.kind !== 'success') {
    return color.danger(ui(
      `计划模式切换失败${node.outcome.text === undefined ? '' : `\n${node.outcome.text}`}`,
      `Failed to switch plan mode${node.outcome.text === undefined ? '' : `\n${node.outcome.text}`}`,
    ))
  }
  const text = node.outcome.text ?? ''
  if (node.args?.trim() === 'off') {
    if (text.includes('entry cancelled')) return color.success(ui('已取消进入计划模式', 'Plan-mode entry cancelled'))
    if (text.includes('already inactive')) return color.muted(ui('计划模式未开启', 'Plan mode is not active'))
    if (text.startsWith('Leaving ')) return color.success(ui('计划模式将在下一步关闭', 'Plan mode will stop on the next step'))
    return color.success(ui('计划模式已关闭', 'Plan mode disabled'))
  }
  return color.success(text.startsWith('Entering ')
    ? ui('计划模式将在下一步开启', 'Plan mode will start on the next step')
    : ui('计划模式已开启', 'Plan mode enabled'))
}

function goalCommandText(node: Extract<ConversationNode, { kind: 'command' }>): string | undefined {
  if (node.name !== 'goal') return undefined
  if (node.outcome === null) return color.warning(ui('正在处理目标', 'Processing goal'))
  const args = node.args?.trim() ?? ''
  const action = args.toLowerCase()
  if (node.outcome.kind !== 'success') {
    if (node.outcome.text?.startsWith('A goal is already ') === true) {
      return color.danger(ui('已有进行中的目标；可编辑或清除后重新创建', 'A goal is already active; edit or clear it before creating another'))
    }
    if (action === 'edit') return color.danger(ui('请提供新的目标内容', 'Provide the new goal text'))
    if (node.outcome.text?.startsWith('No goal is currently set') === true) return color.danger(ui('当前没有目标', 'No active goal'))
    return color.danger(ui('当前状态不能执行此目标操作', 'This goal action is not valid in the current state'))
  }
  if (action === 'clear') {
    return color.success(node.outcome.text === 'No goal to clear.'
      ? ui('当前没有目标', 'No active goal')
      : ui('目标已清除', 'Goal cleared'))
  }
  if (action === 'pause') return color.success(ui('目标已暂停', 'Goal paused'))
  if (action === 'resume') return color.success(ui('目标已继续', 'Goal resumed'))
  if (action.startsWith('edit ')) return color.success(ui(`目标已更新：${args.slice(5).trim()}`, `Goal updated: ${args.slice(5).trim()}`))
  if (args !== '') return color.success(ui(`目标已创建：${args}`, `Goal created: ${args}`))
  if (node.outcome.text?.startsWith('No goal is currently set.') === true) return color.muted(ui('当前没有目标', 'No active goal'))
  const objective = /^Objective: (.*)$/mu.exec(node.outcome.text ?? '')?.[1]
  const phase = /^Status: (\S+)$/mu.exec(node.outcome.text ?? '')?.[1]
  const blocker = /^Blocker: (.*)$/mu.exec(node.outcome.text ?? '')?.[1]
  const phaseLabel = phase === 'active'
    ? ui('进行中', 'In progress')
    : phase === 'paused'
      ? ui('已暂停', 'Paused')
      : phase === 'blocked'
        ? ui('受阻', 'Blocked')
        : phase === 'complete' ? ui('已完成', 'Completed') : undefined
  return [
    objective === undefined ? ui('当前目标', 'Current goal') : ui(`目标：${objective}`, `Goal: ${objective}`),
    ...(phaseLabel === undefined ? [] : [ui(`状态：${phaseLabel}`, `Status: ${phaseLabel}`)]),
    ...(blocker === undefined ? [] : [ui(`阻塞原因：${blocker}`, `Blocked by: ${blocker}`)]),
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
        ? [{ format: 'plain', text: color.warning(ui('[图片附件元数据无效]', '[invalid image attachment metadata]')) }]
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
    ? `${color.brand('>')} ${color.muted(ui('引导', 'Steering'))} `
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
    case 'reasoning': return preferences.reasoning ? color.muted(`${ui('思考', 'Reasoning')}\n${block.text}`) : ''
    case 'image': return color.muted(ui('[图片附件]', '[image attachment]'))
    case 'tool-call':
      if (preferences.tools === 'hidden') return ''
      return color.accent(`◆ ${block.name}${preferences.tools === 'expanded' ? `\n${prettyArgs(block.argsRaw)}` : ''}`)
    case 'other': return color.muted(ui('模型扩展内容 · /trajectory 查看详情', 'Extended model content · use /trajectory for details'))
  }
}

function assistantBlockRows(block: AssistantBlock, preferences: TranscriptPreferences): TranscriptRow[] {
  switch (block.kind) {
    case 'text': return block.text === '' ? [] : [{ format: 'markdown', text: block.text }]
    case 'reasoning':
      if (!preferences.reasoning || block.text === '') return []
      return [{
        format: 'markdown',
        text: `> **${ui('思考', 'Reasoning')}**\n>\n${block.text.split('\n').map(line => `> ${line}`).join('\n')}`,
      }]
    case 'image': return [imageRow(block.attachment)]
    case 'tool-call':
      if (preferences.tools === 'hidden') return []
      return [{
        format: 'plain',
        text: color.accent(`◆ ${block.name}`),
      }, ...(preferences.tools === 'expanded'
        ? [{ format: 'code' as const, text: prettyArgs(block.argsRaw), language: 'json' }]
        : [])]
    case 'other': return [{ format: 'plain', text: color.muted(ui('模型扩展内容 · /trajectory 查看详情', 'Extended model content · use /trajectory for details')) }]
  }
}

function prettyArgs(argsRaw: string): string {
  try { return jsonText(JSON.parse(argsRaw)) } catch { return argsRaw }
}

function diffText(value: unknown, context = DEFAULT_TUI_BEHAVIOR.diffContextLines): string {
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
    rows.push(`diff -- ${path}`)
    rows.push(oldText === null ? '--- /dev/null' : `--- a/${path}`)
    rows.push(`+++ b/${path}`)
    const hunks = unifiedHunks(oldText, newText, context)
    for (const line of hunks) {
      if (line.startsWith('+') && !line.startsWith('+++')) added += 1
      if (line.startsWith('-') && !line.startsWith('---')) removed += 1
      rows.push(line)
    }
  }
  const visible = rows.length <= 80
    ? rows
    : [...rows.slice(0, 40), ui(`@@ … 省略 ${rows.length - 80} 行 … @@`, `@@ … ${rows.length - 80} lines omitted … @@`), ...rows.slice(-40)]
  visible.push(ui(`# +${added} -${removed} · ${paths.size} 个文件`, `# +${added} -${removed} · ${paths.size} file(s)`))
  return visible.join('\n')
}

const PRODUCT_TOOL_TITLES: Readonly<Record<string, { readonly zh: string; readonly en: string }>> = {
  ask_user_question: { zh: '向用户提问', en: 'Ask user' },
  create_goal: { zh: '创建目标', en: 'Create goal' },
  exit_plan_mode: { zh: '计划审查', en: 'Plan review' },
  get_goal: { zh: '查看目标', en: 'View goal' },
  job_kill: { zh: '停止后台任务', en: 'Stop background job' },
  job_list: { zh: '查看后台任务', en: 'View background jobs' },
  job_output: { zh: '读取后台任务', en: 'Read background job' },
  subagent: { zh: '子 Agent', en: 'Subagent' },
  todo_write: { zh: '更新任务清单', en: 'Update task list' },
  update_goal: { zh: '更新目标', en: 'Update goal' },
  workflow: { zh: '工作流', en: 'Workflow' },
}

function toolTitle(node: ToolResultNode | RunningToolCall): string {
  const name = 'kind' in node ? node.call?.name : node.name
  const productTitle = name === undefined ? undefined : PRODUCT_TOOL_TITLES[name]
  if (productTitle !== undefined) return ui(productTitle.zh, productTitle.en)
  const callView = node.callView
  if (callView?.card === 'terminal') {
    const description = callView.description?.trim()
    return description === undefined || description === ''
      ? ui('执行 Shell 指令', 'Run shell command')
      : description
  }
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

type ToolDetail = {
  readonly kind: 'plain'
  readonly text: string
} | {
  readonly kind: 'markdown'
  readonly text: string
} | {
  readonly kind: 'code'
  readonly text: string
  readonly language?: string
  readonly caption?: string
  readonly lineNumbers?: readonly number[]
}

interface ReadLineView {
  readonly number: number
  readonly text: string
}

interface SearchMatchView {
  readonly lineNumber: number
  readonly line: string
}

interface SearchFileView {
  readonly path: string
  readonly matches: readonly SearchMatchView[]
}

interface WebSourceView {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
}

function contentDetails(content: readonly unknown[]): ToolDetail[] {
  return content.flatMap((block): ToolDetail[] => {
    if (typeof block !== 'object' || block === null) return [{ kind: 'plain', text: String(block) }]
    const value = block as Record<string, unknown>
    if ((value.type === 'text' || value.type === 'reasoning') && typeof value.text === 'string') {
      return value.text === '' ? [] : [{ kind: 'markdown', text: value.text }]
    }
    return [{ kind: 'plain', text: contentBlockText(block) }]
  })
}

function invocationCode(name: string, value: unknown): ToolDetail {
  const argumentsText = typeof value === 'object' && value !== null
    && !Array.isArray(value) && Object.keys(value).length === 0
    ? ''
    : jsonText(value)
  return { kind: 'code', text: `${name}(${argumentsText})`, language: 'typescript' }
}

function toolInvocationDetail(name: string, argsRaw: string): ToolDetail {
  try {
    return invocationCode(name, JSON.parse(argsRaw))
  } catch {
    return { kind: 'code', text: `${name}(${argsRaw})`, language: 'typescript' }
  }
}

function fallbackInvocationDetail(value: unknown): ToolDetail {
  return invocationCode('tool', value)
}

function terminalCommandDetail(value: unknown): ToolDetail | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const view = value as Readonly<Record<string, unknown>>
  if (view.card !== 'terminal' || typeof view.title !== 'string' || view.title === '') return undefined
  return { kind: 'code', text: `$ ${view.title}`, language: 'bash' }
}

function readInvocationFallback(node: ToolResultNode): ToolDetail | undefined {
  const result = node.resultView
  if (result?.card === 'read') return invocationCode('read', { file_path: String(result.path) })
  const call = node.callView
  if (call?.card !== 'generic' || call.kind !== 'read') return undefined
  const locations = Array.isArray(call.locations) ? call.locations as readonly unknown[] : []
  const location = locations.find((candidate): candidate is { readonly path: string } =>
    typeof candidate === 'object' && candidate !== null
    && 'path' in candidate && typeof candidate.path === 'string' && candidate.path !== '')
  return location === undefined ? undefined : invocationCode('read', { file_path: location.path })
}

function settledInvocationDetails(node: ToolResultNode, context: number): ToolDetail[] {
  const call = node.callView
  const details: ToolDetail[] = []
  if (call?.card === 'terminal') {
    const command = terminalCommandDetail(call)
    if (command !== undefined) details.push(command)
  } else if (call?.card === 'diff') {
    details.push({ kind: 'code', text: diffText(call.diffs, context), language: 'diff' })
  } else if (node.call !== null) {
    details.push(toolInvocationDetail(node.call.name, node.call.argsRaw))
  } else if (call?.card === 'generic' && call.rawInput !== undefined) {
    details.push(fallbackInvocationDetail(call.rawInput))
  }
  const readFallback = details.length === 0 ? readInvocationFallback(node) : undefined
  if (readFallback !== undefined) details.push(readFallback)
  return details
}

function viewDetails(node: ToolResultNode, context: number): ToolDetail[] {
  const result = node.resultView
  const details = settledInvocationDetails(node, context)
  if (result?.card === 'terminal') {
    if (result.output !== undefined) details.push({ kind: 'plain', text: result.output })
    if (result.exitCode !== undefined) details.push({
      kind: 'plain',
      text: ui(`退出码 ${result.exitCode}`, `Exit code ${result.exitCode}`),
    })
    if (result.signal !== undefined) details.push({
      kind: 'plain',
      text: ui(`信号 ${result.signal}`, `Signal ${result.signal}`),
    })
  } else if (result?.card === 'diff') {
    details.push({ kind: 'code', text: diffText(result.diffs, context), language: 'diff' })
  } else if (result?.card === 'generic' && result.content !== undefined) {
    details.push(...contentDetails(result.content))
  } else if (result?.card === 'read') {
    const lines = result.lines as readonly ReadLineView[]
    const path = String(result.path)
    const language = syntaxLanguageForPath(path, typeof result.lang === 'string' ? result.lang : undefined)
    const first = lines[0]?.number ?? Number(result.offset)
    const last = lines.at(-1)?.number ?? first
    details.push({
      kind: 'code',
      text: lines.map(line => line.text).join('\n'),
      ...(language === undefined ? {} : { language }),
      caption: `${path} · ${String(first)}–${String(last)} / ${String(result.totalLines)}`,
      lineNumbers: lines.map(line => line.number),
    })
  } else if (result?.card === 'search' && result.shape === 'matches') {
    const files = result.files as readonly SearchFileView[]
    for (const file of files) {
      const language = syntaxLanguageForPath(file.path)
      details.push({
        kind: 'code',
        text: file.matches.map(match => match.line).join('\n'),
        ...(language === undefined ? {} : { language }),
        caption: file.path,
        lineNumbers: file.matches.map(match => match.lineNumber),
      })
    }
    if (result.truncated) details.push({
      kind: 'plain',
      text: ui(`只显示部分结果 · 共 ${String(result.total)} 项`, `Partial results · ${String(result.total)} item(s) total`),
    })
  } else if (result?.card === 'search') {
    details.push({ kind: 'plain', text: result.paths.join('\n') })
    if (result.truncated) details.push({
      kind: 'plain',
      text: ui(`只显示部分结果 · 共 ${String(result.total)} 项`, `Partial results · ${String(result.total)} item(s) total`),
    })
  } else if (result?.card === 'web' && result.kind === 'search') {
    if (result.answer !== undefined) details.push({ kind: 'markdown', text: result.answer })
    const sources = result.sources as readonly WebSourceView[]
    details.push(...sources.map(source => ({
      kind: 'plain' as const,
      text: `${source.title ?? source.url}\n${source.url}${source.snippet === undefined ? '' : `\n${source.snippet}`}`,
    })))
    if (result.truncated) details.push({ kind: 'plain', text: ui('来源列表已截断', 'Source list truncated') })
  } else if (result?.card === 'web') {
    details.push({
      kind: 'plain',
      text: `${result.statusCode} · ${result.url}${result.truncated ? ui(' · 内容已截断', ' · content truncated') : ''}`,
    })
    details.push(...contentDetails(node.content))
  } else if (result?.card === 'generic') {
    details.push(...contentDetails(node.content))
  } else {
    details.push(...contentDetails(node.content))
  }
  if (node.meta !== undefined) {
    details.push({ kind: 'code', text: jsonText(node.meta), language: 'json', caption: ui('元数据', 'Metadata') })
  }
  return details.filter(value => value.text !== '')
}

function runningViewDetails(node: RunningToolCall, context: number): ToolDetail[] {
  const view = node.callView
  if (view?.card === 'terminal') {
    const command = terminalCommandDetail(view)
    return command === undefined ? [] : [command]
  }
  if (view?.card === 'diff') return [{ kind: 'code', text: diffText(view.diffs, context), language: 'diff' }]
  return [toolInvocationDetail(node.name, node.argsRaw)]
}

/** Flatten the same tool preview the transcript uses so approval overlays are not blind. */
export function toolApprovalPreview(
  call: RunningToolCall | undefined,
  context: number = DEFAULT_TUI_BEHAVIOR.diffContextLines,
): string {
  if (call === undefined) return ''
  return runningViewDetails(call, context).map(detail => detail.text).filter(text => text !== '').join('\n')
}

function foldDetail(detail: ToolDetail, limit: number): ToolDetail {
  const folded = foldLineBlock(detail.text, limit)
  return folded.omitted === 0 ? detail : { ...detail, text: folded.text }
}

function detailRow(detail: ToolDetail, depth: number): TranscriptRow {
  if (detail.kind === 'plain') return { format: 'plain', text: detail.text }
  if (detail.kind === 'markdown') return { format: 'markdown', text: detail.text }
  return {
    format: 'code',
    text: detail.text,
    ...(detail.language === undefined ? {} : { language: detail.language }),
    ...(detail.caption === undefined ? {} : { caption: detail.caption }),
    ...(detail.lineNumbers === undefined ? {} : { lineNumbers: detail.lineNumbers }),
    prefix: `${'  '.repeat(depth + 1)}⎿  `,
  }
}

function toolFocusMark(preferences: TranscriptPreferences, key: string | undefined): string {
  return key !== undefined && preferences.focusedTool === key ? color.accent('› ') : ''
}

function toolCardExpanded(preferences: TranscriptPreferences, key: string | undefined): boolean {
  if (preferences.tools === 'hidden') return false
  if (key !== undefined) {
    if (preferences.expandedTools.has(key)) return true
    if (preferences.collapsedTools.has(key)) return false
  }
  return preferences.tools === 'expanded'
}

function callKey(block: ToolCallBlock, fallback?: string): string | undefined {
  if ('callId' in block && typeof block.callId === 'string' && block.callId !== '') return block.callId
  return fallback
}

function toolBlockRows(
  block: ToolCallBlock,
  preferences: TranscriptPreferences,
  depth: number,
  cardKey?: string,
): TranscriptRow[] {
  const prefix = depth === 0 ? '◆ ' : `${'  '.repeat(depth)}↳ `
  const key = callKey(block, cardKey)
  const expanded = toolCardExpanded(preferences, key)
  if ('kind' in block) {
    const duration = block.callTime === null ? '' : ` · ${toolDurationText(Math.max(0, block.time - block.callTime))}`
    const failed = settledToolFailed(block)
    const details = expanded ? viewDetails(block, preferences.diffContextLines) : settledInvocationDetails(block, preferences.diffContextLines)
    return [
      {
        format: 'plain',
        text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block))}${failed ? ` · ${color.danger(ui('失败', 'Failed'))}` : ''}${duration}`,
        ...(depth === 0 && key !== undefined ? { toolKey: key } : {}),
      },
      ...details.map(detail => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
      ...block.subCalls.flatMap(child => toolBlockRows(child, preferences, depth + 1)),
    ]
  }
  const details = runningViewDetails(block, preferences.diffContextLines)
  return [
    {
      format: 'plain',
      text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block))}`,
      pulse: 'marker',
      liveDurationSince: block.time,
      ...(depth === 0 && key !== undefined ? { toolKey: key } : {}),
    },
    ...details.map(detail => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
    ...block.subCalls.flatMap(child => toolBlockRows(child, preferences, depth + 1)),
  ]
}

function toolBlockText(block: ToolCallBlock, preferences: TranscriptPreferences, depth: number): string {
  return toolBlockRows(block, preferences, depth).map(row => row.format === 'image'
    ? imageLabel(row.attachment)
    : row.text).join('\n')
}

function nodeText(node: ConversationNode, preferences: TranscriptPreferences): string {
  switch (node.kind) {
    case 'user':
      return `${color.brand('>')} ${contentText(node.content)}`
    case 'steering':
      return `${color.brand('>')} ${color.muted(ui('引导', 'Steering'))} ${contentText(node.content)}`
    case 'context':
      return `${color.muted(`${node.provenance.role === 'recall' ? ui('召回', 'Recall') : ui('上下文', 'Context')}${node.provenance.label === null ? '' : ` · ${node.provenance.label}`}${node.form === null ? ui(' · 未知格式', ' · unknown format') : ` · ${node.form}`}`)}\n${contentText(node.content)}`
    case 'assistant':
      return `${node.blocks.map((block: AssistantBlock) => assistantBlockText(block, preferences)).filter(Boolean).join('\n')}${node.interrupted === true ? color.warning(ui('\n已停止', '\nStopped')) : ''}`
    case 'command':
      return permissionCommandText(node) ?? planCommandText(node) ?? goalCommandText(node) ?? (node.outcome === null
        ? color.warning(ui(
          `命令 /${node.name ?? 'unknown'}${node.args ?? ''} · 执行中`,
          `Command /${node.name ?? 'unknown'}${node.args ?? ''} · running`,
        ))
        : `${node.outcome.kind === 'success' ? color.success(ui('命令完成', 'Command completed')) : color.danger(ui('命令失败', 'Command failed'))} /${node.name ?? 'unknown'}${node.args ?? ''}${node.outcome.text === undefined ? '' : `\n${node.outcome.text}`}`)
    case 'tool-result':
      return preferences.tools === 'hidden' ? '' : toolBlockText(node, preferences, 0)
    case 'compaction':
      return color.muted(ui(
        `上下文已压缩${node.shadowedItemCount === null ? '' : ` · ${node.shadowedItemCount} 项`}${node.shadowedTokenCount === null ? '' : ` · 约 ${node.shadowedTokenCount} Token`}${node.summary === null ? '' : `\n${node.summary}`}`,
        `Context compacted${node.shadowedItemCount === null ? '' : ` · ${node.shadowedItemCount} item(s)`}${node.shadowedTokenCount === null ? '' : ` · about ${node.shadowedTokenCount} tokens`}${node.summary === null ? '' : `\n${node.summary}`}`,
      ))
    case 'model-retry':
      return color.warning(ui(
        `模型请求${node.retryState === 'scheduled' ? '等待重试' : node.retryState === 'started' ? '正在重试' : '重试已取消'} · ${node.provider} · 第 ${node.retry} 次${node.mode === 'normal' ? `/${node.maxRetries}` : ''} · ${node.delayMs} ms`,
        `Model request ${node.retryState === 'scheduled' ? 'waiting to retry' : node.retryState === 'started' ? 'retrying' : 'retry cancelled'} · ${node.provider} · attempt ${node.retry}${node.mode === 'normal' ? `/${node.maxRetries}` : ''} · ${node.delayMs} ms`,
      ))
    case 'turn-error':
      return color.danger(ui(
        `本轮执行失败${node.code === undefined ? '' : ` [${node.code}]`}\n${node.message}`,
        `Turn failed${node.code === undefined ? '' : ` [${node.code}]`}\n${node.message}`,
      ))
    case 'turn-max-tokens':
      return color.warning(ui('本轮已达到最大 Token 数', 'This turn reached the token limit'))
    case 'unknown':
      return color.muted(ui(`未知事件 ${node.type} · /trajectory 查看详情`, `Unknown event ${node.type} · use /trajectory for details`))
    default:
      return color.muted(ui('未知会话事件 · /trajectory 查看详情', 'Unknown session event · use /trajectory for details'))
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
    case 'running': return ui('运行中', 'Running')
    case 'completed': return ui('已完成', 'Completed')
    case 'failed': return ui('失败', 'Failed')
    case 'cancelled': return ui('已取消', 'Cancelled')
    case 'interrupted': return ui('已中断', 'Interrupted')
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
  if (safe === '') return ui(`成员 ${member.seq}`, `Member ${member.seq}`)
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
      : escapeTerminalText(phase.phase.trim()) || ui('未命名阶段', 'Unnamed phase')
    const members = phase.members.map((member: WorkflowRunMemberData) =>
      `    ${workflowStatusText(member.status)} · ${workflowMemberLabel(member)}`)
    return phaseLabel === undefined ? members.map(row => row.slice(2)) : [`  ${color.muted(phaseLabel)}`, ...members]
  })
  const name = escapeTerminalText(workflow.name)
  return `${color.accent(ui(`工作流 · ${name}`, `Workflow · ${name}`))} · ${workflowStatusText(workflow.status)}${rows.length === 0 ? '' : `\n${rows.join('\n')}`}`
}

function deliverablesText(node: ChatConversationViewNode, data: unknown): string {
  if (!isConversationNode(data) || data.kind !== 'assistant') return ''
  const location = node.location
  if (location.kind !== 'turn' && location.kind !== 'step') return ''
  const produced = producedForClosing(
    location.turn.data.get('deliverables'),
    data.seq,
  )
  return produced.length === 0
    ? ''
    : `\n${color.success(ui(`生成文件 · ${produced.join(' · ')}`, `Produced files · ${produced.join(' · ')}`))}`
}

function grouped(rows: readonly TranscriptRow[]): TranscriptRow[] {
  return rows.map((row, index) => index === 0 ? { ...row, gapBefore: true } : row)
}

function deliverablesFingerprint(node: ChatConversationViewNode): readonly string[] {
  if (!isConversationNode(node.data) || node.data.kind !== 'assistant') return []
  const location = node.location
  if (location.kind !== 'turn' && location.kind !== 'step') return []
  return producedForClosing(location.turn.data.get('deliverables'), node.data.seq)
}

function nodeFingerprint(
  node: ChatConversationViewNode,
  preferences: TranscriptPreferences,
): string {
  return JSON.stringify({
    kind: node.kind,
    data: node.data,
    deliverables: deliverablesFingerprint(node),
    tools: preferences.tools,
    reasoning: preferences.reasoning,
    toolOutputLineLimit: preferences.toolOutputLineLimit,
    diffContextLines: preferences.diffContextLines,
    expanded: preferences.expandedTools.has(node.key),
    collapsed: preferences.collapsedTools.has(node.key),
    focusedTool: preferences.focusedTool,
  })
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

function toolDurationText(milliseconds: number): string {
  if (milliseconds <= 0) return '<1ms'
  if (milliseconds < 1_000) return `${String(Math.round(milliseconds))}ms`
  return durationText(milliseconds)
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
  if (steps !== undefined && steps > 0) groups.push(ui(`1 轮 · ${tokenText(steps)} 步`, `1 turn · ${tokenText(steps)} steps`))

  const llmMs = nonnegativeNumber(statistics?.llmMs)
  const toolMs = nonnegativeNumber(statistics?.toolMs)
  const durations = [
    ...(llmMs === undefined || llmMs === 0 ? [] : [`LLM ${durationText(llmMs)}`]),
    ...(toolMs === undefined || toolMs === 0 ? [] : [ui(`工具调用 ${durationText(toolMs)}`, `Tools ${durationText(toolMs)}`)]),
  ]
  if (durations.length > 0) groups.push(durations.join(' · '))

  const ttftMs = nonnegativeNumber(statistics?.ttftMs)
  const ttftSteps = nonnegativeNumber(statistics?.ttftSteps)
  const decodeMs = nonnegativeNumber(statistics?.decodeMs)
  const decodeTokens = nonnegativeNumber(statistics?.decodeTokens)
  const performance = [
    ...(ttftMs === undefined || ttftSteps === undefined || ttftSteps === 0
      ? []
      : [ui(`首 token 平均 ${durationText(ttftMs / ttftSteps)}`, `Average first token ${durationText(ttftMs / ttftSteps)}`)]),
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
    if (input > 0) groups.push(ui(
      `缓存命中 ${String(Math.round(cacheRead / input * 100))}%`,
      `Cache hit ${String(Math.round(cacheRead / input * 100))}%`,
    ))
    if (input > 0 || output > 0) groups.push(ui(
      `输入 ${tokenText(input)} tok · 输出 ${tokenText(output)} tok`,
      `Input ${tokenText(input)} tok · output ${tokenText(output)} tok`,
    ))
  }
  if (groups.length > 0) return color.muted(groups.join('  |  '))

  const legacy = [
    ...nonnegativeNumber(value.ttftMs) === undefined
      ? []
      : [ui(`首 token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`, `First token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`)],
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
  if (step.status === 'interrupted') rows.push({ format: 'plain', text: color.warning(ui('已停止', 'Stopped')) })
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
    return grouped([{ format: 'plain', text: color.muted(ui('◆ 后台任务已结束', '◆ Background job finished')) }])
  }
  if (node.provenance.role === 'recall') {
    const source = node.provenance.label === null ? '' : ` · ${node.provenance.label}`
    return grouped([{
      format: 'plain',
      text: color.muted(ui(`跨会话召回${source} · /trajectory 查看`, `Cross-session recall${source} · view with /trajectory`)),
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
      text: color.muted(ui('◆ 子 Agent 已结束', '◆ Subagent finished')),
      userTurn: true,
    }])
  }
  if (node.source.kind !== 'subagent-report') return undefined
  return grouped([
    { format: 'plain', text: `${color.brand('>')} ${color.muted(ui('子 Agent 报告', 'Subagent report'))}`, userTurn: true },
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
    return data === undefined ? [] : grouped(toolBlockRows(data.root, preferences, 0, node.key))
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
      if (node.data.interrupted === true) rows.push({ format: 'plain', text: color.warning(ui('已停止', 'Stopped')) })
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
    text: color.muted(ui(`扩展节点 ${node.kind} · /trajectory 查看详情`, `Extended node ${node.kind} · use /trajectory for details`)),
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
  private snapshot: ConversationSnapshot | undefined
  private emptyMessage: string | undefined
  private sessionId: string | undefined
  private toolVisibility: ToolVisibility = 'collapsed'
  private reasoningVisible = false
  private toolOutputLineLimit = DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit
  private diffContextLines = DEFAULT_TUI_BEHAVIOR.diffContextLines
  private emptyState = true
  private hasMore = false
  private loadingOlder = false
  private scrollOffset = 0
  private renderedLineCount = 0
  private turnAnchors: readonly number[] = []
  private turnCursor: number | undefined
  private pulseFrame = 0
  private pulseTimer: ReturnType<typeof setInterval> | undefined
  private lastFullLines: readonly string[] = []
  private search: { query: string; composing: boolean; matchIndex: number } | undefined
  private exampleCursor = 0
  private toolCursor = 0
  private toolFocus = false
  private readonly expandedTools = new Set<string>()
  private readonly collapsedTools = new Set<string>()
  private readonly nodeCache = new Map<string, {
    fingerprint: string
    rows: TranscriptRow[]
    components: Component[]
  }>()
  private readonly lineCache = new WeakMap<Component, { width: number; lines: readonly string[] }>()
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

  /**
   * Restore the Settings-owned startup presentation without mutating the Harness log.
   * @param tools - default tool-card shape.
   * @param reasoning - whether reasoning blocks are visible at session open.
   */
  applyPresentationDefaults(
    tools: ToolVisibility,
    reasoning: boolean,
    toolOutputLineLimit = DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit,
    diffContextLines = DEFAULT_TUI_BEHAVIOR.diffContextLines,
  ): void {
    this.toolVisibility = tools
    this.reasoningVisible = reasoning
    this.toolOutputLineLimit = toolOutputLineLimit
    this.diffContextLines = diffContextLines
  }

  /** Follow new transcript output after the user submits from a historical viewport. */
  followLatest(): void {
    this.turnCursor = undefined
    this.scrollOffset = 0
    this.requestRender()
  }

  /**
   * Report whether the transcript is showing non-durable empty-session guidance.
   * @returns true while the conversation has no visible durable content.
   */
  isEmptyState(): boolean {
    return this.emptyState
  }

  /**
   * Replace the transcript with non-durable empty-selection guidance.
   * @param message - guidance rendered when no Session is active.
   */
  empty(message?: string): void {
    this.imageGeneration += 1
    this.imageLoader = undefined
    this.snapshot = undefined
    this.emptyMessage = message
    this.sessionId = undefined
    this.pendingImages.clear()
    this.imageComponents.clear()
    this.nodeCache.clear()
    this.emptyState = true
    this.hasMore = false
    this.loadingOlder = false
    this.replace([{ format: 'plain', text: color.muted(this.emptyCopy()) }])
  }

  private emptyCopy(): string {
    return this.emptyMessage === undefined
      ? ui('在下方输入消息，或用 /help 查看命令。', 'Enter a message below, or use /help to view commands.')
      : translateUiText(this.emptyMessage)
  }

  /**
   * Replace the rendered snapshot after a Harness observable notification.
   * @param snapshot - authoritative Session conversation projection.
   * @param imageLoader - authenticated reader for references in this Session.
   */
  update(snapshot: ConversationSnapshot, imageLoader?: TranscriptImageLoader): void {
    this.snapshot = snapshot
    const sessionId = String(snapshot.sessionId)
    if (sessionId !== this.sessionId) {
      this.imageGeneration += 1
      this.pendingImages.clear()
      this.imageComponents.clear()
      this.sessionId = sessionId
      this.expandedTools.clear()
      this.collapsedTools.clear()
      this.toolCursor = 0
      this.nodeCache.clear()
    }
    this.imageLoader = imageLoader
    this.hasMore = snapshot.hasMore
    this.loadingOlder = snapshot.loadingOlder
    const preferences: TranscriptPreferences = {
      tools: this.toolVisibility,
      reasoning: this.reasoningVisible,
      toolOutputLineLimit: this.toolOutputLineLimit,
      diffContextLines: this.diffContextLines,
      expandedTools: this.expandedTools,
      collapsedTools: this.collapsedTools,
      ...(this.toolFocus ? { focusedTool: this.toolKeys()[this.toolCursor] } : {}),
    }
    const visibleNodes = snapshot.chat.order.flatMap((key) => {
      const node = snapshot.chat.nodes.get(key)
      return node === undefined || node.visibility !== 'visible' ? [] : [node]
    })
    const rows: TranscriptRow[] = []
    const components: Component[] = []
    const keep = new Set<string>()
    const take = (key: string, fingerprint: string, build: () => TranscriptRow[]): void => {
      keep.add(key)
      const hit = this.nodeCache.get(key)
      if (hit !== undefined && hit.fingerprint === fingerprint) {
        rows.push(...hit.rows)
        components.push(...hit.components)
        return
      }
      const built = build()
      const created = built.map(row => this.component(row))
      this.nodeCache.set(key, { fingerprint, rows: built, components: created })
      rows.push(...built)
      components.push(...created)
    }
    for (const node of visibleNodes) {
      take(node.key, nodeFingerprint(node, preferences), () => chatNodeRows(node, preferences))
    }
    if (snapshot.partial !== null && !visibleNodes.some(node => node.kind === 'assistant-step')) {
      const partial = snapshot.partial
      take('__partial__', JSON.stringify({
        partial,
        tools: preferences.tools,
        reasoning: preferences.reasoning,
        toolOutputLineLimit: preferences.toolOutputLineLimit,
        diffContextLines: preferences.diffContextLines,
      }), () => {
        const partialRows = partial.blocks.flatMap(block => assistantBlockRows(block, preferences))
        return grouped([
          ...(partialRows.length === 0 ? [thinkingRow()] : []),
          ...partialRows,
        ])
      })
    }
    if (preferences.tools !== 'hidden' && !visibleNodes.some(node => node.kind === 'tool-call')) {
      for (const call of snapshot.runningCalls) {
        take(`__running__:${call.callId}`, JSON.stringify({
          call,
          tools: preferences.tools,
          reasoning: preferences.reasoning,
          toolOutputLineLimit: preferences.toolOutputLineLimit,
          diffContextLines: preferences.diffContextLines,
          expanded: preferences.expandedTools.has(call.callId),
          collapsed: preferences.collapsedTools.has(call.callId),
        }), () => grouped(toolBlockRows(call, preferences, 0, call.callId)))
      }
    }
    this.emptyState = rows.length === 0
    if (this.emptyState) {
      take('__empty__', JSON.stringify({
        cursor: this.exampleCursor,
        session: this.sessionId,
      }), () => this.emptySessionRows())
    }
    for (const key of [...this.nodeCache.keys()]) {
      if (!keep.has(key)) this.nodeCache.delete(key)
    }
    this.commit(rows, components)
    const keys = this.toolKeys()
    if (this.toolCursor >= keys.length) this.toolCursor = Math.max(0, keys.length - 1)
  }

  /**
   * Submit the focused empty-session example when the transcript has browse focus.
   * @returns the prompt to send, or undefined when Enter has no local action.
   */
  activateFocused(): TranscriptFocusAction | undefined {
    if (this.emptyState && this.snapshot !== undefined) {
      const example = EMPTY_SESSION_EXAMPLES[this.exampleCursor]
      return example === undefined ? undefined : { kind: 'example', text: emptyExampleText(example) }
    }
    if (!this.toolFocus) {
      this.enterToolFocus()
      return undefined
    }
    const key = this.toolKeys()[this.toolCursor]
    if (key === undefined || this.snapshot === undefined) return undefined
    this.toggleToolCard(key)
    this.update(this.snapshot, this.imageLoader)
    return { kind: 'tool', key }
  }

  /**
   * Enter tool-card focus so ↑↓ move among cards instead of scrolling.
   * @returns true when at least one tool card can be focused.
   */
  enterToolFocus(): boolean {
    const keys = this.toolKeys()
    if (keys.length === 0 || this.snapshot === undefined) return false
    this.toolFocus = true
    this.toolCursor = Math.min(this.toolCursor, keys.length - 1)
    this.update(this.snapshot, this.imageLoader)
    this.requestRender()
    return true
  }

  /**
   * Leave tool-card focus and restore ordinary transcript scrolling.
   * @returns true when focus mode was active.
   */
  exitToolFocus(): boolean {
    if (!this.toolFocus) return false
    this.toolFocus = false
    if (this.snapshot !== undefined) this.update(this.snapshot, this.imageLoader)
    this.requestRender()
    return true
  }

  /**
   * Rebuild colorized rows after a live theme or lazy grammar change.
   * The current viewport and durable turn cursor remain unchanged.
   */
  refreshPresentation(): void {
    const scrollOffset = this.scrollOffset
    const turnCursor = this.turnCursor
    const snapshot = this.snapshot
    this.nodeCache.clear()
    if (snapshot === undefined) {
      this.replace([{ format: 'plain', text: color.muted(this.emptyCopy()) }])
    } else {
      this.update(snapshot, this.imageLoader)
    }
    this.scrollOffset = scrollOffset
    this.turnCursor = turnCursor
    this.requestRender()
  }

  invalidate(): void {
    for (const [index, component] of this.components.entries()) {
      const row = this.rows[index]
      if (row?.pulse !== undefined || row?.liveDurationSince !== undefined) component.invalidate()
    }
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
    const totalRows = Math.max(1, Math.floor(this.viewportRows()))
    const withInset = (values: readonly string[]): string[] => {
      const body = values.map(line => line === '' ? '' : `${' '.repeat(inset)}${line}`)
      if (this.search === undefined) return body
      const label = `${' '.repeat(inset)}${color.accent(this.searchLabel())}`
      if (!Number.isFinite(totalRows)) return [...body, label]
      return [...body.slice(0, Math.max(0, totalRows - 1)), label]
    }
    const olderMarker = (count: number): string => {
      if (this.loadingOlder) return color.muted(ui('↑ 正在加载更早内容…', '↑ Loading older content…'))
      const hint = this.focused ? 'PgUp/Home' : ui('滚轮上翻', 'Scroll up')
      return color.muted(count === 0
        ? ui(`↑ 还有更早内容 · ${hint}`, `↑ Older content available · ${hint}`)
        : ui(`↑ ${String(count)} 行更早内容 · ${hint}`, `↑ ${String(count)} older line(s) · ${hint}`))
    }
    const lines: string[] = []
    const anchors: number[] = []
    for (const [index, component] of this.components.entries()) {
      if (lines.length > 0 && this.rows[index]?.gapBefore === true) lines.push('')
      if (this.rows[index]?.userTurn === true) {
        anchors.push(lines.length)
      }
      const row = this.rows[index]
      const pulsing = row?.pulse !== undefined || row?.liveDurationSince !== undefined
      const cached = pulsing ? undefined : this.lineCache.get(component)
      const rendered = cached !== undefined && cached.width === contentWidth
        ? cached.lines
        : (() => {
          internals.componentRenders += 1
          const lines = component.render(contentWidth)
          if (!pulsing) this.lineCache.set(component, { width: contentWidth, lines })
          return lines
        })()
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
    this.lastFullLines = [...lines]
    this.renderedLineCount = lines.length
    this.turnAnchors = anchors
    if (this.search !== undefined) {
      const plan = planLineSearch(lines, this.search.query)
      if (this.search.matchIndex >= plan.matches.length) this.search.matchIndex = 0
      const current = plan.matches[this.search.matchIndex]
      const query = this.search.query
      if (query.trim() !== '') {
        for (const [index, line] of lines.entries()) {
          if (!plan.hit.has(index)) continue
          lines[index] = highlightQuery(line, query, matched =>
            index === current ? `\u001B[7m${matched}\u001B[0m` : color.accent(matched))
        }
      }
    }
    const rows = this.search !== undefined && Number.isFinite(totalRows)
      ? Math.max(1, totalRows - 1)
      : totalRows
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
    if (this.emptyState) {
      const example = EMPTY_SESSION_EXAMPLES[this.exampleCursor]
      const needle = example === undefined ? undefined : emptyExampleText(example)
      const selected = needle === undefined
        ? -1
        : lines.findIndex(line => line.includes(needle))
      this.scrollOffset = scrollOffsetToContain(
        lines.length,
        rows,
        selected === -1 ? 0 : selected,
      )
    } else {
      this.scrollOffset = Math.min(this.scrollOffset, maxOffset)
    }
    const end = lines.length - this.scrollOffset
    const start = Math.max(0, end - rows)
    if (!this.emptyState && this.scrollOffset === 0 && start > 0) {
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
    if (!this.emptyState) {
      if (start > 0 && visible.length > 0) {
        visible[0] = olderMarker(start)
      } else if (this.hasMore && visible.length > 0) {
        visible[0] = olderMarker(0)
      }
      if (end < lines.length && visible.length > 0) {
        const hint = this.focused ? 'PgDn/End' : ui('滚轮下翻', 'Scroll down')
        visible[visible.length - 1] = color.muted(ui(
          `↓ ${String(lines.length - end)} 行更新内容 · ${hint}`,
          `↓ ${String(lines.length - end)} newer line(s) · ${hint}`,
        ))
      }
    }
    return withInset(visible)
  }

  handleInput(data: string): void {
    if (this.search !== undefined) {
      this.handleSearchInput(data)
      return
    }
    if (data === '/') {
      this.search = { query: '', composing: true, matchIndex: 0 }
      this.requestRender()
      return
    }
    if (this.emptyState && this.snapshot !== undefined) {
      if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
        const delta = matchesKey(data, Key.up) ? -1 : 1
        const next = this.exampleCursor + delta
        if (next >= 0 && next < EMPTY_SESSION_EXAMPLES.length) {
          this.exampleCursor = next
          this.replace(this.emptySessionRows())
          this.requestRender()
        }
        return
      }
    }
    if (this.toolFocus && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
      const keys = this.toolKeys()
      const delta = matchesKey(data, Key.up) ? -1 : 1
      const next = this.toolCursor + delta
      if (next >= 0 && next < keys.length) {
        this.toolCursor = next
        if (this.snapshot !== undefined) this.update(this.snapshot, this.imageLoader)
        this.requestRender()
      }
      return
    }
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
   * Leave incremental search and restore the ordinary transcript chrome.
   * @returns true when a search session was closed.
   */
  cancelSearch(): boolean {
    if (this.search === undefined) return false
    this.search = undefined
    this.requestRender()
    return true
  }

  private searchLabel(): string {
    const query = this.search?.query ?? ''
    const matches = findLineMatches(this.lastFullLines, query)
    if (query.trim() === '') return ui('查找：', 'Find:')
    if (matches.length === 0) {
      return ui(`查找 ${query} · 无匹配 · Esc 取消`, `Find ${query} · no matches · Esc cancel`)
    }
    if (this.search?.composing === true) {
      return ui(
        `查找 ${query} · ${String(matches.length)} 处 · Enter 确认 · Esc 取消`,
        `Find ${query} · ${String(matches.length)} match(es) · Enter confirm · Esc cancel`,
      )
    }
    const current = Math.min((this.search?.matchIndex ?? 0) + 1, matches.length)
    return ui(
      `查找 ${query} · ${String(current)}/${String(matches.length)} · n 下一个 · N 上一个 · Esc 取消`,
      `Find ${query} · ${String(current)}/${String(matches.length)} · n next · N previous · Esc cancel`,
    )
  }

  private handleSearchInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.cancelSearch()
      return
    }
    if (matchesKey(data, Key.enter) || data === '\r' || data === '\n') {
      if ((this.search?.query.trim() ?? '') === '') this.cancelSearch()
      else {
        this.search = { ...this.search!, composing: false }
        this.revealCurrentMatch()
        this.requestRender()
      }
      return
    }
    if (data === '\x7f' || data === '\b') {
      const chars = Array.from(this.search?.query ?? '')
      chars.pop()
      this.search = { query: chars.join(''), composing: true, matchIndex: 0 }
      this.revealCurrentMatch()
      this.requestRender()
      return
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)
      || matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)
      || matchesKey(data, Key.home) || matchesKey(data, Key.end)) {
      this.turnCursor = undefined
      const rows = Math.max(1, Math.floor(this.viewportRows()))
      const maxOffset = Math.max(0, this.renderedLineCount - rows)
      if (matchesKey(data, Key.up)) this.scrollBy(1)
      else if (matchesKey(data, Key.down)) this.scrollBy(-1)
      else if (matchesKey(data, Key.pageUp)) this.scrollBy(Math.max(1, rows - 1))
      else if (matchesKey(data, Key.pageDown)) this.scrollBy(-Math.max(1, rows - 1))
      else if (matchesKey(data, Key.home)) this.scrollBy(maxOffset)
      else this.scrollBy(-this.scrollOffset)
      return
    }
    if (this.search?.composing === false) {
      if (data === 'n') {
        this.stepSearch(1)
        return
      }
      if (data === 'N') {
        this.stepSearch(-1)
        return
      }
      if (data === '/') {
        this.search = { query: '', composing: true, matchIndex: 0 }
        this.requestRender()
        return
      }
    }
    if (data.includes('\u001B') || [...data].some(character => character < ' ')) return
    this.search = {
      query: `${this.search?.query ?? ''}${data}`,
      composing: true,
      matchIndex: 0,
    }
    this.revealCurrentMatch()
    this.requestRender()
  }

  private stepSearch(direction: 1 | -1): void {
    if (this.search === undefined) return
    const matches = findLineMatches(this.lastFullLines, this.search.query)
    const current = matches[this.search.matchIndex] ?? -1
    const next = nextMatchIndex(matches, current, direction)
    if (next < 0) return
    this.search = { ...this.search, matchIndex: Math.max(0, matches.indexOf(next)) }
    this.revealCurrentMatch()
    this.requestRender()
  }

  private revealCurrentMatch(): void {
    if (this.search === undefined) return
    const matches = findLineMatches(this.lastFullLines, this.search.query)
    const lineIndex = matches[this.search.matchIndex]
    if (lineIndex === undefined) return
    this.scrollOffset = scrollOffsetToReveal(
      this.lastFullLines.length,
      this.viewportRows(),
      lineIndex,
    )
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

  private toolKeys(): readonly string[] {
    return [...new Set(this.rows.flatMap(row => row.toolKey === undefined ? [] : [row.toolKey]))]
  }

  private toggleToolCard(key: string): void {
    const expanded = toolCardExpanded({
      tools: this.toolVisibility,
      reasoning: this.reasoningVisible,
      toolOutputLineLimit: this.toolOutputLineLimit,
      diffContextLines: this.diffContextLines,
      expandedTools: this.expandedTools,
      collapsedTools: this.collapsedTools,
    }, key)
    if (expanded) {
      this.expandedTools.delete(key)
      if (this.toolVisibility === 'expanded') this.collapsedTools.add(key)
    } else {
      this.collapsedTools.delete(key)
      this.expandedTools.add(key)
    }
  }

  private emptySessionRows(): TranscriptRow[] {
    this.exampleCursor = Math.max(0, Math.min(this.exampleCursor, EMPTY_SESSION_EXAMPLES.length - 1))
    return [
      {
        format: 'plain',
        text: `${color.brand('deepseek')}\n${color.muted(ui('探索未至之境', 'Explore beyond the known'))}\n${color.muted(ui('直接描述你想完成的事', 'Describe what you want to accomplish'))}`,
      },
      {
        format: 'plain',
        text: color.muted(ui('试试这些，Tab 后回车发送：', 'Try one of these; Tab then Enter to send:')),
        gapBefore: true,
      },
      ...EMPTY_SESSION_EXAMPLES.map((example, index) => ({
        format: 'plain' as const,
        text: `${index === this.exampleCursor ? color.accent('› ') : '  '}${emptyExampleText(example)}`,
        exampleId: example.id,
      })),
    ]
  }

  private replace(rows: readonly TranscriptRow[]): void {
    this.commit(rows, rows.map(row => this.component(row)))
  }

  private commit(rows: readonly TranscriptRow[], components: readonly Component[]): void {
    this.rows = rows
    this.turnCursor = undefined
    this.components = [...components]
    this.syncPulseAnimation(rows.some(row => row.liveDurationSince !== undefined
      || (row.pulse !== undefined && terminalColorLevel() !== 0)))
  }

  private component(row: TranscriptRow): Component {
    if (row.format === 'markdown') {
      internals.markdownCreated += 1
      return new Markdown(escapeTerminalText(row.text), 0, 0, markdownTheme)
    }
    if (row.format === 'plain') {
      return row.pulse === undefined
        ? new Text(escapeTerminalText(row.text), 0, 0)
        : new PulsingRow(row.text, row.pulse, () => this.pulseFrame, row.liveDurationSince)
    }
    if (row.format === 'code') return new CodeRow(row)
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
        color.danger(ui(
          `${imageLabel(row.attachment)} · 读取失败：${message}`,
          `${imageLabel(row.attachment)} · failed to load: ${message}`,
        )),
        0,
        0,
      ))
    }).finally(() => {
      if (generation !== this.imageGeneration) return
      this.pendingImages.delete(cacheKey)
      const image = this.imageComponents.get(cacheKey)
      if (image === undefined) {
        this.requestRender()
        return
      }
      this.components = this.rows.map((current, index) =>
        current.format === 'image' && `${this.sessionId ?? 'none'}:${current.key}` === cacheKey
          ? image
          : this.components[index] ?? this.component(current))
      for (const entry of this.nodeCache.values()) {
        for (const [index, current] of entry.rows.entries()) {
          if (current.format === 'image' && `${this.sessionId ?? 'none'}:${current.key}` === cacheKey) {
            entry.components[index] = image
          }
        }
      }
      this.requestRender()
    })
    return fallback
  }

  private syncPulseAnimation(active: boolean): void {
    if (!active) {
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
