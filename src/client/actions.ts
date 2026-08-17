/** Product command and pending-interaction orchestration for the TUI Surface. */

import { visibleWidth } from '@mariozechner/pi-tui'
import {
  LOCALE_SETTINGS_NAMESPACE,
  type LocaleId,
} from '@deepseek-ai/dsh-client-locale'
import type {
  QuestionResponsePayload, SessionId, WorkspaceId, WorkspaceView,
} from '@deepseek-ai/dsh-api-remotes/node-client'
import type {
  ConversationSnapshot,
  PendingInteraction,
  PendingWait,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TuiSettingsConflictError,
  type TuiAppearanceSettings,
  type TuiCodeThemeId,
  type TuiCustomTheme,
  type TuiThemeId,
} from '@deepseek-ai/dsh-tui-protocol'
import { capabilityError, HarnessTuiCapabilities, type TuiCommandCandidate, type TuiModelOption, type TuiPermissionOption, type TuiToolOption } from './capabilities.ts'
import { lastFencedCode } from './copy-content.ts'
import { formatByteSize } from './byte-size.ts'
import { isStoppableJob, jobElapsedMs, jobKillNotice } from './job-control.ts'
import { moveIndex } from './queue-order.ts'
import { relativeTime, sortSessionsByUpdatedAt } from './relative-time.ts'
import type {
  TuiMarketplaceCandidate,
  TuiMarketplaceSource,
  TuiPluginEntry,
  TuiPluginOperation,
  TuiProfileSummary,
  TuiSettingsDocument,
  TuiSettingsPathOp,
} from './management.ts'
import type {
  OverlayChoice,
  OverlayNavigation,
  OverlayPrompts,
  SelectOverlayRequest,
} from './overlays.ts'
import { OverlayQueue } from './overlays.ts'
import {
  formatSettingsValue,
  parseSettingsValue,
  settingsFields,
  settingsSectionLabel,
  type TuiSettingsField,
} from './settings.ts'
import type { Transcript } from './transcript.ts'
import {
  appearanceFromSettings,
  appearanceSettings,
  deleteCustomTheme,
  saveCodeTheme,
  saveCustomTheme,
  saveTheme,
  themeFromAppearance,
} from './appearance.ts'
import {
  composeResolvedTheme,
  editableTheme,
  generateThemeCandidates,
  normalizeCustomTheme,
  normalizeThemeColor,
  resolveCodeTheme,
  resolveTheme,
  themeContrastWarnings,
  themeIdFromName,
  type ResolvedTuiTheme,
} from './theme-config.ts'
import { convertVsCodeTheme, loadVsCodeThemeFile } from './theme-import.ts'
import {
  languageSelection,
  localeFromSettings,
  localeSettings,
  saveLanguage,
  translateUiText,
  ui,
  type TuiLanguageSelection,
} from './locale.ts'
import {
  background,
  color,
  highlightCodeLines,
  markdownTheme,
} from './theme.ts'

/** Surface callbacks kept separate from Harness business actions. */
export interface TuiActionHost {
  readonly overlays: OverlayQueue
  readonly transcript: Transcript
  notice(message: string, tone?: 'info' | 'success' | 'warning' | 'error'): void
  refresh(): void
  refreshHeader(): void
  applyTheme(theme: ResolvedTuiTheme): void
  applyLocale(locale: LocaleId): void
  setEditor(text: string): void
  copy(text: string): void
  close(code: number): void
  restart(profile: string, notice: string): void
  requireRestart(message: string): void
}

function idOf(value: string): SessionId {
  return value as SessionId
}

function workspaceIdOf(value: string): WorkspaceId {
  return value as WorkspaceId
}

function currentMark(current: boolean): string {
  return current ? ui('当前 · ', 'Current · ') : ''
}

function permissionDescription(option: TuiPermissionOption): string {
  switch (option.id) {
    case 'read-only': return ui('只能读取文件，不能修改工作区', 'Can read files but cannot modify the workspace')
    case 'workspace-write': return ui('可以修改当前工作区内的文件', 'Can modify files inside the current workspace')
    case 'danger-full-access': return ui('可以访问工作区外文件，并运行不受工作区限制的命令', 'Can access files outside the workspace and run unrestricted commands')
    default: return option.description ?? ui('此权限没有详细说明，请按高风险权限处理', 'No details are available; treat this as a high-risk permission')
  }
}

function permissionLabel(option: TuiPermissionOption): string {
  switch (option.id) {
    case 'read-only': return ui('只读', 'Read only')
    case 'workspace-write': return ui('工作区', 'Workspace')
    case 'danger-full-access': return ui('完全访问', 'Full access')
    default: return option.label
  }
}

function queuePlacementLabel(
  placement: ConversationSnapshot['queue'][number]['placement'],
): string {
  switch (placement) {
    case 'queued': return ui('等待下一轮', 'Waiting for the next turn')
    case 'steering': return ui('正在引导当前轮次', 'Steering the current turn')
    case 'context': return ui('正在并入上下文', 'Being merged into context')
  }
}

function commandParts(args: string): { command: string; rest: string } {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  return match === null
    ? { command: '', rest: '' }
    : { command: (match[1] ?? '').toLowerCase(), rest: match[2]?.trim() ?? '' }
}

function argumentPair(args: string): { first: string; rest: string } {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  return match === null
    ? { first: '', rest: '' }
    : { first: match[1] ?? '', rest: match[2]?.trim() ?? '' }
}

function commandArguments(args: string): readonly string[] {
  const values: string[] = []
  let current = ''
  let started = false
  let quote: "'" | '"' | undefined
  for (let index = 0; index < args.length; index += 1) {
    const character = args[index] ?? ''
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined
      } else if (character === '\\' && quote === '"' && index + 1 < args.length) {
        index += 1
        current += args[index] ?? ''
      } else {
        current += character
      }
      started = true
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      started = true
    } else if (/\s/u.test(character)) {
      if (started) {
        values.push(current)
        current = ''
        started = false
      }
    } else if (character === '\\' && index + 1 < args.length) {
      index += 1
      current += args[index] ?? ''
      started = true
    } else {
      current += character
      started = true
    }
  }
  if (quote !== undefined) throw new Error(ui('命令参数的引号没有闭合', 'A quoted command argument is not closed'))
  if (started) values.push(current)
  return values
}

const THEME_UI_FIELDS: Readonly<Record<keyof TuiCustomTheme['colors'], string>> = {
  canvas: '画布背景',
  surface: '面板与输入框背景',
  selection: '选择背景',
  text: '正文',
  muted: '弱化文字',
  border: '边框',
  brand: '品牌色',
  accent: '强调色',
  success: '成功',
  warning: '警告',
  danger: '错误',
}

const THEME_SYNTAX_FIELDS: Readonly<Record<keyof TuiCustomTheme['syntax'], string>> = {
  background: '代码背景',
  foreground: '代码正文',
  comment: '注释',
  keyword: '关键字',
  string: '字符串',
  number: '数字',
  constant: '常量',
  function: '函数',
  type: '类型与类',
  variable: '变量',
  property: '属性',
  parameter: '参数',
  operator: '运算符',
  punctuation: '标点',
  tag: '标签',
  attribute: '属性名',
  regexp: '正则表达式',
}

function customThemeId(theme: TuiCustomTheme): TuiThemeId {
  return `custom:${theme.id}`
}

function resolvedCustomTheme(theme: TuiCustomTheme): ResolvedTuiTheme {
  return { ...theme, id: customThemeId(theme), syntaxTone: theme.tone }
}

function themePreviewText(theme: TuiCustomTheme, warnings: readonly string[]): string {
  const codeBlock = (text: string, language: string): string => highlightCodeLines(text, language)
    .map(line => background.code(`${line}${' '.repeat(Math.max(0, 42 - visibleWidth(line)))}`))
    .join('\n')
  return [
    `${color.brand('deepseek')} · ${color.accent(theme.name)} · ${theme.tone === 'dark' ? ui('暗色', 'Dark') : ui('亮色', 'Light')}`,
    `${markdownTheme.heading(ui('Markdown 标题', 'Markdown heading'))}  ${markdownTheme.bold(ui('粗体', 'Bold'))}  ${markdownTheme.code('inline code')}`,
    `${color.success(ui('成功', 'Success'))} · ${color.warning(ui('警告', 'Warning'))} · ${color.danger(ui('错误', 'Error'))} · ${color.muted(ui('弱化文字', 'Muted text'))}`,
    codeBlock(ui('const deepseek = "探索未至之境"', 'const deepseek = "explore beyond the known"'), 'typescript'),
    codeBlock(ui('@@ 主题预览 @@\n+ 新增内容\n- 删除内容', '@@ Theme preview @@\n+ Added content\n- Removed content'), 'diff'),
    ...warnings.map(warning => color.warning(`⚠ ${warning}`)),
  ].join('\n')
}

function detailText(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return typeof value === 'bigint' ? value.toString() : ui('[内容无法序列化]', '[content cannot be serialized]')
  }
}

function pluginIdentity(plugin: TuiPluginEntry): string {
  return `${plugin.name}${plugin.version === undefined ? '' : `@${plugin.version}`}`
}

function pluginDescription(plugin: TuiPluginEntry): string {
  const state = plugin.bundle
    ? (plugin.active ? ui('已启用 Bundle', 'Enabled Bundle') : ui('未启用 Bundle', 'Disabled Bundle'))
    : ui('普通 Profile 依赖', 'Regular Profile dependency')
  const diagnostics = plugin.diagnostics.length === 0
    ? ''
    : ` · ${plugin.diagnostics.map(translateUiText).join(ui('；', '; '))}`
  return `${plugin.source} · ${state} · ${plugin.spec}${diagnostics}`
}

function candidateDescription(candidate: TuiMarketplaceCandidate): string {
  const scripts = candidate.scripts.length === 0
    ? ui('无生命周期脚本', 'No lifecycle scripts')
    : ui(`脚本 ${candidate.scripts.join(', ')}`, `Scripts ${candidate.scripts.join(', ')}`)
  const mutable = candidate.immutable ? ui('不可变定位', 'Immutable reference') : ui('可变来源', 'Mutable source')
  return `${candidate.source} · ${mutable} · ${scripts}`
}

const EXTERNAL_COMMAND_TOOLS = new Set(['bash', 'pwsh', 'shell', 'shell_command', 'terminal'])

function toolBoundary(tool: TuiToolOption): { readonly label: string; readonly detail: string } {
  const name = tool.name.toLowerCase()
  if (name.startsWith('mcp__')) {
    return {
      label: ui('MCP · 外部服务', 'MCP · external service'),
      detail: ui('MCP 工具可能运行在独立进程或远端服务中，不受 Agent 沙箱保护；它能访问的内容由其配置、凭证和网络权限决定。', 'MCP tools may run in a separate process or remote service outside the Agent sandbox; their configuration, credentials, and network permissions determine what they can access.'),
    }
  }
  if (EXTERNAL_COMMAND_TOOLS.has(name)) {
    return {
      label: ui('外部命令', 'External command'),
      detail: ui('此工具可能启动 Shell 子进程。当前权限和逐次审批仍适用；获准后，子进程可按执行器权限访问文件、进程或网络。', 'This tool may start a shell subprocess. Current permissions and per-call approvals still apply; after approval, the subprocess can access files, processes, or the network as allowed by its executor.'),
    }
  }
  return {
    label: ui('Agent 工具', 'Agent tool'),
    detail: ui('此工具由 Agent 调用，并受当前权限和逐次审批控制。若它继续启动外部进程或服务，确认前请查看审批说明。', 'The Agent invokes this tool under the current permission and per-call approval controls. If it starts another process or service, review the approval details before confirming.'),
  }
}

function fieldState(field: TuiSettingsField): string {
  const current = field.control === 'secret'
    ? (field.secretSet ? ui('已配置', 'Configured') : ui('未配置', 'Not configured'))
    : formatSettingsValue(field.value)
  const origin = field.overridden
    ? ui('用户覆盖', 'User override')
    : ui(`继承 ${formatSettingsValue(field.inherited)}`, `Inherited ${formatSettingsValue(field.inherited)}`)
  return `${current} · ${origin}${field.required ? ui(' · 必填', ' · required') : ''}`
}

function jobStatusLabel(status: string): string {
  switch (status) {
    case 'running': return ui('运行中', 'Running')
    case 'stopping': return ui('正在停止', 'Stopping')
    case 'completed': return ui('已完成', 'Completed')
    case 'killed': return ui('已终止', 'Terminated')
    case 'failed': return ui('失败', 'Failed')
    default: return status
  }
}

function jobDetailLabel(detail: string | undefined): string | undefined {
  if (detail === undefined) return undefined
  const exit = /^exit code: (-?\d+)$/u.exec(detail)
  if (exit !== null) return ui(`退出码 ${exit[1]}`, `Exit code ${exit[1]}`)
  const signal = /^signal: (.+)$/u.exec(detail)
  return signal === null ? detail : ui(`信号 ${signal[1]}`, `Signal ${signal[1]}`)
}

