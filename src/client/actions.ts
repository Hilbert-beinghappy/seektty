/** Product command and pending-interaction orchestration for the TUI Surface. */

import { visibleWidth, type OverlayOptions } from '@mariozechner/pi-tui'
import { chmodSync } from 'node:fs'
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
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  TuiSettingsConflictError,
  type TuiAppearanceSettings,
  type TuiBackgroundMode,
  type TuiBehaviorSettings,
  type TuiCodeThemeId,
  type TuiCustomTheme,
  type TuiMouseMode,
  type TuiThemeId,
} from '@deepseek-ai/dsh-tui-protocol'
import { canonicalTuiCommandName, capabilityError, HarnessTuiCapabilities, type TuiCommandCandidate, type TuiDraftAttachment, type TuiModelOption, type TuiPermissionOption, type TuiToolOption } from './capabilities.ts'
import { behaviorFromSettings, behaviorSettings } from './behavior.ts'
import { lastFencedCode } from './copy-content.ts'
import { queueListChoiceOrder } from './queue-order.ts'
import { formatByteSize } from './byte-size.ts'
import { helpSectionChoices, helpSectionText, type HelpSectionId } from './help.ts'
import {
  applyKeyBindingOverrides,
  bindingKeysLabel,
  keyBindingsIssue,
  normalizeChord,
  SURFACE_KEYMAP,
} from './keymap.ts'
import { pluginFailureDetail } from './error-advice.ts'
import { trajectoryRequestDetail } from './trajectory-detail.ts'
import { isStoppableJob, jobElapsedMs, jobKillNotice } from './job-control.ts'
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
  classifyClarifyComposer,
  paletteClarifyTransaction,
  type ClarifyComposerTransaction,
} from './clarify-composer.ts'
import { runClarifyShell } from './clarify-shell.ts'
import {
  formatSettingsValue,
  hasDedicatedSettingsEditor,
  parseSettingsRootChoice,
  parseSettingsValue,
  settingsFields,
  settingsRootChoices,
  settingsSectionLabel,
  visibleSettingsDocuments,
  type TuiSettingsField,
} from './settings.ts'
import { toolApprovalPreview, type Transcript } from './transcript.ts'
import { composeApprovalDetail } from './approval-preview.ts'
import {
  appearanceFromSettings,
  appearanceSettings,
  deleteCustomTheme,
  saveBackgroundMode,
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
import { serializeThemeExport, themeForExport, writeThemeExport } from './theme-export.ts'
import { resolveHarnessUserPath } from './workspace-path.ts'
import { normalizeOnboardingApiKey } from './provider-onboarding.ts'
import {
  captureClipboardImage,
  cleanupClipboardImageWorkspace,
  createClipboardImageWorkspace,
} from './clipboard-image.ts'
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
  applyAppearance(appearance: TuiAppearanceSettings): void
  applyLocale(locale: LocaleId): void
  applyBehavior?(behavior: TuiBehaviorSettings): void
  setEditor(text: string): void
  composerText?(): string
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
      } else if (character === '\\' && quote === '"' && index + 1 < args.length
        && ((args[index + 1] ?? '') === '"' || (args[index + 1] ?? '') === '\\')) {
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
    } else if (character === '\\' && index + 1 < args.length
      && /[\s'"\\]/u.test(args[index + 1] ?? '')) {
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

const THEME_UI_FIELDS: Readonly<Record<keyof TuiCustomTheme['colors'], { readonly zh: string; readonly en: string }>> = {
  canvas: { zh: '画布背景', en: 'Canvas background' },
  surface: { zh: '面板与输入框背景', en: 'Panel and input background' },
  selection: { zh: '选择背景', en: 'Selection background' },
  text: { zh: '正文', en: 'Text' },
  muted: { zh: '弱化文字', en: 'Muted text' },
  border: { zh: '边框', en: 'Border' },
  brand: { zh: '品牌色', en: 'Brand color' },
  accent: { zh: '强调色', en: 'Accent color' },
  success: { zh: '成功', en: 'Success' },
  warning: { zh: '警告', en: 'Warning' },
  danger: { zh: '错误', en: 'Error' },
}

const THEME_SYNTAX_FIELDS: Readonly<Record<keyof TuiCustomTheme['syntax'], { readonly zh: string; readonly en: string }>> = {
  background: { zh: '代码背景', en: 'Code background' },
  foreground: { zh: '代码正文', en: 'Code text' },
  comment: { zh: '注释', en: 'Comment' },
  keyword: { zh: '关键字', en: 'Keyword' },
  string: { zh: '字符串', en: 'String' },
  number: { zh: '数字', en: 'Number' },
  constant: { zh: '常量', en: 'Constant' },
  function: { zh: '函数', en: 'Function' },
  type: { zh: '类型与类', en: 'Types and classes' },
  variable: { zh: '变量', en: 'Variable' },
  property: { zh: '属性', en: 'Property' },
  parameter: { zh: '参数', en: 'Parameter' },
  operator: { zh: '运算符', en: 'Operator' },
  punctuation: { zh: '标点', en: 'Punctuation' },
  tag: { zh: '标签', en: 'Tag' },
  attribute: { zh: '属性名', en: 'Attribute' },
  regexp: { zh: '正则表达式', en: 'Regular expression' },
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

function marketplaceSourceKey(source: TuiMarketplaceSource): string {
  return source.rowKey ?? source.id
}

function findMarketplaceSource(
  sources: readonly TuiMarketplaceSource[],
  token: string,
): TuiMarketplaceSource | undefined {
  const byKey = sources.find(source => source.rowKey === token)
  if (byKey !== undefined) return byKey
  const matches = sources.filter(source => source.id === token)
  return matches.length === 1 ? matches[0] : undefined
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

const DEEPSEEK_CREDENTIAL_REF = 'DEEPSEEK_API_KEY'

function validateSecretValue(raw: string, deepseek: boolean):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string } {
  if (deepseek) return normalizeOnboardingApiKey(raw)
  if (raw === '') return { ok: false, message: ui('Secret 不能为空。', 'The secret cannot be empty.') }
  return { ok: true, value: raw }
}

function credentialWriteFailure(ref: string): string {
  return ui(
    `Credential ${ref} 保存失败；请重试，或按 Esc 后使用 /doctor 检查。`,
    `Could not save credential ${ref}. Retry, or press Esc and inspect /doctor.`,
  )
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
   * Run a multi-page overlay on one Escape stack.
   * Reuses an existing navigation session so nested slash-command flows do not queue.
   */
  private async overlayFlow(
    overlays: OverlayPrompts,
    run: (navigation: OverlayNavigation) => Promise<void>,
    options?: OverlayOptions,
  ): Promise<void> {
    if ('selectPage' in overlays) {
      await run(overlays as OverlayNavigation)
      return
    }
    await this.host.overlays.navigate(run, options)
  }

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
        case 'keymap': await this.keymap(args); break
        case 'mouse': await this.mouse(args); break
        case 'plugin':
        case 'plugins': await this.plugin(args); break
        case 'doctor': await this.doctor(); break
        case 'clarify': await this.clarifyComposer(this.clarifyTransaction(args)); break
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
        case 'help': await this.help(); break
        case 'quit':
        case 'exit': this.host.close(0); break
        default: throw new Error(ui(`TUI 未实现 /${name}`, `TUI does not implement /${name}`))
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
      const document = (await this.capabilities.managementBridge().settings.describe(
        error.namespace,
        { bypassCache: true },
      ))[0]
      if (document !== undefined) actual = document.revision
    } catch (refreshError) {
      this.host.notice(ui(`设置冲突后重新读取失败：${capabilityError(refreshError)}`, `Failed to reload after a Settings conflict: ${capabilityError(refreshError)}`), 'error')
      return
    }
    const reopen = await this.host.overlays.confirm(
      ui(`设置 ${error.namespace} 已被其他界面更新`, `Settings ${error.namespace} was updated by another surface`),
      ui(`本次修改未保存，也没有覆盖其他界面的修改。是否重新读取最新设置？（版本 ${String(error.expected)} → ${String(actual)}）`, `This change was not saved and did not overwrite the other surface. Reload the latest Settings? (revision ${String(error.expected)} → ${String(actual)})`),
      ui('重新读取', "Reload"),
    )
    if (!reopen) return
    try {
      await this.settings(error.namespace)
    } catch (nextError) {
      if (nextError instanceof TuiSettingsConflictError) await this.settingsConflict(nextError)
      else this.host.notice(capabilityError(nextError), 'error')
    }
  }

  /** Open the merged command palette and run local actions immediately. */
  async commandPalette(): Promise<void> {
    try {
      const catalog = await this.capabilities.commandCatalog()
      const choice = await this.host.overlays.select({
        title: ui('命令面板', "Command palette"),
        detail: ui('选择要使用的功能', "Choose a command"),
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
      if (paletteFillsEditor(command)) {
        this.host.setEditor(`/${command.name}${command.argumentHint !== undefined || command.behavior === 'skill' ? ' ' : ''}`)
        return
      }
      await this.execute(command.name, '')
    } catch (error) {
      this.host.notice(capabilityError(error), 'error')
    }
  }

  /** F1 / `/help`: partitioned shortcuts, workflows, and doctor guidance. */
  async help(): Promise<void> {
    const options = { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('帮助', 'Help'),
        detail: ui('F1 与 /help 打开此页；Ctrl+P 仍是命令面板', 'F1 and /help open this page; Ctrl+P remains the command palette'),
        choices: helpSectionChoices(),
        searchable: false,
        options,
      }, async (selected) => {
        await navigation.detail({
          title: selected.label,
          content: helpSectionText(selected.id as HelpSectionId),
          options,
        })
      })
    }, options)
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
          this.host.notice(ui(`交互处理失败：${capabilityError(error)}；输入 /pending 可重试`, `Interaction failed: ${capabilityError(error)}; use /pending to retry`), 'error')
        })
    }
  }

  private async newSession(): Promise<void> {
    const id = await this.capabilities.newSession()
    this.host.notice(id === undefined ? ui('当前没有可用工作区', "No workspace is available") : ui('已打开新会话', "Opened a new session"), id === undefined ? 'warning' : 'success')
  }

  private async sessions(query: string): Promise<void> {
    const current = this.capabilities.active()?.sessionId
    const rows = sortSessionsByUpdatedAt(this.capabilities.listSessions())
    if (rows.length === 0) throw new Error(ui('没有可恢复的会话', "No resumable sessions"))
    const hits = query === ''
      ? undefined
      : await this.capabilities.searchSessions(query, new AbortController().signal)
    const choices = hits === undefined
      ? rows.map(row => ({
        id: row.id,
        label: `${row.id === current ? '● ' : ''}${row.displayTitle}`,
        description: `${row.cwd ?? ui('无工作区', "No workspace")} · ${relativeTime(row.updatedAt)} · ${row.running ? ui('运行中', "Running") : row.pendingInteraction ?? ui('空闲', "Idle")}`,
      }))
      : hits.items.map((hit) => {
        const row = rows.find(candidate => candidate.id === hit.sessionId)
        return {
          id: hit.sessionId,
          label: `${hit.sessionId === current ? '● ' : ''}${row?.displayTitle ?? hit.sessionId}`,
          description: hit.snippet,
        }
      })
    if (choices.length === 0) throw new Error(ui(`没有匹配 ${JSON.stringify(query)} 的会话`, `No session matches ${JSON.stringify(query)}`))
    const selected = await this.host.overlays.select({
      title: query === '' ? ui('会话', "Session") : ui(`搜索会话 · ${query}`, `Search sessions · ${query}`),
      detail: ui(`归档会话不会出现在这里${hits?.hasMore === true ? ' · 结果已达到上限' : ''}`, `Archived sessions do not appear here${hits?.hasMore === true ? ' · results reached the limit' : ''}`),
      choices,
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    this.capabilities.openSession(idOf(selected.id))
    this.host.notice(ui(`已打开 ${selected.label}`, `Opened ${selected.label}`), 'success')
  }

  private async rename(args: string): Promise<void> {
    const title = args !== ''
      ? args
      : await this.host.overlays.input({
        title: ui('重命名会话', "Rename session"),
        initialValue: this.capabilities.active()?.summary.title ?? '',
        placeholder: ui('输入新标题', "Enter a new title"),
      })
    if (title === undefined || title.trim() === '') return
    const accepted = await this.capabilities.renameSession(title)
    this.host.notice(ui(`会话已重命名为 ${accepted}`, `Session renamed to ${accepted}`), 'success')
  }

  private async fork(): Promise<void> {
    const id = await this.capabilities.forkSession()
    this.host.notice(ui(`已创建并打开分支会话 ${id}`, `Created and opened forked session ${id}`), 'success')
  }

  private async archive(): Promise<void> {
    const active = this.capabilities.active()
    if (active === undefined) return
    const confirmed = await this.host.overlays.confirm(
      ui('归档当前会话？', "Archive the current session?"),
      ui(`${active.summary.displayTitle} 的日志会保留，但会从普通会话列表隐藏。`, `The log for ${active.summary.displayTitle} is kept, but it is hidden from the normal session list.`),
      ui('归档', "Archive"),
    )
    if (!confirmed) return
    await this.capabilities.archiveSession()
    this.host.notice(ui('会话已归档；当前不能在这里恢复', "Session archived; archived sessions cannot be resumed here"), 'success')
  }

  private async exportSession(args: string): Promise<void> {
    const parsed = commandParts(args)
    if (parsed.command === 'md') {
      await this.exportMarkdown(parsed.rest)
      return
    }
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('导出会话', "Export session"),
        detail: ui('将原始会话记录和附件保存为 ZIP 文件', "Save the original session log and attachments as a ZIP file"),
        searchable: false,
        choices: [
          { id: 'session', label: ui('仅当前会话', "Current session only"), description: ui('包含当前会话记录和附件', "Includes the current session log and attachments") },
          { id: 'descendants', label: ui('当前会话与子 Agent', "Current session and subagents"), description: ui('同时包含全部子 Agent 会话', "Also includes every subagent session") },
        ],
      }, async (scope) => {
        const requested = args === ''
          ? await navigation.input({
            title: ui('保存会话 ZIP', "Save session ZIP"),
            detail: ui('留空则保存到工作区根目录；已有文件不会被覆盖', "Leave blank to save in the workspace root; existing files are never overwritten"),
            placeholder: ui('可选：相对工作区或绝对路径', "Optional: workspace-relative or absolute path"),
          })
          : args
        if (requested === undefined) return
        const result = await navigation.progress({
          title: ui('导出会话', "Export session"),
          work: (_report, signal) => this.capabilities.exportSession(
            requested.trim() === '' ? undefined : requested.trim(),
            scope.id === 'descendants',
            signal,
          ),
        })
        if (result === undefined) return
        this.host.notice(ui(
          `已保存会话 ZIP（${formatByteSize(result.bytes)}）到 ${result.path}`,
          `Saved session ZIP (${formatByteSize(result.bytes)}) to ${result.path}`,
        ), 'success')
      })
    })
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
    if (parsed.command !== '') throw new Error(ui('用法：/copy [pick|code]', "Usage: /copy [pick|code]"))
    this.copyLastResponse()
  }

  private copyLastResponse(): void {
    const text = this.capabilities.lastAssistantText()
    if (text === undefined) throw new Error(ui('当前会话没有可复制的 DeepSeek 文本回复', "The current session has no DeepSeek text response to copy"))
    this.host.copy(text)
    this.host.notice(ui(`已复制最后一条回复（${text.length} 个字符）`, `Copied the last response (${text.length} characters)`), 'success')
  }

  private copyCode(): void {
    const text = this.capabilities.lastAssistantText()
    if (text === undefined) throw new Error(ui('当前会话没有可复制的 DeepSeek 文本回复', "The current session has no DeepSeek text response to copy"))
    const code = lastFencedCode(text)
    if (code === undefined) throw new Error(ui('最后一条回复没有可复制的代码块', "The last reply has no fenced code block to copy"))
    this.host.copy(code)
    this.host.notice(ui(`已复制最后一段代码（${code.length} 个字符）`, `Copied the last code block (${code.length} characters)`), 'success')
  }

  private async copyPick(): Promise<void> {
    const rows = this.capabilities.assistantCopyTargets()
    if (rows.length === 0) throw new Error(ui('当前会话没有可复制的 DeepSeek 文本回复', "The current session has no DeepSeek text response to copy"))
    const selected = await this.host.overlays.select({
      title: ui('复制回复', "Copy a reply"),
      detail: ui('选择一条助手回复复制到剪贴板', "Choose an assistant reply to copy"),
      choices: rows.map(row => ({ id: row.id, label: row.preview })),
      searchable: rows.length > 8,
      options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined) return
    const row = rows.find(candidate => candidate.id === selected.id)
    if (row === undefined) return
    this.host.copy(row.text)
    this.host.notice(ui(`已复制所选回复（${row.text.length} 个字符）`, `Copied the selected response (${row.text.length} characters)`), 'success')
  }

  private async workspace(args: string): Promise<void> {
    const parsed = commandParts(args)
    if (parsed.command === 'add' || parsed.command === 'open') {
      if (parsed.rest === '') throw new Error(ui(`用法：/workspace ${parsed.command} <目录>`, `Usage: /workspace ${parsed.command} <directory>`))
      await this.capabilities.openWorkspace(parsed.rest)
      this.host.notice(ui('已打开工作区会话', "Opened a workspace session"), 'success')
      return
    }
    if (parsed.command === 'rename') {
      await this.overlayFlow(this.host.overlays, async (navigation) => {
        const workspace = this.currentWorkspace() ?? await this.chooseWorkspace(ui('选择要重命名的工作区', "Choose a workspace to rename"), navigation)
        if (workspace !== undefined) await this.renameWorkspace(workspace, parsed.rest, navigation)
      })
      return
    }
    if (parsed.command === 'delete' || parsed.command === 'remove') {
      await this.overlayFlow(this.host.overlays, async (navigation) => {
        const workspace = parsed.rest === ''
          ? this.currentWorkspace() ?? await this.chooseWorkspace(ui('选择要移除注册的工作区', "Choose a workspace to unregister"), navigation)
          : this.capabilities.listWorkspaces().find(candidate => candidate.workspaceId === parsed.rest)
        if (workspace === undefined) throw new Error(ui(`找不到工作区 ${JSON.stringify(parsed.rest)}`, `Workspace ${JSON.stringify(parsed.rest)} was not found`))
        await this.deleteWorkspace(workspace, navigation)
      })
      return
    }
    if (parsed.command === 'reorder') {
      await this.overlayFlow(this.host.overlays, async (navigation) => {
        const workspace = this.currentWorkspace() ?? await this.chooseWorkspace(ui('选择要移动的工作区', "Choose a workspace to move"), navigation)
        if (workspace !== undefined) await this.reorderWorkspace(workspace, navigation)
      })
      return
    }
    if (parsed.command === 'sessions') {
      await this.overlayFlow(this.host.overlays, async (navigation) => {
        const workspace = this.currentWorkspace() ?? await this.chooseWorkspace(ui('选择工作区', "Choose a workspace"), navigation)
        if (workspace !== undefined) await this.reorderWorkspaceSession(workspace, navigation)
      })
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      await this.capabilities.openWorkspace(args)
      this.host.notice(ui('已打开工作区会话', "Opened a workspace session"), 'success')
      return
    }
    await this.workspaceCenter()
  }

  private async workspaceCenter(): Promise<void> {
    const workspaces = this.capabilities.listWorkspaces()
    const current = this.capabilities.active()?.workspaceId
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('工作区', "Workspace"),
        choices: [
          ...workspaces.map(workspace => ({
            id: workspace.workspaceId,
            label: `${workspace.workspaceId === current ? '● ' : ''}${workspace.title}`,
            description: workspace.path,
          })),
          { id: '__add__', label: ui('添加目录…', "Add directory…"), description: ui('注册现有目录并打开空白会话', "Register an existing directory and open a blank session") },
        ],
      }, async (selected) => {
        if (selected.id === '__add__') {
          const path = await navigation.input({ title: ui('添加工作区', "Add workspace"), placeholder: ui('输入目录路径', "Enter a directory path") })
          if (path === undefined || path.trim() === '') return
          await this.capabilities.openWorkspace(path)
          this.host.notice(ui('已打开工作区会话', "Opened a workspace session"), 'success')
          return
        }
        const workspace = workspaces.find(candidate => candidate.workspaceId === selected.id)
        if (workspace === undefined) return
        const action = await navigation.select({
          title: workspace.title,
          detail: ui(`${workspace.path}\n${workspace.sessionIds.length} 个已登记会话`, `${workspace.path}
${workspace.sessionIds.length} registered session(s)`),
          searchable: false,
          choices: [
            { id: 'open', label: ui('打开／新建会话', "Open / create session"), description: ui('复用该工作区的空白会话，必要时创建', "Reuse this workspace's blank session, creating it if needed") },
            { id: 'rename', label: ui('重命名工作区', "Rename workspace"), description: ui('只改变这里显示的名称', "Changes only the displayed name") },
            { id: 'sessions', label: ui('调整会话顺序', "Reorder sessions"), description: ui('修改该工作区的手动会话顺序', "Change this workspace's manual session order") },
            { id: 'reorder', label: ui('调整工作区顺序', "Reorder workspaces"), description: ui('修改工作区目录显示顺序', "Change the workspace display order") },
            { id: 'delete', label: ui('移除工作区注册', "Unregister workspace"), description: ui('不会删除目录、文件或会话日志', "Does not delete the directory, files, or session logs") },
          ],
        })
        if (action === undefined) return
        if (action.id === 'open') {
          const sessionId = await this.capabilities.selectWorkspace(workspace.workspaceId)
          this.host.notice(ui(`已打开会话 ${sessionId}`, `Opened session ${sessionId}`), 'success')
        } else if (action.id === 'rename') await this.renameWorkspace(workspace, '', navigation)
        else if (action.id === 'sessions') await this.reorderWorkspaceSession(workspace, navigation)
        else if (action.id === 'reorder') await this.reorderWorkspace(workspace, navigation)
        else await this.deleteWorkspace(workspace, navigation)
      })
    })
  }

  private currentWorkspace(): WorkspaceView | undefined {
    const id = this.capabilities.active()?.workspaceId
    return this.capabilities.listWorkspaces().find(candidate => candidate.workspaceId === id)
  }

  private async chooseWorkspace(
    title: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<WorkspaceView | undefined> {
    const workspaces = this.capabilities.listWorkspaces()
    const selected = await overlays.select({
      title,
      choices: workspaces.map(workspace => ({
        id: workspace.workspaceId,
        label: workspace.title,
        description: workspace.path,
      })),
    })
    return workspaces.find(candidate => candidate.workspaceId === selected?.id)
  }

  private async renameWorkspace(
    workspace: WorkspaceView,
    supplied: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const title = supplied !== '' ? supplied : await overlays.input({
      title: ui(`重命名 ${workspace.title}`, `Rename ${workspace.title}`),
      initialValue: workspace.title,
      placeholder: ui('输入新标题', "Enter a new title"),
    })
    if (title === undefined || title.trim() === '') return
    const updated = await this.capabilities.renameWorkspace(workspace.workspaceId, title)
    this.host.notice(ui(`工作区已重命名为 ${updated.title}`, `Workspace renamed to ${updated.title}`), 'success')
  }

  private async deleteWorkspace(
    workspace: WorkspaceView,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const confirmed = await overlays.confirm(
      ui(`移除工作区注册 ${workspace.title}？`, `Unregister workspace ${workspace.title}?`),
      ui(`${workspace.path}\n目录、用户文件和全部会话记录都会保留；会话将成为未分组。`, `${workspace.path}
The directory, user files, and all session logs are kept; sessions become ungrouped.`),
      ui('移除注册', "Unregister"),
    )
    if (!confirmed) return
    await this.capabilities.deleteWorkspace(workspace.workspaceId)
    this.host.notice(ui(`已移除工作区注册 ${workspace.title}`, `Unregistered workspace ${workspace.title}`), 'success')
  }

  private async reorderWorkspace(
    workspace: WorkspaceView,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const choices: OverlayChoice[] = this.capabilities.listWorkspaces()
      .filter(candidate => candidate.workspaceId !== workspace.workspaceId)
      .map(candidate => ({ id: candidate.workspaceId, label: ui(`移到 ${candidate.title} 前`, `Move before ${candidate.title}`), description: candidate.path }))
    choices.push({ id: '__append__', label: ui('移到末尾', "Move to end"), description: ui('追加到工作区目录末尾', "Append to the workspace list") })
    const selected = await overlays.select({ title: ui(`移动 ${workspace.title}`, `Move ${workspace.title}`), choices })
    if (selected === undefined) return
    await this.capabilities.moveWorkspace(
      workspace.workspaceId,
      selected.id === '__append__' ? undefined : workspaceIdOf(selected.id),
    )
    this.host.notice(ui(`已调整工作区 ${workspace.title} 的顺序`, `Updated the order of workspace ${workspace.title}`), 'success')
  }

  private async reorderWorkspaceSession(
    workspace: WorkspaceView,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    if (workspace.sessionIds.length < 2) {
      this.host.notice(ui(`${workspace.title} 没有可调整的多个会话`, `${workspace.title} does not have multiple sessions to reorder`), 'info')
      return
    }
    const summaries = new Map(this.capabilities.listSessions().map(row => [row.id, row]))
    const source = await overlays.select({
      title: ui(`${workspace.title} · 选择会话`, `${workspace.title} · choose a session`),
      choices: workspace.sessionIds.map(id => ({
        id,
        label: summaries.get(id)?.displayTitle ?? id,
        description: summaries.has(id) ? id : ui(`${id} · 已归档或未载入`, `${id} · archived or not loaded`),
      })),
    })
    if (source === undefined) return
    const anchors: OverlayChoice[] = workspace.sessionIds
      .filter(id => id !== source.id)
      .map(id => ({ id, label: ui(`移到 ${summaries.get(id)?.displayTitle ?? id} 前`, `Move before ${summaries.get(id)?.displayTitle ?? id}`) }))
    anchors.push({ id: '__append__', label: ui('移到末尾', "Move to end") })
    const anchor = await overlays.select({ title: ui('选择新位置', "Choose a new position"), choices: anchors })
    if (anchor === undefined) return
    await this.capabilities.moveWorkspaceSession(
      workspace.workspaceId,
      idOf(source.id),
      anchor.id === '__append__' ? undefined : idOf(anchor.id),
    )
    this.host.notice(ui('已调整会话顺序', "Session order updated"), 'success')
  }

  private async profile(args: string): Promise<void> {
    const management = this.capabilities.managementBridge()
    const parsed = commandParts(args)
    if (parsed.command === 'switch') {
      if (parsed.rest === '') throw new Error(ui('用法：/profile switch <名称>', "Usage: /profile switch <name>"))
      await this.switchProfile(parsed.rest)
      return
    }
    if (parsed.command === 'create') {
      if (parsed.rest === '') throw new Error(ui('用法：/profile create <名称>', "Usage: /profile create <name>"))
      const created = await management.profiles.create(parsed.rest)
      await this.createdProfile(created)
      return
    }
    if (parsed.command === 'copy') {
      const copy = argumentPair(parsed.rest)
      if (copy.first === '' || copy.rest === '') throw new Error(ui('用法：/profile copy <源 Profile> <新名称>', "Usage: /profile copy <source Profile> <new-name>"))
      const created = await management.profiles.create(copy.rest, copy.first)
      await this.createdProfile(created)
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      throw new Error(ui('用法：/profile [list|switch <名称>|create <名称>|copy <源> <新名称>]', "Usage: /profile [list|switch <name>|create <name>|copy <source> <new-name>]"))
    }

    const profiles = await management.profiles.list()
    const current = this.capabilities.currentProfile()
    const orderedProfiles = [...profiles].sort((left, right) => {
      if (left.name === current) return -1
      if (right.name === current) return 1
      return 0
    })
    const options = { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: 'Profile',
        detail: ui('切换后会重启，并恢复当前工作区、会话、草稿和附件', "Switching restarts DeepSeek and restores the workspace, session, draft, and attachments"),
        choices: [
          ...orderedProfiles.map(profile => ({
            id: `profile:${profile.name}`,
            label: `${profile.name === current ? '● ' : ''}${profile.name}`,
            description: this.profileDescription(profile),
            ...(profile.compatible ? {} : { disabledReason: ui('不能直接用于终端；可复制为新的终端 Profile', "Cannot be used directly in the terminal; copy it to a new terminal Profile") }),
          })),
          { id: '__create__', label: ui('创建 Profile…', "Create Profile…"), description: ui('创建新的终端运行配置', "Create a new terminal runtime configuration") },
          { id: '__copy__', label: ui('复制 Profile…', "Copy Profile…"), description: ui('基于现有 Profile 创建终端版本', "Create a terminal version from an existing Profile") },
        ],
        options,
      }, async (selected) => {
        if (selected.id === '__create__') {
          const name = await navigation.input({ title: ui('创建 Profile', "Create Profile"), placeholder: ui('输入小写 Profile 名称', "Enter a lowercase Profile name") })
          if (name === undefined || name.trim() === '') return
          await this.createdProfile(await management.profiles.create(name.trim()), navigation)
          return
        }
        if (selected.id === '__copy__') {
          const source = await navigation.select({
            title: ui('选择源 Profile', "Choose source Profile"),
            choices: profiles.map(profile => ({
              id: profile.name,
              label: profile.name,
              description: `${this.profileDescription(profile)}${profile.compatible ? '' : ui(' · 将转换为终端版本', " · will be converted to a terminal version")}`,
            })),
          })
          if (source === undefined) return
          const name = await navigation.input({ title: ui('复制 Profile', "Copy Profile"), placeholder: ui('输入新 Profile 名称', "Enter the new Profile name") })
          if (name === undefined || name.trim() === '') return
          await this.createdProfile(await management.profiles.create(name.trim(), source.id), navigation)
          return
        }
        await this.switchProfile(selected.id.slice('profile:'.length), navigation)
      })
    }, options)
  }

  private profileDescription(profile: TuiProfileSummary): string {
    const initialized = profile.initialized ? ui('已就绪', "Ready") : ui('尚未初始化', "Not initialized")
    return ui(`${initialized} · ${profile.bundles.length} 个功能组件 · ${profile.dependencyCount} 个额外插件`, `${initialized} · ${profile.bundles.length} capability bundle(s) · ${profile.dependencyCount} extra plugin(s)`)
  }

  private async switchProfile(
    profile: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    if (profile === this.capabilities.currentProfile()) {
      this.host.notice(ui(`${profile} 已是当前 Profile`, `${profile} is already the current Profile`), 'info')
      return
    }
    const profiles = await this.capabilities.managementBridge().profiles.list()
    const target = profiles.find(candidate => candidate.name === profile)
    if (target === undefined) throw new Error(ui(`Profile ${JSON.stringify(profile)} 不存在`, `Profile ${JSON.stringify(profile)} does not exist`))
    if (!target.compatible) throw new Error(target.diagnostic ?? ui(`Profile ${profile} 不兼容`, `Profile ${profile} is incompatible`))
    const confirmed = await overlays.confirm(
      ui(`切换到 Profile ${profile}？`, `Switch to Profile ${profile}?`),
      ui('deepseek 会重新启动，并恢复工作区、会话、未发送草稿和附件；正在运行的任务会停止。', "DeepSeek will restart and restore the workspace, session, unsent draft, and attachments; any running task will stop."),
      ui('切换并重启', "Switch and restart"),
    )
    if (confirmed) this.host.restart(profile, ui(`已切换到 Profile ${profile}`, `Switched to Profile ${profile}`))
  }

  private async createdProfile(
    profile: TuiProfileSummary,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    this.host.notice(ui(`已创建 Profile ${profile.name}`, `Created Profile ${profile.name}`), 'success')
    const activate = await overlays.confirm(
      ui(`立即切换到 ${profile.name}？`, `Switch to ${profile.name} now?`),
      ui('切换会受控重启并恢复当前上下文。', "Switching performs a controlled restart and restores the current context."),
      ui('切换并重启', "Switch and restart"),
    )
    if (activate) this.host.restart(profile.name, ui(`已创建并切换到 Profile ${profile.name}`, `Created and switched to Profile ${profile.name}`))
  }

  private async mode(): Promise<void> {
    const modes = await this.capabilities.listModes()
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('Agent 模式', "Agent mode"),
        detail: ui('选择当前会话的工作模式；用户创建的模式会单独标记', "Choose the current session mode; user-created modes are marked separately"),
        choices: modes.map(mode => ({
          id: mode.id,
          label: `${currentMark(mode.current)}${mode.label}${mode.trust === 'user' ? ui(' · 用户', " · user") : ''}`,
          description: mode.description ?? (mode.isDefault ? ui('部署默认模式', "Deployment default") : mode.id),
          ...(mode.disabledReason === undefined ? {} : { disabledReason: mode.disabledReason }),
        })),
      }, async (selected) => {
        const target = modes.find(mode => mode.id === selected.id)
        if (target?.current === true) {
          this.host.notice(ui(`${target.label} 已是当前模式`, `${target.label} is already the current mode`), 'info')
          return
        }
        let allowNewSession = false
        if (this.capabilities.modeNeedsNewSession()) {
          allowNewSession = await navigation.confirm(
            ui('活跃会话不能原地切换模式', "An active session cannot change mode in place"),
            ui('确认后会在同一工作区创建空白会话并应用目标模式；原会话、日志和标题保持不变。', "A blank session will be created in the same workspace with the selected mode; the original session, log, and title remain unchanged."),
            ui('创建新会话', "Create new session"),
          )
          if (!allowNewSession) return
        }
        await this.capabilities.selectMode(selected.id, allowNewSession)
        this.host.notice(
          allowNewSession ? ui(`已创建新会话并切换为${target?.label ?? selected.label}`, `Created a new session and changed mode to ${target?.label ?? selected.label}`) : ui(`模式已切换为${target?.label ?? selected.label}`, `Mode changed to ${target?.label ?? selected.label}`),
          'success',
        )
      })
    })
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
      label: ui('Provider 目录不可用', "Provider catalog unavailable"),
      disabledReason: failure,
    })))
    if (!directory.routable) {
      this.host.notice(ui('当前模型路由不可用；请选择一个已加载 Provider 的模型', "The current model route is unavailable; choose a model from a loaded Provider"), 'warning')
    }
    const options = { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('模型', "Model"),
        detail: ui('选择当前会话使用的 Provider、模型和推理强度', "Choose the Provider, model, and reasoning effort for the current session"),
        choices,
        options,
      }, async (selected) => {
        const option = directory.options.find(candidate => candidate.id === selected.id)
        if (option === undefined) return
        const selection = await this.reasoningSelection(option, navigation)
        if (selection === undefined) return
        await this.capabilities.selectModel(selection)
        this.host.refreshHeader()
        this.host.notice(ui(`模型已切换为 ${selection.provider}/${selection.model}`, `Model changed to ${selection.provider}/${selection.model}`), 'success')
      })
    }, options)
  }

  private async language(
    args: string,
    overlays: OverlayPrompts = this.host.overlays,
    suppliedDocument?: TuiSettingsDocument,
  ): Promise<void> {
    const settings = this.capabilities.managementBridge().settings
    const document = suppliedDocument ?? localeSettings(await settings.describe(LOCALE_SETTINGS_NAMESPACE))
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
      title: ui(`${option.label} · 推理强度`, `${option.label} · reasoning effort`),
      choices: [
        {
          id: '__default__',
          label: ui(`Provider 默认${option.defaultEffort === undefined ? '' : `（${option.defaultEffort}）`}`, `Provider default${option.defaultEffort === undefined ? '' : ` (${option.defaultEffort})`}`),
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
      case 'export': await this.themeExport(parsed.rest); return
      case 'delete': await this.themeDelete(parsed.rest); return
      default: throw new Error(ui('用法：/theme [dark|light|code|use|edit|palette|import|export|delete]', "Usage: /theme [dark|light|code|use|edit|palette|import|export|delete]"))
    }
  }

  private async themeCenter(): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const readChoices = async (): Promise<OverlayChoice[]> => {
      const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE, { bypassCache: true }))
      const appearance = appearanceFromSettings(document)
      const activeCodeTheme = resolveCodeTheme(appearance)
      const choices: OverlayChoice[] = [
        { id: 'dark', label: ui('DeepSeek 暗色', "DeepSeek dark"), description: ui('内置 · 深灰蓝画布', "Built in · deep blue-gray canvas") },
        { id: 'light', label: ui('DeepSeek 亮色', "DeepSeek light"), description: ui('内置 · 柔和冷白画布', "Built in · soft cool-white canvas") },
        ...appearance.customThemes.map(theme => ({
          id: customThemeId(theme),
          label: theme.name,
          description: `${theme.tone === 'dark' ? ui('暗色', "Dark") : ui('亮色', "Light")} · ${theme.source === 'palette' ? ui('颜色组生成', "Generate from palette") : theme.source === 'vscode' ? ui('VS Code 导入', "VS Code import") : ui('手动配色', "Manual colors")}`,
        })),
      ]
      choices.sort((left, right) => Number(right.id === appearance.theme) - Number(left.id === appearance.theme))
      choices.push(
        {
          id: '__background__',
          label: ui('背景模式', 'Background mode'),
          description: ui('选择主画布背景；独立于主题文件', 'Choose the canvas background independently of theme files'),
        },
        {
          id: '__code__',
          label: ui('代码块主题', "Code-block theme"),
          description: ui(`${appearance.codeTheme === 'auto' ? '自动匹配' : '独立指定'} · 当前 ${activeCodeTheme.name}`, `${appearance.codeTheme === 'auto' ? 'Automatic' : 'Explicit'} · current ${activeCodeTheme.name}`),
        },
        { id: '__edit__', label: ui('自定义颜色与代码高亮', "Custom colors and syntax highlighting"), description: ui('修改背景、文字和语法颜色', "Edit backgrounds, text, and syntax colors") },
        { id: '__palette__', label: ui('用颜色组合自动配置', "Generate automatically from a color palette"), description: ui('输入 3–16 个 HEX/RGB 颜色代码', "Enter 3–16 HEX/RGB colors") },
        { id: '__import__', label: ui('导入 VS Code 主题', "Import VS Code theme"), description: ui('本地 JSON/JSONC · 支持相对 include', "Local JSON/JSONC · relative includes supported") },
        { id: '__export__', label: ui('导出主题 JSON', "Export theme JSON"), description: ui('写出可分享的 SeekTTY 主题文件', "Write a shareable SeekTTY theme file") },
        { id: '__delete__', label: ui('删除主题', "Delete theme"), description: ui('管理命名自定义主题', "Manage named custom themes") },
      )
      return choices.map(choice => ({
        ...choice,
        label: `${currentMark(choice.id === appearance.theme)}${choice.label}`,
      }))
    }
    const options = { width: 68, maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('主题', "Theme"),
        detail: ui('手动配色、颜色组合自动生成，或导入 VS Code JSON/JSONC', "Edit colors, generate from a palette, or import VS Code JSON/JSONC"),
        choices: await readChoices(),
        options,
      }, async (selected) => {
        let notice: string | undefined
        try {
          if (selected.id === '__code__') await this.themeCode('', navigation)
          else if (selected.id === '__background__') await this.editBackgroundMode(navigation)
          else if (selected.id === '__palette__') await this.themePalette('', navigation)
          else if (selected.id === '__import__') await this.themeImport('', navigation)
          else if (selected.id === '__export__') await this.themeExport('', navigation)
          else if (selected.id === '__edit__') await this.themeEdit('', navigation)
          else if (selected.id === '__delete__') await this.themeDelete('', navigation)
          else await this.activateTheme(selected.id as TuiThemeId)
        } catch (error) {
          notice = capabilityError(error)
          this.host.notice(notice, 'error')
        }
        if (navigation.signal.aborted) return
        const refreshed = await readChoices()
        if (!navigation.signal.aborted) navigation.updateChoices(refreshed, notice)
      })
    }, options)
  }

  private async activateTheme(target: TuiThemeId): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    const resolved = resolveTheme(appearance, target)
    if (target === appearance.theme && appearance.codeTheme === 'auto') {
      this.host.notice(ui(`${resolved.name}已启用`, `${resolved.name} enabled`), 'info')
      return
    }
    const updated = await saveTheme(bridge, document, target)
    await this.settingsChanged(updated, resolved.name)
  }

  /** Shared by /theme and the searchable Harness appearance field. No preview before saving. */
  private async editBackgroundMode(overlays: OverlayPrompts): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const current = appearanceFromSettings(document).backgroundMode
    const selected = await overlays.select({
      title: ui('背景模式', 'Background mode'),
      detail: ui(
        '主画布、弹窗面板和代码基础背景按模式继承终端效果，不设置透明度；选区与特殊 token 背景保留。保存后立即生效。',
        'Canvas, panels and base code backgrounds inherit terminal effects by mode; opacity is not changed. Selections and explicit token backgrounds remain. Saves apply immediately.',
      ),
      searchable: false,
      initialChoiceId: current,
      choices: [
        {
          id: 'theme', label: ui('主题颜色＋终端效果（默认）', 'Theme + terminal effects'),
          description: ui('默认背景＋OSC 11 主题改色；保留终端透明、模糊和图片效果', 'Default: OSC 11 theme color; retain terminal transparency, blur and images'),
        },
        {
          id: 'terminal', label: ui('跟随终端', 'Follow terminal'),
          description: ui('使用终端默认背景，不改色；恢复本次运行捕获的原色', 'Use the terminal default background without recoloring; restore the captured original'),
        },
        {
          id: 'explicit', label: ui('显式主题底色（兼容）', 'Explicit fill (compatibility)'),
          description: ui('沿用 RGB 画布、面板、代码背景与主题改色；实际透明效果由终端决定', 'Keep RGB canvas, panel and code backgrounds plus theme color sync; the terminal still decides opacity'),
        },
      ].map(choice => ({ ...choice, active: choice.id === current })),
      options: { width: 90, maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    if (selected === undefined || selected.id === current) return
    const updated = await saveBackgroundMode(bridge, document, selected.id as TuiBackgroundMode)
    await this.settingsChanged(updated, ui('背景模式', 'Background mode'), overlays)
  }

  private async themeUse(value: string): Promise<void> {
    if (value === '') throw new Error(ui('用法：/theme use <主题名>', "Usage: /theme use <theme-name>"))
    if (value === 'dark' || value === 'light') {
      await this.activateTheme(value)
      return
    }
    const document = appearanceSettings(await this.capabilities.managementBridge().settings.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    const requested = value.startsWith('custom:') ? value.slice('custom:'.length) : value
    const folded = requested.toLowerCase()
    const theme = appearance.customThemes.find(candidate =>
      candidate.id === requested || candidate.name.toLowerCase() === folded)
    if (theme === undefined) throw new Error(ui(`找不到主题 ${JSON.stringify(value)}`, `Theme ${JSON.stringify(value)} was not found`))
    await this.activateTheme(customThemeId(theme))
  }

  private async themeCode(value: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    let target: TuiCodeThemeId | undefined
    if (value !== '') {
      if (value === 'auto' || value === 'dark' || value === 'light') target = value
      else {
        const requested = value.startsWith('custom:') ? value.slice('custom:'.length) : value
        const folded = requested.toLowerCase()
        const custom = appearance.customThemes.find(candidate =>
          candidate.id === requested || candidate.name.toLowerCase() === folded)
        if (custom === undefined) throw new Error(ui(`找不到代码主题 ${JSON.stringify(value)}`, `Code theme ${JSON.stringify(value)} was not found`))
        target = customThemeId(custom)
      }
    } else {
      const selected = await overlays.select({
        title: ui('代码块主题', "Code-block theme"),
        detail: ui('只改变代码块、工具指令、文件内容、JSON 与 Diff；界面颜色保持不变。', "Changes only code blocks, tool commands, file content, JSON, and diffs; interface colors stay unchanged."),
        choices: [
          {
            id: 'auto',
            label: ui(`${currentMark(appearance.codeTheme === 'auto')}自动匹配`, `${currentMark(appearance.codeTheme === 'auto')}Automatic`),
            description: ui('代码背景、高亮颜色和暗亮方向跟随界面主题', "Code background, highlighting, and tone follow the interface theme"),
          },
          { id: 'dark', label: ui(`${currentMark(appearance.codeTheme === 'dark')}DeepSeek 暗色代码`, `${currentMark(appearance.codeTheme === 'dark')}DeepSeek dark code`) },
          { id: 'light', label: ui(`${currentMark(appearance.codeTheme === 'light')}DeepSeek 亮色代码`, `${currentMark(appearance.codeTheme === 'light')}DeepSeek light code`) },
          ...appearance.customThemes.map(theme => ({
            id: customThemeId(theme),
            label: `${currentMark(appearance.codeTheme === customThemeId(theme))}${theme.name}`,
            description: `${theme.tone === 'dark' ? ui('暗色', "Dark") : ui('亮色', "Light")} · ${theme.source === 'vscode' ? ui('VS Code 导入', "VS Code import") : ui('自定义', "Custom")}`,
          })),
        ],
        options: { width: 72, maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      target = selected?.id as TuiCodeThemeId | undefined
    }
    if (target === undefined) return
    if (target === appearance.codeTheme) {
      this.host.notice(ui(`代码主题 ${resolveCodeTheme(appearance).name} 已启用`, `Code theme ${resolveCodeTheme(appearance).name} enabled`), 'info')
      return
    }
    const updated = await saveCodeTheme(bridge, document, target)
    const stored = appearanceFromSettings(updated)
    await this.settingsChanged(updated, ui(`代码主题 ${resolveCodeTheme(stored).name}`, `Code theme ${resolveCodeTheme(stored).name}`))
  }

  private async themeIdentity(
    nameValue: string,
    appearance: TuiAppearanceSettings,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<{ readonly id: string; readonly name: string } | undefined> {
    const name = nameValue.trim()
    if (name === '' || name.length > 80) throw new Error(ui('主题名称必须为 1–80 个字符', "Theme name must contain 1–80 characters"))
    if (/[\u0000-\u001F\u007F-\u009F]/u.test(name)) throw new Error(ui('主题名称不能包含终端控制字符', "Theme name cannot contain terminal control characters"))
    const existing = appearance.customThemes.find(theme =>
      theme.name.toLowerCase() === name.toLowerCase())
    if (existing !== undefined) {
      const overwrite = await overlays.confirm(
        ui(`覆盖主题 ${existing.name}？`, `Replace theme ${existing.name}?`),
        ui('原主题颜色会被新配置替换，其他命名主题不受影响。', "The new configuration replaces this theme; other named themes are unchanged."),
        ui('覆盖', "Replace"),
      )
      return overwrite ? { id: existing.id, name: existing.name } : undefined
    }
    if (appearance.customThemes.length >= 32) throw new Error(ui('已达到 32 个自定义主题上限', "The limit of 32 custom themes has been reached"))
    const base = themeIdFromName(name)
    let id = base
    for (let index = 2; appearance.customThemes.some(theme => theme.id === id); index += 1) {
      const suffix = `-${String(index)}`
      id = `${base.slice(0, 48 - suffix.length).replace(/-+$/u, '')}${suffix}`
    }
    return { id, name }
  }

  private async promptThemeName(
    initialValue = '',
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<string | undefined> {
    const value = await overlays.input({
      title: ui('主题名称', "Theme name"),
      initialValue,
      placeholder: ui('例如 DeepSeek Ocean', "For example, DeepSeek Ocean"),
    })
    return value === undefined || value.trim() === '' ? undefined : value.trim()
  }

  private async themePalette(requestedName: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    const enteredName = requestedName === '' ? await this.promptThemeName('', overlays) : requestedName
    if (enteredName === undefined) return
    const identity = await this.themeIdentity(enteredName, appearance, overlays)
    if (identity === undefined) return
    const palette = await overlays.input({
      title: ui(`生成主题 · ${identity.name}`, `Generate theme · ${identity.name}`),
      detail: ui('粘贴 3–16 个 HEX/RGB 颜色；程序会自动分配背景、正文、状态和代码高亮。', "Paste 3–16 HEX/RGB colors; backgrounds, text, status, and syntax colors are assigned automatically."),
      placeholder: '#0B1020 #E8ECF5 #6682FF #42C99A',
      options: { width: '95%', maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    if (palette === undefined) return
    const candidates = generateThemeCandidates(identity.id, identity.name, palette)
    const first = candidates[candidates.recommended]
    const alternate = candidates[candidates.recommended === 'dark' ? 'light' : 'dark']
    await this.previewAndSaveTheme(document, first, alternate, 'both', overlays)
  }

  private async themeImport(args: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    const [first = '', ...rest] = commandArguments(args)
    const looksLikePath = /^(?:[./~]|file:)/u.test(first) || /\.jsonc?$/iu.test(first)
    const requestedName = looksLikePath ? '' : first
    const suppliedPath = (looksLikePath ? [first, ...rest] : rest).join(' ')
    const path = suppliedPath !== '' ? suppliedPath : await overlays.input({
      title: ui('导入 VS Code 主题', "Import VS Code theme"),
      detail: ui('读取本地 JSON/JSONC；相对 include 会从主题文件目录递归解析。', "Reads local JSON/JSONC; relative includes are resolved recursively from the theme directory."),
      placeholder: '~/.vscode/extensions/.../themes/theme.json',
      options: { width: '95%', maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    if (path === undefined || path.trim() === '') return
    const loaded = await loadVsCodeThemeFile(path)
    const name = requestedName === '' ? loaded.suggestedName : requestedName
    const identity = await this.themeIdentity(name, appearance, overlays)
    if (identity === undefined) return
    await this.previewAndSaveTheme(
      document,
      convertVsCodeTheme(loaded, identity.id, identity.name),
      undefined,
      'code',
      overlays,
    )
  }

  private async themeExport(args: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const document = appearanceSettings(await this.capabilities.managementBridge().settings.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    const [first = '', ...rest] = commandArguments(args)
    const looksLikePath = /^(?:[./~]|file:)/u.test(first) || /\.jsonc?$/iu.test(first)
    const requested = looksLikePath ? '' : first
    const suppliedPath = (looksLikePath ? [first, ...rest] : rest).join(' ')
    let source: ResolvedTuiTheme
    if (requested === '') source = resolveTheme(appearance)
    else if (requested === 'dark' || requested === 'light') source = resolveTheme(appearance, requested)
    else {
      const folded = requested.toLowerCase()
      const custom = appearance.customThemes.find(theme =>
        theme.id === requested || theme.name.toLowerCase() === folded)
      if (custom === undefined) throw new Error(ui(`找不到主题 ${JSON.stringify(requested)}`, `Theme ${JSON.stringify(requested)} was not found`))
      source = resolvedCustomTheme(custom)
    }
    const payload = themeForExport(source)
    const path = suppliedPath !== '' ? suppliedPath : await overlays.input({
      title: ui('导出主题', 'Export theme'),
      detail: ui(
        `写出 ${payload.name} 的 JSON；目标文件必须还不存在。`,
        `Write JSON for ${payload.name}; the destination must not already exist.`,
      ),
      placeholder: `./${payload.id}.json`,
      options: { width: '95%', maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    if (path === undefined || path.trim() === '') return
    const destination = resolveHarnessUserPath(
      path.trim(),
      this.capabilities.active()?.workspacePath ?? process.cwd(),
    )
    try {
      const bytes = await writeThemeExport(destination, serializeThemeExport(payload))
      this.host.notice(ui(
        `已导出 ${payload.name} → ${destination} · ${bytes} B`,
        `Exported ${payload.name} → ${destination} · ${bytes} B`,
      ), 'success')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        throw new Error(ui(
          `文件已存在：${destination}`,
          `File already exists: ${destination}`,
        ))
      }
      throw error
    }
  }

  private async themeEdit(requested: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
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
      if (source === undefined) throw new Error(ui(`找不到主题 ${JSON.stringify(requested)}`, `Theme ${JSON.stringify(requested)} was not found`))
    } else {
      source = resolveTheme(appearance)
      if (source.source === 'builtin' && appearance.customThemes.length > 0) {
        const selected = await overlays.select({
          title: ui('编辑主题', "Edit theme"),
          detail: ui('内置主题会先复制为命名主题', "A built-in theme is copied to a named theme before editing"),
          choices: [
            { id: source.id, label: source.name, description: ui('当前内置主题 · 创建副本', "Current built-in theme · create a copy") },
            ...appearance.customThemes.map(theme => ({
              id: customThemeId(theme), label: theme.name, description: theme.tone === 'dark' ? ui('暗色', "Dark") : ui('亮色', "Light"),
            })),
          ],
        })
        if (selected === undefined) return
        source = resolveTheme(appearance, selected.id as TuiThemeId)
      }
    }
    let editable: TuiCustomTheme
    if (source.source === 'builtin') {
      const requestedCopyName = await this.promptThemeName(ui(`${source.name} 自定义`, `${source.name} custom`), overlays)
      if (requestedCopyName === undefined) return
      const identity = await this.themeIdentity(requestedCopyName, appearance, overlays)
      if (identity === undefined) return
      editable = editableTheme(source, identity.id, identity.name)
    } else {
      const overwrite = await overlays.confirm(
        ui(`编辑并覆盖主题 ${source.name}？`, `Edit and replace theme ${source.name}?`),
        ui('保存后会替换这个命名主题；其他主题不受影响。', "Saving replaces this named theme; other themes are unchanged."),
        ui('继续编辑', "Continue editing"),
      )
      if (!overwrite) return
      editable = editableTheme(source, source.id.slice('custom:'.length), source.name)
    }
    const edited = await this.editThemeValue(editable, overlays)
    if (edited === undefined) return
    await this.previewAndSaveTheme(document, edited, undefined, 'both', overlays)
  }

  private async editThemeValue(
    initial: TuiCustomTheme,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<TuiCustomTheme | undefined> {
    let theme = initial
    while (true) {
      const selected = await overlays.select({
        title: ui(`编辑主题 · ${theme.name}`, `Edit theme · ${theme.name}`),
        detail: ui('只修改界面背景、文字和代码语法高亮颜色', "Edit interface backgrounds, text, and code syntax colors"),
        choices: [
          { id: '__done__', label: ui('完成并预览', "Finish and preview"), description: ui('检查实际终端效果后保存', "Inspect the terminal result before saving") },
          { id: '__tone__', label: ui('暗亮方向', "Tone"), description: theme.tone === 'dark' ? ui('暗色', "Dark") : ui('亮色', "Light") },
          ...Object.entries(THEME_UI_FIELDS).map(([key, label]) => ({
            id: `ui:${key}`, label: ui(label.zh, label.en), description: theme.colors[key as keyof typeof THEME_UI_FIELDS],
          })),
          ...Object.entries(THEME_SYNTAX_FIELDS).map(([key, label]) => ({
            id: `syntax:${key}`, label: ui(`代码 · ${label.zh}`, `Code · ${label.en}`), description: theme.syntax[key as keyof typeof THEME_SYNTAX_FIELDS],
          })),
        ],
        options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
      })
      if (selected === undefined) return undefined
      if (selected.id === '__done__') return normalizeCustomTheme(theme)
      if (selected.id === '__tone__') {
        const tone = await overlays.select({
          title: ui('暗亮方向', "Tone"),
          choices: [
            { id: 'dark', label: ui('暗色', "Dark"), ...(theme.tone === 'dark' ? { description: ui('当前', "Current") } : {}) },
            { id: 'light', label: ui('亮色', "Light"), ...(theme.tone === 'light' ? { description: ui('当前', "Current") } : {}) },
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
      const value = await overlays.input({
        title: selected.label,
        detail: ui('输入 HEX 或 rgb(r,g,b)', "Enter HEX or rgb(r,g,b)"),
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
    overlays: OverlayPrompts = this.host.overlays,
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
      const selected = await overlays.select({
        title: ui(`${activation === 'code' ? '代码主题' : '主题'}预览 · ${candidate.name}`, `${activation === 'code' ? 'Code theme' : 'Theme'} Preview · ${candidate.name}`),
        detail: themePreviewText(candidate, warnings),
        searchable: false,
        choices: [
          {
            id: 'apply',
            label: ui('应用并保存', "Apply and save"),
            description: activation === 'code' ? ui('只替换代码呈现，界面主题保持不变', "Replace only code presentation; the interface theme stays unchanged") : ui('写入 Harness Settings', "Write to Harness Settings"),
          },
          ...(alternate === undefined ? [] : [{ id: 'toggle', label: ui(`切换为${alternate.tone === 'dark' ? '暗色' : '亮色'}方向`, `Switch to ${alternate.tone === 'dark' ? 'Dark' : 'Light'} tone`), description: ui('使用同一组颜色重新预览', "Preview again with the same colors") }]),
          { id: 'edit', label: ui('继续调整', "Continue editing"), description: ui('修改界面或代码颜色', "Edit interface or code colors") },
          { id: 'cancel', label: ui('取消', "Cancel"), description: ui('恢复原主题', "Restore original theme") },
        ],
        footer: themePreviewFooter(),
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
        const edited = await this.editThemeValue(candidate, overlays)
        if (edited !== undefined) {
          candidate = edited
          alternate = undefined
        }
        continue
      }
      if (warnings.length > 0) {
        const confirmed = await overlays.confirm(
          ui('主题存在对比度警告', "Theme has contrast warnings"),
          ui(`${warnings.join('；')}。颜色不会被静默修改。是否仍然保存？`, `${warnings.join('；')}. Colors will not be changed silently. Save anyway?`),
          ui('仍然保存', "Save anyway"),
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
        await this.settingsChanged(updated, `${activation === 'code' ? ui('代码主题 ', "Code theme ") : ''}${candidate.name}`)
      } catch (error) {
        this.host.applyTheme(original)
        throw error
      }
      return
    }
  }

  private async themeDelete(requested: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const document = appearanceSettings(await bridge.describe(TUI_APPEARANCE_SETTINGS_NAMESPACE))
    const appearance = appearanceFromSettings(document)
    if (appearance.customThemes.length === 0) throw new Error(ui('没有可删除的自定义主题', "There are no custom themes to delete"))
    let theme = requested === '' ? undefined : appearance.customThemes.find(candidate =>
      candidate.id === requested || candidate.name.toLowerCase() === requested.toLowerCase())
    if (requested !== '' && theme === undefined) throw new Error(ui(`找不到主题 ${JSON.stringify(requested)}`, `Theme ${JSON.stringify(requested)} was not found`))
    if (theme === undefined) {
      const selected = await overlays.select({
        title: ui('删除主题', "Delete theme"),
        choices: appearance.customThemes.map(candidate => ({
          id: candidate.id,
          label: candidate.name,
          description: [
            appearance.theme === customThemeId(candidate) ? ui('当前界面', "Current interface") : undefined,
            appearance.codeTheme === customThemeId(candidate) ? ui('当前代码', "Current code theme") : undefined,
            candidate.tone === 'dark' ? ui('暗色', "Dark") : ui('亮色', "Light"),
          ].filter((value): value is string => value !== undefined).join(' · '),
        })),
      })
      if (selected === undefined) return
      theme = appearance.customThemes.find(candidate => candidate.id === selected.id)
    }
    if (theme === undefined) return
    const confirmed = await overlays.confirm(
      ui(`删除主题 ${theme.name}？`, `Delete theme ${theme.name}?`),
      appearance.theme === customThemeId(theme) && appearance.codeTheme === customThemeId(theme)
        ? ui('该主题会从 Harness Settings 删除；界面切换到 DeepSeek 暗色，代码主题恢复自动匹配。', "The theme is deleted from Harness Settings; the interface switches to DeepSeek dark and code returns to automatic matching.")
        : appearance.theme === customThemeId(theme)
          ? ui('该主题会从 Harness Settings 删除，界面立即切换到 DeepSeek 暗色。', "The theme is deleted from Harness Settings and the interface immediately switches to DeepSeek dark.")
          : appearance.codeTheme === customThemeId(theme)
            ? ui('该主题会从 Harness Settings 删除，代码主题恢复自动匹配。', "The theme is deleted from Harness Settings and code returns to automatic matching.")
            : ui('该主题会从 Harness Settings 删除；当前界面和代码主题不变。', "The theme is deleted from Harness Settings; the current interface and code themes are unchanged."),
      ui('删除', "Delete"),
    )
    if (!confirmed) return
    const updated = await deleteCustomTheme(bridge, document, theme.id)
    await this.settingsChanged(updated, ui(`主题 ${theme.name}`, `Theme ${theme.name}`))
  }

  private async permission(args: string): Promise<void> {
    const sessionId = this.capabilities.active()?.sessionId
    const options = this.capabilities.listPermissions()
    if (args !== '') {
      const target = options.find(option => option.id === args)
      if (target === undefined) throw new Error(ui(`未知权限预设 ${JSON.stringify(args)}`, `Unknown permission preset ${JSON.stringify(args)}`))
      await this.selectPermission(target)
      return
    }
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('权限', "Permission"),
        detail: ui(`作用工作区：${this.capabilities.active()?.workspacePath ?? '未知'}`, `Workspace scope: ${this.capabilities.active()?.workspacePath ?? 'Unknown'}`),
        choices: options.map(option => ({
          id: option.id,
          label: `${currentMark(option.current)}${permissionLabel(option)}`,
          description: permissionDescription(option),
        })),
      }, async (selected) => {
        try {
          const target = options.find(option => option.id === selected.id)
          if (target !== undefined && await this.selectPermission(target, navigation, sessionId)) navigation.back()
        } catch (error) {
          const message = capabilityError(error)
          this.host.notice(message, 'error')
          navigation.updateChoices(options.map(option => ({
            id: option.id, label: permissionLabel(option), description: permissionDescription(option),
          })), message)
        }
      })
    })
  }

  private async selectPermission(
    option: TuiPermissionOption,
    overlays: OverlayPrompts = this.host.overlays,
    sessionId = this.capabilities.active()?.sessionId,
  ): Promise<boolean> {
    const checkSession = (): void => {
      if (sessionId === undefined || this.capabilities.active()?.sessionId !== sessionId) {
        throw new Error(ui('会话已切换，请重新选择权限', 'The session changed; select the permission again'))
      }
    }
    checkSession()
    const latest = this.capabilities.listPermissions().find(candidate => candidate.id === option.id)
    if (latest === undefined) throw new Error(ui('权限预设已不可用，请重新打开权限菜单', 'The permission preset is unavailable; reopen the permission menu'))
    option = latest
    if (option.current) {
      this.host.notice(ui(`当前已是${permissionLabel(option)}`, `Permission is already ${permissionLabel(option)}`), 'info')
      return true
    }
    if (option.needsConfirmation) {
      const confirmed = await overlays.confirm(
        option.id === 'danger-full-access' ? ui('进入完全访问？', "Enter full access?") : ui('切换到未知风险权限？', "Switch to a permission with unknown risk?"),
        ui(`${permissionLabel(option)}：${permissionDescription(option)}。切换后立即作用于当前会话。`, `${permissionLabel(option)}: ${permissionDescription(option)}. The change applies to the current session immediately.`),
        ui('确认切换', "Switch"),
      )
      if (!confirmed) return false
    }
    checkSession()
    await this.capabilities.selectPermission(option.id, sessionId)
    checkSession()
    await this.host.refreshHeader()
    checkSession()
    this.host.notice(ui(`权限已切换为${permissionLabel(option)}`, `Permission changed to ${permissionLabel(option)}`), 'success')
    return true
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
        nav.updateChoices(this.queueListRequest().choices)
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
      title: ui('输入队列', "Input queue"),
      detail: ui('查看、编辑或提前处理排队消息 · 打开期间自动刷新', "View, edit, or promote queued messages · refreshes while open"),
      choices: rows.length === 0
        ? [{ id: '__empty__', label: ui('当前队列为空', "The queue is empty"), disabledReason: ui('等待新的排队消息，或 Esc 关闭', "Waiting for a queued message, or Esc to close") }]
        : queueListChoiceOrder(rows.map(row => row.id), queued.length).map((id) => {
          if (id === '__all_steer__') {
            return {
              id,
              label: ui('整队引导', "Steer entire queue"),
              description: ui(`按当前顺序处理 ${queued.length} 条排队消息`, `Process ${queued.length} queued message(s) in the current order`),
            }
          }
          if (id === '__clear__') {
            return {
              id,
              label: ui('清空全部', "Clear all"),
              description: ui('删除所有排队消息，不影响当前轮次', "Remove every queued message; the current turn is unchanged"),
            }
          }
          const row = rows.find(candidate => candidate.id === id)
          if (row === undefined) return { id, label: id }
          return {
            id: row.id,
            label: row.preview === '' ? ui('(空消息)', "(empty message)") : row.preview,
            description: queuePlacementLabel(row.placement),
            ...(row.placement === 'queued' ? {} : { disabledReason: ui('当前状态不接受队列修改', "The queue cannot be changed in the current state") }),
          }
        }),
      searchable: rows.length > 8,
      options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
    }
  }

  private async queueChoice(nav: OverlayNavigation, id: string): Promise<void> {
    const rows = this.capabilities.active()?.session.getSnapshot().queue ?? []
    const queued = rows.filter(row => row.placement === 'queued')
    if (id === '__all_steer__') {
      for (const row of queued) await this.capabilities.updateQueue(row.id, { kind: 'steer' })
      this.host.notice(ui('已请求整队引导', "Requested steering for the full queue"), 'success')
      return
    }
    if (id === '__clear__') {
      const confirmed = await nav.confirm(
        ui('清空输入队列？', "Clear the input queue?"),
        ui('将删除全部排队消息；正在处理的轮次不受影响。', "Every queued message will be removed; the in-flight turn is unchanged."),
        ui('清空全部', "Clear all"),
      )
      if (!confirmed) return
      for (const row of queued) await this.capabilities.updateQueue(row.id, { kind: 'remove' })
      this.host.notice(ui('已清空输入队列', "Input queue cleared"), 'success')
      return
    }
    const row = rows.find(candidate => candidate.id === id)
    if (row === undefined || row.placement !== 'queued') return
    const action = await nav.select({
      title: ui('队列操作', "Queue action"),
      choices: [
        { id: 'steer', label: ui('转为引导', "Convert to steering"), description: ui('并入当前轮次', "Merge into current turn") },
        { id: 'edit', label: ui('编辑', "Edit"), ...(row.text === null ? { disabledReason: ui('含非文本内容，无法文本编辑', "Contains non-text content and cannot be edited as text") } : {}) },
        { id: 'remove', label: ui('删除', "Delete"), description: ui('从待处理队列移除', "Remove from the pending queue") },
      ],
      searchable: false,
    })
    if (action === undefined) return
    if (action.id === 'steer') await this.capabilities.updateQueue(row.id, { kind: 'steer' })
    else if (action.id === 'remove') await this.capabilities.updateQueue(row.id, { kind: 'remove' })
    else if (action.id === 'edit' && row.text !== null) {
      const text = await nav.multilineInput({ title: ui('编辑排队消息', "Edit queued message"), initialValue: row.text })
      if (text === undefined) return
      await this.capabilities.updateQueue(row.id, { kind: 'edit', content: [{ type: 'text', text }] })
    } else {
      return
    }
    this.host.notice(ui('队列操作已提交', "Queue action submitted"), 'success')
  }

  private async steer(args: string): Promise<void> {
    if (args === '') throw new Error(ui('用法：/steer <消息>', "Usage: /steer <message>"))
    const active = this.capabilities.active()
    if (active === undefined) return
    const result = await active.session.prompt(this.capabilities.promptContent(args), 'steer')
    if (!result.ok) throw new Error(ui(`引导失败：${result.error.message}`, `Steering failed: ${result.error.message}`))
    this.capabilities.clearAttachments()
    this.host.notice(ui('引导已接受', "Steering accepted"), 'success')
  }

  private async attach(args: string): Promise<void> {
    const path = args.trim()
    if (path !== '') {
      await this.noticeAttachment(await this.capabilities.addAttachment(path))
      return
    }
    const workspace = createClipboardImageWorkspace()
    try {
      const captured = await captureClipboardImage({ platform: process.platform, dest: workspace.dest })
      if (captured === undefined) {
        throw new Error(ui(
          '用法：/attach <图片路径>；也可以先复制图片再执行 /attach',
          'Usage: /attach <image-path>; or copy an image first, then run /attach',
        ))
      }
      chmodSync(workspace.dest, 0o600)
      await this.noticeAttachment(await this.capabilities.addAttachment(captured))
    } finally {
      cleanupClipboardImageWorkspace(workspace)
    }
  }

  private noticeAttachment(attachment: TuiDraftAttachment): void {
    const dimensions = attachment.width === undefined ? '' : ` · ${attachment.width}×${attachment.height}`
    this.host.notice(ui(`已加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`, `Added ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`), 'success')
  }

  private async attachments(): Promise<void> {
    const items = this.capabilities.draftAttachments()
    if (items.length === 0) {
      this.host.notice(ui('没有待发送图片', "No images waiting to be sent"), 'info')
      return
    }
    const confirmed = await this.host.overlays.confirm(
      ui('清空待发送图片？', "Clear pending images?"),
      items.map(item => `${item.name} (${item.bytes} B)`).join('；'),
      ui('清空', "Clear"),
    )
    if (!confirmed) return
    this.capabilities.clearAttachments()
    this.host.notice(ui('已清空待发送图片', "Pending images cleared"), 'success')
  }

  private async settings(args: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const documents = visibleSettingsDocuments(await bridge.describe())
    if (documents.length === 0) throw new Error(ui('当前 Profile 未注册任何 Settings 命名空间', "The current Profile has no registered Settings namespaces"))
    if (args !== '') {
      const document = documents.find(candidate => candidate.namespace === args)
      if (document === undefined) throw new Error(ui(`Settings 命名空间 ${JSON.stringify(args)} 不存在`, `Settings namespace ${JSON.stringify(args)} does not exist`))
    }
    await this.overlayFlow(overlays, async (navigation) => {
      const root = navigation.selectPage({
        title: ui('设置', "Settings"),
        detail: ui('搜索并修改全部功能设置', "Search and edit all feature settings"),
        choices: settingsRootChoices(documents),
      }, async (selected) => {
        const parsed = parseSettingsRootChoice(selected.id)
        if (parsed === undefined) return
        await this.settingsNamespace(
          navigation,
          parsed.namespace,
          parsed.fieldPath === undefined ? undefined : JSON.stringify(parsed.fieldPath),
        )
      })
      if (args !== '') await this.settingsNamespace(navigation, args)
      await root
    }, { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 })
  }

  private async keymap(args: string): Promise<void> {
    const settings = this.capabilities.managementBridge().settings
    const document = behaviorSettings(await settings.describe(TUI_BEHAVIOR_SETTINGS_NAMESPACE))
    const current = behaviorFromSettings(document)
    applyKeyBindingOverrides(current.keyBindings)
    const { first, rest } = argumentPair(args)
    if (first === '') {
      await this.keymapOverlay(document, current)
      return
    }
    await this.keymapAssign(document, current, first, rest)
  }

  private async keymapOverlay(
    document: TuiSettingsDocument,
    current: TuiBehaviorSettings,
  ): Promise<void> {
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('快捷键', 'Key bindings'),
        detail: ui(
          '选择一项以改绑或恢复默认。撤销、Enter、换行和对话查找不可改。',
          'Choose a shortcut to rebind or restore. Undo, Enter, newline, and transcript search stay fixed.',
        ),
        choices: SURFACE_KEYMAP.filter(binding => binding.configurable !== false).map(binding => ({
          id: binding.id,
          label: ui(binding.zh, binding.en),
          description: bindingKeysLabel(binding.id),
        })),
      }, async (selected) => {
        const target = SURFACE_KEYMAP.find(binding => binding.id === selected.id)
        const action = await navigation.select({
          title: ui(target?.zh ?? selected.id, target?.en ?? selected.id),
          detail: ui(
            `当前：${bindingKeysLabel(selected.id)}。输入 Ctrl+K 或 Cmd+, 这类组合。`,
            `Current: ${bindingKeysLabel(selected.id)}. Type a chord such as Ctrl+K or Cmd+,.`,
          ),
          choices: [
            { id: 'set', label: ui('设置新组合…', 'Set a new chord…') },
            { id: 'reset', label: ui('恢复默认', 'Restore default') },
          ],
        })
        if (action === undefined) return
        if (action.id === 'reset') {
          await this.keymapAssign(document, current, selected.id, 'reset')
          return
        }
        const typed = await navigation.input({
          title: ui('新组合键', 'New chord'),
          placeholder: 'Ctrl+K',
        })
        if (typed === undefined || typed.trim() === '') return
        await this.keymapAssign(document, current, selected.id, typed)
      })
    })
  }

  private async keymapAssign(
    document: TuiSettingsDocument,
    current: TuiBehaviorSettings,
    id: string,
    rest: string,
  ): Promise<void> {
    const binding = SURFACE_KEYMAP.find(candidate => candidate.id === id)
    if (binding === undefined || binding.configurable === false) {
      throw new Error(ui(
        `未知或不可配置的键位 ${id}。用法：/keymap [binding [chord|reset]]`,
        `Unknown or non-configurable binding ${id}. Usage: /keymap [binding [chord|reset]]`,
      ))
    }
    if (rest === '') {
      throw new Error(ui(
        '用法：/keymap [binding [chord|reset]]',
        'Usage: /keymap [binding [chord|reset]]',
      ))
    }
    const next: Record<string, string> = { ...current.keyBindings }
    if (rest.toLowerCase() === 'reset' || rest.toLowerCase() === 'default') {
      delete next[id]
    } else {
      const chord = normalizeChord(rest)
      if (chord === undefined) {
        throw new Error(ui(
          `无法解析组合键 ${rest}`,
          `Cannot parse chord ${rest}`,
        ))
      }
      next[id] = chord
    }
    const issue = keyBindingsIssue(next)
    if (issue !== undefined) throw new Error(issue)
    const updated = await this.capabilities.managementBridge().settings.mutate(
      TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['keyBindings'], value: next }],
      document.revision,
    )
    await this.settingsChanged(updated, ui(`键位 ${id}`, `Key binding ${id}`))
  }

  private async mouse(args: string): Promise<void> {
    const document = behaviorSettings(
      await this.capabilities.managementBridge().settings.describe(TUI_BEHAVIOR_SETTINGS_NAMESPACE),
    )
    const current = behaviorFromSettings(document)
    const token = args.trim().toLowerCase()
    let next: TuiMouseMode | undefined
    if (token === 'full' || token === 'native') next = token
    else if (token === 'toggle') next = current.mouseMode === 'full' ? 'native' : 'full'
    else if (token !== '') {
      throw new Error(ui('用法：/mouse [full|native|toggle]', 'Usage: /mouse [full|native|toggle]'))
    }
    if (next === undefined) {
      const selected = await this.host.overlays.select({
        title: ui('鼠标模式', 'Mouse mode'),
        detail: ui(
          '完整模式提供应用内滚动和点击；原生模式关闭鼠标报告，供终端选择文本。切换不会离开备用屏幕。',
          'Full mode provides in-app scrolling and clicks; native mode turns off mouse reporting so the terminal can select text. Switching never leaves the alternate screen.',
        ),
        searchable: false,
        choices: [
          {
            id: 'full',
            label: ui('完整模式', 'Full mode'),
            description: ui('应用内滚轮、滚动条和点击', 'In-app wheel, scrollbar, and clicks'),
            active: current.mouseMode === 'full',
          },
          {
            id: 'native',
            label: ui('原生选择', 'Native selection'),
            description: ui('关闭鼠标报告，使用终端选区', 'Disable mouse reporting and use terminal selection'),
            active: current.mouseMode === 'native',
          },
        ],
      })
      if (selected === undefined) return
      next = selected.id as TuiMouseMode
    }
    if (next === current.mouseMode) {
      this.host.notice(next === 'full'
        ? ui('已是完整鼠标模式', 'Already in full mouse mode')
        : ui('已是原生选择模式', 'Already in native selection mode'), 'info')
      return
    }
    const updated = await this.capabilities.managementBridge().settings.mutate(
      TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['mouseMode'], value: next }],
      document.revision,
    )
    await this.settingsChanged(updated, ui(
      next === 'full' ? '完整鼠标模式' : '原生选择模式',
      next === 'full' ? 'Full mouse mode' : 'Native selection mode',
    ))
  }

  private async settingsNamespace(
    navigation: OverlayNavigation<void>,
    namespace: string,
    initialChoiceId?: string,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const initialDocument = (await bridge.describe(namespace))[0]
    if (initialDocument === undefined) throw new Error(ui(`Settings 命名空间 ${JSON.stringify(namespace)} 不存在`, `Settings namespace ${JSON.stringify(namespace)} does not exist`))
    const namespaceFields = (current: TuiSettingsDocument) =>
      settingsFields(current).filter(field => !hasDedicatedSettingsEditor(current.namespace, field.path))
    let document: TuiSettingsDocument = initialDocument
    let fields = namespaceFields(document)
    let special = this.settingsSpecialChoices(document)
    if (fields.length + special.length === 0) {
      this.host.notice(ui(`${document.namespace} 没有可见设置字段`, `${document.namespace} has no visible Settings fields`), 'info')
      return
    }
    const request = (initialChoiceId?: string): SelectOverlayRequest => ({
      title: ui(`设置 · ${document.namespace}`, `Settings · ${document.namespace}`),
      detail: `${settingsSectionLabel(document.namespace)} · ${document.applies === 'live' ? ui('修改立即生效', "Changes apply immediately") : ui('修改后需重启', "Restart required after changes")}`,
      choices: [
        ...special,
        ...fields.map(field => ({
          id: JSON.stringify(field.path),
          label: field.label,
          description: `${fieldState(field)}${field.description === undefined ? '' : ` · ${field.description}`}`,
          ...(field.disabled ? { disabledReason: ui('该字段当前不可编辑', "This field is currently read-only") } : {}),
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
      const refreshed = (await bridge.describe(namespace))[0]
      if (refreshed === undefined) {
        this.host.notice(ui(`Settings 命名空间 ${namespace} 已不可用`, `Settings namespace ${namespace} is no longer available`), 'warning')
        navigation.back()
        return
      }
      document = refreshed
      fields = namespaceFields(document)
      special = this.settingsSpecialChoices(document)
      if (fields.length + special.length === 0) {
        this.host.notice(ui(`${document.namespace} 没有可见设置字段`, `${document.namespace} has no visible Settings fields`), 'info')
        navigation.back()
        return
      }
      navigation.replaceSelectPage(request(selected.id), handle)
    }
    await navigation.selectPage(request(initialChoiceId), handle)
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
          label: ui('选择新会话默认模型…', "Choose default model for new sessions…"),
          description: ui('动态 Provider、模型与推理强度；不会修改当前会话', "Dynamic Provider, model, and reasoning effort; does not change the current session"),
        }]
      case 'permission':
        return [{
          id: '__settings_default_permission__',
          label: ui('选择新会话默认权限…', "Choose default permission for new sessions…"),
          description: ui('完全访问仍需确认；不会修改当前会话', "Full access still requires confirmation; does not change the current session"),
        }]
      case 'agent-presets':
        return [{
          id: '__settings_default_mode__',
          label: ui('选择新会话默认模式…', "Choose default mode for new sessions…"),
          description: ui('从当前可用模式中选择', "Choose from the currently available modes"),
        }]
      case 'tui-plugin-marketplace':
        return [{
          id: '__settings_plugin_sources__',
          label: ui('管理插件市场来源…', "Manage plugin marketplace sources…"),
          description: ui('管理 npm 和其他插件目录来源', "Manage npm and other plugin catalog sources"),
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
      default: throw new Error(ui(`未知 Settings 专用动作 ${JSON.stringify(action)}`, `Unknown Settings-only action ${JSON.stringify(action)}`))
    }
  }

  private async editDefaultModel(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const directory = await this.capabilities.listModels()
    const current = typeof document.value === 'object' && document.value !== null
      ? document.value as Record<string, unknown>
      : {}
    const selected = await overlays.select({
      title: ui('新会话默认模型', "Default model for new sessions"),
      detail: ui('保存后只影响未来创建且未单独选择模型的会话', "Affects only future sessions that do not select a model explicitly"),
      choices: [
        ...directory.options.map(option => ({
          id: option.id,
          label: `${current.provider === option.selection.provider && current.model === option.selection.model ? ui('当前 · ', "Current · ") : ''}${option.label}`,
          description: option.description,
        })),
        ...directory.failures.map((failure, index) => ({
          id: `__failure_${String(index)}`,
          label: ui('Provider 目录不可用', "Provider catalog unavailable"),
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
    await this.settingsChanged(updated, ui('新会话默认模型', "Default model for new sessions"), overlays)
  }

  private async editDefaultPermission(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const field = settingsFields(document).find(candidate => candidate.path.length === 1 && candidate.path[0] === 'defaultPreset')
    if (field === undefined) throw new Error(ui('当前设置没有默认权限选项；仍可使用下方通用控件', "This Settings namespace has no dedicated default-permission field; use the generic controls below"))
    const options = this.capabilities.listPermissions()
    const selected = await overlays.select({
      title: ui('新会话默认权限', "Default permission for new sessions"),
      detail: ui('保存后只影响未来创建的会话；当前会话权限保持不变', "Affects only future sessions; the current session permission is unchanged"),
      choices: options.map(option => ({
        id: option.id,
        label: `${field.value === option.id ? ui('当前默认 · ', "Current default · ") : ''}${permissionLabel(option)}`,
        description: permissionDescription(option),
      })),
    })
    if (selected === undefined) return
    const option = options.find(candidate => candidate.id === selected.id)
    if (option === undefined || Object.is(field.value, option.id)) return
    if (option.needsConfirmation) {
      const confirmed = await overlays.confirm(
        option.id === 'danger-full-access' ? ui('新会话默认使用完全访问？', "Use full access by default for new sessions?") : ui('使用未知风险默认权限？', "Use a default permission with unknown risk?"),
        ui(`${permissionLabel(option)}：${permissionDescription(option)}。以后创建的会话会采用该权限；现有会话不会改变。`, `${permissionLabel(option)}: ${permissionDescription(option)}. New sessions will use this permission; existing sessions are unchanged.`),
        ui('确认保存', "Save"),
      )
      if (!confirmed) return
    }
    const updated = await this.capabilities.managementBridge().settings.mutate(
      document.namespace,
      [{ op: 'set', path: field.path, value: option.id }],
      document.revision,
    )
    await this.settingsChanged(updated, ui('新会话默认权限', "Default permission for new sessions"), overlays)
  }

  private async editDefaultMode(overlays: OverlayPrompts, document: TuiSettingsDocument): Promise<void> {
    const field = settingsFields(document).find(candidate => candidate.path.length === 1 && candidate.path[0] === 'default')
    if (field === undefined) throw new Error(ui('当前设置没有默认模式选项；仍可使用下方通用控件', "This Settings namespace has no dedicated default-mode field; use the generic controls below"))
    const modes = await this.capabilities.listModes()
    const selected = await overlays.select({
      title: ui('新会话默认模式', "Default mode for new sessions"),
      detail: ui('保存后只影响未来创建且未显式选择 Agent Preset 的会话', "Affects only future sessions that do not select an Agent Preset explicitly"),
      choices: modes.map(mode => ({
        id: mode.id,
        label: `${field.value === mode.id ? ui('当前默认 · ', "Current default · ") : ''}${mode.label}`,
        description: `${mode.trust === 'system' ? ui('系统', "System") : ui('用户', "User")}${mode.description === undefined ? '' : ` · ${mode.description}`}`,
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
    await this.settingsChanged(updated, ui('新会话默认模式', "Default mode for new sessions"), overlays)
  }

  private async editSetting(
    overlays: OverlayPrompts,
    document: TuiSettingsDocument,
    field: TuiSettingsField,
  ): Promise<void> {
    if (document.namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE
      && field.path.length === 1 && field.path[0] === 'backgroundMode') {
      await this.editBackgroundMode(overlays)
      return
    }
    const bridge = this.capabilities.managementBridge().settings
    const actions: OverlayChoice[] = [
      { id: 'edit', label: field.control === 'secret' ? ui('写入新 Secret…', "Set new secret…") : ui('修改值…', "Edit value…"), description: ui(`控件：${field.control}`, `Control: ${field.control}`) },
      ...(field.overridden
        ? [{ id: 'reset', label: ui('重置用户覆盖', "Reset user override"), description: ui(`恢复继承/default：${formatSettingsValue(field.inherited)}`, `Restore inherited/default: ${formatSettingsValue(field.inherited)}`) }]
        : []),
      ...(field.control === 'credential-ref'
        ? [
          { id: 'credential-set', label: ui('配置该 Credential…', "Configure this credential…"), description: ui('密钥不会在界面回显', "The secret is never displayed") },
          ...(typeof field.value === 'string' && field.value.trim() !== ''
            ? [{ id: 'credential-unset', label: ui('清除该 Credential', "Clear this credential"), description: ui('不改变 Settings 中的 Credential Ref', "Does not change the Credential Ref in Settings") }]
            : []),
        ]
        : []),
    ]
    const action = await overlays.select({
      title: field.label,
      detail: ui(`${field.description ?? '暂无说明'}
当前：${field.control === 'secret' ? (field.secretSet ? '已配置（不可回显）' : '未配置') : formatSettingsValue(field.value)}
配置：${field.overridden ? '已单独设置' : `使用默认值 ${formatSettingsValue(field.inherited)}`}`, `${field.description ?? 'No description'}
Current: ${field.control === 'secret' ? (field.secretSet ? 'Configured (value hidden)' : 'Not configured') : formatSettingsValue(field.value)}
Configured: ${field.overridden ? 'User override' : `Use default ${formatSettingsValue(field.inherited)}`}`),
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
          { id: 'true', label: ui('开启', "On"), description: 'true' },
          { id: 'false', label: ui('关闭', "Off"), description: 'false' },
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
          ...(Object.is(option.value, field.value) ? { description: ui('当前', "Current") } : {}),
        })),
        searchable: false,
      })
      if (choice === undefined) return undefined
      value = field.choices.find(option => option.id === choice.id)?.value
    } else if (field.control === 'secret') {
      const failure = ui(
        `${field.label} 保存失败；请重试。`,
        `Could not save ${field.label}. Please retry.`,
      )
      return overlays.secretTransaction<TuiSettingsDocument>({
        input: {
          title: ui(`写入 ${field.label}`, `Write ${field.label}`),
          detail: ui('现有值不会回显；保存后将替换原值', "The current value is hidden; saving replaces it"),
          placeholder: ui('输入新 Secret', "Enter a new secret"),
        },
        busyTitle: ui(`正在保存 ${field.label}`, `Saving ${field.label}`),
        busyDetail: ui('正在通过 Harness Settings 写入。', 'Writing through Harness Settings.'),
        failureMessage: failure,
        validate: raw => validateSecretValue(raw, document.namespace === 'llm-deepseek'),
        work: async (secret) => {
          try {
            return {
              ok: true,
              value: await this.capabilities.managementBridge().settings.mutate(
                document.namespace,
                [{ op: 'set', path: field.path, value: secret }],
                document.revision,
              ),
            }
          } catch {
            return { ok: false, message: failure }
          }
        },
      })
    } else {
      const initialValue = field.control === 'json'
        ? JSON.stringify(field.value, null, 2)
        : (typeof field.value === 'string' ? field.value : '')
      const text = await overlays.input({
        title: ui(`修改 ${field.label}`, `Edit ${field.label}`),
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
        detail: ui('这是引用名，不是 Secret 值', "This is a reference name, not the secret value"),
        placeholder: ui('例如 DEEPSEEK_API_KEY', "For example, DEEPSEEK_API_KEY"),
      })
      if (entered === undefined || entered.trim() === '') return
      ref = entered.trim()
      writeReference = true
    }
    const info = await bridge.credentialInfo(ref)
    if (!info.writable) {
      const source = info.source === undefined ? '' : ` (${info.source})`
      throw new Error(ui(
        `Credential ${JSON.stringify(ref)} 由外部来源${source}管理，不能在这里修改；请修改启动环境或对应配置层。`,
        `Credential ${JSON.stringify(ref)} is managed by an external source${source} and cannot be changed here; update the launch environment or its owning configuration layer.`,
      ))
    }
    if (set) {
      const failure = credentialWriteFailure(ref)
      const updated = await overlays.secretTransaction<TuiSettingsDocument>({
        input: {
          title: ui(`配置 Credential ${ref}`, `Configure credential ${ref}`),
          detail: ui(`状态：${info.configured ? '已配置' : '未配置'}。原值不会回显；保存后将替换原值。`, `Status: ${info.configured ? 'Configured' : 'Not configured'}. The current value is never echoed; saving replaces it.`),
          placeholder: ui('输入 Secret', "Enter secret"),
        },
        busyTitle: ui(`正在保存 Credential ${ref}`, `Saving credential ${ref}`),
        busyDetail: ui('正在通过 Harness Credential API 写入并检查状态。', 'Writing through the Harness Credential API and checking status.'),
        failureMessage: failure,
        validate: raw => validateSecretValue(
          raw,
          document.namespace === 'llm-deepseek' || ref === DEEPSEEK_CREDENTIAL_REF,
        ),
        work: async (secret) => {
          try {
            const saved = await bridge.setCredential(ref, secret)
            if (!saved.configured) return { ok: false, message: failure }
            const next = writeReference
              ? await bridge.mutate(
                document.namespace,
                [{ op: 'set', path: field.path, value: ref }],
                document.revision,
              )
              : document
            return { ok: true, value: next }
          } catch {
            return { ok: false, message: failure }
          }
        },
      })
      if (updated === undefined) return
      document = updated
      await this.settingsChanged(document, `Credential ${ref}`, overlays)
      return
    }
    if (writeReference) return
    if (!info.configured) {
      this.host.notice(ui(`Credential ${ref} 未配置`, `Credential ${ref} is not configured`), 'info')
      return
    }
    const confirmed = await overlays.confirm(
      ui(`清除 Credential ${ref}？`, `Clear credential ${ref}?`),
      ui('密钥将被清除，Settings 中的引用名会保留。', "The secret is cleared while the reference name remains in Settings."),
      ui('清除', "Clear"),
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
        this.host.applyAppearance(appearanceFromSettings(document))
      }
      if (document.namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE) {
        this.host.applyBehavior?.(behaviorFromSettings(document))
      }
      if (document.namespace === LOCALE_SETTINGS_NAMESPACE) {
        this.host.applyLocale(localeFromSettings([document]))
      }
      this.host.notice(ui(`${label} 已更新并立即生效`, `${label} was updated and is now active`), 'success')
      return
    }
    const restart = await overlays.confirm(
      ui(`${label} 需要重启`, `${label} requires a restart`),
      ui('可立即受控重启并恢复工作区、会话、草稿和附件路径，或稍后使用 /restart。', "Restart now and restore the workspace, session, draft, and attachment paths, or use /restart later."),
      ui('立即重启', "Restart now"),
    )
    if (restart) this.host.restart(this.capabilities.currentProfile(), ui(`已应用 ${label}`, `Applied ${label}`))
    else this.host.requireRestart(ui(`${label} 已修改`, `${label} was changed`))
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
      default: throw new Error(ui('用法：/plugin [list|search|info|install|remove|update|reorder|source|doctor]', "Usage: /plugin [list|search|info|install|remove|update|reorder|source|doctor]"))
    }
  }

  private async pluginCenter(): Promise<void> {
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui(`插件中心 · ${snapshot.profile}`, `Plugin center · ${snapshot.profile}`),
        detail: ui('查看已安装插件、启用状态和加载顺序', "View installed plugins, enabled state, and load order"),
        choices: [
          ...snapshot.plugins.map(plugin => ({
            id: `plugin:${plugin.name}`,
            label: `${plugin.active ? '● ' : ''}${pluginIdentity(plugin)}`,
            description: pluginDescription(plugin),
          })),
          { id: '__search__', label: ui('搜索插件…', "Search plugins…"), description: ui('从已启用的插件目录中搜索', "Search enabled plugin catalogs") },
          { id: '__install__', label: ui('安装插件…', "Install plugin…"), description: ui('支持 npm、Git、压缩包和本地目录；安装前确认', "Supports npm, Git, archives, and local directories; confirmation is required") },
          { id: '__update__', label: ui('更新插件…', "Update plugin…"), description: ui('更新当前 Profile 的插件', "Update plugins in the current Profile") },
          { id: '__reorder__', label: ui('调整插件顺序…', "Reorder plugins…"), description: ui(`${snapshot.bundles.length} 个活动插件`, `${snapshot.bundles.length} active plugin(s)`) },
          { id: '__sources__', label: ui('插件目录…', "Plugin catalogs…"), description: ui('查看或添加插件目录', "View or add plugin catalogs") },
          { id: '__doctor__', label: ui('运行诊断', "Run diagnostics"), description: ui('检查插件加载和运行环境', "Check plugin loading and the runtime environment") },
        ],
        options,
      }, async (selected) => {
        if (selected.id.startsWith('plugin:')) {
          const plugin = snapshot.plugins.find(candidate => candidate.name === selected.id.slice('plugin:'.length))
          if (plugin !== undefined) await this.installedPlugin(plugin, navigation)
          return
        }
        if (selected.id === '__search__') await this.pluginSearch('', navigation)
        if (selected.id === '__install__') await this.pluginInstall('', navigation)
        if (selected.id === '__update__') await this.pluginUpdate('', navigation)
        if (selected.id === '__reorder__') await this.pluginReorder(navigation)
        if (selected.id === '__sources__') await this.pluginSources('', navigation)
        if (selected.id === '__doctor__') await this.doctor(navigation)
      })
    }, options)
  }

  private async pluginList(overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    if (snapshot.plugins.length === 0) {
      this.host.notice(ui(`Profile ${snapshot.profile} 没有已安装插件依赖`, `Profile ${snapshot.profile} has no installed plugin dependencies`), 'info')
      return
    }
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui(`已安装插件 · ${snapshot.profile}`, `Installed plugins · ${snapshot.profile}`),
        choices: snapshot.plugins.map(plugin => ({
          id: plugin.name,
          label: `${plugin.active ? '● ' : ''}${pluginIdentity(plugin)}`,
          description: pluginDescription(plugin),
        })),
        options,
      }, async (selected) => {
        const plugin = snapshot.plugins.find(candidate => candidate.name === selected.id)
        if (plugin !== undefined) await this.installedPlugin(plugin, navigation)
      })
    }, options)
  }

  private async installedPlugin(
    plugin: TuiPluginEntry,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
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
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: pluginIdentity(plugin),
        detail,
        choices: [
          { id: 'update', label: ui('更新…', "Update…"), description: `pnpm update ${plugin.name}` },
          { id: 'remove', label: ui('移除…', "Remove…"), description: `pnpm remove ${plugin.name}` },
        ],
        searchable: false,
      }, async (selected) => {
        if (selected.id === 'update') await this.pluginUpdate(plugin.name, navigation)
        if (selected.id === 'remove') await this.pluginRemove(plugin.name, navigation)
      })
    })
  }

  private async pluginSearch(query: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    await this.overlayFlow(overlays, async (navigation) => {
      let text = query.trim()
      if (text === '') {
        const entered = await navigation.input({ title: ui('搜索插件', "Search plugins"), placeholder: ui('名称、描述或 Catalog 关键词', "Name, description, or catalog keyword") })
        if (entered === undefined || entered.trim() === '') return
        text = entered.trim()
      }
      const candidates = await navigation.progress({
        title: ui(`插件搜索 · ${text}`, `Plugin search · ${text}`),
        work: (_report, signal) => this.capabilities.managementBridge().plugins.search(text, signal),
      })
      if (candidates === undefined) return
      if (candidates.length === 0) {
        this.host.notice(ui(`未找到与 ${JSON.stringify(text)} 匹配的插件`, `No plugins match ${JSON.stringify(text)}`), 'info')
        return
      }
      const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
      await navigation.selectPage({
        title: ui(`插件搜索 · ${text}`, `Plugin search · ${text}`),
        detail: ui('“验证通过”只表示包结构兼容，不表示官方、审核过、安全或可信', "“Validated” means only that the package structure is compatible; it does not mean official, reviewed, safe, or trusted"),
        choices: candidates.map(candidate => ({
          id: candidate.id,
          label: `${candidate.name}${candidate.version === undefined ? '' : `@${candidate.version}`}`,
          description: `${candidate.description ?? candidate.spec} · ${candidateDescription(candidate)}${candidate.diagnostics.length === 0 ? '' : ` · ${candidate.diagnostics.join('；')}`}`,
        })),
        options,
      }, async (selected) => {
        const candidate = candidates.find(item => item.id === selected.id)
        if (candidate !== undefined) await this.marketplaceCandidate(candidate, navigation)
      })
    })
  }

  private async pluginInfo(spec: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    if (spec === '') throw new Error(ui('用法：/plugin info <包名或 spec>', "Usage: /plugin info <package or spec>"))
    const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
    const installed = snapshot.plugins.find(plugin => plugin.name === spec)
    if (installed !== undefined) {
      await this.installedPlugin(installed, overlays)
      return
    }
    await this.overlayFlow(overlays, async (navigation) => {
      const candidate = await navigation.progress({
        title: ui(`检查 ${spec}`, `Inspect ${spec}`),
        work: (_report, signal) => this.capabilities.managementBridge().plugins.inspect(spec, signal),
      })
      if (candidate === undefined) return
      await this.marketplaceCandidate(candidate, navigation)
    })
  }

  private async marketplaceCandidate(
    candidate: TuiMarketplaceCandidate,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const selected = await overlays.select({
      title: `${candidate.name}${candidate.version === undefined ? '' : `@${candidate.version}`}`,
      detail: this.candidateDetail(candidate),
      choices: [{
        id: 'install',
        label: ui('安装到当前 Profile…', "Install in current Profile…"),
        description: `pnpm add --save-exact ${candidate.spec}`,
        ...candidate.source !== 'git' && (!candidate.bundle || !candidate.patchValid)
          ? { disabledReason: ui('候选未通过 Bundle patch 安装前验证', "Candidate failed Bundle-patch preflight validation") }
          : {},
      }],
      searchable: false,
      options: { width: '90%', maxHeight: '85%', anchor: 'center', margin: 1 },
    })
    if (selected?.id === 'install') await this.installCandidate(candidate, overlays)
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

  private async pluginInstall(spec: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    await this.overlayFlow(overlays, async (navigation) => {
      let value = spec.trim()
      if (value === '') {
        const entered = await navigation.input({
          title: ui('按 spec 安装插件', "Install plugin by spec"),
          detail: ui('支持 npm、Git、tarball 和本地路径；不接受带内嵌凭证的 URL', "Supports npm, Git, tarballs, and local paths; URLs with embedded credentials are rejected"),
          placeholder: ui('例如 @scope/plugin@1.2.3', "For example, @scope/plugin@1.2.3"),
        })
        if (entered === undefined || entered.trim() === '') return
        value = entered.trim()
      }
      const candidate = await navigation.progress({
        title: ui(`检查 ${value}`, `Inspect ${value}`),
        work: (_report, signal) => this.capabilities.managementBridge().plugins.inspect(value, signal),
      })
      if (candidate === undefined) return
      if (candidate.source !== 'git' && (!candidate.bundle || !candidate.patchValid)) {
        throw new Error(ui(`已拒绝安装：${candidate.diagnostics.join('；') || '未通过 dsh.bundle.patch 验证'}`, `Installation rejected: ${candidate.diagnostics.join('；') || 'Failed dsh.bundle.patch validation'}`))
      }
      await this.installCandidate(candidate, navigation)
    })
  }

  private async installCandidate(
    candidate: TuiMarketplaceCandidate,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const profile = this.capabilities.currentProfile()
    const confirmed = await overlays.confirm(
      ui(`安装 ${candidate.name} 到 ${profile}？`, `Install ${candidate.name} in ${profile}?`),
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
      ui('理解风险并安装', "Install with acknowledged risk"),
    )
    if (!confirmed) return
    const result = await overlays.progress({
      title: ui(`安装 ${candidate.name}`, `Install ${candidate.name}`),
      work: (report, signal) => this.capabilities.managementBridge().plugins.run(
        ['add', '--save-exact', candidate.spec],
        { signal, onOutput: (_stream, chunk) => { report(chunk) } },
      ),
    })
    if (result === undefined) return
    await this.pluginOperation(ui(`安装 ${candidate.name}`, `Install ${candidate.name}`), result, overlays)
  }

  private async pluginRemove(name: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    await this.overlayFlow(overlays, async (navigation) => {
      let target = name.trim()
      const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
      if (target === '') {
        const selected = await navigation.select({
          title: ui('移除插件', "Remove plugin"),
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
      if (plugin === undefined) throw new Error(ui(`当前 Profile 未安装 ${JSON.stringify(target)}`, `${JSON.stringify(target)} is not installed in the current Profile`))
      const confirmed = await navigation.confirm(
        ui(`从 ${snapshot.profile} 移除 ${target}？`, `Remove ${target} from ${snapshot.profile}?`),
        ui(`将执行：pnpm remove ${target}。Bundle 列表会由原生 Manager 对账。`, `This will run: pnpm remove ${target}. The Bundle list is reconciled by the native Manager.`),
        ui('移除', "Remove"),
      )
      if (!confirmed) return
      const result = await navigation.progress({
        title: ui(`移除 ${target}`, `Remove ${target}`),
        work: (report, signal) => this.capabilities.managementBridge().plugins.run(
          ['remove', target],
          { signal, onOutput: (_stream, chunk) => { report(chunk) } },
        ),
      })
      if (result === undefined) return
      await this.pluginOperation(ui(`移除 ${target}`, `Remove ${target}`), result, navigation)
    })
  }

  private async pluginUpdate(name: string, overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    await this.overlayFlow(overlays, async (navigation) => {
      let target = name.trim()
      const snapshot = await this.capabilities.managementBridge().plugins.snapshot()
      if (target === '') {
        const selected = await navigation.select({
          title: ui('更新插件', "Update plugin"),
          choices: [
            { id: '__all__', label: ui('更新全部 Profile 依赖', "Update all Profile dependencies"), description: 'pnpm update' },
            ...snapshot.plugins.map(plugin => ({ id: plugin.name, label: pluginIdentity(plugin), description: plugin.spec })),
          ],
        })
        if (selected === undefined) return
        target = selected.id === '__all__' ? '' : selected.id
      } else if (!snapshot.plugins.some(plugin => plugin.name === target)) {
        throw new Error(ui(`当前 Profile 未安装 ${JSON.stringify(target)}`, `${JSON.stringify(target)} is not installed in the current Profile`))
      }
      const args = target === '' ? ['update'] : ['update', target]
      const confirmed = await navigation.confirm(
        target === '' ? ui(`更新 ${snapshot.profile} 全部依赖？`, `Update all dependencies in ${snapshot.profile}?`) : ui(`更新 ${target}？`, `Update ${target}?`),
        ui(`将执行：pnpm ${args.join(' ')}。解析结果由 Profile lockfile 持久化。`, `This will run: pnpm ${args.join(' ')}. The resolution is persisted in the Profile lockfile.`),
        ui('更新', "Update"),
      )
      if (!confirmed) return
      const result = await navigation.progress({
        title: target === '' ? ui('更新全部插件', "Update all plugins") : ui(`更新 ${target}`, `Update ${target}`),
        work: (report, signal) => this.capabilities.managementBridge().plugins.run(
          args,
          { signal, onOutput: (_stream, chunk) => { report(chunk) } },
        ),
      })
      if (result === undefined) return
      await this.pluginOperation(target === '' ? ui('更新全部插件', "Update all plugins") : ui(`更新 ${target}`, `Update ${target}`), result, navigation)
    })
  }

  private async pluginOperation(
    label: string,
    result: TuiPluginOperation,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    if (result.exitCode !== 0) {
      const detail = pluginFailureDetail(result)
      throw new Error(ui(`${label} 失败（exit ${result.exitCode}）：${detail.slice(-1200)}`, `${label} failed (exit ${result.exitCode}): ${detail.slice(-1200)}`))
    }
    const warnings = result.warnings.length === 0 ? '' : `；${result.warnings.join('；')}`
    this.host.notice(ui(`${label} 完成${result.changed ? '' : '（没有变化）'}${warnings}`, `${label} completed${result.changed ? '' : '(no changes)'}${warnings}`), warnings === '' ? 'success' : 'warning')
    if (!result.restartRequired) return
    await this.restartAfterPluginChange(label, overlays)
  }

  private async restartAfterPluginChange(
    label: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const restart = await overlays.confirm(
      ui(`${label} 后需要重启`, `Restart required after ${label}`),
      ui('重启后会恢复当前工作区、会话、草稿和附件。', "After restart, the current workspace, session, draft, and attachments are restored."),
      ui('立即重启', "Restart now"),
    )
    if (restart) this.host.restart(this.capabilities.currentProfile(), ui(`${label} 已应用`, `${label} applied`))
    else this.host.requireRestart(ui(`${label} 已完成`, `${label} completed`))
  }

  private async pluginReorder(overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const bridge = this.capabilities.managementBridge().plugins
    const snapshot = await bridge.snapshot()
    if (snapshot.bundles.length < 2) {
      this.host.notice(ui('当前插件少于 2 个，无需调整顺序', "Fewer than two plugins are installed; no reordering is needed"), 'info')
      return
    }
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('Bundle 顺序', "Bundle order"),
        detail: ui('顺序直接对应 dsh.profile.bundles；不会增删 Bundle', "Order maps directly to dsh.profile.bundles; no Bundle is added or removed"),
        choices: snapshot.bundles.map((bundle, index) => ({ id: bundle, label: `${index + 1}. ${bundle}` })),
      }, async (selected) => {
        const index = snapshot.bundles.indexOf(selected.id)
        const direction = await navigation.select({
          title: ui(`移动 ${selected.id}`, `Move ${selected.id}`),
          choices: [
            { id: 'top', label: ui('移到最前', "Move to first"), ...(index === 0 ? { disabledReason: ui('已在最前', "Already first") } : {}) },
            { id: 'up', label: ui('上移一位', "Move up"), ...(index === 0 ? { disabledReason: ui('已在最前', "Already first") } : {}) },
            { id: 'down', label: ui('下移一位', "Move down"), ...(index === snapshot.bundles.length - 1 ? { disabledReason: ui('已在最后', "Already last") } : {}) },
            { id: 'bottom', label: ui('移到最后', "Move to last"), ...(index === snapshot.bundles.length - 1 ? { disabledReason: ui('已在最后', "Already last") } : {}) },
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
        this.host.notice(ui('插件顺序已保存', "Plugin order saved"), 'success')
        await this.restartAfterPluginChange(ui('调整 Bundle 顺序', "Reorder Bundles"), navigation)
      })
    })
  }

  private async pluginSources(
    args: string,
    overlays: OverlayPrompts = this.host.overlays,
  ): Promise<void> {
    const bridge = this.capabilities.managementBridge().plugins
    const parsed = commandParts(args)
    if (parsed.command === 'add') {
      const input = commandParts(parsed.rest)
      if (input.command === '' || input.rest === '') throw new Error(ui('用法：/plugin source add <id> <URL或文件>', "Usage: /plugin source add <id> <URL or file>"))
      const snapshot = await bridge.sources()
      await bridge.saveSources([...snapshot.sources, {
        id: input.command,
        kind: 'catalog',
        label: input.command,
        url: input.rest,
        enabled: true,
        builtIn: false,
      }], snapshot.revision)
      this.host.notice(ui(`已添加插件目录 ${input.command}`, `Added plugin catalog ${input.command}`), 'success')
      return
    }
    if (['remove', 'enable', 'disable'].includes(parsed.command)) {
      if (parsed.rest === '') throw new Error(ui(`/plugin source ${parsed.command} 需要 Source id`, `/plugin source ${parsed.command} requires a Source id`))
      const snapshot = await bridge.sources()
      const target = findMarketplaceSource(snapshot.sources, parsed.rest)
      if (target === undefined || target.builtIn) throw new Error(ui(`插件目录 ${JSON.stringify(parsed.rest)} 不存在或不可修改`, `Plugin catalog ${JSON.stringify(parsed.rest)} does not exist or is read-only`))
      const key = marketplaceSourceKey(target)
      const sources = parsed.command === 'remove'
        ? snapshot.sources.filter(source => marketplaceSourceKey(source) !== key)
        : snapshot.sources.map(source => marketplaceSourceKey(source) === key
          ? { ...source, enabled: parsed.command === 'enable' }
          : source)
      await bridge.saveSources(sources, snapshot.revision)
      this.host.notice(ui(`插件目录 ${target.id} 已${parsed.command === 'remove' ? '移除' : parsed.command === 'enable' ? '启用' : '停用'}`, `Plugin catalog ${target.id} ${parsed.command === 'remove' ? 'removed' : parsed.command === 'enable' ? 'enabled' : 'disabled'}`), 'success')
      return
    }
    if (parsed.command !== '' && parsed.command !== 'list') {
      throw new Error(ui('用法：/plugin source [list|add <id> <URL>|remove|enable|disable]', "Usage: /plugin source [list|add <id> <URL>|remove|enable|disable]"))
    }
    const snapshot = await bridge.sources()
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('插件市场来源', "Plugin marketplace sources"),
        detail: ui('npm 与插件提供的目录为只读；你添加的插件目录可在这里管理', "npm and provider-owned catalogs are read-only; catalogs you add can be managed here"),
        choices: [
          ...snapshot.sources.map(source => ({
            id: `source:${marketplaceSourceKey(source)}`,
            label: `${source.enabled ? '● ' : '○ '}${source.label}`,
            description: `${source.kind} · ${source.url}${source.credentialRef === undefined ? '' : ` · Credential ${source.credentialRef}`}${source.builtIn ? ui(' · 内置', " · built-in") : ''}${source.diagnostic === undefined ? '' : ` · ${source.diagnostic}`}`,
          })),
          { id: '__add__', label: ui('添加插件目录…', "Add plugin catalog…") },
        ],
        options,
      }, async (selected) => {
        if (selected.id === '__add__') {
          await this.addPluginSource(navigation, snapshot.sources, snapshot.revision)
          return
        }
        const source = findMarketplaceSource(snapshot.sources, selected.id.slice('source:'.length))
        if (source === undefined) return
        await this.editPluginSource(navigation, source, snapshot.sources, snapshot.revision)
      })
    }, options)
  }

  private async addPluginSource(
    overlays: OverlayPrompts,
    sources: readonly TuiMarketplaceSource[],
    revision: number,
  ): Promise<void> {
    const id = await overlays.input({ title: ui('插件目录 ID', "Plugin catalog ID"), placeholder: ui('小写 kebab-case', "Lowercase kebab-case") })
    if (id === undefined || id.trim() === '') return
    const label = await overlays.input({ title: ui('插件目录名称', "Plugin catalog name"), initialValue: id.trim() })
    if (label === undefined || label.trim() === '') return
    const url = await overlays.input({ title: ui('目录 URL 或文件', "Catalog URL or file"), placeholder: 'https://example/catalog.json' })
    if (url === undefined || url.trim() === '') return
    const credentialRef = await overlays.input({
      title: ui('Credential Ref（可选）', "Credential Ref (optional)"),
      detail: ui('只输入引用名，不要在 URL 或此处粘贴 Secret', "Enter only the reference name; never paste a secret here or in the URL"),
      placeholder: ui('留空表示无认证', "Leave blank for no authentication"),
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
    this.host.notice(ui(`已添加插件目录 ${source.id}`, `Added plugin catalog ${source.id}`), 'success')
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
          : [{ id: 'credential', label: ui('配置 Credential…', "Configure credential…"), description: source.credentialRef }]),
        {
          id: 'close',
          label: ui('内置插件目录不可修改', "Built-in catalogs cannot be modified"),
          disabledReason: ui('由插件提供方管理', "Managed by the provider plugin"),
        },
      ]
      : [
        { id: 'toggle', label: source.enabled ? ui('停用', "Disable") : ui('启用', "Enable") },
        { id: 'credential', label: ui('配置 Credential…', "Configure credential…"), description: source.credentialRef ?? ui('尚未设置 Credential Ref', "No Credential Ref is configured") },
        { id: 'remove', label: ui('移除插件目录…', "Remove plugin catalog…") },
      ]
    const selected = await overlays.select({
      title: source.label,
      detail: `${source.url}
${source.credentialRef === undefined ? ui('无 Credential Ref', "No Credential Ref") : `Credential Ref：${source.credentialRef}`}`,
      choices,
      searchable: false,
    })
    if (selected === undefined) return
    if (selected.id === 'credential') {
      let ref = source.credentialRef
      if (ref === undefined || ref === '') {
        const entered = await overlays.input({ title: 'Credential Ref', placeholder: ui('输入引用名，不是 Secret', "Enter a reference name, not a secret") })
        if (entered === undefined || entered.trim() === '') return
        ref = entered.trim()
        const credentialRef = ref
        const updated = sources.map(item => marketplaceSourceKey(item) === marketplaceSourceKey(source) ? { ...item, credentialRef } : item)
        await this.capabilities.managementBridge().plugins.saveSources(updated, revision)
      }
      await this.configureSourceCredential(overlays, ref)
      return
    }
    if (source.builtIn) return
    if (selected.id === 'remove') {
      const confirmed = await overlays.confirm(ui(`移除 ${source.label}？`, `Remove ${source.label}?`), ui('该目录将不再参与搜索；已安装插件不受影响。', "This catalog will no longer be searched; installed plugins are unaffected."), ui('移除', "Remove"))
      if (!confirmed) return
    }
    const key = marketplaceSourceKey(source)
    const next = selected.id === 'remove'
      ? sources.filter(item => marketplaceSourceKey(item) !== key)
      : sources.map(item => marketplaceSourceKey(item) === key ? { ...item, enabled: !source.enabled } : item)
    await this.capabilities.managementBridge().plugins.saveSources(next, revision)
    this.host.notice(ui(`插件目录 ${source.id} 已${selected.id === 'remove' ? '移除' : source.enabled ? '停用' : '启用'}`, `Plugin catalog ${source.id} ${selected.id === 'remove' ? 'removed' : source.enabled ? 'disabled' : 'enabled'}`), 'success')
  }

  private async configureSourceCredential(overlays: OverlayPrompts, ref: string): Promise<void> {
    const bridge = this.capabilities.managementBridge().settings
    const info = await bridge.credentialInfo(ref)
    if (!info.writable) {
      const source = info.source === undefined ? '' : ` (${info.source})`
      this.host.notice(ui(
        `Credential ${ref} 由外部来源${source}管理；请修改其拥有的配置层。`,
        `Credential ${ref} is managed by an external source${source}; update its owning configuration layer.`,
      ), 'info')
      return
    }
    const failure = credentialWriteFailure(ref)
    const saved = await overlays.secretTransaction<boolean>({
      input: {
        title: ui(`配置 Credential ${ref}`, `Configure credential ${ref}`),
        detail: ui('值不会回显；保存后将替换原值', "The value is never displayed; saving replaces it"),
        placeholder: ui('输入 Secret；Esc 跳过', "Enter secret; Esc skips"),
      },
      busyTitle: ui(`正在保存 Credential ${ref}`, `Saving credential ${ref}`),
      busyDetail: ui('正在通过 Harness Credential API 写入并检查状态。', 'Writing through the Harness Credential API and checking status.'),
      failureMessage: failure,
      validate: raw => validateSecretValue(raw, ref === DEEPSEEK_CREDENTIAL_REF),
      work: async (secret) => {
        try {
          const result = await bridge.setCredential(ref, secret)
          return result.configured
            ? { ok: true, value: true }
            : { ok: false, message: failure }
        } catch {
          return { ok: false, message: failure }
        }
      },
    })
    if (saved !== true) return
    this.host.notice(ui(`Credential ${ref} 已配置`, `Credential ${ref} configured`), 'success')
  }

  /**
   * Run Clarify from a composer transaction snapped at the surface dispatch boundary.
   * Abort, error, and decline restore the exact original text and never send.
   */
  async clarifyComposer(transaction: ClarifyComposerTransaction): Promise<void> {
    const restore = (): void => {
      if (transaction.restoreText !== '') this.host.setEditor(transaction.restoreText)
    }
    try {
      if (await this.capabilities.clarifyRemotePresent().catch(() => false) !== true) {
        restore()
        this.host.notice(ui('Clarify Remote 当前不可用', 'Clarify Remote is not currently available'), 'error')
        return
      }
      const rpc = this.capabilities.connectionRpc()
      if (rpc === undefined) {
        restore()
        this.host.notice(ui('Clarify Remote 当前不可用', 'Clarify Remote is not currently available'), 'error')
        return
      }
      const active = this.capabilities.active()
      if (active === undefined) {
        restore()
        this.host.notice(ui('当前没有打开的会话', 'No session is open'), 'error')
        return
      }
      await this.overlayFlow(this.host.overlays, async (navigation) => {
        const outcome = await runClarifyShell({
          sessionId: String(active.sessionId),
          seedText: transaction.seedText,
          composerText: transaction.replaceableText,
          overlays: navigation,
          writeComposer: (draft) => { this.host.setEditor(draft) },
          call: (channel, endpoint, payload, signal) => rpc.call(channel, endpoint, payload, signal),
        })
        if (outcome.kind === 'applied') {
          this.host.notice(ui('已将 Clarify 草稿填入输入区', 'Clarify draft inserted into the composer'), 'success')
          return
        }
        restore()
      })
    } catch (error) {
      restore()
      this.host.notice(capabilityError(error), 'error')
    }
  }

  private clarifyTransaction(rawArgs: string): ClarifyComposerTransaction {
    if (rawArgs === '') return paletteClarifyTransaction(this.host.composerText?.() ?? '')
    return classifyClarifyComposer(`/clarify ${rawArgs}`) ?? {
      source: 'leading',
      restoreText: `/clarify ${rawArgs}`,
      seedText: rawArgs,
      replaceableText: '',
    }
  }

  private async doctor(overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const [report, status, inventory] = await Promise.all([
      this.capabilities.managementBridge().plugins.doctor(),
      this.capabilities.headerFacts(true),
      this.capabilities.pluginInventory(),
    ])
    const errors = report.diagnostics.filter(item => item.level === 'error').length
    const warnings = report.diagnostics.filter(item => item.level === 'warning').length
    const failedInstances = inventory.filter(item => item.fiberPhase === 'failed')
    const enabledInstances = inventory.filter(item => item.enabled).length
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui(`诊断 · ${report.profile}`, `Diagnostics · ${report.profile}`),
        detail: ui(
          `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}\npnpm：${report.pnpm ?? '不可用'} · ${errors} 个错误 · ${warnings} 个警告 · ${enabledInstances} 个插件运行中`,
          `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}\npnpm: ${report.pnpm ?? 'unavailable'} · ${errors} error(s) · ${warnings} warning(s) · ${enabledInstances} plugin(s) running`,
        ),
        choices: [
          {
            id: 'runtime',
            label: `Runtime · ${status.running ? ui('运行中', "Running") : ui('空闲', "Idle")}`,
            description: `${status.workspace} · ${status.model} · ${status.permission}`,
          },
          ...report.diagnostics.map((item, index) => ({
            id: `plugin:${index}`,
            label: `${item.level === 'error' ? '✕' : item.level === 'warning' ? '!' : '✓'} ${translateUiText(item.message)}`,
            description: item.level,
          })),
          ...failedInstances.map(item => ({
            id: `loader:${item.entryId}`,
            label: ui(`插件实例 · ${item.moduleName}`, `Plugin instances · ${item.moduleName}`),
            description: `${item.enabled ? ui('已启用', "Enabled") : ui('已禁用', "Disabled")} · ${item.fiberPhase ?? ui('未挂载', "Not mounted")}`,
          })),
        ],
        searchable: false,
        options,
      }, async (selected) => {
        if (selected.id === 'runtime') {
          await navigation.detail({
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
            options,
          })
          return
        }
        if (selected.id.startsWith('plugin:')) {
          const index = Number(selected.id.slice('plugin:'.length))
          const diagnostic = Number.isInteger(index) ? report.diagnostics[index] : undefined
          if (diagnostic === undefined) return
          const level = diagnostic.level === 'error' ? ui('错误', "Error") : diagnostic.level === 'warning' ? ui('警告', "Warning") : ui('信息', "Information")
          await navigation.detail({
            title: ui(`诊断详情 · ${level}`, `Diagnostic details · ${level}`),
            content: translateUiText(diagnostic.message),
            options,
          })
          return
        }
        const loader = inventory.find(item => `loader:${item.entryId}` === selected.id)
        if (loader === undefined) return
        await navigation.detail({
          title: ui(`插件实例详情 · ${loader.moduleName}`, `Plugin instance details · ${loader.moduleName}`),
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
          options,
        })
      })
    }, options)
  }

  private async restart(): Promise<void> {
    const profile = this.capabilities.currentProfile()
    const confirmed = await this.host.overlays.confirm(
      ui('重新启动 deepseek？', "Restart deepseek?"),
      ui('会恢复当前工作区、会话、未发送草稿和附件；正在运行的任务会停止。', "The workspace, session, unsent draft, and attachments are restored; any running task will stop."),
      ui('重启', "Restart"),
    )
    if (confirmed) this.host.restart(profile, ui(`Profile ${profile} 已重启`, `Profile ${profile} restarted`))
  }

  private async tools(args: string): Promise<void> {
    if (args === 'display') {
      const mode = this.host.transcript.cycleToolVisibility()
      this.host.notice(ui(`工具卡片：${mode === 'collapsed' ? '折叠' : mode === 'expanded' ? '展开' : '隐藏'}`, `Tool cards: ${mode === 'collapsed' ? 'Collapsed' : mode === 'expanded' ? 'Expanded' : 'Hidden'}`), 'info')
      this.host.refresh()
      return
    }
    if (args !== '') throw new Error(ui('用法：/tools [display]', "Usage: /tools [display]"))
    const tools = this.capabilities.toolCatalog()
    const todos = this.capabilities.projection('todos')
    const choices: OverlayChoice[] = [
      { id: '__display__', label: ui('调整工具卡片显示', "Change tool-card display"), description: ui('折叠 → 展开 → 隐藏', "Collapsed → expanded → hidden") },
      ...(Array.isArray(todos)
        ? [{ id: '__todos__', label: ui(`任务清单 · ${todos.length} 项`, `Task list · ${todos.length} item(s)`), description: ui('查看当前任务清单', "View the current task list") }]
        : []),
      ...tools.map((tool) => {
        const boundary = toolBoundary(tool)
        return { id: `tool:${tool.name}`, label: tool.name, description: `${tool.description} · ${boundary.label}` }
      }),
    ]
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('工具', "Tools"),
        detail: tools.length === 0 ? ui('当前会话尚无工具记录', "The current session has no tool records") : ui(`${tools.length} 个可用工具`, `${tools.length} available tool(s)`),
        choices,
        options,
      }, async (selected) => {
        if (selected.id === '__display__') {
          await this.tools('display')
          return
        }
        const tool = tools.find(candidate => `tool:${candidate.name}` === selected.id)
        const value = selected.id === '__todos__' ? todos : tool?.parameters
        const boundary = tool === undefined ? undefined : toolBoundary(tool)
        await navigation.detail({
          title: selected.label,
          content: `${boundary === undefined ? '' : `${boundary.detail}\n\n`}${ui('参数 / 数据', 'Parameters / data')}:\n${detailText(value)}`,
          options,
        })
      })
    }, options)
  }

  private async files(): Promise<void> {
    const groups = await this.capabilities.producedFileGroups()
    if (groups.length === 0) {
      this.host.notice(ui('本会话没有生成文件', 'This session has not produced any files'), 'info')
      return
    }
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('产出文件', 'Produced files'),
        detail: ui('查看、复制或打开本会话生成的文件', 'View, copy, or open files produced in this session'),
        choices: groups.flatMap(group => group.paths.map(path => ({
          id: path,
          label: path,
          description: ui(`第 ${String(group.turn)} 轮`, `Turn ${String(group.turn)}`),
        }))),
        options,
      }, async (selected) => {
        const action = await navigation.select({
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
          await navigation.detail({
            title: selected.label,
            content,
            options,
          })
        } else if (action?.id === 'copy') {
          this.host.copy(this.capabilities.producedFilePath(selected.id))
          this.host.notice(ui('已复制产出文件路径', "Produced-file path copied"), 'success')
        } else if (action?.id === 'open') {
          const confirmed = await navigation.confirm(
            ui(`使用外部程序打开 ${selected.label}？`, `Open ${selected.label} with an external program?`),
            ui('所选绝对路径将交给编辑器或系统程序；该程序不受 Agent 权限限制。', "The selected absolute path is passed to an editor or system application, which is outside Agent permission controls."),
            ui('打开', "Open"),
          )
          if (confirmed) {
            await this.capabilities.openProducedFile(selected.id)
            this.host.notice(ui(`已打开 ${selected.id}`, `Opened ${selected.id}`), 'success')
          }
        }
      })
    }, options)
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
        nav.updateChoices(this.jobListRequest(currentId).choices)
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
      title: ui('后台任务', "Background jobs"),
      detail: ui('查看或停止当前会话的后台任务 · 打开期间自动刷新', "View or stop background jobs for the current session · refreshes while open"),
      choices: jobs.length === 0
        ? [{ id: '__empty__', label: ui('当前会话没有后台任务', "The current session has no background jobs"), disabledReason: ui('等待任务出现，或 Esc 关闭', "Waiting for a job, or Esc to close") }]
        : jobs.map(job => ({
          id: job.id,
          label: `${jobStatusLabel(job.status)} · ${job.kind} · ${job.label}`,
          description: `${jobDetailLabel(job.detail) ?? ui('无详情', "No details")} · ${elapsedLabel(jobElapsedMs(job, now))}`,
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
      title: ui(`后台任务 · ${job.label}`, `Background job · ${job.label}`),
      searchable: false,
      choices: [
        { id: 'detail', label: ui('查看详情', "View details"), description: ui('状态、耗时和任务详情', "Status, duration, and job details") },
        {
          id: 'stop',
          label: ui('停止任务', "Stop job"),
          description: ui('向 Host 发送取消请求', "Send a cancel request to the Host"),
          ...(isStoppableJob(job.status) ? {} : { disabledReason: ui('任务已结束', "Job already finished") }),
        },
      ],
    })
    if (action?.id === 'detail') {
      const finishedAt = job.finishedAt
      const duration = jobElapsedMs(job, Date.now())
      await nav.detail({
        title: ui(`后台任务 · ${job.label}`, `Background job · ${job.label}`),
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
      ui('向 Host 发送取消请求；已经结束的任务不会再跑。', "Sends a cancel request to the Host; jobs that already finished will not run again."),
      ui('停止任务', "Stop job"),
    )
    if (!confirmed) return
    const result = await this.capabilities.managementBridge().jobs.kill(job.id)
    this.host.notice(jobKillNotice(result), result === 'requested' ? 'success' : 'info')
  }

  private async subagents(): Promise<void> {
    const parent = this.capabilities.active()
    if (parent === undefined) throw new Error(ui('当前没有打开的父会话', "No parent session is open"))
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
            ui(`已打开子 Agent ${row.entry.id}${row.address.mode === 'continuable' ? '；可直接输入继续，运行时 Ctrl+C 停止' : '；该会话只读'}`, `Opened subagent ${row.entry.id}${row.address.mode === 'continuable' ? '; enter a message to continue, Ctrl+C stops an active turn' : '; this session is read-only'}`),
            'success',
          )
          nav.finish()
        }
        const request = (): SelectOverlayRequest => ({
          title: ui('子 Agent', "Subagents"),
          detail: ui('查看或继续当前会话创建的子 Agent；打开期间自动刷新，运行时可用 Ctrl+C 停止', "View or continue subagents created by the current session; refreshes while open, Ctrl+C stops an active turn"),
          choices: rows.length === 0
            ? [{ id: '__empty__', label: ui('当前没有子 Agent', "No subagents yet"), disabledReason: ui('等待子 Agent 出现，或 Esc 关闭', "Waiting for a subagent, or Esc to close") }]
            : rows.map(row => row.entry.kind === 'diagnostic'
              ? {
                id: `diagnostic:${row.entry.id}`,
                label: `${row.entry.id} · ${row.entry.reason}`,
                disabledReason: ui('该子 Agent 当前不可用', "This subagent is currently unavailable"),
              }
              : {
                id: `child:${row.entry.id}`,
                label: `${row.entry.activity === 'running' ? ui('运行中', "Running") : ui('空闲', "Idle")} · ${row.entry.label ?? row.entry.id}`,
                description: [
                  row.entry.mode === 'continuable' ? ui('可继续', "Continuable") : ui('单次只读', "Read-only snapshot"),
                  row.entry.hasChildren ? ui('有子节点', "Has children") : ui('叶节点', "Leaf"),
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
            if (onList) nav.updateChoices(request().choices)
          }).catch((error: unknown) => {
            if (onList) nav.updateChoices(request().choices, capabilityError(error))
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
    if (trajectory === undefined) throw new Error(ui('当前 Profile 未提供 Trajectory 投影', "The current Profile does not provide a Trajectory projection"))
    const choices: OverlayChoice[] = trajectory.requests.map((request, index) => ({
      id: `request:${index}`,
      label: `${request.purpose} · ${request.status} · #${request.startSeq}`,
      description: `${request.requestConfig?.provider ?? ui('未知 Provider', "Unknown Provider")}/${request.requestConfig?.model ?? ui('未知模型', "Unknown model")} · ${request.completedAt === null ? ui('运行中', "Running") : `${Math.max(0, request.completedAt - request.startedAt)} ms`}`,
    }))
    choices.push(...trajectory.runningCalls.map(call => ({
      id: `call:${call.callId}`,
      label: ui(`运行中工具 · ${call.name}`, `Running tools · ${call.name}`),
      description: call.callId,
    })))
    if (choices.length === 0) {
      this.host.notice(ui('当前会话还没有请求或工具轨迹', "The current session has no model-request or tool trajectory yet"), 'info')
      return
    }
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('轨迹', "Trajectory"),
        detail: ui(`${trajectory.eventNodes.length} 个事件节点 · ${trajectory.requests.length} 个请求 · ${trajectory.runningCalls.length} 个运行中工具`, `${trajectory.eventNodes.length} event node(s) · ${trajectory.requests.length} request(s) · ${trajectory.runningCalls.length} running tool(s)`),
        choices,
        options,
      }, async (selected) => {
        const value = selected.id.startsWith('request:')
          ? trajectory.requests[Number(selected.id.slice('request:'.length))]
          : trajectory.runningCalls.find(call => `call:${call.callId}` === selected.id)
        await navigation.detail({
          title: selected.label,
          content: selected.id.startsWith('request:') ? trajectoryRequestDetail(value) : detailText(value),
          options,
        })
      })
    }, options)
  }

  private async feedback(args: string): Promise<void> {
    if (args !== '') {
      await this.capabilities.recordSessionFeedback(args)
      this.host.notice(ui('已记录会话反馈', "Session feedback recorded"), 'success')
      return
    }
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('反馈', "Feedback"),
        detail: ui('记录对当前会话或某条回复的评价', "Rate the current session or an individual response"),
        choices: [
          { id: 'session', label: ui('记录会话反馈', "Record session feedback"), description: ui('说明本次会话的使用感受', "Describe your experience with this session") },
          { id: 'message', label: ui('评价一条回复', "Rate a response"), description: ui('好评、差评、说明或删除现有评价', "Submit a positive or negative rating, add a note, or remove a rating") },
        ],
        searchable: false,
      }, async (kind) => {
        if (kind.id === 'session') {
          const text = await navigation.input({
            title: ui('会话反馈', "Session feedback"),
            placeholder: ui('输入对当前会话的反馈', "Enter feedback for the current session"),
          })
          if (text === undefined || text.trim() === '') return
          await this.capabilities.recordSessionFeedback(text)
          this.host.notice(ui('已记录会话反馈', "Session feedback recorded"), 'success')
          return
        }
        await this.messageFeedback(navigation)
      })
    })
  }

  private async messageFeedback(overlays: OverlayPrompts = this.host.overlays): Promise<void> {
    const targets = await this.capabilities.feedbackTargets()
    if (targets.length === 0) throw new Error(ui('当前会话中没有可评价的回复', "The current session has no response that can be rated"))
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('消息反馈', "Message feedback"),
        detail: ui('选择要评价的回复', "Choose a response to rate"),
        choices: targets.map(target => ({
          id: String(target.message.messageId),
          label: `${target.feedback?.rating === 'positive' ? ui('好评', "Positive") : target.feedback?.rating === 'negative' ? ui('差评', "Negative") : ui('未评价', "Not rated")} · ${target.preview}`,
          description: target.feedback?.note ?? new Date(target.message.time).toLocaleString(),
        })),
        options,
      }, async (selected) => {
        const target = targets.find(candidate => String(candidate.message.messageId) === selected.id)
        if (target?.message.messageId === undefined) return
        const action = await navigation.select({
          title: target.preview,
          choices: [
            { id: 'positive', label: ui('好评', "Positive"), description: 'positive' },
            { id: 'negative', label: ui('差评', "Negative"), description: 'negative' },
            ...(target.feedback === undefined ? [] : [{ id: 'remove', label: ui('删除现有反馈', "Delete existing feedback"), description: ui('回复内容不会删除', "The response itself is not deleted") }]),
          ],
          searchable: false,
        })
        if (action === undefined) return
        if (action.id === 'remove') {
          if (target.feedback === undefined) return
          await this.capabilities.clearFeedback(target.message.messageId, target.feedback.version)
          this.host.notice(ui('已删除该消息反馈', "Message feedback deleted"), 'success')
          return
        }
        const note = await navigation.input({
          title: action.id === 'positive' ? ui('好评说明（可选）', "Positive-rating note (optional)") : ui('差评说明（可选）', "Negative-rating note (optional)"),
          initialValue: target.feedback?.note ?? '',
          placeholder: ui('留空表示不附说明', "Leave blank to submit without a note"),
        })
        if (note === undefined) return
        await this.capabilities.putFeedback(
          target.message.messageId,
          action.id === 'positive' ? 'positive' : 'negative',
          note.trim() === '' ? undefined : note,
          target.feedback?.version ?? null,
        )
        this.host.notice(ui('已提交消息反馈', "Message feedback submitted"), 'success')
      })
    }, options)
  }

  private async skills(): Promise<void> {
    const skills = await this.capabilities.skills()
    if (skills.length === 0) {
      this.host.notice(ui('当前工作区没有用户可调用 Skill', "The current workspace has no user-invocable Skills"), 'info')
      return
    }
    const selected = await this.host.overlays.select({
      title: 'Skills',
      detail: ui('选择一个 Skill，并补充需要它完成的任务', "Choose a Skill and describe the task it should perform"),
      choices: skills.map(skill => ({
        id: skill.name,
        label: `/${skill.name}${skill.modelInvocable ? '' : ui(' · 仅用户调用', " · user-invoked only")}`,
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
      this.host.notice(ui('当前 Profile 没有可见 MCP 工具、实例或 Settings；可用 /plugin 安装扩展', "The current Profile has no visible MCP tools, instances, or Settings; use /plugin to install an extension"), 'info')
      return
    }
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: 'MCP',
        detail: ui('查看 MCP 工具、实例和设置。MCP 可能在独立进程或远端服务中运行，不受 Agent 沙箱保护。', "View MCP tools, instances, and Settings. MCP may run in a separate process or remote service outside the Agent sandbox."),
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
        options,
      }, async (selected) => {
        if (selected.id.startsWith('settings:')) {
          await this.settings(selected.id.slice('settings:'.length), navigation)
          return
        }
        const plugin = plugins.find(candidate => `plugin:${candidate.entryId}` === selected.id)
        if (plugin !== undefined) {
          const phase = plugin.fiberPhase ?? ui('未挂载', 'not mounted')
          const followUp = await navigation.select({
            title: ui(`MCP 实例 · ${plugin.moduleName}`, `MCP instance · ${plugin.moduleName}`),
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
              { id: 'close', label: ui('关闭', "Close") },
              { id: 'doctor', label: ui('运行 /doctor', "Run /doctor"), description: ui('检查 Profile、插件和运行环境', "Check the Profile, plugins, and runtime environment") },
              ...settings.map(document => ({
                id: `settings:${document.namespace}`,
                label: ui(`打开设置 · ${document.namespace}`, `Open Settings · ${document.namespace}`),
                description: document.applies === 'live' ? ui('立即生效', "Applies immediately") : ui('需要重启', "Restart required"),
              })),
            ],
            searchable: false,
            options,
          })
          if (followUp?.id === 'doctor') await this.doctor(navigation)
          else if (followUp !== undefined && followUp.id.startsWith('settings:')) {
            await this.settings(followUp.id.slice('settings:'.length), navigation)
          }
          return
        }
        const tool = tools.find(candidate => `tool:${candidate.name}` === selected.id)
        if (tool !== undefined) {
          await navigation.detail({
            title: tool.name,
            content: `${toolBoundary(tool).detail}\n\n${ui('参数', 'Parameters')}:\n${detailText(tool.parameters)}`,
          })
        }
      })
    }, options)
  }

  private async status(): Promise<void> {
    const openedSessionId = this.capabilities.active()?.sessionId
    const [status, fetchedAuxiliaryUsage] = await Promise.all([
      this.capabilities.headerFacts(true),
      this.capabilities.auxiliaryUsageStatistics?.(
        openedSessionId === undefined ? {} : { sessionId: openedSessionId },
      ).catch(() => undefined),
    ])
    const auxiliaryUsage = this.capabilities.active()?.sessionId === openedSessionId
      ? fetchedAuxiliaryUsage
      : undefined
    const statistics = this.capabilities.sessionStatistics({ includeTokenUsage: auxiliaryUsage === undefined })
    const projections = this.capabilities.projectionEntries()
    const options = { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const
    const auxiliaryUsageChoice = auxiliaryUsage === undefined
      ? []
      : [{
          id: '__seektty_auxiliary_usage__',
          label: ui('用量来源 · 官方 / 辅助 / 组合（派生）', 'Usage provenance · Official / Auxiliary / Combined (derived)'),
          description: auxiliaryUsage.lines[2],
        }]
    const projectionChoices = projections.map(([key, value]) => ({
      id: key,
      label: key,
      description: detailText(value).replace(/\s+/gu, ' ').slice(0, 240),
    }))
    const choices = [...auxiliaryUsageChoice, ...projectionChoices]
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui('状态与统计', "Status and statistics"),
        detail: [
          `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}`,
          `Profile ${status.profile} · ${status.running ? ui('运行中', 'running') : ui('空闲', 'idle')}`,
          status.workspace,
          `${status.session} · ${status.mode} · ${status.model} · ${status.permission}`,
          ...statistics.lines,
          ...(auxiliaryUsage?.lines ?? []),
        ].join('\n'),
        choices: choices.length === 0
          ? [{ id: 'none', label: ui('当前没有会话数据', "No session data"), description: ui('暂无可显示内容', "Nothing to display") }]
          : choices,
        options,
      }, async (selected) => {
        if (selected.id === 'none') return
        if (selected.id === '__seektty_auxiliary_usage__' && auxiliaryUsage !== undefined) {
          await navigation.detail({
            title: ui('用量来源', 'Usage provenance'),
            content: auxiliaryUsage.lines.join('\n'),
            options,
          })
          return
        }
        const projection = projections.find(([key]) => key === selected.id)
        if (projection === undefined) return
        await navigation.detail({
          title: ui(`会话数据 · ${projection[0]}`, `Session data · ${projection[0]}`),
          content: detailText(projection[1]),
          options,
        })
      })
    }, options)
  }

  private retryPending(): void {
    const snapshot = this.capabilities.active()?.session.getSnapshot()
    if (snapshot === undefined || snapshot.pending.length === 0) {
      this.host.notice(ui('当前没有待处理交互', "No pending interactions"), 'info')
      return
    }
    for (const wait of snapshot.pending) this.handledInteractions.delete(wait.key)
    this.syncPending(snapshot)
  }

  private async handleInteraction(wait: PendingInteraction): Promise<void> {
    const current = this.capabilities.active()?.session.getSnapshot().pending
      .some(candidate => candidate.key === wait.key) === true
    if (!current) return
    if (wait.kind === 'approval') {
      await this.approval(wait)
      return
    }
    await this.question(wait)
  }

  private async approval(wait: PendingWait<'approval'>): Promise<void> {
    const snapshot = this.capabilities.active()?.session.getSnapshot()
    const call = snapshot?.runningCalls?.find(candidate => candidate.callId === wait.payload.callId)
    const composed = composeApprovalDetail({
      ...(wait.payload.reason === undefined ? {} : { reason: wait.payload.reason }),
      fallback: ui(`调用 ${wait.payload.callId ?? wait.payload.approvalId}`, `Invoke ${wait.payload.callId ?? wait.payload.approvalId}`),
      preview: toolApprovalPreview(call),
    })
    const options = { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 } as const
    let decision: 'allowed-once' | 'rejected' | undefined
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      await navigation.selectPage({
        title: ui(`工具审批 · ${wait.payload.toolName}`, `Tool approval · ${wait.payload.toolName}`),
        detail: composed.detail,
        searchable: false,
        initialChoiceId: 'reject',
        choices: [
          { id: 'allow', label: ui('仅本次允许', 'Allow this time'), description: ui('只允许这一次工具调用', 'Allow only this tool call') },
          ...(composed.full === undefined ? [] : [{
            id: 'inspect',
            label: ui('查看完整参数', 'View full arguments'),
            description: ui('打开只读子页，不批准也不拒绝', 'Open a read-only page; does not approve or reject'),
          }]),
          { id: 'reject', label: ui('拒绝', 'Reject'), description: ui('本次工具调用不会执行', 'This tool call will not run') },
        ],
        footer: ui('Enter 确认 · Esc 安全拒绝', 'Enter to confirm · Esc rejects safely'),
        options,
      }, async (selected) => {
        if (selected.id === 'inspect' && composed.full !== undefined) {
          await navigation.detail({
            title: ui(`完整参数 · ${wait.payload.toolName}`, `Full arguments · ${wait.payload.toolName}`),
            content: composed.full,
            options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 } as const,
          })
          return
        }
        decision = selected.id === 'allow' ? 'allowed-once' : 'rejected'
        navigation.finish()
      })
    }, options)
    this.host.transcript.followLatest()
    await this.capabilities.answerApproval(wait, decision ?? 'rejected')
  }

  private async question(wait: PendingWait<'question'>): Promise<void> {
    const answers: QuestionResponsePayload['answer']['answers'] = []
    const questions = wait.payload.questions
    const options = { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 } as const
    await this.overlayFlow(this.host.overlays, async (navigation) => {
      let index = 0
      while (index < questions.length) {
        const question = questions[index]
        if (question === undefined) break
        if (navigation.signal.aborted) {
          this.host.transcript.followLatest()
          await this.capabilities.cancelQuestion(wait)
          return
        }
        const planReview = question.intent?.kind === 'plan-review' ? question.intent : undefined
        const title = `${planReview === undefined ? question.header ?? ui('问题', "Question") : ui('计划审查', "Plan review")} · ${index + 1}/${questions.length}`
        let escapeHandled: 'cancel' | 'skip' | 'continue' | undefined
        const escapeDecision = async (): Promise<'cancel' | 'skip' | 'continue'> => {
          const decision = await this.confirmQuestionEscape(navigation, index, questions.length, answers.length)
          escapeHandled = decision
          return decision
        }
        const onEscape = async (): Promise<void> => {
          const decision = await escapeDecision()
          if (decision === 'continue') return
          navigation.back()
        }
        const resolveEscape = async (): Promise<boolean> => {
          if (navigation.signal.aborted) {
            this.host.transcript.followLatest()
            await this.capabilities.cancelQuestion(wait)
            return false
          }
          const decision = escapeHandled ?? await this.confirmQuestionEscape(
            navigation,
            index,
            questions.length,
            answers.length,
          )
          escapeHandled = undefined
          if (decision === 'cancel') {
            this.host.transcript.followLatest()
            await this.capabilities.cancelQuestion(wait)
            return false
          }
          if (decision === 'skip') {
            answers.push({ id: question.id, selected: [] })
            index += 1
          }
          return true
        }
        const presentation = (option: NonNullable<typeof question.options>[number]): {
          readonly label: string
          readonly description?: string
        } => {
          if (planReview === undefined) return option
          return option.label === planReview.approve
            ? { label: ui('批准计划', "Approve plan"), description: ui('按此计划继续', "Continue with this plan") }
            : { label: ui('继续规划', "Continue planning"), description: ui('返回并修改计划', "Return and revise the plan") }
        }
        if (question.multiSelect === true) {
          const picked = await navigation.multiSelect({
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
            onEscape,
            options,
          })
          if (picked === undefined) {
            if (!await resolveEscape()) return
            continue
          }
          answers.push({ id: question.id, selected: picked.map(option => option.id) })
          index += 1
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
              { id: '__custom__', label: ui('自定义回答…', "Custom answer…") },
              { id: '__skip__', label: ui('跳过', "Skip"), description: ui('提交空选择', "Submit an empty selection") },
            ]
            : []),
        ]
        const picked = await navigation.select({
          title,
          detail: question.detail ?? question.question,
          choices,
          searchable: planReview === undefined,
          onEscape,
          options,
        })
        if (picked === undefined) {
          if (!await resolveEscape()) return
          continue
        }
        if (picked.id === '__custom__') {
          const custom = await navigation.multilineInput({
            title: question.question,
            ...(question.detail === undefined ? {} : { detail: question.detail }),
            onEscape,
            options,
          })
          if (custom === undefined) {
            if (!await resolveEscape()) return
            continue
          }
          answers.push({ id: question.id, selected: [], custom })
        } else if (picked.id === '__skip__') {
          answers.push({ id: question.id, selected: [] })
        } else {
          answers.push({ id: question.id, selected: [picked.id.slice('option:'.length)] })
        }
        index += 1
      }
      if (navigation.signal.aborted) {
        this.host.transcript.followLatest()
        await this.capabilities.cancelQuestion(wait)
        return
      }
      this.host.transcript.followLatest()
      await this.capabilities.answerQuestion(wait, { answers })
      this.host.notice(questionBatchSummary(answers), 'info')
    }, options)
  }

  private async confirmQuestionEscape(
    overlays: OverlayPrompts,
    index: number,
    total: number,
    answered: number,
  ): Promise<'cancel' | 'skip' | 'continue'> {
    const selected = await overlays.select({
      title: ui('取消这批问题？', 'Cancel this question batch?'),
      detail: ui(
        `已回答 ${String(answered)}/${String(total)} · 当前第 ${String(index + 1)} 题`,
        `Answered ${String(answered)}/${String(total)} · currently question ${String(index + 1)}`,
      ),
      searchable: false,
      choices: [
        { id: 'continue', label: ui('继续作答', 'Keep answering'), description: ui('回到当前问题', 'Return to the current question') },
        { id: 'skip', label: ui('仅跳过本题', 'Skip only this question'), description: ui('提交空选择并进入下一题', 'Submit an empty choice and continue') },
        { id: 'cancel', label: ui('取消全部', 'Cancel all'), description: ui('已答内容作废', 'Discard answers already given') },
      ],
      footer: ui('Enter 确认 · Esc 继续作答', 'Enter confirms · Esc keeps answering'),
      options: { width: '95%', maxHeight: '90%', anchor: 'bottom-center', margin: 1 },
    })
    if (selected?.id === 'skip') return 'skip'
    if (selected?.id === 'cancel') return 'cancel'
    return 'continue'
  }
}

