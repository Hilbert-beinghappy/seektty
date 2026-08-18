/** Platform-neutral TUI actions over authoritative Harness Client faces. */

import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { getImageDimensions } from '@mariozechner/pi-tui'
import type {
  IApiClient,
  JobView,
  ModelReasoningEffort,
  ModelSelection,
  QuestionResponsePayload,
  SessionId,
  SessionModels,
  SkillEntry,
  SubagentAddress,
  WorkspaceId,
  WorkspaceView,
} from '@deepseek-ai/dsh-api-remotes/node-client'
import type { ConnectionHandle, SubagentListEntry } from '@deepseek-ai/dsh-client-connection/node-client'
// Pull the generated Remote namespace and forwarded-event declarations into
// this Client program. Runtime values still come from the mounted assembly.
import type {} from '@deepseek-ai/dsh-api-remotes/node-client'
import type {
  AssistantMessageNode,
  ConversationSnapshot,
  PendingInteraction,
  PendingWait,
  SessionFace,
  SessionSearchResultItem,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import type {
  MessageFeedbackItem,
  MessageFeedbackRating,
  MessageFeedbackVersion,
} from '@deepseek-ai/dsh-message-feedback/types'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/projection'
import { TuiSettingsConflictError } from '@deepseek-ai/dsh-tui-protocol'
import type { TuiManagementBridge } from './management.ts'
import type { TuiClientContext } from './context.ts'
import { copyTargets } from './copy-content.ts'
import { flattenProducedFiles, type ProducedFileGroup } from './produced-files.ts'
import { explainFailure } from './error-advice.ts'
import { ui, uiLocale } from './locale.ts'
import { resolveHarnessUserPath } from './workspace-path.ts'

/** A command shown by the terminal's merged slash directory. */
export interface TuiCommandCandidate {
  readonly name: string
  readonly description: string
  readonly argumentHint?: string
  readonly source: 'TUI' | 'Host' | 'Host + TUI' | 'Skill'
  readonly behavior: 'local' | 'host' | 'skill'
}

/**
 * Compatible names that still execute, but stay out of `/`, Ctrl+P, and help.
 * Hidden name → visible canonical name.
 */
export const TUI_HIDDEN_COMMAND_ALIASES = Object.freeze({
  resume: 'sessions',
  plugins: 'plugin',
  quit: 'exit',
} as const)

/**
 * Map a typed command token to the catalog name used for lookup.
 * @param name - token without a leading slash.
 */
export function canonicalTuiCommandName(name: string): string {
  return TUI_HIDDEN_COMMAND_ALIASES[name as keyof typeof TUI_HIDDEN_COMMAND_ALIASES] ?? name
}

/**
 * Visible TUI names plus hidden aliases that must keep occupying the merged catalog.
 * Host or Skill entries with these names must not steal typed `/resume` `/plugins` `/quit`.
 */
export function reservedTuiCatalogNames(): ReadonlySet<string> {
  return new Set([
    ...Object.keys(TUI_HIDDEN_COMMAND_ALIASES),
    ...tuiCommands().map(command => command.name),
  ])
}

/** One selectable Agent Preset from the Host directory. */
export interface TuiModeOption {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly trust: 'system' | 'user'
  readonly current: boolean
  readonly isDefault: boolean
  readonly disabledReason?: string
}

/** One Provider/model route and its adapter-owned reasoning choices. */
export interface TuiModelOption {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly selection: ModelSelection
  readonly efforts: readonly ModelReasoningEffort[]
  readonly defaultEffort?: string
  readonly current: boolean
}

/** One permission option projected by the Host. */
export interface TuiPermissionOption {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly current: boolean
  readonly needsConfirmation: boolean
}

/** Current session binding, resolved from the Runtime selection. */
export interface TuiActiveSession {
  readonly sessionId: SessionId
  readonly session: SessionFace
  readonly summary: SessionSummary
  readonly workspacePath: string
  readonly workspaceId?: WorkspaceId
}

/** Top-strip facts; business values remain owned by the Host and Runtime. */
export interface TuiHeaderFacts {
  readonly hostVersion: string
  readonly nodeVersion: string
  readonly platform: NodeJS.Platform
  readonly architecture: string
  readonly profile: string
  readonly workspace: string
  readonly session: string
  readonly mode: string
  readonly model: string
  readonly permission: string
  readonly running: boolean
  readonly context?: string
  /** Epoch ms when the current turn started running; absent while idle. */
  readonly runningSince?: number
  /** Whether the context row should show a live elapsed clock. */
  readonly statusElapsed?: boolean
}

/** Human-readable whole-session figures derived from registered projections. */
export interface TuiSessionStatistics {
  readonly lines: readonly string[]
  readonly context?: string
}

/** Temporary image bytes waiting for the next Harness prompt admission. */
export interface TuiDraftAttachment {
  readonly path: string
  readonly name: string
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  readonly data: string
  readonly bytes: number
  readonly width?: number
  readonly height?: number
}

/** One dynamic tool schema recorded on the newest ordinary model request. */
export interface TuiToolOption {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
}

/** One direct child row paired with the exact Harness continuation address. */
export interface TuiSubagentOption {
  readonly entry: SubagentListEntry
  readonly address?: SubagentAddress
  readonly totalTokens?: number
  readonly durationMs?: number
}

/** Assistant message eligible for the Harness message-feedback sidecar. */
export interface TuiFeedbackTarget {
  readonly message: AssistantMessageNode
  readonly preview: string
  readonly feedback?: MessageFeedbackItem
}

/** Result of saving one native Harness Session-log export. */
export interface TuiExportResult {
  readonly path: string
  readonly bytes: number
  readonly mediaType: string
  readonly includeDescendants: boolean
}

interface PermissionSelectValue {
  readonly currentValue: string
  readonly options: readonly {
    readonly value: string
    readonly name: string
    readonly description?: string
  }[]
}

interface ImageLimits {
  readonly maxImageBytes: number
  readonly maxImagesPerMessage: number
  readonly maxMessageImageBytes: number
  readonly maxImagePixels: number
  readonly mediaTypes: readonly string[]
}

interface HostCommandDescriptor {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string }
}

const SAFE_PERMISSION_PRESETS = new Set(['read-only', 'workspace-write'])
const FULL_ACCESS_PRESET = 'danger-full-access'
// These remain Host-owned commands. The terminal adds a confirmation/selector
// before dispatch, but does not register a second command with the same name.
const HOST_COMMAND_DECORATORS = new Set(['permission', 'feedback'])
const HOST_COMMAND_FUNCTIONS = new Map<string, { readonly zh: string; readonly en: string }>([
  ['permission', { zh: '切换权限', en: 'Switch permission' }],
  ['feedback', { zh: '提交会话反馈', en: 'Submit session feedback' }],
  ['plan', { zh: '开启或关闭计划模式', en: 'Enable or disable plan mode' }],
  ['goal', { zh: '管理当前目标', en: 'Manage current goal' }],
  ['compact', { zh: '压缩当前会话上下文', en: 'Compact current session context' }],
])
const HOST_COMMAND_ARGUMENT_HINTS = new Map<string, { readonly zh: string; readonly en: string }>([
  ['permission', { zh: '[权限]', en: '[permission]' }],
  ['feedback', { zh: '[内容]', en: '[text]' }],
])

export function shortFunctionDescription(description: string, fallback: string): string {
  const normalized = description.replace(/\s+/gu, ' ').trim()
  if (normalized === '') return fallback
  const firstSentence = normalized.split(/[。；！？\n]/u, 1)[0]?.trim() || fallback
  const characters = Array.from(firstSentence)
  return characters.length <= 48 ? firstSentence : `${characters.slice(0, 48).join('')}…`
}