function elapsedLabel(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 100) / 10} s`
  return `${Math.round(milliseconds / 6_000) / 10} min`
}

/** TUI-local actions. Every durable operation delegates to HarnessTuiCapabilities. */
export class TuiActions {
  private readonly handledInteractions = new Set<string>()
  private interactionChain: Promise<void> = Promise.resolve()

  /** @param capabilities - Harness-backed compatibility controller. */
  constructor(
    private readonly capabilities: HarnessTuiCapabilities,
    private readonly host: TuiActionHost,
  ) {}

  /**
   * Execute one exact TUI-owned slash command.
   * @param name - normalized command name without a leading slash.
   * @param rawArgs - unparsed command argument text.
   */
  async execute(name: string, rawArgs: string): Promise<void> {
    const args = rawArgs.trim()
    try {
      switch (name) {
        case 'new': await this.newSession(); break
        case 'resume':
        case 'sessions': await this.sessions(args); break
        case 'rename': await this.rename(args); break
        case 'fork': await this.fork(); break
        case 'archive': await this.archive(); break
        case 'export': await this.exportSession(args); break
        case 'copy': await this.copy(args); break
        case 'workspace': await this.workspace(args); break
        case 'profile': await this.profile(args); break
        case 'mode': await this.mode(); break
        case 'model': await this.model(); break
        case 'language': await this.language(args); break
        case 'theme': await this.theme(args); break
        case 'permission': await this.permission(args); break
        case 'queue': await this.queue(); break
        case 'steer': await this.steer(args); break
        case 'attach': await this.attach(args); break
        case 'attachments': await this.attachments(); break
        case 'settings': await this.settings(args); break
        case 'plugin':
        case 'plugins': await this.plugin(args); break
        case 'doctor': await this.doctor(); break
        case 'restart': await this.restart(); break
        case 'tools': await this.tools(args); break
        case 'files': await this.files(); break
        case 'jobs': await this.jobs(); break
        case 'subagents': await this.subagents(); break
        case 'trajectory': await this.trajectory(); break
        case 'feedback': await this.feedback(args); break
        case 'skills': await this.skills(); break
        case 'mcp': await this.mcp(); break
        case 'status': await this.status(); break
        case 'pending': this.retryPending(); break
        case 'help': await this.commandPalette(); break
        case 'quit':
        case 'exit': this.host.close(0); break
        default: throw new Error(`TUI 未实现 /${name}`)
      }
    } catch (error) {
      if (error instanceof TuiSettingsConflictError) {
        await this.settingsConflict(error)
        return
      }
      this.host.notice(capabilityError(error), 'error')
    }
  }

  private async settingsConflict(error: TuiSettingsConflictError): Promise<void> {
    let actual = error.actual
    try {
      const document = (await this.capabilities.managementBridge().settings.describe())
        .find(candidate => candidate.namespace === error.namespace)
      if (document !== undefined) actual = document.revision
    } catch (refreshError) {
      this.host.notice(`设置冲突后重新读取失败：${capabilityError(refreshError)}`, 'error')
      return
    }
    const reopen = await this.host.overlays.confirm(
      `设置 ${error.namespace} 已被其他界面更新`,
      `本次修改未保存，也没有覆盖其他界面的修改。是否重新读取最新设置？（版本 ${String(error.expected)} → ${String(actual)}）`,
      '重新读取',
    )
    if (!reopen) return
    try {
      await this.settings(error.namespace)
    } catch (nextError) {
      if (nextError instanceof TuiSettingsConflictError) await this.settingsConflict(nextError)
      else this.host.notice(capabilityError(nextError), 'error')
    }
  }

  /** Open the complete merged command palette and place the selection in the editor. */
  async commandPalette(): Promise<void> {
    try {
      const catalog = await this.capabilities.commandCatalog()
      const choice = await this.host.overlays.select({
        title: '命令面板',
        detail: '选择要使用的功能',
        choices: catalog.map(command => ({
          id: command.name,
          label: `/${command.name}`,
          description: `${command.argumentHint === undefined ? '' : `${command.argumentHint} — `}${command.description}`,
        })),
        options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      if (choice === undefined) return
      const command = catalog.find(candidate => candidate.name === choice.id)
      if (command === undefined) return
      this.host.setEditor(`/${command.name}${command.argumentHint !== undefined || command.behavior === 'skill' ? ' ' : ''}`)
    } catch (error) {
      this.host.notice(capabilityError(error), 'error')
    }
  }

  /** Shift+Tab: use Host order and apply the same risk gate as /permission. */
  async cyclePermission(): Promise<void> {
    try {
      await this.selectPermission(this.capabilities.nextPermission())
    } catch (error) {
      this.host.notice(capabilityError(error), 'error')
    }
  }

  /**
   * Detect newly pending Runtime interactions and serialize them through the FIFO overlay owner.
   * @param snapshot - authoritative Runtime conversation snapshot.
   */
  syncPending(snapshot: ConversationSnapshot): void {
    const present = new Set(snapshot.pending.map(wait => wait.key))
    for (const key of [...this.handledInteractions]) {
      if (!present.has(key)) this.handledInteractions.delete(key)
    }
    for (const wait of snapshot.pending) {
      if (this.handledInteractions.has(wait.key)) continue
      this.handledInteractions.add(wait.key)
      this.interactionChain = this.interactionChain
        .then(() => this.handleInteraction(wait))
        .catch((error: unknown) => {
          this.host.notice(`交互处理失败：${capabilityError(error)}；输入 /pending 可重试`, 'error')
        })
    }
  }

  private async newSession(): Promise<void> {
    const id = await this.capabilities.newSession()
    this.host.notice(id === undefined ? '当前没有可用工作区' : '已打开新会话', id === undefined ? 'warning' : 'success')
  }

  private async sessions(query: string): Promise<void> {
    const current = this.capabilities.active()?.sessionId
    const rows = sortSessionsByUpdatedAt(this.capabilities.listSessions())
    if (rows.length === 0) throw new Error('没有可恢复的会话')
    const hits = query === ''
      ? undefined
      : await this.capabilities.searchSessions(query, new AbortController().signal)
    const choices = hits === undefined
      ? rows.map(row => ({
        id: row.id,
        label: `${row.id === current ? '● ' : ''}${row.displayTitle}`,
        description: `${row.cwd ?? '无工作区'} · ${relativeTime(row.updatedAt)} · ${row.running ? '运行中' : row.pendingInteraction ?? '空闲'}`,
      }))
      : hits.items.map((hit) => {
        const row = rows.find(candidate => candidate.id === hit.sessionId)
        return {
          id: hit.sessionId,
          label: `${hit.sessionId === current ? '● ' : ''}${row?.displayTitle ?? hit.sessionId}`,
          description: hit.snippet,
        }
      })
    if (choices.length === 0) throw new Error(`没有匹配 ${JSON.stringify(query)} 的会话`)
    const selected = await this.host.overlays.select({
      title: query === '' ? '会话' : `搜索会话 · ${query}`,
      detail: `归档会话不会出现在这里${hits?.hasMore === true ? ' · 结果已达到上限' : ''}`,
      choices,
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    this.capabilities.openSession(idOf(selected.id))
    this.host.notice(`已打开 ${selected.label}`, 'success')
  }

  private async rename(args: string): Promise<void> {
    const title = args !== ''
      ? args
      : await this.host.overlays.input({
        title: '重命名会话',
        initialValue: this.capabilities.active()?.summary.title ?? '',
        placeholder: '输入新标题',
      })
    if (title === undefined || title.trim() === '') return
    const accepted = await this.capabilities.renameSession(title)
    this.host.notice(`会话已重命名为 ${accepted}`, 'success')
  }

  private async fork(): Promise<void> {
    const id = await this.capabilities.forkSession()
    this.host.notice(`已创建并打开分支会话 ${id}`, 'success')
  }

  private async archive(): Promise<void> {
    const active = this.capabilities.active()
    if (active === undefined) return
    const confirmed = await this.host.overlays.confirm(
      '归档当前会话？',
      `${active.summary.displayTitle} 的日志会保留，但会从普通会话列表隐藏。`,
      '归档',
    )
    if (!confirmed) return
    await this.capabilities.archiveSession()
    this.host.notice('会话已归档；当前不能在这里恢复', 'success')
  }

  private async exportSession(args: string): Promise<void> {
    const parsed = commandParts(args)
    if (parsed.command === 'md') {
      await this.exportMarkdown(parsed.rest)
      return
    }
    const scope = await this.host.overlays.select({
      title: '导出会话',
      detail: '将原始会话记录和附件保存为 ZIP 文件',
      searchable: false,
      choices: [
        { id: 'session', label: '仅当前会话', description: '包含当前会话记录和附件' },
        { id: 'descendants', label: '当前会话与子 Agent', description: '同时包含全部子 Agent 会话' },
      ],
    })
    if (scope === undefined) return
    const requested = args === ''
      ? await this.host.overlays.input({
        title: '保存会话 ZIP',
        detail: '留空则保存到工作区根目录；已有文件不会被覆盖',
        placeholder: '可选：相对工作区或绝对路径',
      })
      : args
    if (requested === undefined) return
    const result = await this.capabilities.exportSession(
      requested.trim() === '' ? undefined : requested.trim(),
      scope.id === 'descendants',
    )
    this.host.notice(ui(
      `已保存会话 ZIP（${formatByteSize(result.bytes)}）到 ${result.path}`,
      `Saved session ZIP (${formatByteSize(result.bytes)}) to ${result.path}`,
    ), 'success')
  }

  private async exportMarkdown(requested: string): Promise<void> {
    const path = requested === ''
      ? await this.host.overlays.input({
        title: ui('保存会话 Markdown', 'Save session Markdown'),
        detail: ui('留空则保存到工作区根目录；已有文件不会被覆盖', 'Leave empty to save at the workspace root; existing files are not overwritten'),
        placeholder: ui('可选：相对工作区或绝对路径', 'Optional: workspace-relative or absolute path'),
      })
      : requested
    if (path === undefined) return
    const result = await this.capabilities.exportMarkdown(path.trim() === '' ? undefined : path.trim())
    this.host.notice(ui(
      `已保存会话 Markdown（${formatByteSize(result.bytes)}）到 ${result.path}`,
      `Saved session Markdown (${formatByteSize(result.bytes)}) to ${result.path}`,
    ), 'success')
  }

  private async copy(args: string): Promise<void> {
    const parsed = commandParts(args)
    if (parsed.command === 'pick') {
      await this.copyPick()
      return
    }
    if (parsed.command === 'code') {
      this.copyCode()
      return
    }
    if (parsed.command !== '') throw new Error('用法：/copy [pick|code]')
    this.copyLastResponse()
  }

  private copyLastResponse(): void {
    const text = this.capabilities.lastAssistantText()
    if (text === undefined) throw new Error('当前会话没有可复制的 DeepSeek 文本回复')
    this.host.copy(text)
    this.host.notice(`已复制最后一条回复（${text.length} 个字符）`, 'success')
  }

  private copyCode(): void {
    const text = this.capabilities.lastAssistantText()
    if (text === undefined) throw new Error('当前会话没有可复制的 DeepSeek 文本回复')
    const code = lastFencedCode(text)
    if (code === undefined) throw new Error('最后一条回复没有可复制的代码块')
    this.host.copy(code)
    this.host.notice(`已复制最后一段代码（${code.length} 个字符）`, 'success')
  }

  private async copyPick(): Promise<void> {
    const rows = this.capabilities.assistantCopyTargets()
    if (rows.length === 0) throw new Error('当前会话没有可复制的 DeepSeek 文本回复')
    const selected = await this.host.overlays.select({
      title: '复制回复',
      detail: '选择一条助手回复复制到剪贴板',
      choices: rows.map(row => ({ id: row.id, label: row.preview })),
      searchable: rows.length > 8,
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const row = rows.find(candidate => candidate.id === selected.id)
    if (row === undefined) return
    this.host.copy(row.text)
    this.host.notice(`已复制所选回复（${row.text.length} 个字符）`, 'success')
  }

  private async workspace(args: string): Promise<void> {
    const parsed = commandParts(args)
    if (parsed.command === 'add' || parsed.command === 'open') {
      if (parsed.rest === '') throw new Error(`用法：/workspace ${parsed.command} <目录>`)
      await this.capabilities.openWorkspace(parsed.rest)
      this.host.notice('已打开工作区会话', 'success')
      return
    }
    if (parsed.command === 'rename') {
      const workspace = this.currentWorkspace() ?? await this.chooseWorkspace('选择要重命名的工作区')
      if (workspace === undefined) return
      await this.renameWorkspace(workspace, parsed.rest)
      return
    }
    if (parsed.command === 'delete' || parsed.command === 'remove') {
      const workspace = parsed.rest === ''
        ? this.currentWorkspace() ?? await this.chooseWorkspace('选择要移除注册的工作区')
        : this.capabilities.listWorkspaces().find(candidate => candidate.workspaceId === parsed.rest)
      if (workspace === undefined) throw new Error(`找不到工作区 ${JSON.stringify(parsed.rest)}`)
      await this.deleteWorkspace(workspace)
      return
    }
    if (parsed.command === 'reorder') {
      const workspace = this.currentWorkspace() ?? await this.chooseWorkspace('选择要移动的工作区')
      if (workspace !== undefined) await this.reorderWorkspace(workspace)
      return
    }
    if (parsed.command === 'sessions') {
      const workspace = this.currentWorkspace() ?? await this.chooseWorkspace('选择工作区')
      if (workspace !== undefined) await this.reorderWorkspaceSession(workspace)
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      await this.capabilities.openWorkspace(args)
      this.host.notice('已打开工作区会话', 'success')
      return
    }
    await this.workspaceCenter()
  }

  private async workspaceCenter(): Promise<void> {
    const workspaces = this.capabilities.listWorkspaces()
    const current = this.capabilities.active()?.workspaceId
    const selected = await this.host.overlays.select({
      title: '工作区',
      choices: [
        ...workspaces.map(workspace => ({
          id: workspace.workspaceId,
          label: `${workspace.workspaceId === current ? '● ' : ''}${workspace.title}`,
          description: workspace.path,
        })),
        { id: '__add__', label: '添加目录…', description: '注册现有目录并打开空白会话' },
      ],
    })
    if (selected === undefined) return
    if (selected.id === '__add__') {
      const path = await this.host.overlays.input({ title: '添加工作区', placeholder: '输入目录路径' })
      if (path === undefined || path.trim() === '') return
      await this.capabilities.openWorkspace(path)
      this.host.notice('已打开工作区会话', 'success')
      return
    }
    const workspace = workspaces.find(candidate => candidate.workspaceId === selected.id)
    if (workspace === undefined) return
    const action = await this.host.overlays.select({
      title: workspace.title,
      detail: `${workspace.path}\n${workspace.sessionIds.length} 个已登记会话`,
      searchable: false,
      choices: [
        { id: 'open', label: '打开／新建会话', description: '复用该工作区的空白会话，必要时创建' },
        { id: 'rename', label: '重命名工作区', description: '只改变这里显示的名称' },
        { id: 'sessions', label: '调整会话顺序', description: '修改该工作区的手动会话顺序' },
        { id: 'reorder', label: '调整工作区顺序', description: '修改工作区目录显示顺序' },
        { id: 'delete', label: '移除工作区注册', description: '不会删除目录、文件或会话日志' },
      ],
    })
    if (action === undefined) return
    if (action.id === 'open') {
      const sessionId = await this.capabilities.selectWorkspace(workspace.workspaceId)
      this.host.notice(`已打开会话 ${sessionId}`, 'success')
    } else if (action.id === 'rename') await this.renameWorkspace(workspace, '')
    else if (action.id === 'sessions') await this.reorderWorkspaceSession(workspace)
    else if (action.id === 'reorder') await this.reorderWorkspace(workspace)
    else await this.deleteWorkspace(workspace)
  }

  private currentWorkspace(): WorkspaceView | undefined {
    const id = this.capabilities.active()?.workspaceId
    return this.capabilities.listWorkspaces().find(candidate => candidate.workspaceId === id)
  }

  private async chooseWorkspace(title: string): Promise<WorkspaceView | undefined> {
    const workspaces = this.capabilities.listWorkspaces()
    const selected = await this.host.overlays.select({
      title,
      choices: workspaces.map(workspace => ({
        id: workspace.workspaceId,
        label: workspace.title,
        description: workspace.path,
      })),
    })
    return workspaces.find(candidate => candidate.workspaceId === selected?.id)
  }

  private async renameWorkspace(workspace: WorkspaceView, supplied: string): Promise<void> {
    const title = supplied !== '' ? supplied : await this.host.overlays.input({
      title: `重命名 ${workspace.title}`,
      initialValue: workspace.title,
      placeholder: '输入新标题',
    })
    if (title === undefined || title.trim() === '') return
    const updated = await this.capabilities.renameWorkspace(workspace.workspaceId, title)
    this.host.notice(`工作区已重命名为 ${updated.title}`, 'success')
  }

  private async deleteWorkspace(workspace: WorkspaceView): Promise<void> {
    const confirmed = await this.host.overlays.confirm(
      `移除工作区注册 ${workspace.title}？`,
      `${workspace.path}\n目录、用户文件和全部会话记录都会保留；会话将成为未分组。`,
      '移除注册',
    )
    if (!confirmed) return
    await this.capabilities.deleteWorkspace(workspace.workspaceId)
    this.host.notice(`已移除工作区注册 ${workspace.title}`, 'success')
  }

  private async reorderWorkspace(workspace: WorkspaceView): Promise<void> {
    const choices: OverlayChoice[] = this.capabilities.listWorkspaces()
      .filter(candidate => candidate.workspaceId !== workspace.workspaceId)
      .map(candidate => ({ id: candidate.workspaceId, label: `移到 ${candidate.title} 前`, description: candidate.path }))
    choices.push({ id: '__append__', label: '移到末尾', description: '追加到工作区目录末尾' })
    const selected = await this.host.overlays.select({ title: `移动 ${workspace.title}`, choices })
    if (selected === undefined) return
    await this.capabilities.moveWorkspace(
      workspace.workspaceId,
      selected.id === '__append__' ? undefined : workspaceIdOf(selected.id),
    )
    this.host.notice(`已调整工作区 ${workspace.title} 的顺序`, 'success')
  }

  private async reorderWorkspaceSession(workspace: WorkspaceView): Promise<void> {
    if (workspace.sessionIds.length < 2) {
      this.host.notice(`${workspace.title} 没有可调整的多个会话`, 'info')
      return
    }
    const summaries = new Map(this.capabilities.listSessions().map(row => [row.id, row]))
    const source = await this.host.overlays.select({
      title: `${workspace.title} · 选择会话`,
      choices: workspace.sessionIds.map(id => ({
        id,
        label: summaries.get(id)?.displayTitle ?? id,
        description: summaries.has(id) ? id : `${id} · 已归档或未载入`,
      })),
    })
    if (source === undefined) return
    const anchors: OverlayChoice[] = workspace.sessionIds
      .filter(id => id !== source.id)
      .map(id => ({ id, label: `移到 ${summaries.get(id)?.displayTitle ?? id} 前` }))
    anchors.push({ id: '__append__', label: '移到末尾' })
    const anchor = await this.host.overlays.select({ title: '选择新位置', choices: anchors })
    if (anchor === undefined) return
    await this.capabilities.moveWorkspaceSession(
      workspace.workspaceId,
      idOf(source.id),
      anchor.id === '__append__' ? undefined : idOf(anchor.id),
    )
    this.host.notice('已调整会话顺序', 'success')
  }

  private async profile(args: string): Promise<void> {
    const management = this.capabilities.managementBridge()
    const parsed = commandParts(args)
    if (parsed.command === 'switch') {
      if (parsed.rest === '') throw new Error('用法：/profile switch <名称>')
      await this.switchProfile(parsed.rest)
      return
    }
    if (parsed.command === 'create') {
      if (parsed.rest === '') throw new Error('用法：/profile create <名称>')
      const created = await management.profiles.create(parsed.rest)
      await this.createdProfile(created)
      return
    }
    if (parsed.command === 'copy') {
      const copy = argumentPair(parsed.rest)
      if (copy.first === '' || copy.rest === '') throw new Error('用法：/profile copy <源 Profile> <新名称>')
      const created = await management.profiles.create(copy.rest, copy.first)
      await this.createdProfile(created)
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      throw new Error('用法：/profile [list|switch <名称>|create <名称>|copy <源> <新名称>]')
    }

    const profiles = await management.profiles.list()
    const current = this.capabilities.currentProfile()
    const orderedProfiles = [...profiles].sort((left, right) => {
      if (left.name === current) return -1
      if (right.name === current) return 1
      return 0
    })
    const selected = await this.host.overlays.select({
      title: 'Profile',
      detail: '切换后会重启，并恢复当前工作区、会话、草稿和附件',
      choices: [
        ...orderedProfiles.map(profile => ({
          id: `profile:${profile.name}`,
          label: `${profile.name === current ? '● ' : ''}${profile.name}`,
          description: this.profileDescription(profile),
          ...(profile.compatible ? {} : { disabledReason: '不能直接用于终端；可复制为新的终端 Profile' }),
        })),
        { id: '__create__', label: '创建 Profile…', description: '创建新的终端运行配置' },
        { id: '__copy__', label: '复制 Profile…', description: '基于现有 Profile 创建终端版本' },
      ],
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id === '__create__') {
      const name = await this.host.overlays.input({ title: '创建 Profile', placeholder: '输入小写 Profile 名称' })
      if (name === undefined || name.trim() === '') return
      await this.createdProfile(await management.profiles.create(name.trim()))
      return
    }
    if (selected.id === '__copy__') {
      const source = await this.host.overlays.select({
        title: '选择源 Profile',
        choices: profiles.map(profile => ({
          id: profile.name,
          label: profile.name,
          description: `${this.profileDescription(profile)}${profile.compatible ? '' : ' · 将转换为终端版本'}`,
        })),
      })
      if (source === undefined) return
      const name = await this.host.overlays.input({ title: '复制 Profile', placeholder: '输入新 Profile 名称' })
      if (name === undefined || name.trim() === '') return
      await this.createdProfile(await management.profiles.create(name.trim(), source.id))
      return
    }
    await this.switchProfile(selected.id.slice('profile:'.length))
  }

  private profileDescription(profile: TuiProfileSummary): string {
    const initialized = profile.initialized ? '已就绪' : '尚未初始化'
    return `${initialized} · ${profile.bundles.length} 个功能组件 · ${profile.dependencyCount} 个额外插件`
  }

  private async switchProfile(profile: string): Promise<void> {
    if (profile === this.capabilities.currentProfile()) {
      this.host.notice(`${profile} 已是当前 Profile`, 'info')
      return
    }
    const profiles = await this.capabilities.managementBridge().profiles.list()
    const target = profiles.find(candidate => candidate.name === profile)
    if (target === undefined) throw new Error(`Profile ${JSON.stringify(profile)} 不存在`)
    if (!target.compatible) throw new Error(target.diagnostic ?? `Profile ${profile} 不兼容`)
    const confirmed = await this.host.overlays.confirm(
      `切换到 Profile ${profile}？`,
      'deepseek 会重新启动，并恢复工作区、会话、未发送草稿和附件；正在运行的任务会停止。',
      '切换并重启',
    )
    if (confirmed) this.host.restart(profile, `已切换到 Profile ${profile}`)
  }

  private async createdProfile(profile: TuiProfileSummary): Promise<void> {
    this.host.notice(`已创建 Profile ${profile.name}`, 'success')
    const activate = await this.host.overlays.confirm(
      `立即切换到 ${profile.name}？`,
      '切换会受控重启并恢复当前上下文。',
      '切换并重启',
    )
    if (activate) this.host.restart(profile.name, `已创建并切换到 Profile ${profile.name}`)
  }

  private async mode(): Promise<void> {
    const modes = await this.capabilities.listModes()
    const selected = await this.host.overlays.select({
      title: 'Agent 模式',
      detail: '选择当前会话的工作模式；用户创建的模式会单独标记',
      choices: modes.map(mode => ({
        id: mode.id,
        label: `${currentMark(mode.current)}${mode.label}${mode.trust === 'user' ? ' · 用户' : ''}`,
        description: mode.description ?? (mode.isDefault ? '部署默认模式' : mode.id),
        ...(mode.disabledReason === undefined ? {} : { disabledReason: mode.disabledReason }),
      })),
    })
    if (selected === undefined) return
    const target = modes.find(mode => mode.id === selected.id)
    if (target?.current === true) {
      this.host.notice(`${target.label} 已是当前模式`, 'info')
      return
    }
    let allowNewSession = false
    if (this.capabilities.modeNeedsNewSession()) {
      allowNewSession = await this.host.overlays.confirm(
        '活跃会话不能原地切换模式',
        '确认后会在同一工作区创建空白会话并应用目标模式；原会话、日志和标题保持不变。',
        '创建新会话',
      )
      if (!allowNewSession) return
    }
    await this.capabilities.selectMode(selected.id, allowNewSession)
    this.host.notice(
      allowNewSession ? `已创建新会话并切换为${target?.label ?? selected.label}` : `模式已切换为${target?.label ?? selected.label}`,
      'success',
    )
  }

  private async model(): Promise<void> {
    const directory = await this.capabilities.listModels()
    const choices: OverlayChoice[] = directory.options.map(option => ({
      id: option.id,
      label: `${currentMark(option.current)}${option.label}`,
      description: option.description,
    }))
    choices.push(...directory.failures.map((failure, index) => ({
      id: `__failure_${String(index)}`,
      label: 'Provider 目录不可用',
      disabledReason: failure,
    })))
    if (!directory.routable) {
      this.host.notice('当前模型路由不可用；请选择一个已加载 Provider 的模型', 'warning')
    }
    const selected = await this.host.overlays.select({
      title: '模型',
      detail: '选择当前会话使用的 Provider、模型和推理强度',
      choices,
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const option = directory.options.find(candidate => candidate.id === selected.id)
    if (option === undefined) return
    const selection = await this.reasoningSelection(option)
    if (selection === undefined) return
    await this.capabilities.selectModel(selection)
    this.host.refreshHeader()
    this.host.notice(`模型已切换为 ${selection.provider}/${selection.model}`, 'success')
  }

  private async language(
    args: string,
    overlays: OverlayPrompts = this.host.overlays,
    suppliedDocument?: TuiSettingsDocument,
  ): Promise<void> {
    const settings = this.capabilities.managementBridge().settings
    const document = suppliedDocument ?? localeSettings(await settings.describe())
    const requested = args.toLowerCase()
    const aliases = new Map<string, TuiLanguageSelection>([
      ['auto', 'auto'],
      ['zh', 'zh'],
      ['zh-cn', 'zh'],
      ['chinese', 'zh'],
      ['中文', 'zh'],
      ['en', 'en'],
      ['en-us', 'en'],
      ['english', 'en'],
      ['英语', 'en'],
    ])
    let selection = requested === '' ? undefined : aliases.get(requested)
    if (requested !== '' && selection === undefined) {
      throw new Error(ui(
        '用法：/language [auto|zh|en]',
        'Usage: /language [auto|zh|en]',
      ))
    }
    if (selection === undefined) {
      const current = languageSelection(document)
      const selected = await overlays.select({
        title: ui('界面语言', 'Interface language'),
        detail: ui(
          '与 DeepSeek Harness Web 共用 locale.preference；修改会立即作用于当前终端。',
          'Shares locale.preference with DeepSeek Harness Web; changes apply to this terminal immediately.',
        ),
        choices: [
          {
            id: 'auto',
            label: ui('自动', 'Automatic'),
            description: ui('终端使用 LANG/LC_*；浏览器使用 navigator.language', 'Terminal uses LANG/LC_*; browser uses navigator.language'),
            active: current === 'auto',
          },
          {
            id: 'zh',
            label: ui('中文', 'Chinese'),
            description: 'zh',
            active: current === 'zh',
          },
          {
            id: 'en',
            label: 'English',
            description: 'en',
            active: current === 'en',
          },
        ],
        searchable: false,
      })
      if (selected === undefined) return
      selection = selected.id as TuiLanguageSelection
    }
    const saved = await saveLanguage(settings, document, selection)
    this.host.applyLocale(saved.locale)
    this.host.notice(ui(
      `界面语言已切换为${selection === 'auto' ? '自动' : selection === 'zh' ? '中文' : '英语'}`,
      `Interface language changed to ${selection === 'auto' ? 'Automatic' : selection === 'zh' ? 'Chinese' : 'English'}`,
    ), 'success')
  }

  private async reasoningSelection(
    option: TuiModelOption,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<TuiModelOption['selection'] | undefined> {
    if (option.efforts.length === 0) return option.selection
    const selected = await overlays.select({
      title: `${option.label} · 推理强度`,
      choices: [
        {
          id: '__default__',
          label: `Provider 默认${option.defaultEffort === undefined ? '' : `（${option.defaultEffort}）`}`,
        },
        ...option.efforts.map(effort => ({
          id: effort.id,
          label: effort.name,
          ...(effort.description === undefined ? {} : { description: effort.description }),
        })),
      ],
    })
    if (selected === undefined) return undefined
    return {
      ...option.selection,
      ...(selected.id === '__default__' ? {} : { reasoningEffort: selected.id }),
    }
  }

  private async theme(args: string): Promise<void> {
    const parsed = commandParts(args)
    switch (parsed.command) {
      case '': await this.themeCenter(); return
      case 'dark':
      case 'light': await this.activateTheme(parsed.command); return
      case 'code': await this.themeCode(parsed.rest); return
      case 'use': await this.themeUse(parsed.rest); return
      case 'edit': await this.themeEdit(parsed.rest); return
      case 'palette': await this.themePalette(parsed.rest); return
      case 'import': await this.themeImport(parsed.rest); return
      case 'delete': await this.themeDelete(parsed.rest); return
      default: throw new Error('用法：/theme [dark|light|code|use|edit|palette|import|delete]')
    }
  }

  private async themeCenter(): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    const activeCodeTheme = resolveCodeTheme(appearance)
    const choices: OverlayChoice[] = [
      { id: 'dark', label: 'DeepSeek 暗色', description: '内置 · 深灰蓝画布' },
      { id: 'light', label: 'DeepSeek 亮色', description: '内置 · 柔和冷白画布' },
      ...appearance.customThemes.map(theme => ({
        id: customThemeId(theme),
        label: theme.name,
        description: `${theme.tone === 'dark' ? '暗色' : '亮色'} · ${theme.source === 'palette' ? '颜色组生成' : theme.source === 'vscode' ? 'VS Code 导入' : '手动配色'}`,
      })),
    ]
    choices.sort((left, right) => Number(right.id === appearance.theme) - Number(left.id === appearance.theme))
    choices.push(
      {
        id: '__code__',
        label: '代码块主题',
        description: `${appearance.codeTheme === 'auto' ? '自动匹配' : '独立指定'} · 当前 ${activeCodeTheme.name}`,
      },
      { id: '__edit__', label: '自定义颜色与代码高亮', description: '修改背景、文字和语法颜色' },
      { id: '__palette__', label: '用颜色组合自动配置', description: '输入 3–16 个 HEX/RGB 颜色代码' },
      { id: '__import__', label: '导入 VS Code 主题', description: '本地 JSON/JSONC · 支持相对 include' },
      { id: '__delete__', label: '删除主题', description: '管理命名自定义主题' },
    )
    const selected = await this.host.overlays.select({
      title: '主题',
      detail: '手动配色、颜色组合自动生成，或导入 VS Code JSON/JSONC',
      choices: choices.map(choice => ({
        ...choice,
        label: `${currentMark(choice.id === appearance.theme)}${choice.label}`,
      })),
      footer: '↑↓ 选择 · Enter 确认 · Esc 关闭',
      options: { width: 68, maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id === '__code__') await this.themeCode('')
    else if (selected.id === '__palette__') await this.themePalette('')
    else if (selected.id === '__import__') await this.themeImport('')
    else if (selected.id === '__edit__') await this.themeEdit('')
    else if (selected.id === '__delete__') await this.themeDelete('')
    else await this.activateTheme(selected.id as TuiThemeId)
  }

  private async activateTheme(target: TuiThemeId): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    const resolved = resolveTheme(appearance, target)
    if (target === appearance.theme && appearance.codeTheme === 'auto') {
      this.host.notice(`${resolved.name}已启用`, 'info')
      return
    }
    const updated = await saveTheme(bridge, document, target)
    await this.settingsChanged(updated, resolved.name)
  }

  private async themeUse(value: string): Promise<void> {
    if (value === '') throw new Error('用法：/theme use <主题名>')
    if (value === 'dark' || value === 'light') {
      await this.activateTheme(value)
      return
    }
    const document = appearanceSettings(await this.capabilities.managementBridge().settings.describe())
    const appearance = appearanceFromSettings(document)
    const requested = value.startsWith('custom:') ? value.slice('custom:'.length) : value
    const folded = requested.toLowerCase()
    const theme = appearance.customThemes.find(candidate =>
      candidate.id === requested || candidate.name.toLowerCase() === folded)
    if (theme === undefined) throw new Error(`找不到主题 ${JSON.stringify(value)}`)
    await this.activateTheme(customThemeId(theme))
  }

  private async themeCode(value: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    let target: TuiCodeThemeId | undefined
    if (value !== '') {
      if (value === 'auto' || value === 'dark' || value === 'light') target = value
      else {
        const requested = value.startsWith('custom:') ? value.slice('custom:'.length) : value
        const folded = requested.toLowerCase()
        const custom = appearance.customThemes.find(candidate =>
          candidate.id === requested || candidate.name.toLowerCase() === folded)
        if (custom === undefined) throw new Error(`找不到代码主题 ${JSON.stringify(value)}`)
        target = customThemeId(custom)
      }
    } else {
      const selected = await this.host.overlays.select({
        title: '代码块主题',
        detail: '只改变代码块、工具指令、文件内容、JSON 与 Diff；界面颜色保持不变。',
        choices: [
          {
            id: 'auto',
            label: `${currentMark(appearance.codeTheme === 'auto')}自动匹配`,
            description: '代码背景、高亮颜色和暗亮方向跟随界面主题',
          },
          { id: 'dark', label: `${currentMark(appearance.codeTheme === 'dark')}DeepSeek 暗色代码` },
          { id: 'light', label: `${currentMark(appearance.codeTheme === 'light')}DeepSeek 亮色代码` },
          ...appearance.customThemes.map(theme => ({
            id: customThemeId(theme),
            label: `${currentMark(appearance.codeTheme === customThemeId(theme))}${theme.name}`,
            description: `${theme.tone === 'dark' ? '暗色' : '亮色'} · ${theme.source === 'vscode' ? 'VS Code 导入' : '自定义'}`,
          })),
        ],
        footer: '↑↓ 选择 · Enter 确认 · Esc 关闭',
        options: { width: 72, maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      target = selected?.id as TuiCodeThemeId | undefined
    }
    if (target === undefined) return
    if (target === appearance.codeTheme) {
      this.host.notice(`代码主题 ${resolveCodeTheme(appearance).name} 已启用`, 'info')
      return
    }
    const updated = await saveCodeTheme(bridge, document, target)
    const stored = appearanceFromSettings(updated)
    await this.settingsChanged(updated, `代码主题 ${resolveCodeTheme(stored).name}`)
  }

  private async themeIdentity(
    nameValue: string,
    appearance: TuiAppearanceSettings,
  ): Promise<{ readonly id: string; readonly name: string } | undefined> {
    const name = nameValue.trim()
    if (name === '' || name.length > 80) throw new Error('主题名称必须为 1–80 个字符')
    if (/[\u0000-\u001F\u007F-\u009F]/u.test(name)) throw new Error('主题名称不能包含终端控制字符')
    const existing = appearance.customThemes.find(theme =>
      theme.name.toLowerCase() === name.toLowerCase())
    if (existing !== undefined) {
      const overwrite = await this.host.overlays.confirm(
        `覆盖主题 ${existing.name}？`,
        '原主题颜色会被新配置替换，其他命名主题不受影响。',
        '覆盖',
      )
      return overwrite ? { id: existing.id, name: existing.name } : undefined
    }
    if (appearance.customThemes.length >= 32) throw new Error('已达到 32 个自定义主题上限')
    const base = themeIdFromName(name)
    let id = base
    for (let index = 2; appearance.customThemes.some(theme => theme.id === id); index += 1) {
      const suffix = `-${String(index)}`
      id = `${base.slice(0, 48 - suffix.length).replace(/-+$/u, '')}${suffix}`
    }
    return { id, name }
  }

  private async promptThemeName(initialValue = ''): Promise<string | undefined> {
    const value = await this.host.overlays.input({
      title: '主题名称',
      initialValue,
      placeholder: '例如 DeepSeek Ocean',
    })
    return value === undefined || value.trim() === '' ? undefined : value.trim()
  }

  private async themePalette(requestedName: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    const enteredName = requestedName === '' ? await this.promptThemeName() : requestedName
    if (enteredName === undefined) return
    const identity = await this.themeIdentity(enteredName, appearance)
    if (identity === undefined) return
    const palette = await this.host.overlays.input({
      title: `生成主题 · ${identity.name}`,
      detail: '粘贴 3–16 个 HEX/RGB 颜色；程序会自动分配背景、正文、状态和代码高亮。',
      placeholder: '#0B1020 #E8ECF5 #6682FF #42C99A',
      options: { width: '95%', maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    if (palette === undefined) return
    const candidates = generateThemeCandidates(identity.id, identity.name, palette)
    const first = candidates[candidates.recommended]
    const alternate = candidates[candidates.recommended === 'dark' ? 'light' : 'dark']
    await this.previewAndSaveTheme(document, first, alternate)
  }

  private async themeImport(args: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    const [first = '', ...rest] = commandArguments(args)
    const looksLikePath = /^(?:[./~]|file:)/u.test(first) || /\.jsonc?$/iu.test(first)
    const requestedName = looksLikePath ? '' : first
    const suppliedPath = (looksLikePath ? [first, ...rest] : rest).join(' ')
    const path = suppliedPath !== '' ? suppliedPath : await this.host.overlays.input({
      title: '导入 VS Code 主题',
      detail: '读取本地 JSON/JSONC；相对 include 会从主题文件目录递归解析。',
      placeholder: '~/.vscode/extensions/.../themes/theme.json',
      options: { width: '95%', maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    if (path === undefined || path.trim() === '') return
    const loaded = await loadVsCodeThemeFile(path)
    const name = requestedName === '' ? loaded.suggestedName : requestedName
    const identity = await this.themeIdentity(name, appearance)
    if (identity === undefined) return
    await this.previewAndSaveTheme(
      document,
      convertVsCodeTheme(loaded, identity.id, identity.name),
      undefined,
      'code',
    )
  }

  private async themeEdit(requested: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    let source: ResolvedTuiTheme | undefined
    if (requested !== '') {
      if (requested === 'dark' || requested === 'light') source = resolveTheme(appearance, requested)
      else {
        const folded = requested.toLowerCase()
        const custom = appearance.customThemes.find(theme =>
          theme.id === requested || theme.name.toLowerCase() === folded)
        if (custom !== undefined) source = resolvedCustomTheme(custom)
      }
      if (source === undefined) throw new Error(`找不到主题 ${JSON.stringify(requested)}`)
    } else {
      source = resolveTheme(appearance)
      if (source.source === 'builtin' && appearance.customThemes.length > 0) {
        const selected = await this.host.overlays.select({
          title: '编辑主题',
          detail: '内置主题会先复制为命名主题',
          choices: [
            { id: source.id, label: source.name, description: '当前内置主题 · 创建副本' },
            ...appearance.customThemes.map(theme => ({
              id: customThemeId(theme), label: theme.name, description: theme.tone === 'dark' ? '暗色' : '亮色',
            })),
          ],
        })
        if (selected === undefined) return
        source = resolveTheme(appearance, selected.id as TuiThemeId)
      }
    }
    let editable: TuiCustomTheme
    if (source.source === 'builtin') {
      const requestedCopyName = await this.promptThemeName(`${source.name} 自定义`)
      if (requestedCopyName === undefined) return
      const identity = await this.themeIdentity(requestedCopyName, appearance)
      if (identity === undefined) return
      editable = editableTheme(source, identity.id, identity.name)
    } else {
      const overwrite = await this.host.overlays.confirm(
        `编辑并覆盖主题 ${source.name}？`,
        '保存后会替换这个命名主题；其他主题不受影响。',
        '继续编辑',
      )
      if (!overwrite) return
      editable = editableTheme(source, source.id.slice('custom:'.length), source.name)
    }
    const edited = await this.editThemeValue(editable)
    if (edited === undefined) return
    await this.previewAndSaveTheme(document, edited)
  }

  private async editThemeValue(initial: TuiCustomTheme): Promise<TuiCustomTheme | undefined> {
    let theme = initial
    while (true) {
      const selected = await this.host.overlays.select({
        title: `编辑主题 · ${theme.name}`,
        detail: '只修改界面背景、文字和代码语法高亮颜色',
        choices: [
          { id: '__done__', label: '完成并预览', description: '检查实际终端效果后保存' },
          { id: '__tone__', label: '暗亮方向', description: theme.tone === 'dark' ? '暗色' : '亮色' },
          ...Object.entries(THEME_UI_FIELDS).map(([key, label]) => ({
            id: `ui:${key}`, label, description: theme.colors[key as keyof typeof THEME_UI_FIELDS],
          })),
          ...Object.entries(THEME_SYNTAX_FIELDS).map(([key, label]) => ({
            id: `syntax:${key}`, label: `代码 · ${label}`, description: theme.syntax[key as keyof typeof THEME_SYNTAX_FIELDS],
          })),
        ],
        options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      if (selected === undefined) return undefined
      if (selected.id === '__done__') return normalizeCustomTheme(theme)
      if (selected.id === '__tone__') {
        const tone = await this.host.overlays.select({
          title: '暗亮方向',
          choices: [
            { id: 'dark', label: '暗色', ...(theme.tone === 'dark' ? { description: '当前' } : {}) },
            { id: 'light', label: '亮色', ...(theme.tone === 'light' ? { description: '当前' } : {}) },
          ],
          searchable: false,
        })
        if (tone?.id === 'dark' || tone?.id === 'light') theme = { ...theme, tone: tone.id, source: 'manual' }
        continue
      }
      const [section, key] = selected.id.split(':', 2)
      if ((section !== 'ui' && section !== 'syntax') || key === undefined) continue
      const current = section === 'ui'
        ? theme.colors[key as keyof typeof THEME_UI_FIELDS]
        : theme.syntax[key as keyof typeof THEME_SYNTAX_FIELDS]
      const value = await this.host.overlays.input({
        title: selected.label,
        detail: '输入 HEX 或 rgb(r,g,b)',
        initialValue: current,
      })
      if (value === undefined) continue
      const normalized = normalizeThemeColor(value)
      theme = section === 'ui'
        ? { ...theme, source: 'manual', colors: { ...theme.colors, [key]: normalized } }
        : { ...theme, source: 'manual', syntax: { ...theme.syntax, [key]: normalized }, tokenColors: [] }
    }
  }

  private async previewAndSaveTheme(
    document: TuiSettingsDocument,
    initial: TuiCustomTheme,
    initialAlternate?: TuiCustomTheme,
    activation: 'both' | 'code' = 'both',
  ): Promise<void> {
    const original = themeFromAppearance(document)
    const interfaceTheme = resolveTheme(appearanceFromSettings(document))
    let candidate = initial
    let alternate = initialAlternate
    while (true) {
      const warnings = themeContrastWarnings(candidate)
      const resolvedCandidate = resolvedCustomTheme(candidate)
      this.host.applyTheme(activation === 'code'
        ? composeResolvedTheme(interfaceTheme, resolvedCandidate)
        : resolvedCandidate)
      const selected = await this.host.overlays.select({
        title: `${activation === 'code' ? '代码主题' : '主题'}预览 · ${candidate.name}`,
        detail: themePreviewText(candidate, warnings),
        searchable: false,
        choices: [
          {
            id: 'apply',
            label: '应用并保存',
            description: activation === 'code' ? '只替换代码呈现，界面主题保持不变' : '写入 Harness Settings',
          },
          ...(alternate === undefined ? [] : [{ id: 'toggle', label: `切换为${alternate.tone === 'dark' ? '暗色' : '亮色'}方向`, description: '使用同一组颜色重新预览' }]),
          { id: 'edit', label: '继续调整', description: '修改界面或代码颜色' },
          { id: 'cancel', label: '取消', description: '恢复原主题' },
        ],
        footer: '↑↓ 选择 · Enter 确认 · Esc 取消并恢复',
        options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      if (selected === undefined || selected.id === 'cancel') {
        this.host.applyTheme(original)
        return
      }
      if (selected.id === 'toggle' && alternate !== undefined) {
        const previous = candidate
        candidate = alternate
        alternate = previous
        continue
      }
      if (selected.id === 'edit') {
        const edited = await this.editThemeValue(candidate)
        if (edited !== undefined) {
          candidate = edited
          alternate = undefined
        }
        continue
      }
      if (warnings.length > 0) {
        const confirmed = await this.host.overlays.confirm(
          '主题存在对比度警告',
          `${warnings.join('；')}。颜色不会被静默修改。是否仍然保存？`,
          '仍然保存',
        )
        if (!confirmed) continue
      }
      try {
        const updated = await saveCustomTheme(
          this.capabilities.managementBridge().settings,
          document,
          normalizeCustomTheme(candidate),
          activation,
        )
        await this.settingsChanged(updated, `${activation === 'code' ? '代码主题 ' : ''}${candidate.name}`)
      } catch (error) {
        this.host.applyTheme(original)
        throw error
      }
      return
    }
  }

  private async themeDelete(requested: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe())
    const appearance = appearanceFromSettings(document)
    if (appearance.customThemes.length === 0) throw new Error('没有可删除的自定义主题')
    let theme = requested === '' ? undefined : appearance.customThemes.find(candidate =>
      candidate.id === requested || candidate.name.toLowerCase() === requested.toLowerCase())
    if (requested !== '' && theme === undefined) throw new Error(`找不到主题 ${JSON.stringify(requested)}`)
    if (theme === undefined) {
      const selected = await this.host.overlays.select({
        title: '删除主题',
        choices: appearance.customThemes.map(candidate => ({
          id: candidate.id,
          label: candidate.name,
          description: [
            appearance.theme === customThemeId(candidate) ? '当前界面' : undefined,
            appearance.codeTheme === customThemeId(candidate) ? '当前代码' : undefined,
            candidate.tone === 'dark' ? '暗色' : '亮色',
          ].filter((value): value is string => value !== undefined).join(' · '),
        })),
      })
      if (selected === undefined) return
      theme = appearance.customThemes.find(candidate => candidate.id === selected.id)
    }
    if (theme === undefined) return
    const confirmed = await this.host.overlays.confirm(
      `删除主题 ${theme.name}？`,
      appearance.theme === customThemeId(theme) && appearance.codeTheme === customThemeId(theme)
        ? '该主题会从 Harness Settings 删除；界面切换到 DeepSeek 暗色，代码主题恢复自动匹配。'
        : appearance.theme === customThemeId(theme)
          ? '该主题会从 Harness Settings 删除，界面立即切换到 DeepSeek 暗色。'
          : appearance.codeTheme === customThemeId(theme)
            ? '该主题会从 Harness Settings 删除，代码主题恢复自动匹配。'
            : '该主题会从 Harness Settings 删除；当前界面和代码主题不变。',
      '删除',
    )
    if (!confirmed) return
    const updated = await deleteCustomTheme(bridge, document, theme.id)
    await this.settingsChanged(updated, `主题 ${theme.name}`)
  }

  private async permission(args: string): Promise<void> {
    const options = this.capabilities.listPermissions()
    if (args !== '') {
      const target = options.find(option => option.id === args)
      if (target === undefined) throw new Error(`未知权限预设 ${JSON.stringify(args)}`)
      await this.selectPermission(target)
      return
    }
    const selected = await this.host.overlays.select({
      title: '权限',
      detail: `作用工作区：${this.capabilities.active()?.workspacePath ?? '未知'}`,
      choices: options.map(option => ({
        id: option.id,
        label: `${currentMark(option.current)}${permissionLabel(option)}`,
        description: permissionDescription(option),
      })),
    })
    if (selected === undefined) return
    const target = options.find(option => option.id === selected.id)
    if (target !== undefined) await this.selectPermission(target)
  }

  private async selectPermission(option: TuiPermissionOption): Promise<void> {
    if (option.current) return
    if (option.needsConfirmation) {
      const confirmed = await this.host.overlays.confirm(
        option.id === 'danger-full-access' ? '进入完全访问？' : '切换到未知风险权限？',
        `${permissionLabel(option)}：${permissionDescription(option)}。切换后立即作用于当前会话。`,
        '确认切换',
      )
      if (!confirmed) return
    }
    await this.capabilities.selectPermission(option.id)
    this.host.notice(`权限已切换为${permissionLabel(option)}`, 'success')
  }

  private async queue(): Promise<void> {
    await this.host.overlays.navigate(async (nav) => {
      let onList = true
      const onSelect = async (selected: OverlayChoice): Promise<void> => {
        if (selected.id === '__empty__') return
        onList = false
        try {
          await this.queueChoice(nav, selected.id)
        } finally {
          onList = true
        }
      }
      const paint = (): void => {
        if (!onList) return
        nav.replaceSelectPage(this.queueListRequest(), onSelect)
      }
      const timer = setInterval(paint, 1_000)
      timer.unref()
      try {
        await nav.selectPage(this.queueListRequest(), onSelect)
      } finally {
        clearInterval(timer)
      }
    })
  }

  private queueListRequest(): SelectOverlayRequest {
    const rows = this.capabilities.active()?.session.getSnapshot().queue ?? []
    const queued = rows.filter(row => row.placement === 'queued')
    return {
      title: '输入队列',
      detail: '查看、编辑或提前处理排队消息 · 打开期间自动刷新',
      choices: rows.length === 0
        ? [{ id: '__empty__', label: '当前队列为空', disabledReason: '等待新的排队消息，或 Esc 关闭' }]
        : [
          ...(queued.length > 1
            ? [{ id: '__all_steer__', label: '整队引导', description: `按当前顺序处理 ${queued.length} 条排队消息` }]
            : []),
          ...(queued.length > 0
            ? [{ id: '__clear__', label: '清空全部', description: '删除所有排队消息，不影响当前轮次' }]
            : []),
          ...rows.map(row => ({
            id: row.id,
            label: row.preview === '' ? '(空消息)' : row.preview,
            description: queuePlacementLabel(row.placement),
            ...(row.placement === 'queued' ? {} : { disabledReason: '当前状态不接受队列修改' }),
          })),
        ],
      searchable: rows.length > 8,
      options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
    }
  }

  private async queueChoice(nav: OverlayNavigation, id: string): Promise<void> {
    const rows = this.capabilities.active()?.session.getSnapshot().queue ?? []
    const queued = rows.filter(row => row.placement === 'queued')
    if (id === '__all_steer__') {
      for (const row of queued) await this.capabilities.updateQueue(row.id, { kind: 'steer' })
      this.host.notice('已请求整队引导', 'success')
      return
    }
    if (id === '__clear__') {
      const confirmed = await nav.confirm(
        '清空输入队列？',
        '将删除全部排队消息；正在处理的轮次不受影响。',
        '清空全部',
      )
      if (!confirmed) return
      for (const row of queued) await this.capabilities.updateQueue(row.id, { kind: 'remove' })
      this.host.notice('已清空输入队列', 'success')
      return
    }
    const row = rows.find(candidate => candidate.id === id)
    if (row === undefined || row.placement !== 'queued') return
    const index = queued.findIndex(candidate => candidate.id === row.id)
    const canReorder = queued.length > 1 && queued.every(item => item.text !== null)
    const action = await nav.select({
      title: '队列操作',
      choices: [
        { id: 'steer', label: '转为引导', description: '并入当前轮次' },
        { id: 'edit', label: '编辑', ...(row.text === null ? { disabledReason: '含非文本内容，无法文本编辑' } : {}) },
        {
          id: 'up',
          label: '上移',
          description: '与上一条排队消息对调',
          ...(!canReorder || index <= 0
            ? { disabledReason: !canReorder ? '含非文本内容或不足两条，无法重排' : '已在队首' }
            : {}),
        },
        {
          id: 'down',
          label: '下移',
          description: '与下一条排队消息对调',
          ...(!canReorder || index >= queued.length - 1
            ? { disabledReason: !canReorder ? '含非文本内容或不足两条，无法重排' : '已在队尾' }
            : {}),
        },
        { id: 'remove', label: '删除', description: '从待处理队列移除' },
      ],
      searchable: false,
    })
    if (action === undefined) return
    if (action.id === 'steer') await this.capabilities.updateQueue(row.id, { kind: 'steer' })
    if (action.id === 'remove') await this.capabilities.updateQueue(row.id, { kind: 'remove' })
    if (action.id === 'edit' && row.text !== null) {
      const text = await nav.multilineInput({ title: '编辑排队消息', initialValue: row.text })
      if (text !== undefined) await this.capabilities.updateQueue(row.id, { kind: 'edit', content: [{ type: 'text', text }] })
    }
    if (action.id === 'up' || action.id === 'down') {
      await this.reorderQueued(queued, index, action.id === 'up' ? -1 : 1)
    }
    this.host.notice('队列操作已提交', 'success')
  }

  private async reorderQueued(
    queued: ConversationSnapshot['queue'],
    index: number,
    direction: -1 | 1,
  ): Promise<void> {
    const movable = queued.filter(row => row.placement === 'queued')
    if (movable.some(row => row.text === null)) throw new Error('含非文本内容，无法重排')
    const ordered = moveIndex(movable, index, direction)
    if (ordered.every((row, position) => row.id === movable[position]?.id)) return
    const active = this.capabilities.active()
    if (active === undefined) return
    for (const row of movable) await this.capabilities.updateQueue(row.id, { kind: 'remove' })
    for (const row of ordered) {
      const text = row.text
      if (text === null) continue
      const result = await active.session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) throw new Error(`重排队列失败：${result.error.message}`)
    }
  }

  private async steer(args: string): Promise<void> {
    if (args === '') throw new Error('用法：/steer <消息>')
    const active = this.capabilities.active()
    if (active === undefined) return
    const result = await active.session.prompt(this.capabilities.promptContent(args), 'steer')
    if (!result.ok) throw new Error(`引导失败：${result.error.message}`)
    this.capabilities.clearAttachments()
    this.host.notice('引导已接受', 'success')
  }

  private async attach(args: string): Promise<void> {
    if (args === '') throw new Error('用法：/attach <图片路径>')
    const attachment = await this.capabilities.addAttachment(args)
    const dimensions = attachment.width === undefined ? '' : ` · ${attachment.width}×${attachment.height}`
    this.host.notice(`已加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`, 'success')
  }

  private async attachments(): Promise<void> {
    const items = this.capabilities.draftAttachments()
    if (items.length === 0) {
      this.host.notice('没有待发送图片', 'info')
      return
    }
    const confirmed = await this.host.overlays.confirm(
      '清空待发送图片？',
      items.map(item => `${item.name} (${item.bytes} B)`).join('；'),
      '清空',
    )
    if (!confirmed) return
    this.capabilities.clearAttachments()
    this.host.notice('已清空待发送图片', 'success')
  }

  private async settings(args: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const documents = await bridge.describe()
    if (documents.length === 0) throw new Error('当前 Profile 未注册任何 Settings 命名空间')
    if (args !== '') {
      const document = documents.find(candidate => candidate.namespace === args)
      if (document === undefined) throw new Error(`Settings 命名空间 ${JSON.stringify(args)} 不存在`)
    }
    await this.host.overlays.navigate<void>(async (navigation) => {
      const root = navigation.selectPage({
        title: '设置',
        detail: '搜索并修改全部功能设置',
        choices: documents.map(candidate => ({
          id: candidate.namespace,
          label: candidate.namespace,
          description: `${settingsSectionLabel(candidate.namespace)} · ${candidate.applies === 'live' ? '立即生效' : '需重启'}`,
        })),
      }, async (selected) => {
        await this.settingsNamespace(navigation, selected.id)
      })
      if (args !== '') await this.settingsNamespace(navigation, args)
      await root
    }, { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 })
  }

  private async settingsNamespace(
    navigation: OverlayNavigation<void>,
    namespace: string,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const initialDocument = (await bridge.describe()).find(candidate => candidate.namespace === namespace)
    if (initialDocument === undefined) throw new Error(`Settings 命名空间 ${JSON.stringify(namespace)} 不存在`)
    let document: TuiSettingsDocument = initialDocument
    let fields = settingsFields(document)
    let special = this.settingsSpecialChoices(document)
    if (fields.length + special.length === 0) {
      this.host.notice(`${document.namespace} 没有可见设置字段`, 'info')
      return
    }
    const request = (initialChoiceId?: string): SelectOverlayRequest => ({
      title: `设置 · ${document.namespace}`,
      detail: `${settingsSectionLabel(document.namespace)} · ${document.applies === 'live' ? '修改立即生效' : '修改后需重启'}`,
      choices: [
        ...special,
        ...fields.map(field => ({
          id: JSON.stringify(field.path),
          label: field.label,
          description: `${fieldState(field)}${field.description === undefined ? '' : ` · ${field.description}`}`,
          ...(field.disabled ? { disabledReason: '该字段当前不可编辑' } : {}),
        })),
      ],
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
    })
    const handle = async (selected: OverlayChoice): Promise<void> => {
      if (selected.id.startsWith('__settings_')) {
        await this.editSpecialSetting(navigation, document, selected.id)
      } else {
        const field = fields.find(candidate => JSON.stringify(candidate.path) === selected.id)
        if (field !== undefined) await this.editSetting(navigation, document, field)
      }
      const refreshed = (await bridge.describe()).find(candidate => candidate.namespace === namespace)
      if (refreshed === undefined) {
        this.host.notice(`Settings 命名空间 ${namespace} 已不可用`, 'warning')
        navigation.back()
        return
      }
      document = refreshed
      fields = settingsFields(document)
      special = this.settingsSpecialChoices(document)
      if (fields.length + special.length === 0) {
        this.host.notice(`${document.namespace} 没有可见设置字段`, 'info')
        navigation.back()
        return
      }
      navigation.replaceSelectPage(request(selected.id), handle)
    }
    await navigation.selectPage(request(), handle)
  }

  private settingsSpecialChoices(document: TuiSettingsDocument): readonly OverlayChoice[] {
    switch (document.namespace) {
      case LOCALE_SETTINGS_NAMESPACE:
        return [{
          id: '__settings_language__',
          label: ui('选择界面语言…', 'Choose interface language…'),
          description: ui('与 Harness Web 共用同一语言偏好', 'Shares the same preference with Harness Web'),
        }]
      case 'agent-default-model':
        return [{
          id: '__settings_default_model__',
          label: '选择新会话默认模型…',
          description: '动态 Provider、模型与推理强度；不会修改当前会话',
        }]
      case 'permission':
        return [{
          id: '__settings_default_permission__',
          label: '选择新会话默认权限…',
          description: '完全访问仍需确认；不会修改当前会话',
        }]
      case 'agent-presets':
        return [{
          id: '__settings_default_mode__',
          label: '选择新会话默认模式…',
          description: '从当前可用模式中选择',
        }]
      case 'tui-plugin-marketplace':
        return [{
          id: '__settings_plugin_sources__',
          label: '管理插件市场来源…',
          description: '管理 npm 和其他插件目录来源',
        }]
      default: return []
    }
  }

  private async editSpecialSetting(
    overlays: OverlayPrompts,
    document: TuiSettingsDocument,
    action: string,
  ): Promise<void> {
    switch (action) {
      case '__settings_language__': await this.language('', overlays, document); return
      case '__settings_default_model__': await this.editDefaultModel(overlays, document); return
      case '__settings_default_permission__': await this.editDefaultPermission(overlays, document); return
      case '__settings_default_mode__': await this.editDefaultMode(overlays, document); return
      case '__settings_plugin_sources__': await this.pluginSources('', overlays); return
      default: throw new Error(`未知 Settings 专用动作 ${JSON.stringify(action)}`)
    }
  }

  private async editDefaultModel(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const directory = await this.capabilities.listModels()
    const current = typeof document.value === 'object' && document.value !== null
      ? document.value as Record<string, unknown>
      : {}
    const selected = await overlays.select({
      title: '新会话默认模型',
      detail: '保存后只影响未来创建且未单独选择模型的会话',
      choices: [
        ...directory.options.map(option => ({
          id: option.id,
          label: `${current.provider === option.selection.provider && current.model === option.selection.model ? '当前 · ' : ''}${option.label}`,
          description: option.description,
        })),
        ...directory.failures.map((failure, index) => ({
          id: `__failure_${String(index)}`,
          label: 'Provider 目录不可用',
          disabledReason: failure,
        })),
      ],
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const option = directory.options.find(candidate => candidate.id === selected.id)
    if (option === undefined) return
    const selection = await this.reasoningSelection(option, overlays)
    if (selection === undefined) return
    const ops: TuiSettingsPathOp[] = [
      { op: 'set', path: ['provider'], value: selection.provider },
      { op: 'set', path: ['model'], value: selection.model },
      selection.reasoningEffort === undefined
        ? { op: 'unset', path: ['reasoningEffort'] }
        : { op: 'set', path: ['reasoningEffort'], value: selection.reasoningEffort },
    ]
    const updated = await this.capabilities.managementBridge().settings.mutate(
      document.namespace,
      ops,
      document.revision,
    )
    await this.settingsChanged(updated, '新会话默认模型', overlays)
  }

  private async editDefaultPermission(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const field = settingsFields(document).find(candidate => candidate.path.length === 1 && candidate.path[0] === 'defaultPreset')
    if (field === undefined) throw new Error('当前设置没有默认权限选项；仍可使用下方通用控件')
    const options = this.capabilities.listPermissions()
    const selected = await overlays.select({
      title: '新会话默认权限',
      detail: '保存后只影响未来创建的会话；当前会话权限保持不变',
      choices: options.map(option => ({
        id: option.id,
        label: `${field.value === option.id ? '当前默认 · ' : ''}${permissionLabel(option)}`,
        description: permissionDescription(option),
      })),
    })
    if (selected === undefined) return
    const option = options.find(candidate => candidate.id === selected.id)
    if (option === undefined || Object.is(field.value, option.id)) return
    if (option.needsConfirmation) {
      const confirmed = await overlays.confirm(
        option.id === 'danger-full-access' ? '新会话默认使用完全访问？' : '使用未知风险默认权限？',
        `${permissionLabel(option)}：${permissionDescription(option)}。以后创建的会话会采用该权限；现有会话不会改变。`,
        '确认保存',
      )
      if (!confirmed) return
    }
    const updated = await this.capabilities.managementBridge().settings.mutate(
      document.namespace,
      [{ op: 'set', path: field.path, value: option.id }],
      document.revision,
    )
    await this.settingsChanged(updated, '新会话默认权限', overlays)
  }

  private async editDefaultMode(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const field = settingsFields(document).find(candidate => candidate.path.length === 1 && candidate.path[0] === 'default')
    if (field === undefined) throw new Error('当前设置没有默认模式选项；仍可使用下方通用控件')
    const modes = await this.capabilities.listModes()
    const selected = await overlays.select({
      title: '新会话默认模式',
      detail: '保存后只影响未来创建且未显式选择 Agent Preset 的会话',
      choices: modes.map(mode => ({
        id: mode.id,
        label: `${field.value === mode.id ? '当前默认 · ' : ''}${mode.label}`,
        description: `${mode.trust === 'system' ? '系统' : '用户'}${mode.description === undefined ? '' : ` · ${mode.description}`}`,
        ...(mode.disabledReason === undefined ? {} : { disabledReason: mode.disabledReason }),
      })),
    })
    if (selected === undefined || Object.is(field.value, selected.id)) return
    const mode = modes.find(candidate => candidate.id === selected.id)
    if (mode === undefined || mode.disabledReason !== undefined) return
    const updated = await this.capabilities.managementBridge().settings.mutate(
      document.namespace,
      [{ op: 'set', path: field.path, value: mode.id }],
      document.revision,
    )
    await this.settingsChanged(updated, '新会话默认模式', overlays)
  }

  private async editSetting(
    overlays: OverlayPrompts,
    document: TuiSettingsDocument,
    field: TuiSettingsField,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const actions: OverlayChoice[] = [
      { id: 'edit', label: field.control === 'secret' ? '写入新 Secret…' : '修改值…', description: `控件：${field.control}` },
      ...(field.overridden
        ? [{ id: 'reset', label: '重置用户覆盖', description: `恢复继承/default：${formatSettingsValue(field.inherited)}` }]
        : []),
      ...(field.control === 'credential-ref'
        ? [
          { id: 'credential-set', label: '配置该 Credential…', description: '密钥不会在界面回显' },
          ...(typeof field.value === 'string' && field.value.trim() !== ''
            ? [{ id: 'credential-unset', label: '清除该 Credential', description: '不改变 Settings 中的 Credential Ref' }]
            : []),
        ]
        : []),
    ]
    const action = await overlays.select({
      title: field.label,
      detail: `${field.description ?? '暂无说明'}