/**
 * Summarize a completed question batch without counting skipped items as answered.
 * @param answers - submitted answers, including empty skip rows.
 */
export function questionBatchSummary(
  answers: readonly { readonly selected: readonly string[]; readonly custom?: string }[],
): string {
  const skipped = answers.filter(answer =>
    answer.selected.length === 0 && (answer.custom === undefined || answer.custom === '')).length
  const answered = answers.length - skipped
  return ui(
    `已处理 ${String(answers.length)} 项（回答 ${String(answered)} · 跳过 ${String(skipped)}）`,
    `Processed ${String(answers.length)} item(s) (answered ${String(answered)} · skipped ${String(skipped)})`,
  )
}

/**
 * Theme preview Esc restores the previous theme and discards unsaved edits.
 */
export function themePreviewFooter(): string {
  return ui('Enter 选择 · Esc 取消并恢复', 'Enter select · Esc cancel and restore')
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
  const canonical = canonicalTuiCommandName(name)
  if (canonical !== name) {
    return catalog.find(candidate => candidate.name === canonical)
  }
  return catalog.find(candidate => candidate.name === name)
}

/** Local commands that still need the user to type required arguments. */
const PALETTE_REQUIRED_ARGUMENT_COMMANDS = new Set(['rename', 'steer', 'attach'])

/**
 * Host, Skill, quit/exit, and required-argument commands stay in the editor.
 * Other TUI-local commands run through `execute()` after a palette choice.
 * Argument-hint punctuation is display copy and must not decide this.
 */
export function paletteFillsEditor(command: TuiCommandCandidate): boolean {
  if (command.behavior !== 'local') return true
  if (command.name === 'quit' || command.name === 'exit') return true
  return PALETTE_REQUIRED_ARGUMENT_COMMANDS.has(command.name)
}
