/** Single source of surface key bindings shared with `/help`. */

import { Key, matchesKey } from '@mariozechner/pi-tui'
import { ui } from './locale.ts'

export interface SurfaceKeyBinding {
  readonly id: string
  readonly keys: readonly string[]
  readonly zh: string
  readonly en: string
  readonly match: (data: string) => boolean
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
  },
  {
    id: 'newline',
    keys: ['Shift+Enter'],
    zh: '在输入区插入换行',
    en: 'Insert a newline in the composer',
    match: () => false,
  },
  {
    id: 'transcriptSearch',
    keys: ['/'],
    zh: '对话浏览时增量查找',
    en: 'Incremental search while browsing the transcript',
    match: () => false,
  },
]

const byId = new Map(SURFACE_KEYMAP.map(binding => [binding.id, binding]))

/**
 * Match one named surface binding against a raw input chunk.
 * @param id - SURFACE_KEYMAP id.
 * @param data - terminal input.
 */
export function matchesBinding(id: string, data: string): boolean {
  return byId.get(id)?.match(data) === true
}

/**
 * Render the shared keymap for the help overlay.
 */
export function helpKeymapText(): string {
  return SURFACE_KEYMAP.map(binding => `${binding.keys.join(' / ')} · ${ui(binding.zh, binding.en)}`).join('\n')
}