当前：${field.control === 'secret' ? (field.secretSet ? '已配置（不可回显）' : '未配置') : formatSettingsValue(field.value)}
配置：${field.overridden ? '已单独设置' : `使用默认值 ${formatSettingsValue(field.inherited)}`}`,
      choices: actions,
      searchable: false,
    })
    if (action === undefined) return
    if (action.id === 'credential-set' || action.id === 'credential-unset') {
      await this.manageCredential(overlays, document, field, action.id === 'credential-set')
      return
    }
    const updated = action.id === 'reset'
      ? await bridge.mutate(document.namespace, [{ op: 'unset', path: field.path }], document.revision)
      : await this.writeSetting(overlays, document, field)
    if (updated !== undefined) await this.settingsChanged(updated, `${document.namespace}.${field.path.join('.')}`, overlays)
  }

  private async writeSetting(
    overlays: OverlayPrompts,
    document: TuiSettingsDocument,
    field: TuiSettingsField,
  ): Promise<TuiSettingsDocument | undefined> {
    let value: unknown
    if (field.control === 'boolean') {
      const choice = await overlays.select({
        title: field.label,
        choices: [
          { id: 'true', label: '开启', description: 'true' },
          { id: 'false', label: '关闭', description: 'false' },
        ],
        searchable: false,
      })
      if (choice === undefined) return undefined
      value = choice.id === 'true'
    } else if (field.control === 'enum') {
      const choice = await overlays.select({
        title: field.label,
        choices: field.choices.map(option => ({
          id: option.id,
          label: option.label,
          ...(Object.is(option.value, field.value) ? { description: '当前' } : {}),
        })),
        searchable: false,
      })
      if (choice === undefined) return undefined
      value = field.choices.find(option => option.id === choice.id)?.value
    } else if (field.control === 'secret') {
      const secret = await overlays.secretInput({
        title: `写入 ${field.label}`,
        detail: '现有值不会回显；保存后将替换原值',
        placeholder: '输入新 Secret',
      })
      if (secret === undefined || secret === '') return undefined
      value = secret
    } else {
      const initialValue = field.control === 'json'
        ? JSON.stringify(field.value, null, 2)
        : (typeof field.value === 'string' ? field.value : '')
      const text = await overlays.input({
        title: `修改 ${field.label}`,
        ...(field.description === undefined ? {} : { detail: field.description }),
        initialValue,
      })
      if (text === undefined) return undefined
      value = parseSettingsValue(field, text)
    }
    return this.capabilities.managementBridge().settings.mutate(
      document.namespace,
      [{ op: 'set', path: field.path, value }],
      document.revision,
    )
  }

  private async manageCredential(
    overlays: OverlayPrompts,
    document: TuiSettingsDocument,
    field: TuiSettingsField,
    set: boolean,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    let ref = typeof field.value === 'string' ? field.value.trim() : ''
    let writeReference = false
    if (ref === '') {
      const entered = await overlays.input({
        title: 'Credential Ref',
        detail: '这是引用名，不是 Secret 值',
        placeholder: '例如 DEEPSEEK_API_KEY',
      })
      if (entered === undefined || entered.trim() === '') return
      ref = entered.trim()
      writeReference = true
    }
    const info = await bridge.credentialInfo(ref)
    if (!info.writable) throw new Error(`Credential ${JSON.stringify(ref)} 由系统管理，不能在这里修改`)
    if (set) {
      const secret = await overlays.secretInput({
        title: `配置 Credential ${ref}`,
        detail: `状态：${info.configured ? '已配置' : '未配置'}。原值不会回显；保存后将替换原值。`,
        placeholder: '输入 Secret',
      })
      if (secret === undefined || secret === '') return
      if (writeReference) {
        document = await bridge.mutate(
          document.namespace,
          [{ op: 'set', path: field.path, value: ref }],
          document.revision,
        )
      }
      await bridge.setCredential(ref, secret)
      await this.settingsChanged(document, `Credential ${ref}`, overlays)
      return
    }
    if (writeReference) return
    if (!info.configured) {
      this.host.notice(`Credential ${ref} 未配置`, 'info')
      return
    }
    const confirmed = await overlays.confirm(
      `清除 Credential ${ref}？`,
      '密钥将被清除，Settings 中的引用名会保留。',
      '清除',
    )
    if (!confirmed) return
    await bridge.unsetCredential(ref)
    await this.settingsChanged(document, `Credential ${ref}`, overlays)
  }

  private async settingsChanged(
    document: TuiSettingsDocument,
    label: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    if (document.applies === 'live') {
      if (document.namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) {
        this.host.applyTheme(themeFromAppearance(document))
      }
      if (document.namespace === LOCALE_SETTINGS_NAMESPACE) {
        this.host.applyLocale(localeFromSettings([document]))
      }
      this.host.notice(`${label} 已更新并立即生效`, 'success')
      return
    }
    const restart = await overlays.confirm(
      `${label} 需要重启`,
      '可立即受控重启并恢复工作区、会话、草稿和附件路径，或稍后使用 /restart。',
      '立即重启',
    )
    if (restart) this.host.restart(this.capabilities.currentProfile(), `已应用 ${label}`)
    else this.host.requireRestart(`${label} 已修改，输入 /restart 生效`)
  }

  private async plugin(args: string): Promise<void> {
    const parsed = commandParts(args)
    switch (parsed.command) {
      case '': await this.pluginCenter(); return
      case 'list': await this.pluginList(); return
      case 'search': await this.pluginSearch(parsed.rest); return
      case 'info': await this.pluginInfo(parsed.rest); return
      case 'install':
      case 'add': await this.pluginInstall(parsed.rest); return
      case 'remove':
      case 'rm': await this.pluginRemove(parsed.rest); return
      case 'update':
      case 'up': await this.pluginUpdate(parsed.rest); return
      case 'reorder': await this.pluginReorder(); return
      case 'source':
      case 'sources': await this.pluginSources(parsed.rest); return
      case 'doctor': await this.doctor(); return
      default: throw new Error('用法：/plugin [list|search|info|install|remove|update|reorder|source|doctor]')
    }
  }

  private async pluginCenter(): Promise<void> {
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    const selected = await this.host.overlays.select({
      title: `插件中心 · ${snapshot.profile}`,
      detail: '查看已安装插件、启用状态和加载顺序',
      choices: [
        ...snapshot.plugins.map(plugin => ({
          id: `plugin:${plugin.name}`,
          label: `${plugin.active ? '● ' : ''}${pluginIdentity(plugin)}`,
          description: pluginDescription(plugin),
        })),
        { id: '__search__', label: '搜索插件…', description: '从已启用的插件目录中搜索' },
        { id: '__install__', label: '安装插件…', description: '支持 npm、Git、压缩包和本地目录；安装前确认' },
        { id: '__update__', label: '更新插件…', description: '更新当前 Profile 的插件' },
        { id: '__reorder__', label: '调整插件顺序…', description: `${snapshot.bundles.length} 个活动插件` },
        { id: '__sources__', label: '插件目录…', description: '查看或添加插件目录' },
        { id: '__doctor__', label: '运行诊断', description: '检查插件加载和运行环境' },
      ],
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id.startsWith('plugin:')) {
      const plugin = snapshot.plugins.find(candidate => candidate.name === selected.id.slice('plugin:'.length))
      if (plugin !== undefined) await this.installedPlugin(plugin)
      return
    }
    if (selected.id === '__search__') await this.pluginSearch('')
    if (selected.id === '__install__') await this.pluginInstall('')
    if (selected.id === '__update__') await this.pluginUpdate('')
    if (selected.id === '__reorder__') await this.pluginReorder()
    if (selected.id === '__sources__') await this.pluginSources('')
    if (selected.id === '__doctor__') await this.doctor()
  }

  private async pluginList(): Promise<void> {
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    if (snapshot.plugins.length === 0) {
      this.host.notice(`Profile ${snapshot.profile} 没有已安装插件依赖`, 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: `已安装插件 · ${snapshot.profile}`,
      choices: snapshot.plugins.map(plugin => ({
        id: plugin.name,
        label: `${plugin.active ? '● ' : ''}${pluginIdentity(plugin)}`,
        description: pluginDescription(plugin),
      })),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const plugin = snapshot.plugins.find(candidate => candidate.name === selected.id)
    if (plugin !== undefined) await this.installedPlugin(plugin)
  }

  private async installedPlugin(plugin: TuiPluginEntry): Promise<void> {
    const detail = ui(
      `${plugin.description ?? '无包说明'}
