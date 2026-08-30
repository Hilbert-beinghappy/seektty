/** Terminal BEL + OSC 9 notices for turn completion and pending interactions. */

import { ui } from './locale.ts'

export type DesktopNotifyKind = 'turn-complete' | 'approval' | 'question'

export interface DesktopNotifySnapshot {
  readonly running: boolean
  readonly pending: readonly { readonly key: string; readonly kind: string }[]
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu

/**
 * Build a BEL + OSC 9 sequence for terminals that surface desktop notifications.
 * @param message - short human-readable body; control characters are stripped.
 * @returns the exact bytes to write to the terminal.
 */
export function desktopNotifySequence(message: string): string {
  const body = message.replace(CONTROL_CHARS, ' ').replace(/\s+/gu, ' ').trim().slice(0, 200)
  if (body === '') return '\u0007'
  return `\u0007\u001B]9;${body}\u0007`
}

/**
 * Decide whether a snapshot transition should ring the terminal bell.
 * @param previous - last observed running/pending facts.
 * @param current - newly observed facts.
 * @param primed - false skips the first snapshot so reconnects do not notify.
 * @returns the event to announce, or undefined when nothing changed for the user.
 */
export function nextDesktopNotify(
  previous: DesktopNotifySnapshot,
  current: DesktopNotifySnapshot,
  primed: boolean,
): DesktopNotifyKind | undefined {
  if (!primed) return undefined
  const previousKeys = new Set(previous.pending.map(wait => wait.key))
  const added = current.pending.filter(wait => !previousKeys.has(wait.key))
  if (added.some(wait => wait.kind === 'approval')) return 'approval'
  if (added.some(wait => wait.kind === 'question')) return 'question'
  if (previous.running && !current.running && current.pending.length === 0) return 'turn-complete'
  return undefined
}

/**
 * Localized body for one desktop-notify event.
 * @param kind - event selected by {@link nextDesktopNotify}.
 * @param locale - current terminal locale.
 * @returns a short notification body.
 */
export function desktopNotifyBody(kind: DesktopNotifyKind, origin?: string): string {
  const suffix = origin === undefined ? '' : ` · ${origin}`
  if (kind === 'approval') return ui(`SeekTTY：需要工具审批${suffix}`, `SeekTTY: tool approval needed${suffix}`)
  if (kind === 'question') return ui(`SeekTTY：有问题待回答${suffix}`, `SeekTTY: a question is waiting${suffix}`)
  return ui(`SeekTTY：回合完成${suffix}`, `SeekTTY: turn complete${suffix}`)
}
