/** FIFO modal overlays built only from public pi-tui components. */

import {
  CURSOR_MARKER,
  Editor,
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  SelectList,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type OverlayHandle,
  type OverlayOptions,
  type SelectItem,
  type TUI,
} from '@mariozechner/pi-tui'
import { translateUiText, ui } from './locale.ts'
import { formatBusyFooter, lastOutputLines } from './busy-status.ts'
import { background, color, editorTheme, escapeTerminalText, surfaceRow } from './theme.ts'
import type { TuiDangerConfirmDefault } from '@deepseek-ai/dsh-tui-protocol'
import type { HitRegion } from './mouse-hit-map.ts'

let dangerConfirmDefault: TuiDangerConfirmDefault = 'cancel'

/**
 * Apply the Settings-owned default focus for dangerous confirmations.
 * @param value - cancel keeps Enter from executing the action.
 */
export function setDangerConfirmDefault(value: TuiDangerConfirmDefault): void {
  dangerConfirmDefault = value
}

/**
 * Ordered confirm choices with the configured default already selected.
 * @param confirmLabel - affirmative action label.
 */
export function dangerConfirmChoices(confirmLabel: string): {
  readonly choices: readonly OverlayChoice[]
  readonly initialChoiceId: TuiDangerConfirmDefault
} {
  const confirm: OverlayChoice = {
    id: 'confirm',
    label: confirmLabel,
    description: ui('我已理解上述影响', 'I understand the impact'),
  }
  const cancel: OverlayChoice = {
    id: 'cancel',
    label: ui('取消', 'Cancel'),
    description: ui('保持当前状态', 'Keep current state'),
  }
  return {
    choices: dangerConfirmDefault === 'cancel' ? [cancel, confirm] : [confirm, cancel],
    initialChoiceId: dangerConfirmDefault,
  }
}

/** One row in a searchable terminal selector. */
export interface OverlayChoice {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly active?: boolean
  readonly disabledReason?: string
}

/** Searchable selector request. */
export interface SelectOverlayRequest {
  readonly title: string
  readonly detail?: string
  readonly choices: readonly OverlayChoice[]
  readonly initialChoiceId?: string
  readonly footer?: string
  readonly searchable?: boolean
  readonly maxVisible?: number
  readonly options?: OverlayOptions
  /** When set, Escape runs this instead of Back/close so a child page can open. */
  readonly onEscape?: () => void | Promise<void>
  /** When true, Enter with no selection stays open and shows a localized notice. */
  readonly requireSelection?: boolean
  /** Mouse never executes danger/permission confirmations; Enter remains required. */
  readonly mouseExecute?: 'activate' | 'focus-only'
}

/** Text input request. */
export interface InputOverlayRequest {
  readonly title: string
  readonly detail?: string
  readonly initialValue?: string
  readonly placeholder?: string
  readonly footer?: string
  readonly options?: OverlayOptions
  /** When set, Escape runs this instead of Back/close so a child page can open. */
  readonly onEscape?: () => void | Promise<void>
  /** When true, blank Enter stays open and shows a localized notice. */
  readonly requireText?: boolean
}

/** Scrollable read-only detail request. */
export interface DetailOverlayRequest {
  readonly title: string
  readonly content: string
  readonly footer?: string
  readonly maxVisible?: number
  readonly options?: OverlayOptions
}

/** Live progress for a long Host operation; Escape aborts the session signal. */
export interface ProgressOverlayRequest<T> {
  readonly title: string
  readonly detail?: string
  readonly options?: OverlayOptions
  work(report: (chunk: string) => void, signal: AbortSignal): Promise<T>
}

/** Value-only validation result for a write-only secret transaction. */
export type SecretValidationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string }

/** Safe result returned by the Harness-owned write step. */
export type SecretTransactionWorkResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

/** One prompt -> visible busy page -> success/retry transaction. */
export interface SecretTransactionRequest<T> {
  readonly input: InputOverlayRequest
  readonly busyTitle: string
  readonly busyDetail?: string
  readonly failureMessage: string
  validate(raw: string): SecretValidationResult
  work(value: string, signal: AbortSignal): Promise<SecretTransactionWorkResult<T>>
}

/** Shared prompt surface implemented by both standalone and navigated overlays. */
export interface OverlayPrompts {
  select(request: SelectOverlayRequest): Promise<OverlayChoice | undefined>
  input(request: InputOverlayRequest): Promise<string | undefined>
  multilineInput(request: InputOverlayRequest): Promise<string | undefined>
  secretInput(request: InputOverlayRequest): Promise<string | undefined>
  secretTransaction<T>(request: SecretTransactionRequest<T>): Promise<T | undefined>
  multiSelect(request: SelectOverlayRequest): Promise<readonly OverlayChoice[] | undefined>
  detail(request: DetailOverlayRequest): Promise<void>
  confirm(title: string, detail: string, confirmLabel?: string): Promise<boolean>
  progress<T>(request: ProgressOverlayRequest<T>): Promise<T | undefined>
}

/** One logical overlay session whose page stack owns all back navigation. */
export interface OverlayNavigation<TResult = void> extends OverlayPrompts {
  readonly signal: AbortSignal
  selectPage(
    request: SelectOverlayRequest,
    onSelect: (choice: OverlayChoice) => void | Promise<void>,
  ): Promise<void>
  replaceSelectPage(
    request: SelectOverlayRequest,
    onSelect: (choice: OverlayChoice) => void | Promise<void>,
  ): void
  updateChoices(choices: readonly OverlayChoice[], notice?: string): void
  back(): void
  finish(value?: TResult): void
}

interface QueueEntry<T> {
  readonly create: (
    settle: (value: T | undefined) => void,
    reject: (error: unknown) => void,
  ) => Component
  readonly options: OverlayOptions
  readonly resolve: (value: T | undefined) => void
  readonly reject: (error: unknown) => void
  settled: boolean
  handle?: OverlayHandle
  component?: Component
}

interface DisposableComponent extends Component {
  dispose?(): void
}

interface NavigationEntry {
  component: DisposableComponent
  readonly dismiss: () => void
  busy: boolean
  abortOnEscape?: boolean
  active: boolean
  escapeHandler?: (() => void | Promise<void>) | undefined
}

function rowOf(choice: OverlayChoice, descriptionWidth: number): SelectItem {
  const state = choice.active === true ? '● ' : choice.disabledReason === undefined ? '  ' : '× '
  const description = choice.disabledReason ?? choice.description
  return {
    value: choice.id,
    label: escapeTerminalText(`${state}${translateUiText(choice.label)}`),
    ...description === undefined
      ? {}
      : { description: truncateToWidth(escapeTerminalText(translateUiText(description)), descriptionWidth, '…') },
  }
}

