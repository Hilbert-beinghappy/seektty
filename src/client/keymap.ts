/** Single source of surface key bindings shared with `/help`. */

import { Key, matchesKey, type KeyId } from '@mariozechner/pi-tui'
import { ui } from './locale.ts'

const KEYMAP_GROUPS = [
  { id: 'input', zh: '输入与编辑', en: 'Input & editing' },
  { id: 'commands', zh: '命令与弹窗', en: 'Commands & overlays' },
  { id: 'transcript', zh: '对话浏览', en: 'Transcript browsing' },
  { id: 'session', zh: '会话与运行', en: 'Sessions & running turns' },
  { id: 'selection', zh: '鼠标与选区', en: 'Mouse & selection' },
] as const

interface KeymapHelpRow {
  readonly group: (typeof KEYMAP_GROUPS)[number]['id']
  readonly keys: readonly string[]
  readonly zh: string
  readonly en: string
}

export interface SurfaceKeyBinding extends KeymapHelpRow {
  readonly id: string
  readonly match: (data: string) => boolean
  readonly configurable?: boolean
}

/** Product shortcuts handled by the terminal Surface. */
export const SURFACE_KEYMAP: readonly SurfaceKeyBinding[] = [
  {
    id: 'help',
    group: 'commands',
    keys: ['F1'],
    zh: '打开帮助',
    en: 'Open help',
    match: data => matchesKey(data, Key.f1),
  },
  {
    id: 'commandPalette',
    group: 'commands',
    keys: ['Ctrl+P'],
    zh: '打开命令面板',
    en: 'Open the command palette',
    match: data => matchesKey(data, Key.ctrl('p')),
  },
  {
    id: 'historySearch',
    group: 'input',
    keys: ['Ctrl+R'],
    zh: '搜索输入历史',
    en: 'Search input history',
    match: data => matchesKey(data, Key.ctrl('r')),
  },
  {
    id: 'sessions',
    group: 'session',
    keys: ['Ctrl+S'],
    zh: '打开会话列表',
    en: 'Open the session list',
    match: data => matchesKey(data, Key.ctrl('s')),
  },
  {
    id: 'model',
    group: 'session',
    keys: ['Ctrl+M'],
    zh: '打开模型选择（需扩展键盘协议）',
    en: 'Open model selection (extended keyboard protocol)',
    match: data => data !== '\r' && data !== '\n' && matchesKey(data, Key.ctrl('m')),
  },
  {
    id: 'toolsDisplay',
    group: 'transcript',
    keys: ['Ctrl+O'],
    zh: '循环工具卡片显示',
    en: 'Cycle tool-card display',
    match: data => matchesKey(data, Key.ctrl('o')),
  },
  {
    id: 'reasoning',
    group: 'transcript',
    keys: ['Ctrl+T'],
    zh: '显示或隐藏推理',
    en: 'Show or hide reasoning',
    match: data => matchesKey(data, Key.ctrl('t')),
  },
  {
    id: 'settings',
    group: 'commands',
    keys: ['F2', 'Ctrl+,', 'Cmd+,'],
    zh: '打开设置',
    en: 'Open Settings',
    match: data => matchesKey(data, Key.f2)
      || matchesKey(data, Key.ctrl(Key.comma))
      || matchesKey(data, Key.super(Key.comma)),
  },
  {
    id: 'toggleMouseMode',
    group: 'selection',
    keys: ['F3'],
    zh: '切换完整鼠标模式与终端原生选择',
    en: 'Toggle full mouse mode and native terminal selection',
    match: data => matchesKey(data, Key.f3),
  },
  {
    id: 'cyclePermission',
    group: 'session',
    keys: ['Shift+Tab'],
    zh: '循环当前权限',
    en: 'Cycle the current permission',
    match: data => matchesKey(data, Key.shift(Key.tab)),
  },
  {
    id: 'focusToggle',
    group: 'transcript',
    keys: ['Tab'],
    zh: '空输入框进入对话浏览；浏览时返回输入框',
    en: 'Browse from an empty composer; return from browsing',
    match: data => matchesKey(data, Key.tab),
  },
  {
    id: 'previousTurn',
    group: 'transcript',
    keys: ['Shift+Left'],
    zh: '跳到上一个用户轮次',
    en: 'Jump to the previous user turn',
    match: data => matchesKey(data, Key.shift(Key.left)),
  },
  {
    id: 'nextTurn',
    group: 'transcript',
    keys: ['Shift+Right'],
    zh: '跳到下一个用户轮次',
    en: 'Jump to the next user turn',
    match: data => matchesKey(data, Key.shift(Key.right)),
  },
  {
    id: 'interrupt',
    group: 'session',
    keys: ['Ctrl+C'],
    zh: '停止当前轮次、清空草稿，或再按一次退出',
    en: 'Stop the active turn, clear a draft, or press again to exit',
    match: data => matchesKey(data, Key.ctrl('c')),
  },
  {
    id: 'copySelection',
    group: 'selection',
    keys: ['Ctrl+Shift+C'],
    zh: '复制当前选区',
    en: 'Copy the current selection',
    match: data => matchesKey(data, Key.ctrlShift('c')) || matchesKey(data, Key.shiftCtrl('c')),
  },
  {
    id: 'undoInput',
    group: 'input',
    keys: ['Ctrl+Z', 'Ctrl+-'],
    zh: '撤销当前输入框内的编辑',
    en: 'Undo edits in the focused input',
    match: () => false,
    configurable: false,
  },
  {
    id: 'submit',
    group: 'input',
    keys: ['Enter'],
    zh: '发送消息或确认；斜杠候选选中后直接执行',
    en: 'Send or confirm; run the selected slash candidate',
    match: () => false,
    configurable: false,
  },
  {
    id: 'newline',
    group: 'input',
    keys: ['Shift+Enter'],
    zh: '在输入区插入换行',
    en: 'Insert a newline in the composer',
    match: () => false,
    configurable: false,
  },
  {
    id: 'transcriptSearch',
    group: 'transcript',
    keys: ['/'],
    zh: '对话浏览时增量查找',
    en: 'Incremental search while browsing the transcript',
    match: () => false,
    configurable: false,
  },
]

