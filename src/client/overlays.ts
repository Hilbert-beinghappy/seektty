/** FIFO modal overlays built only from public pi-tui components. */

import {
  CURSOR_MARKER,
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
import { color, editorTheme, escapeTerminalText } from './theme.ts'

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
  readonly footer?: string
  readonly searchable?: boolean
  readonly maxVisible?: number
  readonly options?: OverlayOptions
}

/** Text input request. */
export interface InputOverlayRequest {
  readonly title: string
  readonly detail?: string
  readonly initialValue?: string
  readonly placeholder?: string
  readonly options?: OverlayOptions
}

/** Scrollable read-only detail request. */
export interface DetailOverlayRequest {
  readonly title: string
  readonly content: string
  readonly footer?: string
  readonly maxVisible?: number
  readonly options?: OverlayOptions
}

interface QueueEntry<T> {
  readonly create: (settle: (value: T | undefined) => void) => Component
  readonly options: OverlayOptions
  readonly resolve: (value: T | undefined) => void
  readonly reject: (error: unknown) => void
  settled: boolean
  handle?: OverlayHandle
}

function rowOf(choice: OverlayChoice, descriptionWidth: number): SelectItem {
  const state = choice.active === true ? '● ' : choice.disabledReason === undefined ? '  ' : '× '
  const description = choice.disabledReason ?? choice.description
  return {
    value: choice.id,
    label: escapeTerminalText(`${state}${choice.label}`),
    ...description === undefined
      ? {}
      : { description: truncateToWidth(escapeTerminalText(description), descriptionWidth, '…') },
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
    return color.brand(`${start}${'─'.repeat(Math.max(0, width - 2))}${end}`)
  }
  const label = truncateToWidth(escapeTerminalText(title), Math.max(1, width - 7), '…')
  const lead = `─ ${label} `
  return color.brand(`${start}${lead}${'─'.repeat(Math.max(0, width - 2 - visibleWidth(lead)))}${end}`)
}

function modalFrame(title: string, lines: readonly string[], width: number): string[] {
  const contentWidth = frameContentWidth(width)
  const vertical = color.brand('│')
  const content = escapeFrame(lines.map(line => truncateToWidth(line, contentWidth, '…')))
    .map(line => `${vertical} ${line}${' '.repeat(Math.max(0, contentWidth - visibleWidth(line)))} ${vertical}`)
  return [modalRule(title, width, true), ...content, modalRule(undefined, width, false)]
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

function wrappedDetail(detail: string, width: number, maxLines = 4): string[] {
  const lines = wrapTextWithAnsi(escapeTerminalText(detail), Math.max(1, width))
  if (lines.length <= maxLines) return lines.map(line => color.muted(line))
  const visible = lines.slice(0, maxLines)
  const last = visible.at(-1) ?? ''
  visible[visible.length - 1] = truncateToWidth(`${last} …`, width, '…')
  return visible.map(line => color.muted(line))
}

/** Search input plus SelectList, with disabled-row and Escape-first semantics. */
class SearchSelectOverlay implements Component {
  focused = false
  private readonly input = new Input()
  private list: SelectList
  private filtered: readonly OverlayChoice[]
  private descriptionWidth = 36
  private notice = ''

  constructor(
    private readonly request: SelectOverlayRequest,
    private readonly settle: (value: OverlayChoice | undefined) => void,
  ) {
    this.filtered = request.choices
    this.list = this.createList(this.filtered)
    this.input.onSubmit = () => { this.choose() }
    this.input.onEscape = () => { this.escape() }
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
      lines.push(`${color.muted('搜索 ')}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ''}`)
    }
    lines.push(...this.list.render(safeWidth))
    if (this.notice !== '') lines.push(color.warning(truncateToWidth(this.notice, safeWidth, '…')))
    lines.push(color.muted(this.request.footer ?? '↑↓ 选择 · Enter 确认 · Esc 清空/关闭'))
    return modalFrame(this.request.title, lines, width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      this.escape()
      return
    }
    if (matchesKey(data, Key.tab)) {
      this.choose()
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
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter)) {
      this.list.handleInput(data)
      return
    }
    if (this.request.searchable === false) return
    this.input.handleInput(data)
    this.applyFilter(this.input.getValue())
  }

  private createList(choices: readonly OverlayChoice[], preferredId?: string): SelectList {
    const rows = choices.map(choice => rowOf(choice, this.descriptionWidth))
    const list = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList)
    const preferredIndex = preferredId === undefined ? 0 : rows.findIndex(row => row.value === preferredId)
    list.setSelectedIndex(Math.max(0, preferredIndex))
    list.onSelect = () => { this.choose() }
    list.onCancel = () => { this.escape() }
    return list
  }

  private applyFilter(query: string): void {
    this.filtered = query === ''
      ? this.request.choices
      : fuzzyFilter([...this.request.choices], query, choice =>
        `${choice.label} ${choice.description ?? ''} ${choice.id}`)
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
    this.settle(choice)
  }

  private escape(): void {
    if (this.request.searchable !== false && this.input.getValue() !== '') {
      this.input.setValue('')
      this.applyFilter('')
      return
    }
    this.settle(undefined)
  }
}