/** TUI-owned product commands available in the terminal Surface. */
export function tuiCommands(): readonly TuiCommandCandidate[] {
  return Object.freeze([
    { name: 'new', description: ui('新建会话', 'New session'), source: 'TUI', behavior: 'local' },
    { name: 'sessions', description: ui('查看或搜索会话', 'View or search sessions'), argumentHint: ui('[搜索词]', '[query]'), source: 'TUI', behavior: 'local' },
    { name: 'model', description: ui('切换模型和推理强度', 'Switch model and reasoning effort'), source: 'TUI', behavior: 'local' },
    { name: 'mode', description: ui('切换模式', 'Switch mode'), source: 'TUI', behavior: 'local' },
    { name: 'permission', description: ui('切换权限', 'Switch permission'), argumentHint: ui('[权限]', '[permission]'), source: 'Host + TUI', behavior: 'local' },
    { name: 'workspace', description: ui('管理工作区', 'Manage workspaces'), argumentHint: ui('[子命令|路径]', '[subcommand|path]'), source: 'TUI', behavior: 'local' },
    { name: 'rename', description: ui('重命名当前会话', 'Rename current session'), argumentHint: ui('<标题>', '<title>'), source: 'TUI', behavior: 'local' },
    { name: 'fork', description: ui('从当前会话创建分支', 'Fork current session'), source: 'TUI', behavior: 'local' },
    { name: 'archive', description: ui('归档当前会话', 'Archive current session'), source: 'TUI', behavior: 'local' },
    { name: 'export', description: ui('导出当前会话', 'Export current session'), argumentHint: ui('[md] [路径]', '[md] [path]'), source: 'TUI', behavior: 'local' },
    { name: 'copy', description: ui('复制最后一条回复', 'Copy last response'), argumentHint: '[pick|code]', source: 'TUI', behavior: 'local' },
    { name: 'profile', description: ui('管理 Profile', 'Manage Profiles'), argumentHint: '[list|switch|create|copy]', source: 'TUI', behavior: 'local' },
    { name: 'language', description: ui('切换界面语言', 'Switch interface language'), argumentHint: '[auto|zh|en]', source: 'TUI', behavior: 'local' },
    { name: 'theme', description: ui('切换界面或独立代码主题', 'Switch interface or code theme'), argumentHint: '[dark|light|code|use|edit|palette|import|export|delete]', source: 'TUI', behavior: 'local' },
    { name: 'queue', description: ui('管理排队消息', 'Manage queued messages'), source: 'TUI', behavior: 'local' },
    { name: 'steer', description: ui('发送引导消息', 'Send steering message'), argumentHint: ui('<消息>', '<message>'), source: 'TUI', behavior: 'local' },
    { name: 'attach', description: ui('添加图片', 'Attach image'), argumentHint: ui('<图片路径>', '<image-path>'), source: 'TUI', behavior: 'local' },
    { name: 'attachments', description: ui('管理待发送图片', 'Manage pending images'), source: 'TUI', behavior: 'local' },
    { name: 'pending', description: ui('处理待审批或待回答事项', 'Handle pending approvals or questions'), source: 'TUI', behavior: 'local' },
    { name: 'settings', description: ui('打开设置', 'Open Settings'), argumentHint: '[namespace]', source: 'TUI', behavior: 'local' },
    { name: 'keymap', description: ui('自定义快捷键', 'Customize shortcuts'), argumentHint: '[binding [chord|reset]]', source: 'TUI', behavior: 'local' },
    { name: 'plugin', description: ui('打开插件中心', 'Open plugin center'), argumentHint: ui('[子命令]', '[subcommand]'), source: 'TUI', behavior: 'local' },
    { name: 'doctor', description: ui('检查运行环境', 'Check runtime environment'), source: 'TUI', behavior: 'local' },
    { name: 'restart', description: ui('重启并恢复当前会话', 'Restart and resume current session'), source: 'TUI', behavior: 'local' },
    { name: 'tools', description: ui('查看工具', 'View tools'), argumentHint: '[display]', source: 'TUI', behavior: 'local' },
    { name: 'files', description: ui('查看本会话生成文件', 'View files produced this session'), source: 'TUI', behavior: 'local' },
    { name: 'jobs', description: ui('查看后台任务', 'View background jobs'), source: 'TUI', behavior: 'local' },
    { name: 'subagents', description: ui('查看子 Agent', 'View subagents'), source: 'TUI', behavior: 'local' },
    { name: 'trajectory', description: ui('查看执行轨迹', 'View execution trajectory'), source: 'TUI', behavior: 'local' },
    { name: 'skills', description: ui('查看 Skills', 'View Skills'), source: 'TUI', behavior: 'local' },
    { name: 'mcp', description: ui('查看 MCP', 'View MCP'), source: 'TUI', behavior: 'local' },
    { name: 'status', description: ui('查看状态和统计', 'View status and statistics'), source: 'TUI', behavior: 'local' },
    { name: 'help', description: ui('查看帮助', 'View help'), source: 'TUI', behavior: 'local' },
    { name: 'exit', description: ui('退出', 'Exit'), source: 'TUI', behavior: 'local' },
  ])
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function projectionRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function nonnegativeNumber(record: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function compactNumber(value: number): string {
  const scaled = (number: number): string => number >= 100
    ? String(Math.round(number))
    : String(Math.round(number * 10) / 10)
  if (value < 1_000) return String(Math.round(value))
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}

function durationText(milliseconds: number): string {
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

function assistantText(message: AssistantMessageNode): string {
  return message.blocks.flatMap((block) => {
    if (block.kind === 'text') return [block.text]
    if (block.kind === 'image') return [ui('[图片]', '[image]')]
    return []
  }).join('\n')
}

function latestModelRoute(snapshot: ConversationSnapshot): string | undefined {
  const request = snapshot.views.get('trajectory')?.requests.findLast(candidate => candidate.purpose === 'assistant'
    && candidate.requestConfig !== undefined)
  if (request?.requestConfig !== undefined) {
    const effort = request.requestConfig.reasoningEffort
    return `${request.requestConfig.provider}/${request.requestConfig.model}${effort === undefined ? '' : ` · ${effort}`}`
  }
  const message = snapshot.nodes.findLast(node => node.kind === 'assistant'
    && (node.requestConfig !== undefined || node.provenance !== undefined))
  if (message?.kind !== 'assistant') return undefined
  const provider = message.requestConfig?.provider ?? message.provenance?.provider
  const model = message.requestConfig?.model ?? message.provenance?.model
  if (provider === undefined || model === undefined) return undefined
  const effort = message.requestConfig?.reasoningEffort
  return `${provider}/${model}${effort === undefined ? '' : ` · ${effort}`}`
}

async function saveExport(path: string, stream: ReadableStream<Uint8Array>): Promise<number> {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'wx').catch(async (error: unknown) => {
    await stream.cancel('export destination unavailable').catch(() => undefined)
    throw error
  })
  const reader = stream.getReader()
  let bytes = 0
  let complete = false
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      let offset = 0
      while (offset < next.value.byteLength) {
        const result = await file.write(next.value, offset, next.value.byteLength - offset, null)
        if (result.bytesWritten < 1) {
          throw new Error(ui('写入 Session Export 时没有取得进展', 'Session Export write made no progress'))
        }
        offset += result.bytesWritten
        bytes += result.bytesWritten
      }
    }
    await file.sync()
    complete = true
    return bytes
  } finally {
    if (!complete) await reader.cancel('export write failed').catch(() => undefined)
    reader.releaseLock()
    await file.close().catch(() => undefined)
    if (!complete) await unlink(path).catch(() => undefined)
  }
}

async function saveTextExport(path: string, text: string): Promise<number> {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'wx')
  let complete = false
  try {
    const bytes = Buffer.byteLength(text, 'utf8')
    await file.write(Buffer.from(text, 'utf8'))
    await file.sync()
    complete = true
    return bytes
  } finally {
    await file.close().catch(() => undefined)
    if (!complete) await unlink(path).catch(() => undefined)
  }
}

function markdownExportName(title: string): string {
  const slug = title.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80)
  return `${slug === '' ? 'session' : slug}.md`
}

function isPermissionSelect(value: unknown): value is PermissionSelectValue {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.currentValue !== 'string' || !Array.isArray(record.options)) return false
  return record.options.every((option) => {
    if (typeof option !== 'object' || option === null) return false
    const row = option as Record<string, unknown>
    return typeof row.value === 'string' && typeof row.name === 'string'
      && (row.description === undefined || typeof row.description === 'string')
  })
}

function isImageLimits(value: unknown): value is ImageLimits {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.maxImageBytes === 'number'
    && typeof row.maxImagesPerMessage === 'number'
    && typeof row.maxMessageImageBytes === 'number'
    && typeof row.maxImagePixels === 'number'
    && Array.isArray(row.mediaTypes)
    && row.mediaTypes.every(item => typeof item === 'string')
}