// Context-specific keys are documentation, not global reservations or dispatch rules.
const CONTEXT_KEYMAP: readonly KeymapHelpRow[] = [
  { group: 'input', keys: ['Enter / Ctrl+Enter'], zh: '多行弹窗：换行 / 提交', en: 'Multiline overlay: newline / submit' },
  { group: 'commands', keys: ['/'], zh: '输入框：打开命令与 Skill 候选', en: 'Composer: open command and Skill candidates' },
  { group: 'commands', keys: ['Up / Down'], zh: '候选或列表：移动选择', en: 'Candidates or lists: move selection' },
  { group: 'commands', keys: ['Tab'], zh: '候选显示时：只补全，不执行', en: 'With candidates open: complete without running' },
  { group: 'commands', keys: ['Space'], zh: '多选弹窗：勾选或取消当前项', en: 'Multi-select overlay: toggle the current item' },
  { group: 'commands', keys: ['Esc'], zh: '弹窗：返回或关闭；候选：取消补全', en: 'Overlay: back or close; candidates: dismiss' },
  { group: 'transcript', keys: ['Up / Down'], zh: '浏览时：逐行滚动或移动卡片选择', en: 'While browsing: scroll or move card selection' },
  { group: 'transcript', keys: ['PgUp / PgDn'], zh: '浏览时：上一页 / 下一页', en: 'While browsing: previous / next page' },
  { group: 'transcript', keys: ['Home / End'], zh: '浏览时：最早内容 / 最新内容', en: 'While browsing: oldest / latest content' },
  { group: 'transcript', keys: ['n / N'], zh: '查找确认后：下一个 / 上一个匹配', en: 'After confirming Find: next / previous match' },
  { group: 'transcript', keys: ['Esc'], zh: '依次退出查找、卡片聚焦，再返回输入区', en: 'Leave Find, then card focus, then return to composer' },
  { group: 'selection', keys: ['Ctrl+X'], zh: '非密钥弹窗输入框：剪切选区', en: 'Non-secret overlay input: cut selection' },
  { group: 'selection', keys: ['Backspace / Delete'], zh: '可编辑输入框：删除选区', en: 'Editable input: delete selection' },
]

const byId = new Map(SURFACE_KEYMAP.map(binding => [binding.id, binding]))
const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'super'] as const
const MODIFIERS: Readonly<Record<string, (typeof MODIFIER_ORDER)[number]>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  super: 'super',
  cmd: 'super',
  command: 'super',
  win: 'super',
  windows: 'super',
  meta: 'super',
}
const NAMED_KEYS: Readonly<Record<string, string>> = {
  ',': ',',
  comma: ',',
  '/': '/',
  slash: '/',
  tab: 'tab',
  enter: 'enter',
  return: 'enter',
  space: 'space',
  escape: 'escape',
  esc: 'escape',
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
  home: 'home',
  end: 'end',
  backspace: 'backspace',
  delete: 'delete',
}

let overrides: Readonly<Record<string, string>> = {}