/** Single-line input overlay for titles, paths, custom answers, and queue edits. */
class TextInputOverlay implements Component {
  focused = false
  private readonly input = new Input()

  constructor(
    private readonly request: InputOverlayRequest,
    private readonly settle: (value: string | undefined) => void,
  ) {
    this.input.setValue(escapeTerminalText(request.initialValue ?? ''))
    this.input.onSubmit = (value) => { settle(escapeTerminalText(value)) }
    this.input.onEscape = () => { settle(undefined) }
  }

  invalidate(): void { this.input.invalidate() }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    this.input.focused = this.focused
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      this.input.render(safeWidth)[0] ?? color.muted(this.request.placeholder ?? ''),
      color.muted('Enter 确认 · Esc 取消'),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      this.settle(undefined)
      return
    }
    this.input.handleInput(data)
  }
}

/** Write-only secret input: the underlying value is never returned by render(). */
class SecretInputOverlay implements Component {
  focused = false
  private readonly input = new Input()

  constructor(
    private readonly request: InputOverlayRequest,
    private readonly settle: (value: string | undefined) => void,
  ) {
    this.input.onSubmit = (value) => { this.finish(value) }
    this.input.onEscape = () => { this.finish(undefined) }
  }

  invalidate(): void { this.input.invalidate() }