function mediaTypeOf(bytes: Uint8Array, path: string): TuiDraftAttachment['mediaType'] | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a'
    || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a') return 'image/gif'
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return undefined
}

function workspaceFor(
  sessionId: SessionId,
  path: string,
  workspaces: readonly WorkspaceView[],
): WorkspaceView | undefined {
  return workspaces.find(workspace => workspace.sessionIds.includes(sessionId))
    ?? workspaces.find(workspace => workspace.path === path)
}

/**
 * Compatibility controller used by terminal components. It stores only
 * cancellable catalog caches and draft images; every durable read/write goes
 * through the mounted Harness API, Remote, Session, or Workspace face.
 */
export class HarnessTuiCapabilities {
  private readonly commandCatalogs = new Map<string, Promise<readonly TuiCommandCandidate[]>>()
  private readonly modelCatalogs = new Map<SessionId, SessionModels>()
  private readonly modelLoads = new Map<SessionId, Promise<SessionModels>>()
  private readonly attachments: TuiDraftAttachment[] = []
  private modelGeneration = 0

  /**
   * @param ctx - isolated Harness Client Context.
   * @param api - in-process API Proxy client used by the same Context.
   * @param profile - launcher-selected Profile name.
   * @param initialWorkspacePath - startup fallback until the current list row lands.
   */
  constructor(
    readonly ctx: TuiClientContext,
    private readonly api: IApiClient,
    private readonly profile: string,
    private readonly initialWorkspacePath: string,
    private readonly management?: TuiManagementBridge,
  ) {
    ctx.remote.$on('commands/change', () => { this.commandCatalogs.clear() })
    ctx.remote.$on('agent-preset/selected', (sessionId: SessionId) => {
      this.dropCommandCatalog(sessionId)
      this.invalidateModels()
    })
    ctx.remote.$on('llm/adapters-updated', () => { this.invalidateModels() })
    ctx.remote.$on('settings/document-updated', () => { this.invalidateModels() })
    ctx.on('connection/reset', () => {
      this.commandCatalogs.clear()
      this.invalidateModels()
    })
  }

  /**
   * Access the direct same-process management bridge when the launcher supplied it.
   * @returns Host Settings/Profile/plugin bridge.
   */
  managementBridge(): TuiManagementBridge {
    if (this.management === undefined) {
      throw new Error(ui(
        '当前 launcher 未提供 Settings/Profile/插件管理能力',
        'The current launcher does not provide Settings, Profile, or plugin management',
      ))
    }
    return this.management
  }

  /**
   * Read the Profile selected by the launcher.
   * @returns launcher-selected current Profile name.
   */
  currentProfile(): string { return this.profile }

  /**
   * Resolve the Runtime's current selection and stable Session face.
   * @returns the active Session binding, or undefined when selection is empty.
   */
  active(): TuiActiveSession | undefined {
    const sessions = this.ctx.sessions.list.getSnapshot()
    const sessionId = sessions.current
    if (sessionId === undefined) return undefined
    const summary = sessions.byId[sessionId]
    const binding = this.ctx.sessions.binding(sessionId)
    if (summary === undefined || binding === undefined) return undefined
    const workspacePath = summary.cwd ?? this.initialWorkspacePath
    const workspace = workspaceFor(sessionId, workspacePath, this.ctx.workspaces.list.getSnapshot().items)
    return {
      sessionId,
      session: binding.session,
      summary,
      workspacePath,
      ...(workspace === undefined ? {} : { workspaceId: workspace.workspaceId }),
    }
  }

  /**
   * Follow selection changes and the currently selected Session snapshot.
   * @param listener - receives the active binding and snapshot, or two undefined values after selection clears.
   * @returns disposer for both Runtime subscriptions.
   */
  subscribeActive(listener: (
    active: TuiActiveSession | undefined,
    snapshot: ConversationSnapshot | undefined,
  ) => void): () => void {
    let selected: SessionId | undefined
    let stopSession = (): void => undefined
    const bind = (): void => {
      const active = this.active()
      if (active === undefined) {
        if (selected !== undefined) {
          stopSession()
          stopSession = (): void => undefined
          selected = undefined
        }
        listener(undefined, undefined)
        return
      }
      if (selected !== active.sessionId) {
        stopSession()
        selected = active.sessionId
        const notify = (): void => {
          const current = this.active()
          if (current === undefined || current.sessionId !== selected) return
          listener(current, current.session.getSnapshot())
        }
        stopSession = active.session.subscribe(notify)
      }
      listener(active, active.session.getSnapshot())
    }
    const stopList = this.ctx.sessions.list.subscribe(bind)
    bind()
    return () => {
      stopSession()
      stopList()
    }
  }

  /**
   * Read the current status strip, optionally refreshing the model directory.
   * @param refreshModel - whether to repull model metadata before rendering.
   * @returns status facts derived from current Harness projections.
   */
  async headerFacts(refreshModel = false): Promise<TuiHeaderFacts> {
    const active = this.requireActive()
    if (refreshModel || !this.modelCatalogs.has(active.sessionId)) {
      await this.loadModels(active.sessionId).catch(() => undefined)
    }
    const model = this.modelCatalogs.get(active.sessionId)?.current
    const modelRoute = model === undefined
      ? latestModelRoute(active.session.getSnapshot())
      : `${model.provider}/${model.model}${model.reasoningEffort === undefined ? '' : ` · ${model.reasoningEffort}`}`
    const permission = this.permissionValue(active.session)
    const context = this.sessionStatistics().context
    const connection = (this.ctx as TuiClientContext & { readonly connection: ConnectionHandle }).connection
    return {
      hostVersion: connection.hostDescription.getSnapshot()?.version ?? ui('未知', 'Unknown'),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      profile: this.profile,
      workspace: active.workspacePath,
      session: active.summary.displayTitle,
      mode: active.summary.agentPreset ?? ui('未声明', 'Not declared'),
      model: modelRoute ?? '',
      permission: permission?.currentValue ?? ui('未提供', 'Not available'),
      running: active.session.getSnapshot().running,
      ...(context === undefined ? {} : { context }),
    }
  }

  /**
   * Dynamically merge TUI commands, the current Host command directory, and user-invocable Skills.
   * @param signal - optional cancellation signal for Host catalog requests.
   * @returns the merged, collision-checked command catalog.
   */
  commandCatalog(signal?: AbortSignal): Promise<readonly TuiCommandCandidate[]> {
    signal?.throwIfAborted()
    const sessionId = this.active()?.sessionId
    if (sessionId === undefined) return Promise.resolve(tuiCommands())
    const key = `${sessionId}:${uiLocale()}`
    const existing = this.commandCatalogs.get(key)
    const request = existing ?? this.readCommandCatalog(sessionId)
      .catch((error: unknown) => {
        this.commandCatalogs.delete(key)
        throw error
      })
    if (existing === undefined) this.commandCatalogs.set(key, request)
    if (signal === undefined) return request
    return request.then((catalog) => {
      signal.throwIfAborted()
      return catalog
    })
  }

  /** Invalidate the current command/Skill snapshot and repull on next use. */
  invalidateCommandCatalog(): void {
    this.dropCommandCatalog(this.active()?.sessionId)
  }

  private dropCommandCatalog(sessionId?: SessionId): void {
    if (sessionId === undefined) {
      this.commandCatalogs.clear()
      return
    }
    const prefix = `${sessionId}:`
    for (const key of this.commandCatalogs.keys()) {
      if (key.startsWith(prefix)) this.commandCatalogs.delete(key)
    }
  }

  /**
   * List every Host Agent Preset without a client-side enum.
   * @returns the current Host-owned mode directory.
   */
  async listModes(): Promise<readonly TuiModeOption[]> {
    const active = this.requireActive()
    const response = await this.api.agentPresets.list({})
    if (!response.result.ok) {
      throw new Error(ui(`读取模式失败：${response.result.error.message}`, `Failed to load modes: ${response.result.error.message}`))
    }
    return response.result.value.presets.map(preset => ({
      id: preset.id,
      label: preset.name ?? preset.id,
      ...(preset.description === undefined ? {} : { description: preset.description }),
      trust: preset.trust,
      current: active.summary.agentPreset === preset.id,
      isDefault: preset.isDefault,
      ...(preset.broken === undefined ? {} : { disabledReason: preset.broken }),
    }))
  }