function escapeFrame(lines: readonly string[]): string[] {
  return lines.map(line => line.split(CURSOR_MARKER).map(escapeTerminalText).join(CURSOR_MARKER))
}

function frameContentWidth(width: number): number {
  return Math.max(1, width - 4)
}

function selectDescriptionWidth(width: number): number {
  // pi-tui reserves a 32-cell primary column, a two-cell prefix, and two
  // safety cells. Pre-truncate to the actual remainder so its final pass
  // keeps our explicit ellipsis instead of cutting a word silently.
  return Math.max(1, Math.min(60, width - 36))
}

function modalRule(title: string | undefined, width: number, top: boolean): string {
  const start = top ? '╭' : '╰'
  const end = top ? '╮' : '╯'
  if (!top || title === undefined || width < 8) {
    return color.border(`${start}${'─'.repeat(Math.max(0, width - 2))}${end}`)
  }
  const label = truncateToWidth(escapeTerminalText(title), Math.max(1, width - 7), '…')
  const lead = `─ ${label} `
  return color.border(`${start}${lead}${'─'.repeat(Math.max(0, width - 2 - visibleWidth(lead)))}${end}`)
}

function modalFrame(title: string, lines: readonly string[], width: number): string[] {
  const contentWidth = frameContentWidth(width)
  const vertical = color.border('│')
  const content = escapeFrame(lines.map(line => truncateToWidth(line, contentWidth, '…')))
    .map(line => `${vertical} ${line}${' '.repeat(Math.max(0, contentWidth - visibleWidth(line)))} ${vertical}`)
  return [modalRule(translateUiText(title), width, true), ...content, modalRule(undefined, width, false)]
    .map(line => surfaceRow(line, width))
}

function modalOptions(options: OverlayOptions | undefined): OverlayOptions {
  return {
    width: '80%',
    minWidth: 44,
    maxHeight: '80%',
    anchor: 'center',
    margin: 1,
    ...options,
  }
}

function selectVisibleWindow(length: number, selected: number, maxVisible: number): { start: number; end: number } {
  if (length <= 0) return { start: 0, end: 0 }
  const start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), length - maxVisible))
  return { start, end: Math.min(start + maxVisible, length) }
}

export type OverlayMouseClickResult = 'focused' | 'activated' | 'danger' | 'none'

interface OverlayMouseTarget {
  hitChildren(): readonly HitRegion[]
  handleHover(optionId?: string): boolean
  handleOptionClick(optionId: string): OverlayMouseClickResult
  activateArmedOption(): OverlayMouseClickResult
}

interface OverlayWheelTarget {
  handleWheel(lines: number): boolean
}

function isOverlayMouseTarget(value: Component): value is Component & OverlayMouseTarget {
  return 'hitChildren' in value && 'handleHover' in value
    && 'handleOptionClick' in value && 'activateArmedOption' in value
}

function isOverlayWheelTarget(value: Component): value is Component & OverlayWheelTarget {
  return 'handleWheel' in value && typeof value.handleWheel === 'function'
}

function moveListByWheel(list: SelectList, length: number, lines: number): boolean {
  const delta = Math.trunc(lines)
  if (delta === 0 || length <= 0) return false
  const steps = Math.min(12, Math.abs(delta))
  const next = list.getSelectedIndex() - Math.sign(delta) * steps
  list.setSelectedIndex(Math.max(0, Math.min(length - 1, next)))
  return true
}

const MULTILINE_VISIBLE_ROWS = 12

/**
 * Keep the cursor row inside a bounded multiline editor window.
 * @param lines - rendered editor rows.
 * @param cursorLine - 0-based cursor row in that array.
 * @param maxVisible - maximum rows to keep on screen.
 */
export function visibleEditorWindow(
  lines: readonly string[],
  cursorLine: number,
  maxVisible = MULTILINE_VISIBLE_ROWS,
): readonly string[] {
  if (lines.length <= maxVisible) return lines
  const cursor = Math.max(0, Math.min(cursorLine, lines.length - 1))
  const maxStart = lines.length - maxVisible
  const start = Math.max(0, Math.min(cursor - Math.floor((maxVisible - 1) / 2), maxStart))
  return lines.slice(start, start + maxVisible)
}

function wrappedDetail(detail: string, width: number, maxLines = 4): string[] {
  const lines = wrapTextWithAnsi(escapeTerminalText(translateUiText(detail)), Math.max(1, width))
  if (lines.length <= maxLines) return lines.map(line => color.muted(line))
  const visible = lines.slice(0, maxLines)
  const last = visible.at(-1) ?? ''
  visible[visible.length - 1] = truncateToWidth(`${last} …`, width, '…')
  return visible.map(line => color.muted(line))
}

/** Search input plus SelectList; the owning navigator handles Escape and abort. */
class SearchSelectOverlay implements Component {
  focused = false
  private readonly input = new Input()
  private list: SelectList
  private filtered: readonly OverlayChoice[]
  private descriptionWidth = 36
  private notice = ''
  private lastHits: readonly HitRegion[] = []
  private armedOptionId: string | undefined
  private hoveredOptionId: string | undefined

  constructor(
    private request: SelectOverlayRequest,
    private readonly submit: (value: OverlayChoice) => void,
  ) {
    this.filtered = request.choices
    this.list = this.createList(this.filtered, request.initialChoiceId)
    this.input.onSubmit = () => { this.choose() }
  }

  /**
   * Refresh rows without dropping the typed query or the selected stable id.
   * @param choices - latest rows from Host.
   * @param notice - optional in-page diagnostic; empty clears a previous one.
   */
  updateChoices(choices: readonly OverlayChoice[], notice = ''): void {
    const selectedId = this.list.getSelectedItem()?.value
    this.request = { ...this.request, choices }
    this.filtered = this.filterChoices(this.input.getValue())
    this.list = this.createList(this.filtered, selectedId)
    this.notice = notice
  }