function isConfigurable(binding: SurfaceKeyBinding): boolean {
  return binding.configurable !== false
}

function namedKey(token: string): string | undefined {
  if (token === '') return undefined
  const lower = token.toLowerCase()
  if (NAMED_KEYS[lower] !== undefined) return NAMED_KEYS[lower]
  if (/^f([1-9]|1[0-2])$/u.test(lower)) return lower
  if (/^[a-z0-9]$/u.test(lower)) return lower
  if (token.length === 1) return lower
  return undefined
}

/**
 * Normalize a typed chord such as `Ctrl+P` or `Cmd+,` into a pi-tui key id.
 * @param input - user-facing shortcut text.
 * @returns canonical key id, or undefined when the chord is empty or incomplete.
 */
export function normalizeChord(input: string): string | undefined {
  const tokens = input.trim().split('+').map(part => part.trim())
  if (tokens.length === 0 || tokens.some(token => token === '')) return undefined
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>()
  const last = tokens.at(-1)
  if (last === undefined) return undefined
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIERS[token.toLowerCase()]
    if (modifier === undefined) return undefined
    modifiers.add(modifier)
  }
  const key = namedKey(last)
  if (key === undefined || MODIFIERS[last.toLowerCase()] !== undefined) return undefined
  const prefix = MODIFIER_ORDER.filter(name => modifiers.has(name)).join('+')
  return prefix === '' ? key : `${prefix}+${key}`
}

function formatChord(chord: string): string {
  return chord.split('+').map(part => {
    if (part === ',' || part === '/') return part
    if (/^f\d{1,2}$/u.test(part)) return part.toUpperCase()
    return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
  }).join('+')
}

function matchChord(data: string, chord: string): boolean {
  if (chord === 'ctrl+m' && (data === '\r' || data === '\n')) return false
  return matchesKey(data, chord as KeyId)
}

function defaultChords(binding: SurfaceKeyBinding): readonly string[] {
  return binding.keys.flatMap(key => {
    const chord = normalizeChord(key)
    return chord === undefined ? [] : [chord]
  })
}

function effectiveChords(binding: SurfaceKeyBinding): readonly string[] {
  const override = overrides[binding.id]
  if (override !== undefined) return [override]
  return defaultChords(binding)
}

const BARE_SPECIAL_KEYS = new Set([
  'tab',
  'enter',
  'escape',
  'left',
  'right',
  'up',
  'down',
  'home',
  'end',
  'backspace',
  'delete',
])

function isUnmodifiedPrintableChord(chord: string): boolean {
  if (chord.includes('+')) return false
  if (BARE_SPECIAL_KEYS.has(chord)) return false
  if (/^f([1-9]|1[0-2])$/u.test(chord)) return false
  return chord.length === 1
}

function parsedOverrides(value: unknown): {
  readonly bindings: Record<string, string>
  readonly issue?: string
} {
  if (typeof value !== 'object' || value === null) return { bindings: {} }
  const bindings: Record<string, string> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') {
      return {
        bindings,
        issue: ui(`键位 ${id} 必须是字符串`, `Key binding ${id} must be a string`),
      }
    }
    const binding = byId.get(id)
    if (binding === undefined || !isConfigurable(binding)) continue
    const chord = normalizeChord(raw)
    if (chord === undefined) {
      return {
        bindings,
        issue: ui(`无法解析组合键 ${raw}`, `Cannot parse chord ${raw}`),
      }
    }
    if (isUnmodifiedPrintableChord(chord)) {
      return {
        bindings,
        issue: ui(
          `不能把无修饰可打印字符 ${formatChord(chord)} 设为全局快捷键`,
          `Cannot bind unmodified printable character ${formatChord(chord)} as a global shortcut`,
        ),
      }
    }
    bindings[id] = chord
  }
  return { bindings }
}

function conflictIssue(overrides: Readonly<Record<string, string>>): string | undefined {
  const owners = new Map<string, string>()
  for (const binding of SURFACE_KEYMAP) {
    const override = overrides[binding.id]
    const chords = override === undefined ? defaultChords(binding) : [override]
    for (const chord of chords) {
      const owner = owners.get(chord)
      if (owner !== undefined && owner !== binding.id) {
        const reported = overrides[owner] !== undefined && overrides[binding.id] === undefined
          ? binding.id
          : owner
        return ui(`与 ${reported} 冲突`, `Conflicts with ${reported}`)
      }
      owners.set(chord, binding.id)
    }
  }
  return undefined
}

/**
 * Explain why a complete override map cannot be written or applied.
 * @param value - persisted or typed override map.
 * @returns a localized error, or undefined when the map is valid.
 */