  /**
   * Whether selecting another Preset must create a same-workspace session.
   * @returns true when the active Session already contains conversation state.
   */
  modeNeedsNewSession(): boolean {
    return !this.requireActive().summary.blank
  }

  /**
   * Apply a Preset to a blank session or to a newly connected blank in the same Workspace.
   * @param agentPreset - opaque Host Agent Preset identifier.
   * @param allowNewSession - whether an active conversation may move to a new blank Session.
   * @returns the Session receiving the selected Preset.
   */
  async selectMode(agentPreset: string, allowNewSession: boolean): Promise<SessionId> {
    const source = this.requireActive()
    let target = source
    if (!source.summary.blank) {
      if (!allowNewSession) {
        throw new Error(ui('活跃会话不能原地切换模式', 'An active session cannot change mode in place'))
      }
      let workspaceId = source.workspaceId
      if (workspaceId === undefined) {
        workspaceId = (await this.ctx.workspaces.create({ path: source.workspacePath })).workspaceId
      }
      const sessionId = await this.ctx.workspaces.connectWorkspace(workspaceId)
      const summary = this.ctx.sessions.list.getSnapshot().byId[sessionId]
      const binding = this.ctx.sessions.binding(sessionId)
      if (summary === undefined || binding === undefined || sessionId === source.sessionId) {
        throw new Error(ui(
          'Harness 未提供可用于模式切换的同工作区空白会话',
          'Harness did not provide a blank same-workspace session for the mode change',
        ))
      }
      target = {
        sessionId,
        session: binding.session,
        summary,
        workspacePath: summary.cwd ?? source.workspacePath,
        workspaceId,
      }
    }
    const response = await this.api.agentPresets.select({ sessionId: target.sessionId, agentPreset })
    if (!response.result.ok) {
      throw new Error(ui(`切换模式失败：${response.result.error.message}`, `Failed to change mode: ${response.result.error.message}`))
    }
    this.ctx.sessions.noteAgentPreset(target.sessionId, response.result.value.agentPreset)
    this.ctx.sessions.open(target.sessionId)
    this.dropCommandCatalog(target.sessionId)
    return target.sessionId
  }

  /**
   * Load the current session's Provider/model directory.
   * @param sessionId - Session whose routable model directory should be read.
   * @returns the current Provider/model directory.
   */
  loadModels(sessionId = this.requireActive().sessionId): Promise<SessionModels> {
    const existing = this.modelLoads.get(sessionId)
    if (existing !== undefined) return existing
    const generation = this.modelGeneration
    const request = this.api.sessions.models({ sessionId }).then((response) => {
      if (!response.result.ok) {
        throw new Error(ui(`读取模型失败：${response.result.error.message}`, `Failed to load models: ${response.result.error.message}`))
      }
      if (generation === this.modelGeneration) this.modelCatalogs.set(sessionId, response.result.value)
      return response.result.value
    }).finally(() => {
      if (this.modelLoads.get(sessionId) === request) this.modelLoads.delete(sessionId)
    })
    this.modelLoads.set(sessionId, request)
    return request
  }