  invalidate(): void {
    this.input.invalidate()
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    const descriptionWidth = selectDescriptionWidth(safeWidth)
    if (descriptionWidth !== this.descriptionWidth) {
      const selectedId = this.list.getSelectedItem()?.value
      this.descriptionWidth = descriptionWidth
      this.list = this.createList(this.filtered, selectedId)
    }
    const lines: string[] = []
    if (this.request.detail !== undefined) {
      lines.push(...wrappedDetail(this.request.detail, safeWidth))
    }
    if (this.request.searchable !== false) {
      this.input.focused = this.focused
      lines.push(`${color.muted(ui('搜索 ', 'Search '))}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ''}`)
    }
    const listStart = lines.length
    const listLines = [...this.list.render(safeWidth)]
    const maxVisible = this.request.maxVisible ?? 10
    const window = selectVisibleWindow(this.filtered.length, this.list.getSelectedIndex(), maxVisible)
    const hoveredIndex = this.hoveredOptionId === undefined
      ? -1
      : this.filtered.findIndex(choice => choice.id === this.hoveredOptionId)
    const hoveredRow = hoveredIndex - window.start
    if (hoveredRow >= 0 && hoveredRow < window.end - window.start && listLines[hoveredRow] !== undefined) {
      listLines[hoveredRow] = background.selection(listLines[hoveredRow] ?? '')
    }
    lines.push(...listLines)
    if (this.notice !== '') lines.push(color.warning(truncateToWidth(this.notice, safeWidth, '…')))
    lines.push(color.muted(translateUiText(this.request.footer ?? ui(
      'Enter 选择 · Esc 返回',
      'Enter select · Esc back',
    ))))
    this.lastHits = this.filtered.slice(window.start, window.end).map((choice, index) => ({
      id: `overlay:option:${choice.id}`,
      rect: { col: 1, row: 1 + listStart + index, width: Math.max(1, width - 2), height: 1 },
      zIndex: 1,
      role: 'option',
      enabled: choice.disabledReason === undefined,
      activation: this.request.mouseExecute === 'focus-only' ? 'enter-only' : 'arm',
      hover: choice.disabledReason === undefined && this.request.mouseExecute !== 'focus-only'
        ? 'highlight'
        : 'none',
      action: { kind: 'overlay', command: 'focus', optionId: choice.id },
    }))
    return modalFrame(this.request.title, lines, width)
  }

  hitChildren(): readonly HitRegion[] {
    return this.lastHits
  }

  handleHover(optionId?: string): boolean {
    if (this.hoveredOptionId === optionId) return false
    this.hoveredOptionId = optionId
    return true
  }

  handleOptionClick(optionId: string): OverlayMouseClickResult {
    const index = this.filtered.findIndex(choice => choice.id === optionId)
    if (index < 0) return 'none'
    this.list.setSelectedIndex(index)
    if (this.request.mouseExecute === 'focus-only') return 'danger'
    if (this.armedOptionId === optionId) return 'activated'
    this.armedOptionId = optionId
    return 'focused'
  }

  activateArmedOption(): OverlayMouseClickResult {
    if (this.request.mouseExecute === 'focus-only') return 'danger'
    if (this.armedOptionId === undefined) return 'none'
    this.armedOptionId = undefined
    this.choose()
    return 'activated'
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.home)) {
      this.list.setSelectedIndex(0)
      return
    }
    if (matchesKey(data, Key.end)) {
      this.list.setSelectedIndex(Math.max(0, this.filtered.length - 1))
      return
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter)) {
      this.list.handleInput(data)
      return
    }
    if (this.request.searchable === false) return
    this.input.handleInput(data)
    this.applyFilter(this.input.getValue())
  }

  handleWheel(lines: number): boolean {
    this.armedOptionId = undefined
    return moveListByWheel(this.list, this.filtered.length, lines)
  }

  private createList(choices: readonly OverlayChoice[], preferredId?: string): SelectList {
    const rows = choices.map(choice => rowOf(choice, this.descriptionWidth))
    const list = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList)
    const preferredIndex = preferredId === undefined ? 0 : rows.findIndex(row => row.value === preferredId)
    list.setSelectedIndex(Math.max(0, preferredIndex))
    list.onSelect = () => { this.choose() }
    return list
  }

  private filterChoices(query: string): readonly OverlayChoice[] {
    return query === ''
      ? this.request.choices
      : fuzzyFilter([...this.request.choices], query, choice =>
        `${choice.label} ${choice.description ?? ''} ${choice.id}`)
  }

  private applyFilter(query: string): void {
    this.filtered = this.filterChoices(query)
    this.list = this.createList(this.filtered)
    this.notice = ''
  }

  private choose(): void {
    const selected = this.list.getSelectedItem()
    const choice = selected === null
      ? undefined
      : this.filtered.find(candidate => candidate.id === selected.value)
    if (choice === undefined) return
    if (choice.disabledReason !== undefined) {
      this.notice = choice.disabledReason
      return
    }
    this.submit(choice)
  }
}

/** Single-line input overlay for titles, paths, custom answers, and queue edits. */
class TextInputOverlay implements Component {
  focused = false
  private readonly input = new Input()
  private notice = ''

  constructor(
    private readonly request: InputOverlayRequest,
    private readonly submit: (value: string) => void,
  ) {
    this.input.setValue(escapeTerminalText(request.initialValue ?? ''))
    this.input.onSubmit = (value) => {
      const safe = escapeTerminalText(value)
      if (request.requireText === true && safe.trim() === '') {
        this.notice = ui('请输入内容', 'Enter a value')
        return
      }
      submit(safe)
    }
  }

  invalidate(): void { this.input.invalidate() }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    this.input.focused = this.focused
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      this.input.render(safeWidth)[0] ?? color.muted(translateUiText(this.request.placeholder ?? '')),
      ...(this.notice === '' ? [] : [color.warning(truncateToWidth(this.notice, safeWidth, '…'))]),
      color.muted(this.request.footer === undefined
        ? ui('Enter 确认 · Esc 返回/关闭', 'Enter confirm · Esc back/close')
        : translateUiText(this.request.footer)),
    ], width)
  }

  handleInput(data: string): void {
    const before = this.input.getValue()
    this.input.handleInput(data)
    if (this.input.getValue() !== before) this.notice = ''
  }

  handleWheel(lines: number): boolean { return Math.trunc(lines) !== 0 }
}

/** Multiline editor overlay: Enter inserts a newline, Ctrl+Enter submits. */
class MultilineEditorOverlay implements Component {
  focused = false
  private readonly editor: Editor

  constructor(
    tui: TUI,
    private readonly request: InputOverlayRequest,
    private readonly submit: (value: string) => void,
  ) {
    this.editor = new Editor(tui, editorTheme, { paddingX: 0, autocompleteMaxVisible: 3 })
    this.editor.disableSubmit = true
    this.editor.setText(escapeTerminalText(request.initialValue ?? ''))
  }