spec：${plugin.spec}
来源：${plugin.source}
Bundle：${plugin.bundle ? (plugin.active ? '已启用' : '未启用') : '否'}
patch：${plugin.patch ?? '未声明'} · ${plugin.patchValid ? '有效' : '无效'}
生命周期脚本：${plugin.scripts.length === 0 ? '无' : plugin.scripts.join(', ')}
诊断：${plugin.diagnostics.length === 0 ? '无' : plugin.diagnostics.join('；')}`,
      `${plugin.description ?? 'No package description'}
spec: ${plugin.spec}
Source: ${plugin.source}
Bundle: ${plugin.bundle ? (plugin.active ? 'enabled' : 'disabled') : 'no'}
patch: ${plugin.patch ?? 'not declared'} · ${plugin.patchValid ? 'valid' : 'invalid'}
Lifecycle scripts: ${plugin.scripts.length === 0 ? 'none' : plugin.scripts.join(', ')}
Diagnostics: ${plugin.diagnostics.length === 0 ? 'none' : plugin.diagnostics.map(translateUiText).join('; ')}`,
    )
    const selected = await this.host.overlays.select({
      title: pluginIdentity(plugin),
      detail,
      choices: [
        { id: 'update', label: '更新…', description: `pnpm update ${plugin.name}` },
        { id: 'remove', label: '移除…', description: `pnpm remove ${plugin.name}` },
      ],
      searchable: false,
    })
    if (selected?.id === 'update') await this.pluginUpdate(plugin.name)
    if (selected?.id === 'remove') await this.pluginRemove(plugin.name)
  }

  private async pluginSearch(query: string): Promise<void> {
    let text = query.trim()
    if (text === '') {
      const entered = await this.host.overlays.input({ title: '搜索插件', placeholder: '名称、描述或 Catalog 关键词' })
      if (entered === undefined || entered.trim() === '') return
      text = entered.trim()
    }
    const candidates = await this.capabilities.managementBridge().plugins.search(text)
    if (candidates.length === 0) {
      this.host.notice(`未找到与 ${JSON.stringify(text)} 匹配的插件`, 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: `插件搜索 · ${text}`,
      detail: '“验证通过”只表示包结构兼容，不表示官方、审核过、安全或可信',
      choices: candidates.map(candidate => ({
        id: candidate.id,
        label: `${candidate.name}${candidate.version === undefined ? '' : `@${candidate.version}`}`,
        description: `${candidate.description ?? candidate.spec} · ${candidateDescription(candidate)}${candidate.diagnostics.length === 0 ? '' : ` · ${candidate.diagnostics.join('；')}`}`,
      })),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const candidate = candidates.find(item => item.id === selected.id)
    if (candidate !== undefined) await this.marketplaceCandidate(candidate)
  }

  private async pluginInfo(spec: string): Promise<void> {
    if (spec === '') throw new Error('用法：/plugin info <包名或 spec>')
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    const installed = snapshot.plugins.find(plugin => plugin.name === spec)
    if (installed !== undefined) {
      await this.installedPlugin(installed)
      return
    }
    const candidate = await this.capabilities.managementBridge().plugins.inspect(spec)
    await this.marketplaceCandidate(candidate)
  }

  private async marketplaceCandidate(candidate: TuiMarketplaceCandidate): Promise<void> {
    const selected = await this.host.overlays.select({
      title: `${candidate.name}${candidate.version === undefined ? '' : `@${candidate.version}`}`,
      detail: this.candidateDetail(candidate),
      choices: [{
        id: 'install',
        label: '安装到当前 Profile…',
        description: `pnpm add --save-exact ${candidate.spec}`,
        ...candidate.source !== 'git' && (!candidate.bundle || !candidate.patchValid)
          ? { disabledReason: '候选未通过 Bundle patch 安装前验证' }
          : {},
      }],
      searchable: false,
      options: { width: '90%', maxHeight: '85%', anchor: 'center', margin: 1 },
    })
    if (selected?.id === 'install') await this.installCandidate(candidate)
  }

  private candidateDetail(candidate: TuiMarketplaceCandidate): string {
    return ui(
      `${candidate.description ?? '无包说明'}