  /**
   * Flatten the Host model groups while keeping selection values opaque.
   * @returns terminal options, adapter failures, and route availability.
   */
  async listModels(): Promise<{ options: readonly TuiModelOption[]; failures: readonly string[]; routable: boolean }> {
    const directory = await this.loadModels()
    const options = directory.groups.flatMap(group => group.models.map(model => ({
      id: `${group.id}\u0000${model.id}`,
      label: model.name,
      description: `${group.name}${model.description === undefined ? '' : ` · ${model.description}`}`,
      selection: { provider: group.id, model: model.id },
      efforts: model.reasoning?.efforts ?? [],
      ...(model.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: model.reasoning.defaultEffort }),
      current: directory.current.provider === group.id && directory.current.model === model.id,
    })))
    return {
      options,
      failures: directory.failures.map(failure => `${failure.name}: ${failure.message}`),
      routable: directory.routable,
    }
  }

  /**
   * Select one complete Provider/model/reasoning route through session.selectModel.
   * @param selection - complete opaque route selected from the Host directory.
   */
  async selectModel(selection: ModelSelection): Promise<void> {
    const active = this.requireActive()
    const response = await this.api.sessions.selectModel({ sessionId: active.sessionId, ...selection })
    if (!response.result.ok) {
      throw new Error(ui(`切换模型失败：${response.result.error.message}`, `Failed to change model: ${response.result.error.message}`))
    }
    const current = this.modelCatalogs.get(active.sessionId)
    this.invalidateModels()
    if (current !== undefined) {
      this.modelCatalogs.set(active.sessionId, { ...current, current: response.result.value.selected, routable: true })
    } else {
      await this.loadModels(active.sessionId)
    }
  }

  /**
   * Read the dynamic permission directory from the official Session projection.
   * @returns Host-ordered permission choices with conservative risk metadata.
   */
  listPermissions(): readonly TuiPermissionOption[] {
    const value = this.permissionValue(this.requireActive().session)
    if (value === undefined) {
      throw new Error(ui('当前 Profile 未提供权限投影', 'The current Profile does not provide a permission projection'))
    }
    return value.options
      .filter(option => option.value !== 'custom')
      .map(option => ({
        id: option.value,
        label: option.name,
        ...(option.description === undefined ? {} : { description: option.description }),
        current: option.value === value.currentValue,
        needsConfirmation: this.permissionNeedsConfirmation(option.value),
      }))
  }

  /**
   * Return the next Host-ordered permission option for Shift+Tab.
   * @returns the next cyclic permission option.
   */
  nextPermission(): TuiPermissionOption {
    const options = this.listPermissions()
    if (options.length === 0) {
      throw new Error(ui('当前 Profile 没有可切换的权限预设', 'The current Profile has no switchable permission preset'))
    }
    const index = options.findIndex(option => option.current)
    return options[(index + 1 + options.length) % options.length] as TuiPermissionOption
  }

  /**
   * Unknown options carry no risk metadata today and therefore confirm conservatively.
   * @param id - Host permission value.
   * @returns true when the transition requires explicit confirmation.
   */
  permissionNeedsConfirmation(id: string): boolean {
    return id === FULL_ACCESS_PRESET || !SAFE_PERMISSION_PRESETS.has(id)
  }

  /**
   * Submit the existing Host /permission command; no local permission state is written.
   * @param id - Host permission value selected by the user.
   */
  async selectPermission(id: string): Promise<void> {
    const result = await this.requireActive().session.command(`/permission ${id}`)
    if (!result.ok) {
      throw new Error(ui(`切换权限失败：${result.error.message}`, `Failed to change permission: ${result.error.message}`))
    }
    if (!result.value.matched) {
      throw new Error(ui(
        `Host 未识别权限预设 ${JSON.stringify(id)}`,
        `The Host did not recognize permission preset ${JSON.stringify(id)}`,
      ))
    }
  }

  /**
   * Record session-level feedback through the existing Host command while the
   * TUI decorator supplies terminal-native input and message-rating choices.
   * @param text - human-authored session feedback.
   */
  async recordSessionFeedback(text: string): Promise<void> {
    const normalized = text.trim()
    if (normalized === '') throw new Error(ui('会话反馈不能为空', 'Session feedback cannot be empty'))
    const result = await this.requireActive().session.command(`/feedback ${normalized}`)
    if (!result.ok) {
      throw new Error(ui(`提交会话反馈失败：${result.error.message}`, `Failed to submit session feedback: ${result.error.message}`))
    }
    if (!result.value.matched) {
      throw new Error(ui('当前 Profile 未提供会话反馈功能', 'The current Profile does not provide session feedback'))
    }
  }

  /**
   * Visible, non-archived session rows in Runtime order.
   * @returns the current visible Session registry.
   */
  listSessions(): readonly SessionSummary[] {
    const sessions = this.ctx.sessions.list.getSnapshot()
    const archived = new Set(this.ctx.workspaces.list.getSnapshot().archivedSessionIds)
    return sessions.ids.flatMap((id) => {
      const row = sessions.byId[id]
      return row === undefined || archived.has(id) ? [] : [row]
    })
  }

  /**
   * Search visible session message content through the Host index.
   * @param query - non-blank literal phrase.
   * @param signal - cancellation for a superseded search.
   * @returns bounded Host search hits.
   */
  async searchSessions(query: string, signal: AbortSignal): Promise<{
    readonly items: readonly SessionSearchResultItem[]
    readonly hasMore: boolean
  }> {
    const result = await this.ctx.sessions.search(query, signal)
    if (!result.ok) {
      throw new Error(ui(`搜索会话失败：${result.error.message}`, `Failed to search sessions: ${result.error.message}`))
    }
    return result.value
  }

  /**
   * Select an existing Runtime session.
   * @param sessionId - existing Session identifier.
   */
  openSession(sessionId: SessionId): void {
    if (this.ctx.sessions.list.getSnapshot().byId[sessionId] === undefined) {
      throw new Error(ui(`找不到会话 ${sessionId}`, `Session ${sessionId} was not found`))
    }
    this.ctx.sessions.open(sessionId)
  }

  /**
   * Start or reuse the selected Workspace's blank session through Workspace Runtime.
   * @param workspaceId - optional explicit Workspace selection.
   * @returns the opened blank Session, or undefined when no Workspace exists.
   */
  async newSession(workspaceId?: WorkspaceId): Promise<SessionId | undefined> {
    const active = this.active()
    const target = workspaceId ?? active?.workspaceId ?? this.ctx.workspaces.list.getSnapshot().recentWorkspaceId
    if (target === undefined) {
      this.ctx.sessions.clear()
      return undefined
    }
    const sessionId = await this.ctx.workspaces.connectWorkspace(target)
    this.ctx.sessions.open(sessionId)
    return sessionId
  }

  /**
   * Fork the current session at its latest completed turn and open the child.
   * @returns the opened child Session identifier.
   */
  async forkSession(): Promise<SessionId> {
    const sessionId = await this.ctx.sessions.fork({ sessionId: this.requireActive().sessionId, increaseTitle: true })
    this.ctx.sessions.open(sessionId)
    return sessionId
  }

  /**
   * Rename the current session through the Session face.
   * @param title - requested Session title.
   * @returns the title accepted by the Host.
   */
  async renameSession(title: string): Promise<string> {
    const result = await this.requireActive().session.rename(title)
    if (!result.ok) {
      throw new Error(ui(`重命名失败：${result.error.message}`, `Rename failed: ${result.error.message}`))
    }
    return result.value.title
  }

  /** Archive the current session through Workspace Runtime. */
  async archiveSession(): Promise<void> {
    await this.ctx.workspaces.archiveSession(this.requireActive().sessionId)
  }

  /**
   * Current Workspace registry projection.
   * @returns the current Host-owned Workspace rows.
   */
  listWorkspaces(): readonly WorkspaceView[] {
    return this.ctx.workspaces.list.getSnapshot().items
  }

  /**
   * Register a path, connect its blank session, and open it.
   * @param path - user-selected Workspace path.
   * @returns the opened blank Session identifier.
   */
  async openWorkspace(path: string): Promise<SessionId> {
    const workspace = await this.ctx.workspaces.create({ path: resolve(path) })
    const sessionId = await this.ctx.workspaces.connectWorkspace(workspace.workspaceId)
    this.ctx.sessions.open(sessionId)
    return sessionId
  }

  /**
   * Open a registered Workspace through its reusable blank Session.
   * @param workspaceId - target Harness Workspace.
   * @returns opened Session id.
   */
  async selectWorkspace(workspaceId: WorkspaceId): Promise<SessionId> {
    const sessionId = await this.ctx.workspaces.connectWorkspace(workspaceId)
    this.ctx.sessions.open(sessionId)
    return sessionId
  }

  /**
   * Rename a Workspace through the Runtime domain.
   * @param workspaceId - authoritative Workspace identifier.
   * @param title - requested display title.
   * @returns updated Host-owned Workspace row.
   */
  renameWorkspace(workspaceId: WorkspaceId, title: string): Promise<WorkspaceView> {
    return this.ctx.workspaces.rename(workspaceId, title)
  }

  /**
   * Remove only a Workspace registry row; files and Session logs remain untouched.
   * @param workspaceId - authoritative Workspace identifier.
   */
  deleteWorkspace(workspaceId: WorkspaceId): Promise<void> {
    return this.ctx.workspaces.delete(workspaceId)
  }

  /**
   * Move one Workspace before another, or append it when the anchor is omitted.
   * @param workspaceId - Workspace being moved.
   * @param beforeWorkspaceId - optional insertion anchor.
   */
  moveWorkspace(workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId): Promise<void> {
    return this.ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId)
  }

  /**
   * Move an accounted Session inside its Workspace-owned manual order.
   * @param workspaceId - Workspace that owns the manual order.
   * @param sessionId - Session being moved.
   * @param beforeSessionId - optional insertion anchor.
   * @returns updated Host-owned Workspace row.
   */
  moveWorkspaceSession(
    workspaceId: WorkspaceId,
    sessionId: SessionId,
    beforeSessionId?: SessionId,
  ): Promise<WorkspaceView> {
    return this.ctx.workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
  }

  /**
   * Add a validated image path to the transient next-prompt draft.
   * @param rawPath - absolute or Workspace-relative image path.
   * @returns validated transient attachment metadata and bytes.
   */
  async addAttachment(rawPath: string): Promise<TuiDraftAttachment> {
    const active = this.requireActive()
    const input = rawPath.trim()
    if (input === '' || input === '""' || input === "''") {
      throw new Error(ui('附件路径不能为空', 'Attachment path cannot be empty'))
    }
    let path: string
    try {
      path = resolveHarnessUserPath(input, active.workspacePath)
    } catch {
      throw new Error(ui('附件 file URL 无效', 'Attachment file URL is invalid'))
    }
    const file = await stat(path)
    if (!file.isFile()) throw new Error(ui('附件路径不是文件', 'Attachment path is not a file'))
    const bytes = await readFile(path)
    const mediaType = mediaTypeOf(bytes, path)
    if (mediaType === undefined) {
      throw new Error(ui('只支持 PNG、JPEG、GIF 或 WebP 图片', 'Only PNG, JPEG, GIF, and WebP images are supported'))
    }
    const data = bytes.toString('base64')
    const dimensions = getImageDimensions(data, mediaType)
    const limitsValue = active.session.projections.faceOf('imageLimits').getSnapshot()
    const limits = isImageLimits(limitsValue) ? limitsValue : undefined
    if (limits !== undefined) {
      if (!limits.mediaTypes.includes(mediaType)) {
        throw new Error(ui(`当前 Host 不接受 ${mediaType}`, `The current Host does not accept ${mediaType}`))
      }
      if (bytes.byteLength > limits.maxImageBytes) {
        throw new Error(ui(
          `图片超过单文件限制 ${limits.maxImageBytes} 字节`,
          `Image exceeds the per-file limit of ${limits.maxImageBytes} bytes`,
        ))
      }
      if (this.attachments.length + 1 > limits.maxImagesPerMessage) {
        throw new Error(ui(
          `每条消息最多 ${limits.maxImagesPerMessage} 张图片`,
          `Each message can include at most ${limits.maxImagesPerMessage} image(s)`,
        ))
      }
      const total = this.attachments.reduce((sum, item) => sum + item.bytes, 0) + bytes.byteLength
      if (total > limits.maxMessageImageBytes) {
        throw new Error(ui(
          `图片总大小超过 ${limits.maxMessageImageBytes} 字节`,
          `Total image size exceeds ${limits.maxMessageImageBytes} bytes`,
        ))
      }
      if (dimensions !== null && dimensions.widthPx * dimensions.heightPx > limits.maxImagePixels) {
        throw new Error(ui(`图片像素超过 ${limits.maxImagePixels}`, `Image pixels exceed ${limits.maxImagePixels}`))
      }
    }
    const attachment: TuiDraftAttachment = {
      path,
      name: basename(path),
      mediaType,
      data,
      bytes: bytes.byteLength,
      ...(dimensions === null ? {} : { width: dimensions.widthPx, height: dimensions.heightPx }),
    }
    this.attachments.push(attachment)
    return attachment
  }

  /**
   * Snapshot of transient image drafts.
   * @returns a copy of the next-prompt attachment list.
   */
  draftAttachments(): readonly TuiDraftAttachment[] {
    return [...this.attachments]
  }

  /** Clear transient image drafts without touching durable attachment storage. */
  clearAttachments(): void {
    this.attachments.splice(0)
  }

  /**
   * Build the next official prompt payload from text and temporary image bytes.
   * @param text - current editor text.
   * @returns the official multimodal prompt content array.
   */
  promptContent(text: string): Array<
    { type: 'text'; text: string }
    | { type: 'image'; mediaType: TuiDraftAttachment['mediaType']; data: string; name: string }
  > {
    return [
      ...(text === '' ? [] : [{ type: 'text' as const, text }]),
      ...this.attachments.map(item => ({
        type: 'image' as const,
        mediaType: item.mediaType,
        data: item.data,
        name: item.name,
      })),
    ]
  }

  /**
   * Read one Host-computed Session projection by its open extension key.
   * @param key - Session projection key registered by the active Profile.
   * @returns current whole value, or undefined when the capability is absent.
   */
  projection(key: string): unknown {
    return this.requireActive().session.projections.faceOf(key).getSnapshot()
  }

  /**
   * Read every projection value mirrored on the current Session summary.
   * @returns sorted open-key entries; unknown future keys remain visible.
   */
  projectionEntries(): readonly (readonly [string, unknown])[] {
    return Object.entries(this.requireActive().summary.projectionValues ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
  }

  /**
   * Format durable usage, latency, throughput, and context projections without
   * assuming that every Profile mounts every projection unit.
   * @returns available statistics lines and an optional compact context label.
   */
  sessionStatistics(): TuiSessionStatistics {
    const usage = projectionRecord(this.projection('tokenUsage'))
    const stats = projectionRecord(this.projection('sessionStats'))
    const pressure = projectionRecord(this.projection('contextPressure'))
    const breakdown = projectionRecord(this.projection('contextBreakdown'))
    const lines: string[] = []

    const turns = nonnegativeNumber(stats, 'turns')
    const steps = nonnegativeNumber(stats, 'steps')
    if (turns !== undefined || steps !== undefined) {
      lines.push(ui(
        `轮次 ${turns === undefined ? '未知' : compactNumber(turns)} · 步骤 ${steps === undefined ? '未知' : compactNumber(steps)}`,
        `Turns ${turns === undefined ? 'unknown' : compactNumber(turns)} · Steps ${steps === undefined ? 'unknown' : compactNumber(steps)}`,
      ))
    }
    const llmMs = nonnegativeNumber(stats, 'llmMs')
    const toolMs = nonnegativeNumber(stats, 'toolMs')
    const durations = [
      ...(llmMs === undefined || llmMs === 0 ? [] : [ui(`模型 ${durationText(llmMs)}`, `Model ${durationText(llmMs)}`)]),
      ...(toolMs === undefined || toolMs === 0 ? [] : [ui(`工具 ${durationText(toolMs)}`, `Tools ${durationText(toolMs)}`)]),
    ]
    if (durations.length > 0) lines.push(durations.join(' · '))
    const ttftMs = nonnegativeNumber(stats, 'ttftMs')
    const ttftSteps = nonnegativeNumber(stats, 'ttftSteps')
    const decodeMs = nonnegativeNumber(stats, 'decodeMs')
    const decodeTokens = nonnegativeNumber(stats, 'decodeTokens')
    const performance = [
      ...(ttftMs === undefined || ttftSteps === undefined || ttftSteps === 0
        ? []
        : [ui(`首 Token 平均 ${durationText(ttftMs / ttftSteps)}`, `Average first token ${durationText(ttftMs / ttftSteps)}`)]),
      ...(decodeMs === undefined || decodeTokens === undefined || decodeMs === 0
        ? []
        : [`${Math.round(decodeTokens / (decodeMs / 1_000) * 10) / 10} tok/s`]),
    ]
    if (performance.length > 0) lines.push(performance.join(' · '))

    const uncached = nonnegativeNumber(usage, 'uncachedInputTokens')
    const cacheRead = nonnegativeNumber(usage, 'cacheReadTokens')
    const cacheWrite = nonnegativeNumber(usage, 'cacheWriteTokens')
    const output = nonnegativeNumber(usage, 'outputTokens')
    if (uncached !== undefined && cacheRead !== undefined && cacheWrite !== undefined && output !== undefined) {
      const input = uncached + cacheRead + cacheWrite
      const cache = input === 0 ? undefined : Math.round(cacheRead / input * 100)
      lines.push(ui(
        `Token 输入 ${compactNumber(input)} · 输出 ${compactNumber(output)}${cache === undefined ? '' : ` · 缓存命中 ${cache}%`}`,
        `Token input ${compactNumber(input)} · output ${compactNumber(output)}${cache === undefined ? '' : ` · cache hit ${cache}%`}`,
      ))
    }

    const used = nonnegativeNumber(pressure, 'projectedTokens')
      ?? nonnegativeNumber(pressure, 'pressureTokens')
    const capacity = nonnegativeNumber(pressure, 'contextWindow')
    const context = used === undefined || capacity === undefined || capacity === 0
      ? undefined
      : `${Math.min(100, Math.round(used / capacity * 100))}% · ~${compactNumber(used)}/${compactNumber(capacity)}`
    if (context !== undefined) lines.push(ui(`上下文 ${context}`, `Context ${context}`))

    const system = nonnegativeNumber(breakdown, 'systemTokens')
    const tools = nonnegativeNumber(breakdown, 'toolsTokens')
    const messages = nonnegativeNumber(breakdown, 'messageTokens')
    if (system !== undefined && tools !== undefined && messages !== undefined) {
      lines.push(ui(
        `上下文估算：系统 ~${compactNumber(system)} · 工具 ~${compactNumber(tools)} · 消息 ~${compactNumber(messages)}`,
        `Estimated context: system ~${compactNumber(system)} · tools ~${compactNumber(tools)} · messages ~${compactNumber(messages)}`,
      ))
    }
    return { lines, ...(context === undefined ? {} : { context }) }
  }

  /**
   * Read the shared Trajectory target assembled from Harness Session events.
   * @returns current Trajectory snapshot, or undefined before the target is available.
   */
  trajectory(): TrajectorySnapshot | undefined {
    return this.requireActive().session.getSnapshot().views.get('trajectory')
  }

  /**
   * Read the dynamic tool catalog recorded on the newest ordinary request.
   * @returns exact provider-bound tool schemas, or an empty list before the first request.
   */
  toolCatalog(): readonly TuiToolOption[] {
    const request = this.trajectory()?.requests.findLast(candidate => candidate.purpose === 'assistant')
    return request?.purpose === 'assistant'
      ? (request.prompt?.tools ?? []).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }))
      : []
  }

  /**
   * Read produced paths from every visible turn, grouped oldest-first.
   * @returns first-seen Workspace-relative paths per turn.
   */
  async producedFileGroups(): Promise<readonly ProducedFileGroup[]> {
    const active = this.requireActive()
    return this.managementBridge().sessionFiles.index(active.sessionId)
  }

  /**
   * Read produced paths from every visible turn, de-duplicated oldest-first.
   * @returns first-seen Workspace-relative paths, or an empty list when absent.
   */
  async producedFiles(): Promise<readonly string[]> {
    return flattenProducedFiles(await this.producedFileGroups())
  }

  /**
   * Read one produced file for in-TUI inspection.
   * @param path - Workspace-relative or absolute file path.
   * @returns UTF-8 text when the file looks like text.
   */
  async readProducedFile(path: string): Promise<string> {
    const absolute = this.producedFilePath(path)
    const file = await stat(absolute)
    if (file.size > 200_000) throw new Error(ui('文件超过 200 KB，请用外部程序打开', 'File exceeds 200 KB; open it with an external program'))
    const bytes = await readFile(absolute)
    if (bytes.includes(0)) throw new Error(ui('该文件不是可在 TUI 内查看的文本', 'This file is not text that can be viewed in the TUI'))
    return bytes.toString('utf8')
  }

  /**
   * Ask the Harness Workspace Runtime to open one produced path.
   * @param path - Workspace-relative or absolute file path selected by the user.
   */
  async openProducedFile(path: string): Promise<void> {
    const active = this.requireActive()
    await this.ctx.workspaces.openPath(resolve(active.workspacePath, path))
  }

  /**
   * Resolve one produced path using the active Harness Workspace root.
   * @param path - Workspace-relative or absolute file path.
   * @returns platform-normalized absolute path suitable for clipboard export.
   */
  producedFilePath(path: string): string {
    return resolve(this.requireActive().workspacePath, path)
  }

  /**
   * Read the current Session's Host-mirrored background Jobs.
   * @returns current immutable Job views.
   */
  jobs(): readonly JobView[] {
    const active = this.requireActive()
    return this.ctx.sessions.list.getSnapshot().jobsBySession[active.sessionId] ?? []
  }

  /**
   * Mark whether the direct-child catalog is visibly open.
   * @param parentSessionId - parent whose direct-child catalog is being shown.
   * @param open - current Surface state.
   */
  setSubagentCatalogOpen(parentSessionId: SessionId, open: boolean): void {
    this.ctx.sessions.setSubagentCatalogOpen(parentSessionId, open)
  }

  /**
   * Refresh and read the active Session's direct-child catalog.
   * @param refresh - whether to force a Host catalog read first.
   * @returns healthy and diagnostic rows with exact continuation addresses.
   */
  async subagents(refresh = false): Promise<readonly TuiSubagentOption[]> {
    const active = this.requireActive()
    if (refresh) await this.ctx.sessions.refreshSubagents(active.sessionId)
    const list = this.ctx.sessions.list.getSnapshot()
    const catalog = list.subagentsByParent[active.sessionId]
    if (catalog?.state === 'error') {
      throw new Error(ui(
        `读取子 Agent 失败：${catalog.error?.message ?? ui('未知错误', 'unknown error')}`,
        `Failed to load subagents: ${catalog.error?.message ?? ui('未知错误', 'unknown error')}`,
      ))
    }
    const now = Date.now()
    return (catalog?.entries ?? []).map((entry) => {
      const summary = list.byId[entry.id]
      const projectionValues = projectionRecord(summary?.projectionValues)
      const usage = projectionRecord(projectionValues?.tokenUsage)
      const buckets = [
        nonnegativeNumber(usage, 'uncachedInputTokens'),
        nonnegativeNumber(usage, 'outputTokens'),
        nonnegativeNumber(usage, 'cacheReadTokens'),
        nonnegativeNumber(usage, 'cacheWriteTokens'),
      ]
      const completeBuckets = buckets.filter((value): value is number => value !== undefined)
      const totalTokens = completeBuckets.length === buckets.length
        ? completeBuckets.reduce((total, value) => total + value, 0)
        : undefined
      const timing = projectionRecord(projectionValues?.subagentTiming)
      const settled = nonnegativeNumber(timing, 'settledMs')
      const activeTiming = projectionRecord(timing?.active)
      const since = nonnegativeNumber(activeTiming, 'since')
      const through = nonnegativeNumber(activeTiming, 'through')
      const durationMs = settled === undefined
        ? undefined
        : settled + (since === undefined
          ? 0
          : Math.max(0, (entry.kind === 'child' && entry.activity === 'running' ? now : through ?? now) - since))
      return {
        entry,
        ...(entry.kind === 'child'
          ? {
            address: {
              parentSessionId: active.sessionId,
              childSessionId: entry.id,
              mode: entry.mode,
            },
          }
          : {}),
        ...(totalTokens === undefined ? {} : { totalTokens }),
        ...(durationMs === undefined ? {} : { durationMs }),
      }
    })
  }

  /**
   * Open one catalog-derived child without activating an unrelated Agent.
   * @param address - exact durable direct-parent address.
   */
  openSubagent(address: SubagentAddress): void {
    this.ctx.sessions.openSubagent(address)
  }

  /**
   * Read user-invocable Skills for the active Session project.
   * @returns authoritative Skill catalog.
   */
  async skills(): Promise<readonly SkillEntry[]> {
    const response = await this.api.skills.list({ sessionId: this.requireActive().sessionId })
    if (!response.result.ok) {
      throw new Error(ui(`读取 Skill 失败：${response.result.error.message}`, `Failed to load Skills: ${response.result.error.message}`))
    }
    return response.result.value.skills
  }

  /**
   * Read current live Loader entries through the generated pluginInventory Remote.
   * @returns Host-owned inventory rows.
   */
  async pluginInventory(): Promise<readonly {
    readonly entryId: string
    readonly moduleName: string
    readonly enabled: boolean
    readonly fiberPhase: string | null
  }[]> {
    const carried = await this.ctx.remote.pluginInventory.list()
    if (!carried.ok) {
      throw new Error(ui(`读取插件运行状态失败：${carried.error.message}`, `Failed to load plugin runtime state: ${carried.error.message}`))
    }
    return carried.value.entries
  }

  /**
   * Read persisted feedback beside every eligible loaded Assistant message.
   * @returns newest-first targets with their current CAS item when present.
   */
  async feedbackTargets(): Promise<readonly TuiFeedbackTarget[]> {
    const active = this.requireActive()
    const carried = await this.ctx.remote.messageFeedback.list({ sessionId: active.sessionId })
    if (!carried.ok) {
      throw new Error(ui(`读取反馈失败：${carried.error.message}`, `Failed to load feedback: ${carried.error.message}`))
    }
    if (!carried.value.ok) {
      throw new Error(ui(`读取反馈失败：${carried.value.error.code}`, `Failed to load feedback: ${carried.value.error.code}`))
    }
    const items = carried.value.value.items as readonly MessageFeedbackItem[]
    const feedback = new Map(items.map(item => [item.messageId, item]))
    return active.session.getSnapshot().nodes.flatMap<TuiFeedbackTarget>((node) => {
      if (node.kind !== 'assistant' || node.messageId === undefined) return []
      const text = assistantText(node)
      const item = feedback.get(node.messageId)
      const target: TuiFeedbackTarget = {
        message: node,
        preview: text.replace(/\s+/gu, ' ').slice(0, 160) || ui('[无文本回复]', '[no text response]'),
        ...(item === undefined ? {} : { feedback: item }),
      }
      return [target]
    }).reverse()
  }

  /**
   * Create or replace one message-feedback item using its observed CAS version.
   * @param messageId - persisted Assistant message identity.
   * @param rating - desired positive or negative judgment.
   * @param note - optional non-blank human explanation.
   * @param ifVersion - observed feedback revision, or null for first creation.
   * @returns committed authoritative feedback item.
   */
  async putFeedback(
    messageId: NonNullable<AssistantMessageNode['messageId']>,
    rating: MessageFeedbackRating,
    note: string | undefined,
    ifVersion: MessageFeedbackVersion | null,
  ): Promise<MessageFeedbackItem> {
    const carried = await this.ctx.remote.messageFeedback.put({
      sessionId: this.requireActive().sessionId,
      messageId,
      rating,
      ...(note === undefined ? {} : { note }),
      ifVersion,
    })
    if (!carried.ok) {
      throw new Error(ui(`提交反馈失败：${carried.error.message}`, `Failed to submit feedback: ${carried.error.message}`))
    }
    if (!carried.value.ok) {
      throw new Error(ui(`提交反馈失败：${carried.value.error.code}`, `Failed to submit feedback: ${carried.value.error.code}`))
    }
    return carried.value.value
  }

  /**
   * Remove one observed message-feedback item.
   * @param messageId - persisted Assistant message identity.
   * @param ifVersion - observed feedback revision.
   */
  async clearFeedback(
    messageId: NonNullable<AssistantMessageNode['messageId']>,
    ifVersion: MessageFeedbackVersion,
  ): Promise<void> {
    const carried = await this.ctx.remote.messageFeedback.delete({
      sessionId: this.requireActive().sessionId,
      messageId,
      ifVersion,
    })
    if (!carried.ok) {
      throw new Error(ui(`删除反馈失败：${carried.error.message}`, `Failed to delete feedback: ${carried.error.message}`))
    }
    if (!carried.value.ok) {
      throw new Error(ui(`删除反馈失败：${carried.value.error.code}`, `Failed to delete feedback: ${carried.value.error.code}`))
    }
  }

  /**
   * Read the newest durable Assistant response as plain visible text.
   * @returns response text, or undefined when no eligible response is loaded.
   */
  lastAssistantText(): string | undefined {
    const node = this.requireActive().session.getSnapshot().nodes.findLast(
      candidate => candidate.kind === 'assistant',
    )
    if (node?.kind !== 'assistant') return undefined
    const text = assistantText(node)
    return text === '' ? undefined : text
  }

  /**
   * Read every loaded Assistant reply as copy-picker rows, newest first.
   * @returns visible assistant texts with stable ids.
   */
  assistantCopyTargets(): readonly { readonly id: string; readonly preview: string; readonly text: string }[] {
    const entries = this.requireActive().session.getSnapshot().nodes.flatMap((node) => {
      if (node.kind !== 'assistant') return []
      const text = assistantText(node)
      return text === '' ? [] : [{ id: String(node.seq), text }]
    })
    return copyTargets(entries)
  }

  /**
   * Stream the Host's native Session-log ZIP into one exclusive destination.
   * @param requestedPath - absolute or Workspace-relative destination.
   * @param includeDescendants - whether the Host includes subagent Session artifacts.
   * @returns saved path, byte count, media type, and scope.
   */
  async exportSession(
    requestedPath?: string,
    includeDescendants = false,
    signal?: AbortSignal,
  ): Promise<TuiExportResult> {
    const active = this.requireActive()
    const payload = await this.managementBridge().sessionExport.download(
      active.sessionId,
      includeDescendants,
      signal,
    )
    const path = resolve(active.workspacePath, requestedPath ?? payload.suggestedFilename)
    const bytes = await saveExport(path, payload.stream)
    return { path, bytes, mediaType: payload.mediaType, includeDescendants }
  }

  /**
   * Write Host Session-log Markdown beside the workspace.
   * @param requestedPath - absolute or Workspace-relative destination.
   * @returns saved path, byte count, and Markdown media type.
   */
  async exportMarkdown(requestedPath?: string, signal?: AbortSignal): Promise<TuiExportResult> {
    const active = this.requireActive()
    const payload = await this.managementBridge().sessionExport.markdown(active.sessionId, signal)
    const path = resolve(
      active.workspacePath,
      requestedPath ?? payload.suggestedFilename ?? markdownExportName(active.summary.displayTitle),
    )
    const bytes = await saveExport(path, payload.stream)
    return { path, bytes, mediaType: payload.mediaType, includeDescendants: false }
  }

  /**
   * Apply one queue action through the current Session face.
   * @param itemId - authoritative queue item identifier.
   * @param action - official Session queue mutation.
   */
  async updateQueue(
    itemId: ConversationSnapshot['queue'][number]['id'],
    action: Parameters<SessionFace['updateQueue']>[1],
  ): Promise<void> {
    const result = await this.requireActive().session.updateQueue(itemId, action)
    if (!result.ok) {
      throw new Error(ui(`队列操作失败：${result.error.message}`, `Queue operation failed: ${result.error.message}`))
    }
  }

  /**
   * Answer a Runtime-owned approval wait with the Host protocol's correlated value.
   * @param wait - correlated Runtime approval interaction.
   * @param outcome - Host-supported one-shot allow or rejection.
   */
  async answerApproval(wait: PendingWait<'approval'>, outcome: 'allowed-once' | 'rejected'): Promise<void> {
    const receipt = await wait.respond({
      ok: true,
      value: { sessionId: wait.sessionId, approvalId: wait.payload.approvalId, outcome },
    })
    if (!receipt.accepted) {
      throw new Error(ui(`审批响应被拒绝：${receipt.reason}`, `Approval response was rejected: ${receipt.reason}`))
    }
  }

  /**
   * Answer a Runtime-owned question wait with a complete structured batch.
   * @param wait - correlated Runtime question interaction.
   * @param answer - complete structured answer batch.
   */
  async answerQuestion(wait: PendingWait<'question'>, answer: QuestionResponsePayload['answer']): Promise<void> {
    const receipt = await wait.respond({ ok: true, value: { sessionId: wait.sessionId, answer } })
    if (!receipt.accepted) {
      throw new Error(ui(`问题响应被拒绝：${receipt.reason}`, `Question response was rejected: ${receipt.reason}`))
    }
  }

  /**
   * Cancel a Runtime-owned question wait through its official error envelope.
   * @param wait - correlated Runtime question interaction.
   */
  async cancelQuestion(wait: PendingWait<'question'>): Promise<void> {
    const receipt = await wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user cancelled this question request', details: {} },
    })
    if (!receipt.accepted) {
      throw new Error(ui(`取消问题被拒绝：${receipt.reason}`, `Question cancellation was rejected: ${receipt.reason}`))
    }
  }

  /**
   * Narrow a generic pending interaction after a discriminant check.
   * @param wait - generic Runtime pending interaction.
   * @returns the approval wait when the discriminant matches.
   */
  static approval(wait: PendingInteraction): PendingWait<'approval'> | undefined {
    return wait.kind === 'approval' ? wait : undefined
  }

  /**
   * Narrow a generic pending interaction after a discriminant check.
   * @param wait - generic Runtime pending interaction.
   * @returns the question wait when the discriminant matches.
   */
  static question(wait: PendingInteraction): PendingWait<'question'> | undefined {
    return wait.kind === 'question' ? wait : undefined
  }

  private requireActive(): TuiActiveSession {
    const active = this.active()
    if (active === undefined) throw new Error(ui('当前没有打开的会话', 'No session is open'))
    return active
  }

  private permissionValue(session: SessionFace): PermissionSelectValue | undefined {
    const value = session.projections.faceOf('permissions').getSnapshot()
    return isPermissionSelect(value) ? value : undefined
  }

  private invalidateModels(): void {
    this.modelGeneration += 1
    this.modelCatalogs.clear()
    this.modelLoads.clear()
  }

  private async readCommandCatalog(
    sessionId: SessionId,
  ): Promise<readonly TuiCommandCandidate[]> {
    const isSubagent = this.ctx.sessions.subagentAddress(sessionId) !== undefined
    const [hostResult, skillResponse] = await Promise.all([
      isSubagent
        ? Promise.resolve({ ok: true as const, value: [] as readonly HostCommandDescriptor[] })
        : this.ctx.remote.commands.list(sessionId),
      isSubagent
        ? Promise.resolve(undefined)
        : this.api.skills.list({ sessionId }),
    ])
    if (!hostResult.ok) {
      throw new Error(ui(`读取 Host 命令失败：${hostResult.error.message}`, `Failed to load Host commands: ${hostResult.error.message}`))
    }
    if (skillResponse !== undefined && !skillResponse.result.ok) {
      throw new Error(ui(
        `读取 Skill 失败：${skillResponse.result.error.message}`,
        `Failed to load Skills: ${skillResponse.result.error.message}`,
      ))
    }
    const commands = tuiCommands()
    const reserved = reservedTuiCatalogNames()
    const merged = [...commands]
    const names = new Set(reserved)
    for (const command of hostResult.value as readonly HostCommandDescriptor[]) {
      if (reserved.has(command.name)) continue
      names.add(command.name)
      merged.push({
        name: command.name,
        description: (() => {
          const named = HOST_COMMAND_FUNCTIONS.get(command.name)
          return named === undefined
            ? shortFunctionDescription(command.description, ui('执行命令', 'Run command'))
            : ui(named.zh, named.en)
        })(),
        ...(command.input === undefined
          ? {}
          : {
            argumentHint: (() => {
              const named = HOST_COMMAND_ARGUMENT_HINTS.get(command.name)
              return named === undefined ? command.input.hint : ui(named.zh, named.en)
            })(),
          }),
        source: HOST_COMMAND_DECORATORS.has(command.name) ? 'Host + TUI' : 'Host',
        behavior: HOST_COMMAND_DECORATORS.has(command.name) ? 'local' : 'host',
      })
    }
    const skills: readonly SkillEntry[] = skillResponse?.result.ok === true
      ? skillResponse.result.value.skills
      : []
    for (const skill of skills) {
      if (names.has(skill.name)) continue
      names.add(skill.name)
      merged.push({
        name: skill.name,
        description: shortFunctionDescription(skill.description, ui('按名称执行对应能力', 'Invoke the named capability')),
        source: 'Skill',
        behavior: 'skill',
      })
    }
    return merged
  }
}

/**
 * Convert unknown failures at Surface boundaries without losing Host text.
 * @param error - unknown failure crossing into terminal presentation.
 * @returns a safe user-facing failure message.
 */
export function capabilityError(error: unknown): string {
  if (error instanceof TuiSettingsConflictError) {
    return ui(
      `设置 ${JSON.stringify(error.namespace)} 已在其他界面更新（期望 revision ${String(error.expected)}，当前 ${String(error.actual)}）`,
      `Settings ${JSON.stringify(error.namespace)} was updated in another surface (expected revision ${String(error.expected)}, actual ${String(error.actual)})`,
    )
  }
  return explainFailure(messageOf(error))
}