  invalidate(): void { this.editor.invalidate() }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    this.editor.focused = this.focused
    const rendered = this.editor.render(Math.max(8, safeWidth))
    const cursorLine = rendered.findIndex(line => line.includes(CURSOR_MARKER))
    const body = visibleEditorWindow(
      rendered,
      cursorLine === -1 ? this.editor.getCursor().line : cursorLine,
    )
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      ...body,
      color.muted(ui('Enter 换行 · Ctrl+Enter 提交 · Esc 返回/关闭', 'Enter newline · Ctrl+Enter submit · Esc back/close')),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl(Key.enter))) {
      this.submit(escapeTerminalText(this.editor.getExpandedText()))
      return
    }
    if (matchesKey(data, Key.enter) || data === '\r' || data === '\n') {
      this.editor.insertTextAtCursor('\n')
      return
    }
    this.editor.handleInput(data)
  }

  handleWheel(lines: number): boolean { return Math.trunc(lines) !== 0 }
}

/** Write-only secret input: the underlying value is never returned by render(). */
class SecretInputOverlay implements Component {
  focused = false
  private readonly input = new Input()

  constructor(
    private readonly request: InputOverlayRequest,
    private readonly submit: (value: string) => void,
  ) {
    this.input.onSubmit = (value) => { this.finish(value) }
  }

  invalidate(): void { this.input.invalidate() }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    const length = Array.from(this.input.getValue()).length
    const cursor = this.focused ? CURSOR_MARKER : ''
    const masked = length === 0
      ? `${cursor}${color.muted(translateUiText(this.request.placeholder ?? '') || ui('输入新 Secret', 'Enter a new secret'))}`
      : `${'•'.repeat(Math.min(length, 32))}${cursor}▌`
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      truncateToWidth(masked, safeWidth, '…'),
      color.muted(this.request.footer === undefined
        ? ui(
          '输入内容不会回显或写入日志 · Enter 保存 · Esc 返回/关闭',
          'Input is never displayed or logged · Enter save · Esc back/close',
        )
        : translateUiText(this.request.footer)),
    ], width)
  }

  handleInput(data: string): void {
    this.input.handleInput(data)
  }

  handleWheel(lines: number): boolean { return Math.trunc(lines) !== 0 }

  dispose(): void { this.input.setValue('') }

  private finish(value: string): void {
    this.input.setValue('')
    this.submit(value)
  }
}

/** Multi-select question overlay; Space toggles, Enter commits. */
class MultiSelectOverlay implements Component {
  focused = false
  private readonly input = new Input()
  private filtered: readonly OverlayChoice[]
  private list: SelectList
  private readonly selected = new Set<string>()
  private descriptionWidth = 36
  private notice = ''
  private lastHits: readonly HitRegion[] = []
  private armedOptionId: string | undefined
  private hoveredOptionId: string | undefined

  constructor(
    private readonly request: SelectOverlayRequest,
    private readonly submit: (value: readonly OverlayChoice[]) => void,
  ) {
    this.filtered = request.choices
    this.list = this.createList()
  }

  invalidate(): void {
    this.input.invalidate()
    this.list.invalidate()
  }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    const descriptionWidth = selectDescriptionWidth(safeWidth)
    if (descriptionWidth !== this.descriptionWidth) {
      const selectedId = this.list.getSelectedItem()?.value
      this.descriptionWidth = descriptionWidth
      this.list = this.createList(selectedId)
    }
    this.input.focused = this.focused
    const prefix = [
      ...(this.request.detail === undefined ? [] : wrappedDetail(this.request.detail, safeWidth)),
      `${color.muted(ui('搜索 ', 'Search '))}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ''}`,
    ]
    const listLines = [...this.list.render(safeWidth)]
    const maxVisible = this.request.maxVisible ?? 10
    const window = selectVisibleWindow(this.filtered.length, this.list.getSelectedIndex(), maxVisible)
    const hoveredIndex = this.hoveredOptionId === undefined
      ? -1
      : this.filtered.findIndex(choice => choice.id === this.hoveredOptionId)
    const hoveredRow = hoveredIndex - window.start
    if (hoveredRow >= 0 && hoveredRow < window.end - window.start && listLines[hoveredRow] !== undefined) {
      listLines[hoveredRow] = background.selection(listLines[hoveredRow] ?? '')
    }
    this.lastHits = this.filtered.slice(window.start, window.end).map((choice, index) => ({
      id: `overlay:option:${choice.id}`,
      rect: { col: 1, row: 1 + prefix.length + index, width: Math.max(1, width - 2), height: 1 },
      zIndex: 1,
      role: 'option',
      enabled: true,
      activation: 'arm',
      hover: 'highlight',
      action: { kind: 'overlay', command: 'focus', optionId: choice.id },
    }))
    return modalFrame(this.request.title, [
      ...prefix,
      ...listLines,
      ...(this.notice === '' ? [] : [color.warning(truncateToWidth(this.notice, safeWidth, '…'))]),
      color.muted(translateUiText(this.request.footer ?? ui(
        'Space 勾选 · Enter 选择 · Esc 返回',
        'Space toggle · Enter select · Esc back',
      ))),
    ], width)
  }

  hitChildren(): readonly HitRegion[] {
    return this.lastHits
  }

  handleHover(optionId?: string): boolean {
    if (this.hoveredOptionId === optionId) return false
    this.hoveredOptionId = optionId
    return true
  }

  handleOptionClick(optionId: string): OverlayMouseClickResult {
    const index = this.filtered.findIndex(choice => choice.id === optionId)
    if (index < 0) return 'none'
    this.list.setSelectedIndex(index)
    if (this.request.mouseExecute === 'focus-only') return 'danger'
    if (this.armedOptionId === optionId) return 'activated'
    this.armedOptionId = optionId
    return 'focused'
  }

  activateArmedOption(): OverlayMouseClickResult {
    if (this.request.mouseExecute === 'focus-only') return 'danger'
    if (this.armedOptionId === undefined) return 'none'
    const id = this.armedOptionId
    this.armedOptionId = undefined
    this.toggleSelected(id)
    return 'activated'
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.space)) {
      const item = this.list.getSelectedItem()
      if (item === null) return
      this.toggleSelected(item.value)
      return
    }
    if (matchesKey(data, Key.enter)) {
      const selected = this.request.choices.filter(choice => this.selected.has(choice.id))
      if (this.request.requireSelection === true && selected.length === 0) {
        this.notice = ui('请至少选择一项', 'Select at least one option')
        return
      }
      this.submit(selected)
      return
    }
    if (matchesKey(data, Key.home)) {
      this.list.setSelectedIndex(0)
      return
    }
    if (matchesKey(data, Key.end)) {
      this.list.setSelectedIndex(Math.max(0, this.filtered.length - 1))
      return
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      this.list.handleInput(data)
      return
    }
    this.input.handleInput(data)
    this.applyFilter(this.input.getValue())
  }

  handleWheel(lines: number): boolean {
    this.armedOptionId = undefined
    return moveListByWheel(this.list, this.filtered.length, lines)
  }

  private createList(preferredId?: string): SelectList {
    const rows = this.filtered.map(choice => ({
      value: choice.id,
      label: escapeTerminalText(`${this.selected.has(choice.id) ? '[x]' : '[ ]'} ${translateUiText(choice.label)}`),
      ...(choice.description === undefined
        ? {}
        : { description: truncateToWidth(escapeTerminalText(translateUiText(choice.description)), this.descriptionWidth, '…') }),
    }))
    const list = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList)
    const index = preferredId === undefined ? 0 : rows.findIndex(row => row.value === preferredId)
    list.setSelectedIndex(Math.max(0, index))
    return list
  }

  private toggleSelected(id: string): void {
    this.notice = ''
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    this.list = this.createList(id)
  }

  private applyFilter(query: string): void {
    this.filtered = query === ''
      ? this.request.choices
      : fuzzyFilter([...this.request.choices], query, choice =>
        `${choice.label} ${choice.description ?? ''} ${choice.id}`)
    this.list = this.createList()
  }
}