  render(width: number): string[] {
    const safeWidth = frameContentWidth(width)
    const length = Array.from(this.input.getValue()).length
    const cursor = this.focused ? CURSOR_MARKER : ''
    const masked = length === 0
      ? `${cursor}${color.muted(this.request.placeholder ?? '输入新 Secret')}`
      : `${'•'.repeat(Math.min(length, 32))}${cursor}▌`
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      truncateToWidth(masked, safeWidth, '…'),
      color.muted('输入内容不会回显或写入日志 · Enter 保存 · Esc 取消'),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl('c'))) {
      this.finish(undefined)
      return
    }
    this.input.handleInput(data)
  }

  private finish(value: string | undefined): void {
    this.input.setValue('')
    this.settle(value)
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

  constructor(
    private readonly request: SelectOverlayRequest,
    private readonly settle: (value: readonly OverlayChoice[] | undefined) => void,
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
    return modalFrame(this.request.title, [
      ...(this.request.detail === undefined
        ? []
        : wrappedDetail(this.request.detail, safeWidth)),
      `${color.muted('搜索 ')}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ''}`,
      ...this.list.render(safeWidth),
      color.muted(this.request.footer ?? '↑↓ 选择 · Space 勾选 · Enter 提交 · Esc 取消'),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      if (this.input.getValue() !== '') {
        this.input.setValue('')
        this.applyFilter('')
      } else {
        this.settle(undefined)
      }
      return
    }
    if (matchesKey(data, Key.space)) {
      const item = this.list.getSelectedItem()
      if (item === null) return
      if (this.selected.has(item.value)) this.selected.delete(item.value)
      else this.selected.add(item.value)
      this.list = this.createList(item.value)
      return
    }
    if (matchesKey(data, Key.enter)) {
      this.settle(this.request.choices.filter(choice => this.selected.has(choice.id)))
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

  private createList(preferredId?: string): SelectList {
    const rows = this.filtered.map(choice => ({
      value: choice.id,
      label: escapeTerminalText(`${this.selected.has(choice.id) ? '[x]' : '[ ]'} ${choice.label}`),
      ...(choice.description === undefined
        ? {}
        : { description: truncateToWidth(escapeTerminalText(choice.description), this.descriptionWidth, '…') }),
    }))
    const list = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList)
    const index = preferredId === undefined ? 0 : rows.findIndex(row => row.value === preferredId)
    list.setSelectedIndex(Math.max(0, index))
    return list
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
    const lines = wrapTextWithAnsi(content === '' ? '(无详情)' : content, safeWidth)
      .map(line => color.muted(line))
    this.lineCount = lines.length
    const maxOffset = Math.max(0, this.lineCount - this.viewportRows)
    this.offset = Math.min(this.offset, maxOffset)
    const end = Math.min(this.lineCount, this.offset + this.viewportRows)
    const position = `${String(this.offset + 1)}-${String(end)}/${String(this.lineCount)} 行`
    return modalFrame(this.request.title, [
      ...lines.slice(this.offset, end),
      color.muted(this.request.footer ?? `${position} · ↑↓ 滚动 · PgUp/PgDn 翻页 · Home/End · Enter/Esc 关闭`),
    ], width)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))
      || matchesKey(data, Key.enter) || data === 'q') {
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
}

/** One-focus-owner FIFO for every built-in terminal modal. */
export class OverlayQueue {
  private readonly entries: Array<QueueEntry<unknown>> = []
  private active: QueueEntry<unknown> | undefined
  private accepting = true

  /** @param tui - mounted pi-tui root whose public overlay API owns focus. */
  constructor(private readonly tui: TUI) {}

  /**
   * Whether a modal currently owns input focus.
   * @returns true while an overlay owns input focus.
   */
  hasActive(): boolean { return this.active !== undefined }

  /**
   * Open a searchable choice selector in FIFO order.
   * @param request - selector content and presentation options.
   * @returns the selected choice, or undefined after cancellation.
   */
  select(request: SelectOverlayRequest): Promise<OverlayChoice | undefined> {
    return this.enqueue(
      settle => new SearchSelectOverlay(request, settle),
      request.options,
    )
  }

  /**
   * Open a single-line text input in FIFO order.
   * @param request - input content and presentation options.
   * @returns submitted text, or undefined after cancellation.
   */
  input(request: InputOverlayRequest): Promise<string | undefined> {
    return this.enqueue(
      settle => new TextInputOverlay(request, settle),
      request.options,
    )
  }

  /**
   * Open a write-only masked input; no existing value or raw render is supported.
   * @param request - title, safe detail, placeholder, and layout options.
   * @returns submitted secret, or undefined after cancellation.
   */
  secretInput(request: InputOverlayRequest): Promise<string | undefined> {
    return this.enqueue(
      settle => new SecretInputOverlay(request, settle),
      request.options,
    )
  }

  /**
   * Open a multi-select question in FIFO order.
   * @param request - selector content and presentation options.
   * @returns selected choices, or undefined after cancellation.
   */
  multiSelect(request: SelectOverlayRequest): Promise<readonly OverlayChoice[] | undefined> {
    return this.enqueue(
      settle => new MultiSelectOverlay(request, settle),
      request.options,
    )
  }

  /**
   * Open scrollable read-only content in FIFO order.
   * @param request - title, complete content, and viewport options.
   */
  async detail(request: DetailOverlayRequest): Promise<void> {
    await this.enqueue<void>(
      settle => new ScrollableDetailOverlay(request, () => { settle(undefined) }),
      request.options,
    )
  }

  /**
   * Explicit high-risk confirmation.
   * @param title - concise risk prompt.
   * @param detail - complete impact description.
   * @param confirmLabel - affirmative action label.
   * @returns true only when the affirmative action was selected.
   */
  async confirm(title: string, detail: string, confirmLabel = '确认'): Promise<boolean> {
    const selected = await this.select({
      title,
      detail,
      searchable: false,
      choices: [
        { id: 'confirm', label: confirmLabel, description: '我已理解上述影响' },
        { id: 'cancel', label: '取消', description: '保持当前状态' },
      ],
      footer: '↑↓ 选择 · Enter 确认 · Esc 取消',
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
    create: (settle: (value: T | undefined) => void) => Component,
    options: OverlayOptions | undefined,
  ): Promise<T | undefined> {
    if (!this.accepting) return Promise.resolve(undefined)
    return new Promise<T | undefined>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        create: settle => create(settle),
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
    const component = entry.create((value) => { this.settle(entry, value) })
    try {
      entry.handle = this.tui.showOverlay(component, entry.options)
      this.tui.requestRender()
    } catch (error) {
      this.fail(entry, error)
    }
  }

  private settle(entry: QueueEntry<unknown>, value: unknown): void {
    if (entry.settled) return
    entry.settled = true
    entry.handle?.hide()
    if (this.active === entry) this.active = undefined
    const queued = this.entries.indexOf(entry)
    if (queued >= 0) this.entries.splice(queued, 1)
    entry.resolve(value)
    this.tui.requestRender()
    queueMicrotask(() => { this.activateNext() })
  }

  private fail(entry: QueueEntry<unknown>, error: unknown): void {
    if (entry.settled) return
    entry.settled = true
    if (this.active === entry) this.active = undefined
    entry.reject(error)
    this.tui.requestRender()
    queueMicrotask(() => { this.activateNext() })
  }
}