export function keyBindingsIssue(value: unknown): string | undefined {
  const parsed = parsedOverrides(value)
  return parsed.issue ?? conflictIssue(parsed.bindings)
}

function dropConflictingOverrides(overrides: Record<string, string>): Record<string, string> {
  const next = { ...overrides }
  for (;;) {
    const owners = new Map<string, string[]>()
    for (const binding of SURFACE_KEYMAP) {
      const override = next[binding.id]
      const chords = override === undefined ? defaultChords(binding) : [override]
      for (const chord of chords) {
        const list = owners.get(chord) ?? []
        list.push(binding.id)
        owners.set(chord, list)
      }
    }
    let dropped = false
    for (const ids of owners.values()) {
      if (ids.length < 2) continue
      for (const id of ids) {
        if (next[id] === undefined) continue
        delete next[id]
        dropped = true
      }
    }
    if (!dropped) return next
  }
}

/**
 * Drop unknown ids, documentation-only rows, and chords that cannot be parsed.
 * @param value - persisted or typed override map.
 */
export function sanitizeKeyBindings(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null) return {}
  const next: Record<string, string> = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') continue
    const binding = byId.get(id)
    if (binding === undefined || !isConfigurable(binding)) continue
    const chord = normalizeChord(raw)
    if (chord === undefined || isUnmodifiedPrintableChord(chord)) continue
    next[id] = chord
  }
  return dropConflictingOverrides(next)
}

/**
 * Replace the live override table used by matching and help text.
 * @param value - canonical or user-typed override map; empty restores defaults.
 */
export function applyKeyBindingOverrides(value: Readonly<Record<string, string>>): void {
  overrides = sanitizeKeyBindings(value)
}

/**
 * Match one named surface binding against a raw input chunk.
 * @param id - SURFACE_KEYMAP id.
 * @param data - terminal input.
 */
export function matchesBinding(id: string, data: string): boolean {
  const binding = byId.get(id)
  if (binding === undefined) return false
  const override = overrides[id]
  if (override !== undefined) return matchChord(data, override)
  return binding.match(data) === true
}

/**
 * First stage of the Surface input listener: a running turn consumes Ctrl+C
 * before pi-tui can deliver the chord to an overlay.
 */
export function consumeRunningInterrupt(
  data: string,
  session: { getSnapshot(): { running: boolean }; cancel(): unknown } | undefined,
): { consume: true } | undefined {
  if (!matchesBinding('interrupt', data)) return undefined
  if (session?.getSnapshot().running !== true) return undefined
  void session.cancel()
  return { consume: true }
}

/**
 * Find another action that already owns this chord.
 * @param id - binding being assigned.
 * @param typed - user-facing or canonical chord.
 * @returns the conflicting binding id, if any.
 */
export function bindingConflict(id: string, typed: string): string | undefined {
  const chord = normalizeChord(typed)
  if (chord === undefined) return undefined
  for (const binding of SURFACE_KEYMAP) {
    if (binding.id === id) continue
    if (effectiveChords(binding).includes(chord)) return binding.id
  }
  return undefined
}

/**
 * Display the live chords for one binding, using the override when present.
 * @param id - SURFACE_KEYMAP id.
 */
export function bindingKeysLabel(id: string): string {
  const binding = byId.get(id)
  if (binding === undefined) return id
  const override = overrides[id]
  return override === undefined ? binding.keys.join(' / ') : formatChord(override)
}

/**
 * Render grouped help using live chords, keeping context-only keys out of global dispatch.
 */
export function helpKeymapText(): string {
  const rows = [
    ...SURFACE_KEYMAP.map(binding => ({ ...binding, label: bindingKeysLabel(binding.id) })),
    ...CONTEXT_KEYMAP.map(row => ({ ...row, label: row.keys.join(' / ') })),
  ]
  const keyWidth = Math.max(...rows.map(row => row.label.length))
  const sections = KEYMAP_GROUPS.map(group => [
    `[${ui(group.zh, group.en)}]`,
    ...rows.filter(row => row.group === group.id).map(row =>
      `  ${row.label.padEnd(keyWidth)}  ${ui(row.zh, row.en)}`),
  ].join('\n'))
  return [...sections, ui(
    '显示当前绑定；可改绑项见 /keymap。Ctrl+Z 仅撤销当前框内编辑，不撤回已发送消息或已保存设置。',
    'Shows current bindings; see /keymap to rebind supported actions. Ctrl+Z undoes field edits, not sent messages or saved settings.',
  )].join('\n\n')
}