/** Fixed-height, scrollable body for structured output and diagnostics. */
class ScrollableDetailOverlay implements Component {
  focused = false
  private offset = 0
  private lineCount = 0
  private viewportRows: number

  constructor(
    private readonly request: DetailOverlayRequest,
    private readonly settle: () => void,
  ) {
    this.viewportRows = Math.max(1, request.maxVisible ?? 12)
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    const content = escapeTerminalText(this.request.content)
    const lines = wrapTextWithAnsi(content === '' ? ui('(无详情)', '(No details)') : content, safeWidth)
      .map(line => color.muted(line))
    this.lineCount = lines.length
    const maxOffset = Math.max(0, this.lineCount - this.viewportRows)
    this.offset = Math.min(this.offset, maxOffset)
    const end = Math.min(this.lineCount, this.offset + this.viewportRows)
    const position = ui(
      `${String(this.offset + 1)}-${String(end)}/${String(this.lineCount)} 行`,
      `${String(this.offset + 1)}-${String(end)}/${String(this.lineCount)} lines`,
    )
    return modalFrame(this.request.title, [
      ...lines.slice(this.offset, end),
      color.muted(translateUiText(this.request.footer ?? ui(
        `${position} · ↑↓ 滚动 · PgUp/PgDn 翻页 · Home/End · Enter/q 关闭 · Esc 返回`,
        `${position} · ↑↓ scroll · PgUp/PgDn page · Home/End · Enter/q close · Esc back`,
      ))),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter) || data === 'q') {
      this.settle()
      return
    }
    const maxOffset = Math.max(0, this.lineCount - this.viewportRows)
    if (matchesKey(data, Key.up)) this.offset = Math.max(0, this.offset - 1)
    else if (matchesKey(data, Key.down)) this.offset = Math.min(maxOffset, this.offset + 1)
    else if (matchesKey(data, Key.pageUp)) this.offset = Math.max(0, this.offset - this.viewportRows)
    else if (matchesKey(data, Key.pageDown)) this.offset = Math.min(maxOffset, this.offset + this.viewportRows)
    else if (matchesKey(data, Key.home)) this.offset = 0
    else if (matchesKey(data, Key.end)) this.offset = maxOffset
  }

  handleWheel(lines: number): boolean {
    const delta = Math.trunc(lines)
    if (delta === 0) return false
    const maxOffset = Math.max(0, this.lineCount - this.viewportRows)
    this.offset = Math.max(0, Math.min(maxOffset, this.offset - delta))
    return true
  }
}

/** Live output page while a Host operation holds the overlay; Escape aborts. */
class ProgressOverlay implements Component {
  focused = false
  private output = ''
  private readonly started = Date.now()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly request: { readonly title: string; readonly detail?: string },
    private readonly requestRender: () => void,
  ) {
    this.timer = setInterval(() => { this.requestRender() }, 250)
  }

  append(chunk: string): void {
    this.output = `${this.output}${chunk}`.slice(-8_192)
    this.requestRender()
  }

  dispose(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  invalidate(): void {}

  render(width: number): string[] {
    const body = lastOutputLines(this.output, 12)
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined ? [] : wrappedDetail(this.request.detail, width)),
      color.accent(formatBusyFooter(Date.now() - this.started)),
      ...wrapTextWithAnsi(
        escapeTerminalText(body === '' ? ui('等待输出…', 'Waiting for output…') : body),
        frameContentWidth(width),
      ).map(line => color.muted(line)),
      color.muted(ui('Esc 中止', 'Esc abort')),
    ], width)
  }

  handleInput(_data: string): void {}

  handleWheel(lines: number): boolean { return Math.trunc(lines) !== 0 }
}

/** Stable visible state while a write-only secret is being persisted. */
class SecretBusyOverlay implements Component {
  focused = false

  constructor(
    private readonly title: string,
    private readonly detail: string | undefined,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    return modalFrame(this.title, [
      ...(this.detail === undefined ? [] : wrappedDetail(this.detail, safeWidth)),
      color.warning(ui('正在保存…', 'Saving…')),
      color.muted(ui('请稍候；重复按 Enter 不会再次提交', 'Please wait; pressing Enter again will not resubmit')),
    ], width)
  }

  handleInput(_data: string): void {}

  handleWheel(lines: number): boolean { return Math.trunc(lines) !== 0 }
}

/** A single mounted modal with a logical page stack and one Escape owner. */
class NavigationOverlay<TResult> implements Component, OverlayNavigation<TResult> {
  focused = false
  readonly signal: AbortSignal
  private readonly stack: NavigationEntry[] = []
  private closed = false
  private pendingBack: NavigationEntry | undefined
  private readonly controller = new AbortController()

  constructor(
    private readonly tui: TUI,
    run: (navigation: OverlayNavigation<TResult>) => void | Promise<void>,
    private readonly settle: (value: TResult | undefined) => void,
    private readonly reject: (error: unknown) => void,
    private readonly requestRender: () => void,
  ) {
    this.signal = this.controller.signal
    try {
      void Promise.resolve(run(this)).then(
        () => { this.finish() },
        error => {
          if (this.signal.aborted) this.finish()
          else this.fail(error)
        },
      )
    } catch (error) {
      queueMicrotask(() => { this.fail(error) })
    }
  }