发布者：${candidate.publisher ?? '未知'}
来源：${candidate.sourceId} / ${candidate.source}
spec：${candidate.spec}
定位：${candidate.immutable ? '不可变' : '可变，未来内容可能改变'}
Bundle patch：${candidate.bundle ? (candidate.patchValid ? '声明且有效' : '声明但无效') : '未声明/尚未验证'}
生命周期脚本：${candidate.scripts.length === 0 ? '无或尚未知' : candidate.scripts.join(', ')}
诊断：${candidate.diagnostics.length === 0 ? '无' : candidate.diagnostics.join('；')}
信任边界：Profile 插件安装器（pnpm），不受当前 Agent permission 或 sandbox 约束；包脚本以启动 deepseek 的本机用户权限运行。
注意：结构验证不代表安全、信任或质量审核。`,
      `${candidate.description ?? 'No package description'}
Publisher: ${candidate.publisher ?? 'unknown'}
Source: ${candidate.sourceId} / ${candidate.source}
spec: ${candidate.spec}
Reference: ${candidate.immutable ? 'immutable' : 'mutable; future content may change'}
Bundle patch: ${candidate.bundle ? (candidate.patchValid ? 'declared and valid' : 'declared but invalid') : 'not declared / not yet validated'}
Lifecycle scripts: ${candidate.scripts.length === 0 ? 'none or not yet known' : candidate.scripts.join(', ')}
Diagnostics: ${candidate.diagnostics.length === 0 ? 'none' : candidate.diagnostics.map(translateUiText).join('; ')}
Trust boundary: the Profile plugin installer (pnpm) is outside the current Agent permission and sandbox; package scripts run with the local account that started DeepSeek.
Warning: structural validation is not a security, trust, or quality review.`,
    )
  }

  private async pluginInstall(spec: string): Promise<void> {
    let value = spec.trim()
    if (value === '') {
      const entered = await this.host.overlays.input({
        title: '按 spec 安装插件',
        detail: '支持 npm、Git、tarball 和本地路径；不接受带内嵌凭证的 URL',
        placeholder: '例如 @scope/plugin@1.2.3',
      })
      if (entered === undefined || entered.trim() === '') return
      value = entered.trim()
    }
    const candidate = await this.capabilities.managementBridge().plugins.inspect(value)
    if (candidate.source !== 'git' && (!candidate.bundle || !candidate.patchValid)) {
      throw new Error(`已拒绝安装：${candidate.diagnostics.join('；') || '未通过 dsh.bundle.patch 验证'}`)
    }
    await this.installCandidate(candidate)
  }

  private async installCandidate(candidate: TuiMarketplaceCandidate): Promise<void> {
    const profile = this.capabilities.currentProfile()
    const confirmed = await this.host.overlays.confirm(
      `安装 ${candidate.name} 到 ${profile}？`,
      ui(
        `${this.candidateDetail(candidate)}
