/** Sparse Grok Build-style chrome with DeepSeek semantic colors. */

import {
  CURSOR_MARKER,
  Editor,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from '@mariozechner/pi-tui'
import type { TuiHeaderFacts } from './capabilities.ts'
import { formatElapsed } from './elapsed.ts'
import { translateUiText, ui } from './locale.ts'
import { color, editorTheme } from './theme.ts'

function fit(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width), '…')
}

function padded(text: string, width: number): string {
  const clipped = fit(text, width)
  return `${clipped}${' '.repeat(Math.max(0, width - visibleWidth(clipped)))}`
}

function columns(left: string, right: string | undefined, width: number): string {
  if (right === undefined || right === '') return fit(left, width)
  const gap = width - visibleWidth(left) - visibleWidth(right)
  if (gap >= 1) return `${left}${' '.repeat(gap)}${right}`
  const leftWidth = width - visibleWidth(right) - 1
  if (leftWidth >= 8) return `${fit(left, leftWidth)} ${right}`
  return fit(right, width)
}

function gutter(width: number): { readonly prefix: string; readonly innerWidth: number } {
  const cells = width >= 12 ? 2 : 0
  return { prefix: ' '.repeat(cells), innerWidth: Math.max(1, width - cells * 2) }
}

function modeLabel(value: string): string {
  switch (value) {
    case 'standard': return ui('标准', 'Standard')
    case 'code': return 'PTC'
    case 'minimal': return ui('极简', 'Minimal')
    case 'cordis': return ui('创造', 'Create')
    default: return value
  }
}

function modelLabel(value: string): string {
  const [rawRoute = value, effort] = value.split(' · ', 2)
  const providerless = rawRoute.startsWith('deepseek-official/')
    ? rawRoute.slice('deepseek-official/'.length)
    : rawRoute
  const route = providerless.startsWith('deepseek-') ? providerless.slice('deepseek-'.length) : providerless
  const reasoningLabel = effort === undefined
    ? ''
    : ({
      low: ui('低', 'Low'),
      medium: ui('中', 'Medium'),
      high: ui('高', 'High'),
      xhigh: ui('极高', 'Extra high'),
      max: ui('最大', 'Maximum'),
      ultra: ui('极致', 'Ultra'),
    }[effort] ?? effort)
  const reasoning = effort === undefined ? '' : ui(` · ${reasoningLabel}推理`, ` · ${reasoningLabel} reasoning`)
  return `${route}${reasoning}`
}

function permissionLabel(value: string): string {
  switch (value) {
    case 'read-only': return ui('只读', 'Read only')
    case 'workspace-write': return ui('工作区', 'Workspace')
    case 'danger-full-access': return ui('完全访问', 'Full access')
    case 'custom': return ui('自定义', 'Custom')
    default: return value
  }
}

function horizontalRule(
  label: string,
  width: number,
  paint: (text: string) => string,
): string {
  if (width <= 1) return paint('─'.repeat(Math.max(1, width)))
  const labelWidth = Math.max(0, width - 2)
  const safeLabel = labelWidth === 0 ? '' : truncateToWidth(label, labelWidth, '…')
  const suffix = safeLabel === '' ? '' : ` ${safeLabel}`
  return paint(`${'─'.repeat(Math.max(1, width - visibleWidth(suffix)))}${suffix}`)
}

function compactFacts(label: string, width: number): string {
  if (width <= 0) return ''
  const parts = label.split(' · ')
  const candidates = [label]
  const model = parts[0] ?? label
  const mode = parts.at(-1) ?? label
  candidates.push([model, mode].join(' · '), mode)
  return candidates.find(candidate => visibleWidth(candidate) <= width)
    ?? truncateToWidth(mode, width, '…')
}