  invalidate(): void { this.current()?.component.invalidate() }

  render(width: number): string[] {
    const component = this.current()?.component
    if (component === undefined) return []
    if ('focused' in component) {
      (component as Component & { focused: boolean }).focused = this.focused
    }
    return component.render(width)
  }

  hitChildren(): readonly HitRegion[] {
    const component = this.current()?.component
    return component !== undefined && isOverlayMouseTarget(component) ? component.hitChildren() : []
  }

  handleOptionClick(optionId: string): OverlayMouseClickResult {
    const component = this.current()?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.handleOptionClick(optionId)
      : 'none'
  }

  handleHover(optionId?: string): boolean {
    const component = this.current()?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.handleHover(optionId)
      : false
  }

  handleWheel(lines: number): boolean {
    const component = this.current()?.component
    if (component === undefined) return false
    return isOverlayWheelTarget(component) ? component.handleWheel(lines) : Math.trunc(lines) !== 0
  }

  activateArmedOption(): OverlayMouseClickResult {
    const component = this.current()?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.activateArmedOption()
      : 'none'
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl('c'))) {
      this.finish()
      return
    }
    const current = this.current()
    if (current === undefined) return
    if (matchesKey(data, Key.escape)) {
      if (current.busy) {
        if (current.abortOnEscape === false) return
        this.abort()
        this.pendingBack = current
        return
      }
      if (current.escapeHandler !== undefined) {
        this.dispatch(current, current.escapeHandler)
        return
      }
      if (this.stack.length <= 1) this.finish()
      else this.back()
      return
    }
    if (current.busy) return
    current.component.handleInput?.(data)
  }

  selectPage(
    request: SelectOverlayRequest,
    onSelect: (choice: OverlayChoice) => void | Promise<void>,
  ): Promise<void> {
    if (this.closed) return Promise.resolve()
    return new Promise<void>((resolve) => {
      let entry: NavigationEntry
      entry = {
        component: new SearchSelectOverlay(request, choice => {
          this.dispatch(entry, () => onSelect(choice))
        }),
        dismiss: resolve,
        busy: false,
        active: true,
        escapeHandler: request.onEscape,
      }
      this.stack.push(entry)
      this.requestRender()
    })
  }

  replaceSelectPage(
    request: SelectOverlayRequest,
    onSelect: (choice: OverlayChoice) => void | Promise<void>,
  ): void {
    if (this.closed) return
    const entry = this.current()
    if (entry === undefined) throw new Error(ui('没有可替换的 overlay 页面', 'No overlay page to replace'))
    this.disposeComponent(entry.component)
    entry.component = new SearchSelectOverlay(request, choice => {
      this.dispatch(entry, () => onSelect(choice))
    })
    this.requestRender()
  }

  updateChoices(choices: readonly OverlayChoice[], notice?: string): void {
    if (this.closed) return
    const entry = this.current()
    if (entry === undefined || !(entry.component instanceof SearchSelectOverlay)) {
      throw new Error(ui('没有可更新的选择页', 'No select page to update'))
    }
    entry.component.updateChoices(choices, notice ?? '')
    this.requestRender()
  }

  select(request: SelectOverlayRequest): Promise<OverlayChoice | undefined> {
    return this.prompt(submit => new SearchSelectOverlay(request, submit), request.onEscape)
  }

  input(request: InputOverlayRequest): Promise<string | undefined> {
    return this.prompt(submit => new TextInputOverlay(request, submit), request.onEscape)
  }

  multilineInput(request: InputOverlayRequest): Promise<string | undefined> {
    return this.prompt(submit => new MultilineEditorOverlay(this.tui, request, submit), request.onEscape)
  }

  secretInput(request: InputOverlayRequest): Promise<string | undefined> {
    return this.prompt(submit => new SecretInputOverlay(request, submit), request.onEscape)
  }

  async secretTransaction<T>(request: SecretTransactionRequest<T>): Promise<T | undefined> {
    let failure: string | undefined
    while (!this.closed) {
      const raw = await this.secretInput({
        ...request.input,
        detail: [request.input.detail, failure]
          .filter((line): line is string => line !== undefined && line !== '')
          .join('\n'),
      })
      if (raw === undefined) return undefined
      const checked = request.validate(raw)
      if (!checked.ok) {
        failure = checked.message
        continue
      }
      const result = await this.runSecretWork(request, checked.value)
      if (result === undefined) return undefined
      if (result.ok) return result.value
      failure = result.message
    }
    return undefined
  }

  multiSelect(request: SelectOverlayRequest): Promise<readonly OverlayChoice[] | undefined> {
    return this.prompt(submit => new MultiSelectOverlay(request, submit), request.onEscape)
  }

  async detail(request: DetailOverlayRequest): Promise<void> {
    await this.prompt<void>(submit => new ScrollableDetailOverlay(request, () => { submit() }))
  }

  async confirm(title: string, detail: string, confirmLabel = ui('确认', 'Confirm')): Promise<boolean> {
    const { choices, initialChoiceId } = dangerConfirmChoices(confirmLabel)
    const selected = await this.select({
      title,
      detail,
      searchable: false,
      choices,
      initialChoiceId,
      footer: ui('Enter 选择 · Esc 返回', 'Enter select · Esc back'),
      mouseExecute: 'focus-only',
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    return selected?.id === 'confirm'
  }

  async progress<T>(request: ProgressOverlayRequest<T>): Promise<T | undefined> {
    if (this.closed) return undefined
    const overlay = new ProgressOverlay(request, () => { this.requestRender() })
    const entry: NavigationEntry = {
      component: overlay,
      dismiss: () => undefined,
      busy: true,
      active: true,
    }
    this.stack.push(entry)
    this.requestRender()
    try {
      return await request.work((chunk) => { overlay.append(chunk) }, this.signal)
    } catch (error) {
      if (this.signal.aborted) return undefined
      throw error
    } finally {
      entry.busy = false
      this.remove(entry)
    }
  }

  back(): void {
    const entry = this.current()
    if (entry === undefined) return
    this.remove(entry)
    entry.dismiss()
  }

  finish(value?: TResult): void {
    if (this.closed) return
    this.abort()
    this.closed = true
    this.pendingBack = undefined
    this.dismissAll()
    this.settle(value)
  }

  dispose(): void {
    if (this.closed) return
    this.abort()
    this.closed = true
    this.pendingBack = undefined
    this.dismissAll()
  }

  private prompt<T>(
    create: (submit: (value: T) => void) => DisposableComponent,
    escapeHandler?: (() => void | Promise<void>) | undefined,
  ): Promise<T | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    return new Promise<T | undefined>((resolve) => {
      let entry: NavigationEntry
      entry = {
        component: create((value) => {
          if (!this.remove(entry)) return
          resolve(value)
        }),
        dismiss: () => { resolve(undefined) },
        busy: false,
        active: true,
        escapeHandler,
      }
      this.stack.push(entry)
      this.requestRender()
    })
  }

  private async runSecretWork<T>(
    request: SecretTransactionRequest<T>,
    value: string,
  ): Promise<SecretTransactionWorkResult<T> | undefined> {
    if (this.closed) return undefined
    let entry: NavigationEntry
    entry = {
      component: new SecretBusyOverlay(request.busyTitle, request.busyDetail),
      dismiss: () => undefined,
      busy: true,
      abortOnEscape: false,
      active: true,
    }
    this.stack.push(entry)
    this.requestRender()
    try {
      return await request.work(value, this.signal)
    } catch {
      if (this.signal.aborted || this.closed) return undefined
      return { ok: false, message: request.failureMessage }
    } finally {
      if (entry.active) this.remove(entry)
    }
  }

  private dispatch(entry: NavigationEntry, action: () => void | Promise<void>): void {
    if (this.closed || this.current() !== entry || entry.busy) return
    entry.busy = true
    void Promise.resolve().then(action).catch(error => {
      if (this.signal.aborted) return
      this.fail(error)
    }).finally(() => {
      if (entry.active) entry.busy = false
      if (this.pendingBack === entry) {
        this.pendingBack = undefined
        this.back()
      }
      this.requestRender()
    })
  }

  private current(): NavigationEntry | undefined { return this.stack.at(-1) }

  private remove(entry: NavigationEntry): boolean {
    if (!entry.active || this.current() !== entry) return false
    this.stack.pop()
    if (this.pendingBack === entry) this.pendingBack = undefined
    entry.active = false
    this.disposeComponent(entry.component)
    this.requestRender()
    return true
  }

  private dismissAll(): void {
    for (const entry of this.stack.splice(0).reverse()) {
      entry.active = false
      this.disposeComponent(entry.component)
      entry.dismiss()
    }
    this.requestRender()
  }

  private fail(error: unknown): void {
    if (this.closed) return
    if (this.signal.aborted) {
      this.finish()
      return
    }
    this.abort()
    this.closed = true
    this.pendingBack = undefined
    this.dismissAll()
    this.reject(error)
  }

  private abort(): void {
    if (!this.controller.signal.aborted) this.controller.abort()
  }

  private disposeComponent(component: DisposableComponent): void {
    try { component.dispose?.() } catch { /* page cleanup must not mask the navigation result */ }
  }
}

