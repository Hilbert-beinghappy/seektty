/** Single source of surface key bindings shared with `/help`. */

import { Key, matchesKey, type KeyId } from '@mariozechner/pi-tui'
import { ui } from './locale.ts'

export interface SurfaceKeyBinding {
  readonly id: string
  readonly keys: readonly string[]
  readonly zh: string
  readonly en: string
  readonly match: (data: string) => boolean
  readonly configurable?: boolean
}

/** Product shortcuts handled by the terminal Surface. */
export const SURFACE_KEYMAP: readonly SurfaceKeyBinding[] = [
  {
    id: 'help',
    keys: ['F1'],
    zh: '打开帮助',
    en: 'Open help',
    match: data => matchesKey(data, Key.f1),
  },
  {
    id: 'commandPalette',
    keys: ['Ctrl+P'],
    zh: '打开命令面板',
    en: 'Open the command palette',
    match: data => matchesKey(data, Key.ctrl('p')),
  },
  {
    id: 'historySearch',
    keys: ['Ctrl+R'],
    zh: '搜索输入历史',
    en: 'Search input history',
    match: data => matchesKey(data, Key.ctrl('r')),
  },
  {
    id: 'sessions',
    keys: ['Ctrl+S'],
    zh: '打开会话列表',
    en: 'Open the session list',
    match: data => matchesKey(data, Key.ctrl('s')),
  },
  {
    id: 'model',
    keys: ['Ctrl+M'],
    zh: '打开模型选择（需扩展键盘协议）',
    en: 'Open model selection (extended keyboard protocol)',
    match: data => data !== '\r' && data !== '\n' && matchesKey(data, Key.ctrl('m')),
  },
  {
    id: 'toolsDisplay',
    keys: ['Ctrl+O'],
    zh: '循环工具卡片显示',
    en: 'Cycle tool-card display',
    match: data => matchesKey(data, Key.ctrl('o')),
  },
  {
    id: 'reasoning',
    keys: ['Ctrl+T'],
    zh: '显示或隐藏推理',
    en: 'Show or hide reasoning',
    match: data => matchesKey(data, Key.ctrl('t')),
  },
  {
    id: 'settings',
    keys: ['F2', 'Ctrl+,', 'Cmd+,'],
    zh: '打开设置',
    en: 'Open Settings',
    match: data => matchesKey(data, Key.f2)
      || matchesKey(data, Key.ctrl(Key.comma))
      || matchesKey(data, Key.super(Key.comma)),
  },
  {
    id: 'cyclePermission',
    keys: ['Shift+Tab'],
    zh: '循环当前权限',
    en: 'Cycle the current permission',
    match: data => matchesKey(data, Key.shift(Key.tab)),
  },
  {
    id: 'focusToggle',
    keys: ['Tab'],
    zh: '在输入区和对话区之间切换',
    en: 'Switch between composer and transcript',
    match: data => matchesKey(data, Key.tab),
  },
  {
    id: 'previousTurn',
    keys: ['Shift+Left'],
    zh: '跳到上一个用户轮次',
    en: 'Jump to the previous user turn',
    match: data => matchesKey(data, Key.shift(Key.left)),
  },
  {
    id: 'nextTurn',
    keys: ['Shift+Right'],
    zh: '跳到下一个用户轮次',
    en: 'Jump to the next user turn',
    match: data => matchesKey(data, Key.shift(Key.right)),
  },
  {
    id: 'interrupt',
    keys: ['Ctrl+C'],
    zh: '停止当前轮次、清空草稿，或再按一次退出',
    en: 'Stop the active turn, clear a draft, or press again to exit',
    match: data => matchesKey(data, Key.ctrl('c')),
  },
  {
    id: 'submit',
    keys: ['Enter'],
    zh: '提交或确认',
    en: 'Submit or confirm',
    match: () => false,
    configurable: false,
  },
  {
    id: 'newline',
    keys: ['Shift+Enter'],
    zh: '在输入区插入换行',
    en: 'Insert a newline in the composer',
    match: () => false,
    configurable: false,
  },
  {
    id: 'transcriptSearch',
    keys: ['/'],
    zh: '对话浏览时增量查找',
    en: 'Incremental search while browsing the transcript',
    match: () => false,
    configurable: false,
  },
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

function effectiveChords(binding: SurfaceKeyBinding): readonly string[] {
  const override = overrides[binding.id]
  if (override !== undefined) return [override]
  return binding.keys.flatMap(key => {
    const chord = normalizeChord(key)
    return chord === undefined ? [] : [chord]
  })
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
    if (chord === undefined) continue
    next[id] = chord
  }
  return next
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
 * Render the shared keymap for the help overlay.
 */
export function helpKeymapText(): string {
  return SURFACE_KEYMAP.map(binding =>
    `${bindingKeysLabel(binding.id)} · ${ui(binding.zh, binding.en)}`).join('\n')
}