将执行：pnpm add --save-exact ${candidate.spec}
目标 Profile：${profile}
pnpm 可能执行上述包脚本；Git 包只能在安装后由原生 Manager 再验证。此操作不使用 Agent 沙箱。`,
        `${this.candidateDetail(candidate)}
Will run: pnpm add --save-exact ${candidate.spec}
Target Profile: ${profile}
pnpm may run the package scripts listed above; a Git package can be revalidated by the native Manager only after installation. This operation does not use the Agent sandbox.`,
      ),
      '理解风险并安装',
    )
    if (!confirmed) return
    const result = await this.capabilities.managementBridge().plugins.run(['add', '--save-exact', candidate.spec])
    await this.pluginOperation(`安装 ${candidate.name}`, result)
  }

  private async pluginRemove(name: string): Promise<void> {
    let target = name.trim()
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    if (target === '') {
      const selected = await this.host.overlays.select({
        title: '移除插件',
        choices: snapshot.plugins.map(plugin => ({
          id: plugin.name,
          label: pluginIdentity(plugin),
          description: pluginDescription(plugin),
        })),
      })
      if (selected === undefined) return
      target = selected.id
    }
    const plugin = snapshot.plugins.find(candidate => candidate.name === target)
    if (plugin === undefined) throw new Error(`当前 Profile 未安装 ${JSON.stringify(target)}`)
    const confirmed = await this.host.overlays.confirm(
      `从 ${snapshot.profile} 移除 ${target}？`,
      `将执行：pnpm remove ${target}。Bundle 列表会由原生 Manager 对账。`,
      '移除',
    )
    if (!confirmed) return
    await this.pluginOperation(`移除 ${target}`, await this.capabilities.managementBridge().plugins.run(['remove', target]))
  }

  private async pluginUpdate(name: string): Promise<void> {
    let target = name.trim()
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    if (target === '') {
      const selected = await this.host.overlays.select({
        title: '更新插件',
        choices: [
          { id: '__all__', label: '更新全部 Profile 依赖', description: 'pnpm update' },
          ...snapshot.plugins.map(plugin => ({ id: plugin.name, label: pluginIdentity(plugin), description: plugin.spec })),
        ],
      })
      if (selected === undefined) return
      target = selected.id === '__all__' ? '' : selected.id
    } else if (!snapshot.plugins.some(plugin => plugin.name === target)) {
      throw new Error(`当前 Profile 未安装 ${JSON.stringify(target)}`)
    }
    const args = target === '' ? ['update'] : ['update', target]
    const confirmed = await this.host.overlays.confirm(
      target === '' ? `更新 ${snapshot.profile} 全部依赖？` : `更新 ${target}？`,
      `将执行：pnpm ${args.join(' ')}。解析结果由 Profile lockfile 持久化。`,
      '更新',
    )
    if (!confirmed) return
    await this.pluginOperation(target === '' ? '更新全部插件' : `更新 ${target}`, await this.capabilities.managementBridge().plugins.run(args))
  }

  private async pluginOperation(label: string, result: TuiPluginOperation): Promise<void> {
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || '无 pnpm 输出'
      throw new Error(`${label} 失败（exit ${result.exitCode}）：${detail.slice(-1200)}`)
    }
    const warnings = result.warnings.length === 0 ? '' : `；${result.warnings.join('；')}`
    this.host.notice(`${label} 完成${result.changed ? '' : '（没有变化）'}${warnings}`, warnings === '' ? 'success' : 'warning')
    if (!result.restartRequired) return
    await this.restartAfterPluginChange(label)
  }

  private async restartAfterPluginChange(label: string): Promise<void> {
    const restart = await this.host.overlays.confirm(
      `${label} 后需要重启`,
      '重启后会恢复当前工作区、会话、草稿和附件。',
      '立即重启',
    )
    if (restart) this.host.restart(this.capabilities.currentProfile(), `${label} 已应用`)
    else this.host.requireRestart(`${label} 已完成，输入 /restart 加载变更`)
  }

  private async pluginReorder(): Promise<void> {
    const bridge = this.capabilities.managementBridge().plugins
    const snapshot = await bridge.snapshot()
    if (snapshot.bundles.length < 2) {
      this.host.notice('当前插件少于 2 个，无需调整顺序', 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: 'Bundle 顺序',
      detail: '顺序直接对应 dsh.profile.bundles；不会增删 Bundle',
      choices: snapshot.bundles.map((bundle, index) => ({ id: bundle, label: `${index + 1}. ${bundle}` })),
    })
    if (selected === undefined) return
    const index = snapshot.bundles.indexOf(selected.id)
    const direction = await this.host.overlays.select({
      title: `移动 ${selected.id}`,
      choices: [
        { id: 'top', label: '移到最前', ...(index === 0 ? { disabledReason: '已在最前' } : {}) },
        { id: 'up', label: '上移一位', ...(index === 0 ? { disabledReason: '已在最前' } : {}) },
        { id: 'down', label: '下移一位', ...(index === snapshot.bundles.length - 1 ? { disabledReason: '已在最后' } : {}) },
        { id: 'bottom', label: '移到最后', ...(index === snapshot.bundles.length - 1 ? { disabledReason: '已在最后' } : {}) },
      ],
      searchable: false,
    })
    if (direction === undefined) return
    const bundles = [...snapshot.bundles]
    bundles.splice(index, 1)
    const target = direction.id === 'top'
      ? 0
      : direction.id === 'bottom'
        ? bundles.length
        : direction.id === 'up' ? index - 1 : index + 1
    bundles.splice(target, 0, selected.id)
    await bridge.reorder(bundles)
    this.host.notice('插件顺序已保存', 'success')
    await this.restartAfterPluginChange('调整 Bundle 顺序')
  }

  private async pluginSources(
    args: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().plugins
    const parsed = commandParts(args)
    if (parsed.command === 'add') {
      const input = commandParts(parsed.rest)
      if (input.command === '' || input.rest === '') throw new Error('用法：/plugin source add <id> <URL或文件>')
      const snapshot = await bridge.sources()
      await bridge.saveSources([...snapshot.sources, {
        id: input.command,
        kind: 'catalog',
        label: input.command,
        url: input.rest,
        enabled: true,
        builtIn: false,
      }], snapshot.revision)
      this.host.notice(`已添加插件目录 ${input.command}`, 'success')
      return
    }
    if (['remove', 'enable', 'disable'].includes(parsed.command)) {
      if (parsed.rest === '') throw new Error(`/plugin source ${parsed.command} 需要 Source id`)
      const snapshot = await bridge.sources()
      const target = snapshot.sources.find(source => source.id === parsed.rest)
      if (target === undefined || target.builtIn) throw new Error(`插件目录 ${JSON.stringify(parsed.rest)} 不存在或不可修改`)
      const sources = parsed.command === 'remove'
        ? snapshot.sources.filter(source => source.id !== target.id)
        : snapshot.sources.map(source => source.id === target.id
          ? { ...source, enabled: parsed.command === 'enable' }
          : source)
      await bridge.saveSources(sources, snapshot.revision)
      this.host.notice(`插件目录 ${target.id} 已${parsed.command === 'remove' ? '移除' : parsed.command === 'enable' ? '启用' : '停用'}`, 'success')
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      throw new Error('用法：/plugin source [list|add <id> <URL>|remove|enable|disable]')
    }
    const snapshot = await bridge.sources()
    const selected = await overlays.select({
      title: '插件市场来源',
      detail: 'npm 与插件提供的目录为只读；你添加的插件目录可在这里管理',
      choices: [
        ...snapshot.sources.map(source => ({
          id: `source:${source.id}`,
          label: `${source.enabled ? '● ' : '○ '}${source.label}`,
          description: `${source.kind} · ${source.url}${source.credentialRef === undefined ? '' : ` · Credential ${source.credentialRef}`}${source.builtIn ? ' · 内置' : ''}`,
        })),
        { id: '__add__', label: '添加插件目录…' },
      ],
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id === '__add__') {
      await this.addPluginSource(overlays, snapshot.sources, snapshot.revision)
      return
    }
    const source = snapshot.sources.find(item => item.id === selected.id.slice('source:'.length))
    if (source === undefined) return
    await this.editPluginSource(overlays, source, snapshot.sources, snapshot.revision)
  }

  private async addPluginSource(
    overlays: OverlayPrompts,
    sources: readonly TuiMarketplaceSource[],
    revision: number,
  ): Promise<void> {
    const id = await overlays.input({ title: '插件目录 ID', placeholder: '小写 kebab-case' })
    if (id === undefined || id.trim() === '') return
    const label = await overlays.input({ title: '插件目录名称', initialValue: id.trim() })
    if (label === undefined || label.trim() === '') return
    const url = await overlays.input({ title: '目录 URL 或文件', placeholder: 'https://example/catalog.json' })
    if (url === undefined || url.trim() === '') return
    const credentialRef = await overlays.input({
      title: 'Credential Ref（可选）',
      detail: '只输入引用名，不要在 URL 或此处粘贴 Secret',
      placeholder: '留空表示无认证',
    })
    if (credentialRef === undefined) return
    const source: TuiMarketplaceSource = {
      id: id.trim(),
      kind: 'catalog',
      label: label.trim(),
      url: url.trim(),
      enabled: true,
      ...(credentialRef.trim() === '' ? {} : { credentialRef: credentialRef.trim() }),
      builtIn: false,
    }
    await this.capabilities.managementBridge().plugins.saveSources([...sources, source], revision)
    this.host.notice(`已添加插件目录 ${source.id}`, 'success')
    if (source.credentialRef !== undefined) await this.configureSourceCredential(overlays, source.credentialRef)
  }

  private async editPluginSource(
    overlays: OverlayPrompts,
    source: TuiMarketplaceSource,
    sources: readonly TuiMarketplaceSource[],
    revision: number,
  ): Promise<void> {
    const choices: OverlayChoice[] = source.builtIn
      ? [
        ...(source.credentialRef === undefined
          ? []
          : [{ id: 'credential', label: '配置 Credential…', description: source.credentialRef }]),
        {
          id: 'close',
          label: '内置插件目录不可修改',
          disabledReason: '由插件提供方管理',
        },
      ]
      : [
        { id: 'toggle', label: source.enabled ? '停用' : '启用' },
        { id: 'credential', label: '配置 Credential…', description: source.credentialRef ?? '尚未设置 Credential Ref' },
        { id: 'remove', label: '移除插件目录…' },
      ]
    const selected = await overlays.select({
      title: source.label,
      detail: `${source.url}