/** One-focus-owner FIFO for independent overlay navigation sessions. */
export class OverlayQueue implements OverlayPrompts {
  private readonly entries: Array<QueueEntry<unknown>> = []
  private active: QueueEntry<unknown> | undefined
  private accepting = true
  private generation = 0

  /** @param tui - mounted pi-tui root whose public overlay API owns focus. */
  constructor(
    private readonly tui: TUI,
    private readonly onSessionChange: () => void = () => undefined,
  ) {}

  /**
   * Whether a modal currently owns input focus.
   * @returns true while an overlay owns input focus.
   */
  hasActive(): boolean { return this.active !== undefined }

  /**
   * Scroll the capturing overlay by keyboard-equivalent steps.
   * Positive lines move toward the start of the list or detail (Key.up).
   */
  handleWheel(lines: number): boolean {
    const component = this.active?.component
    const delta = Math.trunc(lines)
    if (component === undefined || delta === 0) return false
    return isOverlayWheelTarget(component) ? component.handleWheel(delta) : true
  }

  /** Frame generation bound to the currently capturing overlay; changes on replace. */
  activeGeneration(): number { return this.generation }

  /** Stable id for the capturing overlay, if any. */
  activeOverlayId(): string | undefined {
    return this.active === undefined ? undefined : String(this.generation)
  }

  /** Overlay-local option regions from the last render of the capturing page. */
  hitChildren(): readonly HitRegion[] {
    const component = this.active?.component
    return component !== undefined && isOverlayMouseTarget(component) ? component.hitChildren() : []
  }

  /**
   * First click focuses; the next click on the same option runs the ordinary action.
   * Danger confirmations never execute from the mouse.
   */
  handleOptionClick(optionId: string): OverlayMouseClickResult {
    const component = this.active?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.handleOptionClick(optionId)
      : 'none'
  }

  activateArmedOption(): OverlayMouseClickResult {
    const component = this.active?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.activateArmedOption()
      : 'none'
  }

  /**
   * Mount one physical overlay whose navigator owns every logical child page.
   * @param run - navigation session body.
   * @param options - fixed modal placement for the complete session.
   * @returns the explicit session result, or undefined after root Back/abort.
   */
  navigate<TResult>(
    run: (navigation: OverlayNavigation<TResult>) => void | Promise<void>,
    options?: OverlayOptions,
  ): Promise<TResult | undefined> {
    return this.enqueue(
      (settle, reject) => new NavigationOverlay(this.tui, run, settle, reject, () => {
        this.tui.requestRender()
      }),
      options,
    )
  }

  /**
   * Open a searchable choice selector in FIFO order.
   * @param request - selector content and presentation options.
   * @returns the selected choice, or undefined after cancellation.
   */
  select(request: SelectOverlayRequest): Promise<OverlayChoice | undefined> {
    return this.navigate<OverlayChoice>(async (navigation) => {
      const selected = await navigation.select(request)
      navigation.finish(selected)
    }, request.options)
  }

  /**
   * Keep a modal open while work runs, aborting it on Escape.
   * @param title - overlay title shown while busy.
   * @param work - body that observes the session signal.
   * @returns the work result, or undefined after cancel.
   */
  runBusy<T>(title: string, work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    return this.navigate(async (navigation) => {
      const page = navigation.selectPage({
        title,
        detail: ui('按 Esc 取消', 'Press Esc to cancel'),
        searchable: false,
        choices: [{
          id: 'busy',
          label: ui('进行中…', 'In progress…'),
          disabledReason: ui('按 Esc 取消', 'Press Esc to cancel'),
        }],
      }, () => undefined)
      try {
        navigation.finish(await work(navigation.signal))
      } catch (error) {
        if (navigation.signal.aborted) return
        throw error
      }
      await page
    })
  }