function isHorizontalRule(line: string): boolean {
  const plain = line.replace(/\u001B\[[0-9;:]*m/gu, '')
  return /^(?:─+|─── [↑↓] \d+ more ─*)$/u.test(plain)
}

function isBlankMultiline(text: string): boolean {
  return /[\r\n]/u.test(text) && text.trim() === ''
}

/**
 * Keep the composer and shortcut row visible while the editor or autocomplete grows.
 *
 * @param terminalRows - Total rows currently available in the terminal.
 * @param editorRows - Rows occupied by the framed editor and autocomplete list.
 * @returns Rows that remain available for the transcript viewport.
 */
export function transcriptViewportRows(terminalRows: number, editorRows: number): number {
  // Context (1) + top/bottom breathing room (2) + permission status (1).
  return Math.max(1, terminalRows - 4 - editorRows)
}

/** Full-height chat layout whose composer and status remain at the viewport bottom. */
export class BottomAnchoredLayout implements Component {
  /**
   * @param viewportRows - current terminal height in rows.
   * @param context - one-row execution context.
   * @param transcript - conversation content that grows into terminal scrollback.
   * @param composer - prompt editor and its autocomplete rows.
   * @param status - one-row permission and runtime status.
   * @param centerTranscript - whether spare conversation rows surround the transcript.
   */
  constructor(
    private readonly viewportRows: () => number,
    private readonly context: Component,
    private readonly transcript: Component,
    private readonly composer: Component,
    private readonly status: Component,
    private readonly centerTranscript: () => boolean = () => false,
  ) {}

  invalidate(): void {
    this.context.invalidate()
    this.transcript.invalidate()
    this.composer.invalidate()
    this.status.invalidate()
  }

  /**
   * Give unused viewport rows to the conversation area above the composer.
   * @param width - current terminal width in character cells.
   * @returns a full viewport or the complete longer conversation.
   */
  render(width: number): string[] {
    const contextRows = this.context.render(width)
    const transcriptRows = this.transcript.render(width)
    const composerRows = this.composer.render(width)
    const statusRows = this.status.render(width)
    const naturalRows = contextRows.length + transcriptRows.length
      + composerRows.length + statusRows.length + 2
    const requestedRows = Math.floor(this.viewportRows())
    const minimumRows = Number.isFinite(requestedRows)
      ? Math.max(1, requestedRows)
      : naturalRows
    const flexibleRows = Math.max(0, minimumRows - naturalRows)
    const flexibleBefore = this.centerTranscript()
      ? Math.floor(flexibleRows / 2)
      : 0
    const flexibleAfter = flexibleRows - flexibleBefore
    return [
      ...contextRows,
      '',
      ...Array.from({ length: flexibleBefore }, () => ''),
      ...transcriptRows,
      ...Array.from({ length: flexibleAfter }, () => ''),
      '',
      ...composerRows,
      ...statusRows,
    ]
  }
}

/** One quiet context row containing only live execution state on the right. */
export class ContextBar implements Component {
  private state:
    | { readonly kind: 'loading' | 'empty'; readonly profile: string; readonly workspace: string }
    | { readonly kind: 'facts'; readonly facts: TuiHeaderFacts }
    | { readonly kind: 'error'; readonly profile: string; readonly workspace: string; readonly message: string }

  constructor(profile: string, workspace: string) {
    this.state = { kind: 'loading', profile, workspace }
  }

  /**
   * Show the current Harness Session in the context row.
   * @param facts - Current Session facts projected from Harness capabilities.
   */
  setFacts(facts: TuiHeaderFacts): void { this.state = { kind: 'facts', facts } }

  /**
   * Show a connected workspace without an active Session.
   * @param profile - Connected Profile.
   * @param workspace - Current working directory.
   */
  setEmpty(profile: string, workspace: string): void {
    this.state = { kind: 'empty', profile, workspace }
  }

  /**
   * Show a failed Harness connection without expanding the top row.
   * @param profile - Failed Profile.
   * @param message - Safe failure summary.
   */
  setError(profile: string, message: string): void {
    const workspace = this.state.kind === 'facts' ? this.state.facts.workspace : this.state.workspace
    this.state = { kind: 'error', profile, workspace, message }
  }

  invalidate(): void { /* presentation is derived directly from state */ }

  render(width: number): string[] {
    const { prefix, innerWidth } = gutter(width)
    if (this.state.kind === 'facts') {
      const facts = this.state.facts
      const context = facts.context?.split(' · ', 1)[0]
      const elapsed = facts.running && facts.statusElapsed !== false && facts.runningSince !== undefined
        ? ` ${formatElapsed(Date.now() - facts.runningSince)}`
        : ''
      const runtime = facts.running
        ? color.accent(`${ui('● 生成中', '● Generating')}${elapsed}${ui(' · Ctrl+C 停止', ' · Ctrl+C to stop')}`)
        : color.muted(ui('就绪', 'Ready'))
      const right = context === undefined ? runtime : `${color.muted(context)} · ${runtime}`
      return [`${prefix}${columns('', right, innerWidth)}`]
    }
    const state = this.state.kind === 'error'
      ? color.danger(translateUiText(this.state.message))
      : color.muted(this.state.kind === 'loading'
        ? ui('正在连接 Harness…', 'Connecting to Harness…')
        : ui('未打开会话', 'No session open'))
    return [`${prefix}${columns('', state, innerWidth)}`]
  }
}

/** One stable permission row; high-signal runtime facts share its right side. */
export class StatusBar implements Component {
  private permission = 'workspace-write'
  private detail: string | undefined

  /**
   * Show the current permission projected by Harness.
   * @param permission - Current permission preset id.
   */
  setPermission(permission: string): void { this.permission = permission }

  /**
   * Replace the optional runtime fact or notice on the right.
   * @param detail - High-signal state; absent while idle.
   */
  setDetail(detail?: string): void { this.detail = detail }

  invalidate(): void { /* presentation is derived directly from state */ }

  render(width: number): string[] {
    const { prefix, innerWidth } = gutter(width)
    const label = ui(
      `使用权限：${permissionLabel(this.permission)}`,
      `Permission: ${permissionLabel(this.permission)}`,
    )
    const permission = `${color.brand('▸▸')} ${
      this.permission === 'danger-full-access'
        ? color.danger(label)
        : this.permission === 'read-only' ? color.muted(label) : color.accent(label)
    }`
    if (this.detail === undefined || innerWidth - visibleWidth(permission) - visibleWidth(this.detail) < 1) {
      return [`${prefix}${fit(permission, innerWidth)}`]
    }
    return [`${prefix}${columns(permission, this.detail, innerWidth)}`]
  }
}

/** Open Grok-style composer with live model facts aligned to its lower rule. */
export class PromptEditor extends Editor {
  private facts: TuiHeaderFacts | undefined

  constructor(tui: TUI) {
    super(tui, editorTheme, { paddingX: 3, autocompleteMaxVisible: 6 })
  }

  /**
   * Embed current Harness Session facts in the composer's lower rule.
   * @param facts - Current authoritative Session facts.
   */
  setFacts(facts: TuiHeaderFacts): void {
    this.facts = facts
  }

  /** Return the composer to its connected blank-session facts. */
  setEmpty(): void {
    this.facts = undefined
  }

  override setText(text: string): void {
    super.setText(isBlankMultiline(text) ? '' : text)
  }

  override handleInput(data: string): void {
    super.handleInput(data)
    const text = this.getText()
    if (isBlankMultiline(text)) super.setText('')
  }

  override render(width: number): string[] {
    this.borderColor = this.focused ? color.brand : color.border
    if (width < 8) return super.render(width)
    const { prefix, innerWidth: frameWidth } = gutter(width)
    const lines = super.render(frameWidth)
    const lowerRule = lines.findIndex((line, index) => index > 0 && isHorizontalRule(line))
    const split = lowerRule < 0 ? lines.length - 1 : lowerRule
    const editorRows = lines.slice(1, split)
    const autocompleteRows = lines.slice(split + 1)

    if (this.getText() === '' && !this.isShowingAutocomplete() && editorRows.length > 0) {
      const cursor = this.focused ? `${CURSOR_MARKER}\u001B[7m \u001B[0m` : ''
      editorRows[0] = padded(
        `${color.brand('❯')} ${cursor}${color.muted(ui('输入消息，/ 打开命令', 'Enter a message; / opens commands'))}`,
        frameWidth,
      )
    } else if (editorRows.length > 0) {
      editorRows[0] = `${color.brand('❯')} ${editorRows[0]?.slice(2) ?? ''}`
    }

    const body = [...editorRows, ...autocompleteRows].map(row => padded(row, frameWidth))
    const facts = this.facts === undefined
      ? ui('deepseek · 标准', 'deepseek · Standard')
      : [
        this.facts.model === '' ? undefined : modelLabel(this.facts.model),
        modeLabel(this.facts.mode),
      ].filter((value): value is string => value !== undefined).join(' · ')
    const compactedFacts = compactFacts(facts, Math.max(0, frameWidth - 2))
    return [
      horizontalRule('', frameWidth, this.borderColor),
      ...body,
      horizontalRule(compactedFacts, frameWidth, this.borderColor),
    ].map(line => `${prefix}${line}`)
  }
}