${source.credentialRef === undefined ? '无 Credential Ref' : `Credential Ref：${source.credentialRef}`}`,
      choices,
      searchable: false,
    })
    if (selected === undefined) return
    if (selected.id === 'credential') {
      let ref = source.credentialRef
      if (ref === undefined || ref === '') {
        const entered = await overlays.input({ title: 'Credential Ref', placeholder: '输入引用名，不是 Secret' })
        if (entered === undefined || entered.trim() === '') return
        ref = entered.trim()
        const credentialRef = ref
        const updated = sources.map(item => item.id === source.id ? { ...item, credentialRef } : item)
        await this.capabilities.managementBridge().plugins.saveSources(updated, revision)
      }
      await this.configureSourceCredential(overlays, ref)
      return
    }
    if (source.builtIn) return
    if (selected.id === 'remove') {
      const confirmed = await overlays.confirm(`移除 ${source.label}？`, '该目录将不再参与搜索；已安装插件不受影响。', '移除')
      if (!confirmed) return
    }
    const next = selected.id === 'remove'
      ? sources.filter(item => item.id !== source.id)
      : sources.map(item => item.id === source.id ? { ...item, enabled: !source.enabled } : item)
    await this.capabilities.managementBridge().plugins.saveSources(next, revision)
    this.host.notice(`插件目录 ${source.id} 已${selected.id === 'remove' ? '移除' : source.enabled ? '停用' : '启用'}`, 'success')
  }

  private async configureSourceCredential(overlays: OverlayPrompts, ref: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const info = await bridge.credentialInfo(ref)
    if (!info.writable) {
      this.host.notice(`Credential ${ref} 由系统管理，无需在这里配置`, 'info')
      return
    }
    const secret = await overlays.secretInput({
      title: `配置 Credential ${ref}`,
      detail: '值不会回显；保存后将替换原值',
      placeholder: '输入 Secret；Esc 跳过',
    })
    if (secret === undefined || secret === '') return
    await bridge.setCredential(ref, secret)
    this.host.notice(`Credential ${ref} 已配置`, 'success')
  }

  private async doctor(): Promise<void> {
    const [report, status, inventory] = await Promise.all([
      this.capabilities.managementBridge().plugins.doctor(),
      this.capabilities.headerFacts(true),
      this.capabilities.pluginInventory(),
    ])
    const errors = report.diagnostics.filter(item => item.level === 'error').length
    const warnings = report.diagnostics.filter(item => item.level === 'warning').length
    const failedInstances = inventory.filter(item => item.fiberPhase === 'failed')
    const enabledInstances = inventory.filter(item => item.enabled).length
    const selected = await this.host.overlays.select({
      title: `诊断 · ${report.profile}`,
      detail: ui(
        `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}\npnpm：${report.pnpm ?? '不可用'} · ${errors} 个错误 · ${warnings} 个警告 · ${enabledInstances} 个插件运行中`,
        `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}\npnpm: ${report.pnpm ?? 'unavailable'} · ${errors} error(s) · ${warnings} warning(s) · ${enabledInstances} plugin(s) running`,
      ),
      choices: [
        {
          id: 'runtime',
          label: `Runtime · ${status.running ? '运行中' : '空闲'}`,
          description: `${status.workspace} · ${status.model} · ${status.permission}`,
        },
        ...report.diagnostics.map((item, index) => ({
          id: `plugin:${index}`,
          label: `${item.level === 'error' ? '✕' : item.level === 'warning' ? '!' : '✓'} ${translateUiText(item.message)}`,
          description: item.level,
        })),
        ...failedInstances.map(item => ({
          id: `loader:${item.entryId}`,
          label: `插件实例 · ${item.moduleName}`,
          description: `${item.enabled ? '已启用' : '已禁用'} · ${item.fiberPhase ?? '未挂载'}`,
        })),
      ],
      searchable: false,
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id === 'runtime') {
      await this.host.overlays.detail({
        title: ui('运行环境详情', 'Runtime details'),
        content: ui(
          [
            `Harness：${status.hostVersion}`,
            `Node：${status.nodeVersion}`,
            `系统：${status.platform}/${status.architecture}`,
            `pnpm：${report.pnpm ?? '不可用'}`,
            `Profile：${report.profile}`,
            `工作区：${status.workspace}`,
            `会话：${status.session}`,
            `模式：${status.mode}`,
            `模型：${status.model}`,
            `权限：${status.permission}`,
            `状态：${status.running ? '运行中' : '空闲'}`,
          ].join('\n'),
          [
            `Harness: ${status.hostVersion}`,
            `Node: ${status.nodeVersion}`,
            `System: ${status.platform}/${status.architecture}`,
            `pnpm: ${report.pnpm ?? 'unavailable'}`,
            `Profile: ${report.profile}`,
            `Workspace: ${status.workspace}`,
            `Session: ${status.session}`,
            `Mode: ${status.mode}`,
            `Model: ${status.model}`,
            `Permission: ${status.permission}`,
            `Status: ${status.running ? 'running' : 'idle'}`,
          ].join('\n'),
        ),
        options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      return
    }
    if (selected.id.startsWith('plugin:')) {
      const index = Number(selected.id.slice('plugin:'.length))
      const diagnostic = Number.isInteger(index) ? report.diagnostics[index] : undefined
      if (diagnostic === undefined) return
      const level = diagnostic.level === 'error' ? '错误' : diagnostic.level === 'warning' ? '警告' : '信息'
      await this.host.overlays.detail({
        title: `诊断详情 · ${level}`,
        content: translateUiText(diagnostic.message),
        options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      return
    }
    const loader = inventory.find(item => `loader:${item.entryId}` === selected.id)
    if (loader === undefined) return
    await this.host.overlays.detail({
      title: `插件实例详情 · ${loader.moduleName}`,
      content: ui(
        [
          `模块：${loader.moduleName}`,
          `实例：${loader.entryId}`,
          `状态：${loader.enabled ? '已启用' : '已禁用'}`,
          `加载阶段：${loader.fiberPhase ?? '未挂载'}`,
        ].join('\n'),
        [
          `Module: ${loader.moduleName}`,
          `Instance: ${loader.entryId}`,
          `Status: ${loader.enabled ? 'enabled' : 'disabled'}`,
          `Load phase: ${loader.fiberPhase ?? 'not mounted'}`,
        ].join('\n'),
      ),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
  }

  private async restart(): Promise<void> {
    const profile = this.capabilities.currentProfile()
    const confirmed = await this.host.overlays.confirm(
      '重新启动 deepseek？',
      '会恢复当前工作区、会话、未发送草稿和附件；正在运行的任务会停止。',
      '重启',
    )
    if (confirmed) this.host.restart(profile, `Profile ${profile} 已重启`)
  }

  private async tools(args: string): Promise<void> {
    if (args === 'display') {
      const mode = this.host.transcript.cycleToolVisibility()
      this.host.notice(`工具卡片：${mode === 'collapsed' ? '折叠' : mode === 'expanded' ? '展开' : '隐藏'}`, 'info')
      this.host.refresh()
      return
    }
    if (args !== '') throw new Error('用法：/tools [display]')
    const tools = this.capabilities.toolCatalog()
    const todos = this.capabilities.projection('todos')
    const choices: OverlayChoice[] = [
      { id: '__display__', label: '调整工具卡片显示', description: '折叠 → 展开 → 隐藏' },
      ...(Array.isArray(todos)
        ? [{ id: '__todos__', label: `任务清单 · ${todos.length} 项`, description: '查看当前任务清单' }]
        : []),
      ...tools.map((tool) => {
        const boundary = toolBoundary(tool)
        return { id: `tool:${tool.name}`, label: tool.name, description: `${tool.description} · ${boundary.label}` }
      }),
    ]
    const selected = await this.host.overlays.select({
      title: '工具',
      detail: tools.length === 0 ? '当前会话尚无工具记录' : `${tools.length} 个可用工具`,
      choices,
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id === '__display__') {
      await this.tools('display')
      return
    }
    const tool = tools.find(candidate => `tool:${candidate.name}` === selected.id)
    const value = selected.id === '__todos__' ? todos : tool?.parameters
    const boundary = tool === undefined ? undefined : toolBoundary(tool)
    await this.host.overlays.detail({
      title: selected.label,
      content: `${boundary === undefined ? '' : `${boundary.detail}\n\n`}${ui('参数 / 数据', 'Parameters / data')}:\n${detailText(value)}`,
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
  }

  private async files(): Promise<void> {
    const groups = this.capabilities.producedFileGroups()
    if (groups.length === 0) {
      this.host.notice(ui('本会话没有生成文件', 'This session has not produced any files'), 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: ui('产出文件', 'Produced files'),
      detail: ui('查看、复制或打开本会话生成的文件', 'View, copy, or open files produced in this session'),
      choices: groups.flatMap(group => group.paths.map(path => ({
        id: path,
        label: path,
        description: ui(`第 ${String(group.turn)} 轮`, `Turn ${String(group.turn)}`),
      }))),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const action = await this.host.overlays.select({
      title: selected.label,
      choices: [
        { id: 'view', label: ui('在 TUI 内查看', 'View in TUI'), description: ui('用只读详情页打开文本文件', 'Open a text file in a read-only detail page') },
        { id: 'copy', label: ui('复制绝对路径', 'Copy absolute path') },
        { id: 'open', label: ui('用外部程序打开', 'Open with an external program'), description: ui('使用编辑器或系统默认程序', 'Use the editor or the system default program') },
      ],
      searchable: false,
    })
    if (action?.id === 'view') {
      const content = await this.capabilities.readProducedFile(selected.id)
      await this.host.overlays.detail({
        title: selected.label,
        content,
        options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
    } else if (action?.id === 'copy') {
      this.host.copy(this.capabilities.producedFilePath(selected.id))
      this.host.notice('已复制产出文件路径', 'success')
    } else if (action?.id === 'open') {
      const confirmed = await this.host.overlays.confirm(
        `使用外部程序打开 ${selected.label}？`,
        '所选绝对路径将交给编辑器或系统程序；该程序不受 Agent 权限限制。',
        '打开',
      )
      if (confirmed) {
        await this.capabilities.openProducedFile(selected.id)
        this.host.notice(`已打开 ${selected.id}`, 'success')
      }
    }
  }

  private async jobs(): Promise<void> {
    await this.host.overlays.navigate(async (nav) => {
      let onList = true
      let currentId: string | undefined
      const onSelect = async (selected: OverlayChoice): Promise<void> => {
        if (selected.id === '__empty__') return
        onList = false
        currentId = selected.id
        try {
          await this.inspectJob(nav, selected.id)
        } finally {
          onList = true
        }
      }
      const paint = (): void => {
        if (!onList) return
        nav.replaceSelectPage(this.jobListRequest(currentId), onSelect)
      }
      const timer = setInterval(paint, 1_000)
      timer.unref()
      try {
        await nav.selectPage(this.jobListRequest(currentId), onSelect)
      } finally {
        clearInterval(timer)
      }
    })
  }

  private jobListRequest(initialChoiceId?: string): SelectOverlayRequest {
    const jobs = this.capabilities.jobs()
    const now = Date.now()
    return {
      title: '后台任务',
      detail: '查看或停止当前会话的后台任务 · 打开期间自动刷新',
      choices: jobs.length === 0
        ? [{ id: '__empty__', label: '当前会话没有后台任务', disabledReason: '等待任务出现，或 Esc 关闭' }]
        : jobs.map(job => ({
          id: job.id,
          label: `${jobStatusLabel(job.status)} · ${job.kind} · ${job.label}`,
          description: `${jobDetailLabel(job.detail) ?? '无详情'} · ${elapsedLabel(jobElapsedMs(job, now))}`,
        })),
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      searchable: jobs.length > 8,
      options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
    }
  }

  private async inspectJob(nav: OverlayNavigation, id: string): Promise<void> {
    const job = this.capabilities.jobs().find(candidate => candidate.id === id)
    if (job === undefined) return
    const action = await nav.select({
      title: `后台任务 · ${job.label}`,
      searchable: false,
      choices: [
        { id: 'detail', label: '查看详情', description: '状态、耗时和任务详情' },
        {
          id: 'stop',
          label: '停止任务',
          description: '向 Host 发送取消请求',
          ...(isStoppableJob(job.status) ? {} : { disabledReason: '任务已结束' }),
        },
      ],
    })
    if (action?.id === 'detail') {
      const finishedAt = job.finishedAt
      const duration = jobElapsedMs(job, Date.now())
      await nav.detail({
        title: `后台任务 · ${job.label}`,
        content: ui(
          [
            `状态：${jobStatusLabel(job.status)}`,
            `类型：${job.kind}`,
            `任务 ID：${job.id}`,
            `开始：${new Date(job.startedAt).toISOString()}`,
            `结束：${finishedAt === undefined ? '仍在运行' : new Date(finishedAt).toISOString()}`,
            `耗时：${elapsedLabel(duration)}`,
            '',
            `详情：${jobDetailLabel(job.detail) ?? '没有任务详情。'}`,
          ].join('\n'),
          [
            `Status: ${jobStatusLabel(job.status)}`,
            `Type: ${job.kind}`,
            `Job ID: ${job.id}`,
            `Started: ${new Date(job.startedAt).toISOString()}`,
            `Ended: ${finishedAt === undefined ? 'still running' : new Date(finishedAt).toISOString()}`,
            `Duration: ${elapsedLabel(duration)}`,
            '',
            `Details: ${jobDetailLabel(job.detail) ?? 'No job details.'}`,
          ].join('\n'),
        ),
        options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      return
    }
    if (action?.id !== 'stop') return
    const confirmed = await nav.confirm(
      ui(`停止 ${job.label}？`, `Stop ${job.label}?`),
      '向 Host 发送取消请求；已经结束的任务不会再跑。',
      '停止任务',
    )
    if (!confirmed) return
    const result = await this.capabilities.managementBridge().jobs.kill(job.id)
    this.host.notice(jobKillNotice(result), result === 'requested' ? 'success' : 'info')
  }

  private async subagents(): Promise<void> {
    const parent = this.capabilities.active()
    if (parent === undefined) throw new Error('当前没有打开的父会话')
    this.capabilities.setSubagentCatalogOpen(parent.sessionId, true)
    try {
      await this.host.overlays.navigate(async (nav) => {
        let onList = true
        let rows = await this.capabilities.subagents(true)
        const onSelect = async (selected: OverlayChoice): Promise<void> => {
          const row = rows.find(candidate => `child:${candidate.entry.id}` === selected.id)
          if (row?.address === undefined) return
          onList = false
          this.capabilities.openSubagent(row.address)
          this.host.notice(
            `已打开子 Agent ${row.entry.id}${row.address.mode === 'continuable' ? '；可直接输入继续，运行时 Ctrl+C 停止' : '；该会话只读'}`,
            'success',
          )
          nav.finish()
        }
        const request = (): SelectOverlayRequest => ({
          title: '子 Agent',
          detail: '查看或继续当前会话创建的子 Agent；打开期间自动刷新，运行时可用 Ctrl+C 停止',
          choices: rows.length === 0
            ? [{ id: '__empty__', label: '当前没有子 Agent', disabledReason: '等待子 Agent 出现，或 Esc 关闭' }]
            : rows.map(row => row.entry.kind === 'diagnostic'
              ? {
                id: `diagnostic:${row.entry.id}`,
                label: `${row.entry.id} · ${row.entry.reason}`,
                disabledReason: '该子 Agent 当前不可用',
              }
              : {
                id: `child:${row.entry.id}`,
                label: `${row.entry.activity === 'running' ? '运行中' : '空闲'} · ${row.entry.label ?? row.entry.id}`,
                description: [
                  row.entry.mode === 'continuable' ? '可继续' : '单次只读',
                  row.entry.hasChildren ? '有子节点' : '叶节点',
                  row.totalTokens === undefined ? undefined : `${row.totalTokens.toLocaleString('en-US')} tok`,
                  row.durationMs === undefined ? undefined : `${Math.round(row.durationMs / 100) / 10}s`,
                ].filter(value => value !== undefined).join(' · '),
              }),
          options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
        })
        let inflight = false
        const timer = setInterval(() => {
          if (!onList || inflight) return
          inflight = true
          void this.capabilities.subagents(true).then((next) => {
            rows = [...next]
            if (onList) nav.replaceSelectPage(request(), onSelect)
          }).finally(() => {
            inflight = false
          })
        }, 1_000)
        timer.unref()
        try {
          await nav.selectPage(request(), onSelect)
        } finally {
          clearInterval(timer)
        }
      })
    } finally {
      this.capabilities.setSubagentCatalogOpen(parent.sessionId, false)
    }
  }

  private async trajectory(): Promise<void> {
    const trajectory = this.capabilities.trajectory()
    if (trajectory === undefined) throw new Error('当前 Profile 未提供 Trajectory 投影')
    const choices: OverlayChoice[] = trajectory.requests.map((request, index) => ({
      id: `request:${index}`,
      label: `${request.purpose} · ${request.status} · #${request.startSeq}`,
      description: `${request.requestConfig?.provider ?? '未知 Provider'}/${request.requestConfig?.model ?? '未知模型'} · ${request.completedAt === null ? '运行中' : `${Math.max(0, request.completedAt - request.startedAt)} ms`}`,
    }))
    choices.push(...trajectory.runningCalls.map(call => ({
      id: `call:${call.callId}`,
      label: `运行中工具 · ${call.name}`,
      description: call.callId,
    })))
    if (choices.length === 0) {
      this.host.notice('当前会话还没有请求或工具轨迹', 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: '轨迹',
      detail: `${trajectory.eventNodes.length} 个事件节点 · ${trajectory.requests.length} 个请求 · ${trajectory.runningCalls.length} 个运行中工具`,
      choices,
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const value = selected.id.startsWith('request:')
      ? trajectory.requests[Number(selected.id.slice('request:'.length))]
      : trajectory.runningCalls.find(call => `call:${call.callId}` === selected.id)
    await this.host.overlays.detail({
      title: selected.label,
      content: detailText(value),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
  }

  private async feedback(args: string): Promise<void> {
    if (args !== '') {
      await this.capabilities.recordSessionFeedback(args)
      this.host.notice('已记录会话反馈', 'success')
      return
    }
    const kind = await this.host.overlays.select({
      title: '反馈',
      detail: '记录对当前会话或某条回复的评价',
      choices: [
        { id: 'session', label: '记录会话反馈', description: '说明本次会话的使用感受' },
        { id: 'message', label: '评价一条回复', description: '好评、差评、说明或删除现有评价' },
      ],
      searchable: false,
    })
    if (kind === undefined) return
    if (kind.id === 'session') {
      const text = await this.host.overlays.input({
        title: '会话反馈',
        placeholder: '输入对当前会话的反馈',
      })
      if (text === undefined || text.trim() === '') return
      await this.capabilities.recordSessionFeedback(text)
      this.host.notice('已记录会话反馈', 'success')
      return
    }
    await this.messageFeedback()
  }

  private async messageFeedback(): Promise<void> {
    const targets = await this.capabilities.feedbackTargets()
    if (targets.length === 0) throw new Error('当前会话中没有可评价的回复')
    const selected = await this.host.overlays.select({
      title: '消息反馈',
      detail: '选择要评价的回复',
      choices: targets.map(target => ({
        id: String(target.message.messageId),
        label: `${target.feedback?.rating === 'positive' ? '好评' : target.feedback?.rating === 'negative' ? '差评' : '未评价'} · ${target.preview}`,
        description: target.feedback?.note ?? new Date(target.message.time).toLocaleString(),
      })),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    const target = targets.find(candidate => String(candidate.message.messageId) === selected?.id)
    if (target?.message.messageId === undefined) return
    const action = await this.host.overlays.select({
      title: target.preview,
      choices: [
        { id: 'positive', label: '好评', description: 'positive' },
        { id: 'negative', label: '差评', description: 'negative' },
        ...(target.feedback === undefined ? [] : [{ id: 'remove', label: '删除现有反馈', description: '回复内容不会删除' }]),
      ],
      searchable: false,
    })
    if (action === undefined) return
    if (action.id === 'remove') {
      if (target.feedback === undefined) return
      await this.capabilities.clearFeedback(target.message.messageId, target.feedback.version)
      this.host.notice('已删除该消息反馈', 'success')
      return
    }
    const note = await this.host.overlays.input({
      title: action.id === 'positive' ? '好评说明（可选）' : '差评说明（可选）',
      initialValue: target.feedback?.note ?? '',
      placeholder: '留空表示不附说明',
    })
    if (note === undefined) return
    await this.capabilities.putFeedback(
      target.message.messageId,
      action.id === 'positive' ? 'positive' : 'negative',
      note.trim() === '' ? undefined : note,
      target.feedback?.version ?? null,
    )
    this.host.notice('已提交消息反馈', 'success')
  }

  private async skills(): Promise<void> {
    const skills = await this.capabilities.skills()
    if (skills.length === 0) {
      this.host.notice('当前工作区没有用户可调用 Skill', 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: 'Skills',
      detail: '选择一个 Skill，并补充需要它完成的任务',
      choices: skills.map(skill => ({
        id: skill.name,
        label: `/${skill.name}${skill.modelInvocable ? '' : ' · 仅用户调用'}`,
        description: `${skill.description}${skill.whenToUse === undefined ? '' : ` · ${skill.whenToUse}`}`,
      })),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected !== undefined) this.host.setEditor(`/${selected.id} `)
  }

  private async mcp(): Promise<void> {
    const [inventory, documents] = await Promise.all([
      this.capabilities.pluginInventory(),
      this.capabilities.managementBridge().settings.describe(),
    ])
    const tools = this.capabilities.toolCatalog().filter(tool => tool.name.startsWith('mcp__'))
    const plugins = inventory.filter(item => item.moduleName.toLowerCase().includes('mcp'))
    const settings = documents.filter(document => document.namespace.toLowerCase().includes('mcp'))
    if (tools.length + plugins.length + settings.length === 0) {
      this.host.notice('当前 Profile 没有可见 MCP 工具、实例或 Settings；可用 /plugin 安装扩展', 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: 'MCP',
      detail: '查看 MCP 工具、实例和设置。MCP 可能在独立进程或远端服务中运行，不受 Agent 沙箱保护。',
      choices: [
        ...tools.map(tool => ({
          id: `tool:${tool.name}`,
          label: ui(`工具 · ${tool.name}`, `Tool · ${tool.name}`),
          description: `${tool.description} · ${ui('外部服务', 'external service')}`,
        })),
        ...plugins.map(item => ({
          id: `plugin:${item.entryId}`,
          label: ui(`实例 · ${item.moduleName}`, `Instance · ${item.moduleName}`),
          description: `${item.enabled ? ui('启用', 'enabled') : ui('禁用', 'disabled')} · ${item.fiberPhase ?? ui('未挂载', 'not mounted')}`,
        })),
        ...settings.map(document => ({
          id: `settings:${document.namespace}`,
          label: ui(`设置 · ${document.namespace}`, `Settings · ${document.namespace}`),
          description: document.applies === 'live' ? ui('立即生效', 'Applies immediately') : ui('需要重启', 'Restart required'),
        })),
      ],
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    if (selected.id.startsWith('settings:')) {
      await this.settings(selected.id.slice('settings:'.length))
      return
    }
    const plugin = plugins.find(candidate => `plugin:${candidate.entryId}` === selected.id)
    if (plugin !== undefined) {
      const phase = plugin.fiberPhase ?? ui('未挂载', 'not mounted')
      const followUp = await this.host.overlays.select({
        title: `MCP 实例 · ${plugin.moduleName}`,
        detail: ui(
          [
            `模块：${plugin.moduleName}`,
            `实例 ID：${plugin.entryId}`,
            `运行状态：${plugin.enabled ? '已启用' : '已禁用'} · ${phase}`,
            '作用范围：当前 Profile；工具是否可用取决于当前会话和模型。',
            '安全提示：MCP 可能在独立进程或远端服务中运行，不受 Agent 沙箱保护；请单独检查其配置、凭证、文件和网络权限。',
            phase === 'failed'
              ? '诊断：实例启动失败；运行 /doctor，并检查对应的 MCP 设置。'
              : '诊断：运行 /doctor 查看完整检查结果。',
          ].join('\n'),
          [
            `Module: ${plugin.moduleName}`,
            `Instance ID: ${plugin.entryId}`,
            `Runtime status: ${plugin.enabled ? 'enabled' : 'disabled'} · ${phase}`,
            'Scope: current Profile; tool availability depends on the current session and model.',
            'Security: MCP may run in another process or remote service outside the Agent sandbox; review its configuration, credentials, file access, and network access separately.',
            phase === 'failed'
              ? 'Diagnostics: the instance failed to start; run /doctor and inspect the corresponding MCP Settings.'
              : 'Diagnostics: run /doctor for the complete report.',
          ].join('\n'),
        ),
        choices: [
          { id: 'close', label: '关闭' },
          { id: 'doctor', label: '运行 /doctor', description: '检查 Profile、插件和运行环境' },
          ...settings.map(document => ({
            id: `settings:${document.namespace}`,
            label: `打开设置 · ${document.namespace}`,
            description: document.applies === 'live' ? '立即生效' : '需要重启',
          })),
        ],
        searchable: false,
        options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      if (followUp?.id === 'doctor') await this.doctor()
      else if (followUp !== undefined && followUp.id.startsWith('settings:')) {
        await this.settings(followUp.id.slice('settings:'.length))
      }
      return
    }
    const tool = tools.find(candidate => `tool:${candidate.name}` === selected.id)
    if (tool !== undefined) {
      await this.host.overlays.detail({
        title: tool.name,
        content: `${toolBoundary(tool).detail}\n\n${ui('参数', 'Parameters')}:\n${detailText(tool.parameters)}`,
      })
    }
  }

  private async status(): Promise<void> {
    const status = await this.capabilities.headerFacts(true)
    const statistics = this.capabilities.sessionStatistics()
    const projections = this.capabilities.projectionEntries()
    const selected = await this.host.overlays.select({
      title: '状态与统计',
      detail: [
        `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}`,
        `Profile ${status.profile} · ${status.running ? ui('运行中', 'running') : ui('空闲', 'idle')}`,
        status.workspace,
        `${status.session} · ${status.mode} · ${status.model} · ${status.permission}`,
        ...statistics.lines,
      ].join('\n'),
      choices: projections.length === 0
        ? [{ id: 'none', label: '当前没有会话数据', description: '暂无可显示内容' }]
        : projections.map(([key, value]) => ({
          id: key,
          label: key,
          description: detailText(value).replace(/\s+/gu, ' ').slice(0, 240),
        })),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined || selected.id === 'none') return
    const projection = projections.find(([key]) => key === selected.id)
    if (projection === undefined) return
    await this.host.overlays.detail({
      title: `会话数据 · ${projection[0]}`,
      content: detailText(projection[1]),
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
  }

  private retryPending(): void {
    const snapshot = this.capabilities.active()?.session.getSnapshot()
    if (snapshot === undefined || snapshot.pending.length === 0) {
      this.host.notice('当前没有待处理交互', 'info')
      return
    }
    for (const wait of snapshot.pending) this.handledInteractions.delete(wait.key)
    this.syncPending(snapshot)
  }

  private async handleInteraction(wait: PendingInteraction): Promise<void> {
    const current = this.capabilities.active()?.session.getSnapshot().pending
      .some(candidate => candidate.key === wait.key) === true
    if (!current) return
    if (wait.kind === 'approval') await this.approval(wait)
    else await this.question(wait)
  }

  private async approval(wait: PendingWait<'approval'>): Promise<void> {
    const selected = await this.host.overlays.select({
      title: `工具审批 · ${wait.payload.toolName}`,
      detail: wait.payload.reason ?? `调用 ${wait.payload.callId ?? wait.payload.approvalId}`,
      searchable: false,
      choices: [
        { id: 'allow', label: '仅本次允许', description: '只允许这一次工具调用' },
        { id: 'reject', label: '拒绝', description: '本次工具调用不会执行' },
      ],
      footer: 'Enter 确认 · Esc 安全拒绝',
      options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
    })
    this.host.transcript.followLatest()
    await this.capabilities.answerApproval(wait, selected?.id === 'allow' ? 'allowed-once' : 'rejected')
  }

  private async question(wait: PendingWait<'question'>): Promise<void> {
    const answers: QuestionResponsePayload['answer']['answers'] = []
    for (const [index, question] of wait.payload.questions.entries()) {
      const planReview = question.intent?.kind === 'plan-review' ? question.intent : undefined
      const title = `${planReview === undefined ? question.header ?? '问题' : '计划审查'} · ${index + 1}/${wait.payload.questions.length}`
      const presentation = (option: NonNullable<typeof question.options>[number]): {
        readonly label: string
        readonly description?: string
      } => {
        if (planReview === undefined) return option
        return option.label === planReview.approve
          ? { label: '批准计划', description: '按此计划继续' }
          : { label: '继续规划', description: '返回并修改计划' }
      }
      if (question.multiSelect === true) {
        const picked = await this.host.overlays.multiSelect({
          title,
          detail: question.detail ?? question.question,
          choices: (question.options ?? []).map((option) => {
            const display = presentation(option)
            return {
              id: option.label,
              label: display.label,
              ...(display.description === undefined ? {} : { description: display.description }),
            }
          }),
          options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
        })
        if (picked === undefined) {
          this.host.transcript.followLatest()
          await this.capabilities.cancelQuestion(wait)
          return
        }
        answers.push({ id: question.id, selected: picked.map(option => option.id) })
        continue
      }
      const choices: OverlayChoice[] = [
        ...(question.options ?? []).map((option) => {
          const display = presentation(option)
          return {
            id: `option:${option.label}`,
            label: display.label,
            ...(display.description === undefined ? {} : { description: display.description }),
          }
        }),
        ...(planReview === undefined
          ? [
            { id: '__custom__', label: '自定义回答…' },
            { id: '__skip__', label: '跳过', description: '提交空选择' },
          ]
          : []),
      ]
      const picked = await this.host.overlays.select({
        title,
        detail: question.detail ?? question.question,
        choices,
        searchable: planReview === undefined,
        options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
      })
      if (picked === undefined) {
        this.host.transcript.followLatest()
        await this.capabilities.cancelQuestion(wait)
        return
      }
      if (picked.id === '__custom__') {
        const custom = await this.host.overlays.multilineInput({
          title: question.question,
          ...(question.detail === undefined ? {} : { detail: question.detail }),
          options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
        })
        if (custom === undefined) {
          this.host.transcript.followLatest()
          await this.capabilities.cancelQuestion(wait)
          return
        }
        answers.push({ id: question.id, selected: [], custom })
      } else if (picked.id === '__skip__') {
        answers.push({ id: question.id, selected: [] })
      } else {
        answers.push({ id: question.id, selected: [picked.id.slice('option:'.length)] })
      }
    }
    this.host.transcript.followLatest()
    await this.capabilities.answerQuestion(wait, { answers })
  }
}

/**
 * Resolve one exact candidate from a previously merged catalog.
 * @param catalog - merged dynamic command catalog.
 * @param name - command name without a leading slash.
 * @returns the exact command candidate when registered.
 */
export function commandOf(
  catalog: readonly TuiCommandCandidate[],
  name: string,
): TuiCommandCandidate | undefined {
  return catalog.find(candidate => candidate.name === name)
}