  /**
   * Keep a modal open while work runs, streaming its output and aborting on Escape.
   * @param request - title, optional detail, and the work body observing (report, signal).
   * @returns the work result, or undefined after cancel.
   */
  progress<T>(request: ProgressOverlayRequest<T>): Promise<T | undefined> {
    return this.navigate<T>(async (navigation) => {
      navigation.finish(await navigation.progress(request))
    }, request.options)
  }

  /**
   * Open a single-line text input in FIFO order.
   * @param request - input content and presentation options.
   * @returns submitted text, or undefined after cancellation.
   */
  input(request: InputOverlayRequest): Promise<string | undefined> {
    return this.navigate<string>(async (navigation) => {
      const value = await navigation.input(request)
      navigation.finish(value)
    }, request.options)
  }

  /**
   * Open a multiline editor: Enter inserts a newline, Ctrl+Enter submits.
   * @param request - title, optional detail, and initial value.
   * @returns submitted text, or undefined after cancellation.
   */
  multilineInput(request: InputOverlayRequest): Promise<string | undefined> {
    return this.navigate<string>(async (navigation) => {
      const value = await navigation.multilineInput(request)
      navigation.finish(value)
    }, request.options)
  }

  /**
   * Open a write-only masked input; no existing value or raw render is supported.
   * @param request - title, safe detail, placeholder, and layout options.
   * @returns submitted secret, or undefined after cancellation.
   */
  secretInput(request: InputOverlayRequest): Promise<string | undefined> {
    return this.navigate<string>(async (navigation) => {
      const value = await navigation.secretInput(request)
      navigation.finish(value)
    }, request.options)
  }

  /** Apply a visual-only option hover without moving keyboard focus or arming an action. */
  handleHover(optionId?: string): boolean {
    const component = this.active?.component
    return component !== undefined && isOverlayMouseTarget(component)
      ? component.handleHover(optionId)
      : false
  }

  secretTransaction<T>(request: SecretTransactionRequest<T>): Promise<T | undefined> {
    return this.navigate<T>(async (navigation) => {
      navigation.finish(await navigation.secretTransaction(request))
    }, request.input.options)
  }

  /**
   * Open a multi-select question in FIFO order.
   * @param request - selector content and presentation options.
   * @returns selected choices, or undefined after cancellation.
   */
  multiSelect(request: SelectOverlayRequest): Promise<readonly OverlayChoice[] | undefined> {
    return this.navigate<readonly OverlayChoice[]>(async (navigation) => {
      const selected = await navigation.multiSelect(request)
      navigation.finish(selected)
    }, request.options)
  }

  /**
   * Open scrollable read-only content in FIFO order.
   * @param request - title, complete content, and viewport options.
   */
  async detail(request: DetailOverlayRequest): Promise<void> {
    await this.navigate<void>(async (navigation) => {
      await navigation.detail(request)
      navigation.finish()
    }, request.options)
  }

  /**
   * Explicit high-risk confirmation.
   * @param title - concise risk prompt.
   * @param detail - complete impact description.
   * @param confirmLabel - affirmative action label.
   * @returns true only when the affirmative action was selected.
   */
  async confirm(title: string, detail: string, confirmLabel = ui('确认', 'Confirm')): Promise<boolean> {
    const { choices, initialChoiceId } = dangerConfirmChoices(confirmLabel)
    const selected = await this.select({
      title,
      detail,
      searchable: false,
      choices,
      initialChoiceId,
      footer: ui('Enter 选择 · Esc 返回', 'Enter select · Esc back'),
      mouseExecute: 'focus-only',
      options: { width: '95%', maxHeight: '90%', anchor: 'center', margin: 1 },
    })
    return selected?.id === 'confirm'
  }

  /** Settle every active/queued request before terminal teardown. */
  dispose(): void {
    if (!this.accepting) return
    this.accepting = false
    if (this.active !== undefined) this.settle(this.active, undefined)
    for (const entry of [...this.entries]) this.settle(entry, undefined)
  }

  private enqueue<T>(
    create: (
      settle: (value: T | undefined) => void,
      reject: (error: unknown) => void,
    ) => Component,
    options: OverlayOptions | undefined,
  ): Promise<T | undefined> {
    if (!this.accepting) return Promise.resolve(undefined)
    return new Promise<T | undefined>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        create,
        options: modalOptions(options),
        resolve,
        reject,
        settled: false,
      }
      this.entries.push(entry as QueueEntry<unknown>)
      this.activateNext()
    })
  }

  private activateNext(): void {
    if (!this.accepting || this.active !== undefined) return
    const entry = this.entries.shift()
    if (entry === undefined) return
    this.active = entry
    this.generation += 1
    this.onSessionChange()
    try {
      const component = entry.create(
        value => { this.settle(entry, value) },
        error => { this.fail(entry, error) },
      )
      entry.component = component
      if (entry.settled) {
        this.disposeComponent(component)
        return
      }
      entry.handle = this.tui.showOverlay(component, entry.options)
      this.tui.requestRender()
    } catch (error) {
      this.fail(entry, error)
    }
  }

  private settle(entry: QueueEntry<unknown>, value: unknown): void {
    if (entry.settled) return
    entry.settled = true
    this.disposeComponent(entry.component)
    entry.handle?.hide()
    if (this.active === entry) this.active = undefined
    const queued = this.entries.indexOf(entry)
    if (queued >= 0) this.entries.splice(queued, 1)
    this.generation += 1
    this.onSessionChange()
    entry.resolve(value)
    this.tui.requestRender()
    queueMicrotask(() => { this.activateNext() })
  }

  private fail(entry: QueueEntry<unknown>, error: unknown): void {
    if (entry.settled) return
    entry.settled = true
    this.disposeComponent(entry.component)
    entry.handle?.hide()
    if (this.active === entry) this.active = undefined
    const queued = this.entries.indexOf(entry)
    if (queued >= 0) this.entries.splice(queued, 1)
    this.generation += 1
    this.onSessionChange()
    entry.reject(error)
    this.tui.requestRender()
    queueMicrotask(() => { this.activateNext() })
  }

  private disposeComponent(component: Component | undefined): void {
    if (component === undefined || !('dispose' in component)) return
    try { (component as DisposableComponent).dispose?.() } catch { /* teardown remains best effort */ }
  }
}
