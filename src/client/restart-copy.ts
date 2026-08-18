/** Restart-required copy owned by `requireRestart()`, not by callers. */

import { ui } from './locale.ts'

/** Lasting status-bar fact after a restart-required change. */
export function restartRequiredFact(): string {
  return ui('需要重启 · /restart', 'Restart required · /restart')
}

/**
 * One-shot notice after the user declines an immediate restart.
 * @param label - what changed, without a `/restart` instruction.
 */
export function restartRequiredNotice(label: string): string {
  return ui(`${label}。需要重启 · /restart`, `${label}. Restart required · /restart`)
}

/**
 * A later success/info toast must not hide the lasting restart fact.
 * @param restart - current restart fact.
 * @param noticeTone - tone of the notice that would otherwise replace status.
 */
export function restartFactAfterNotice(
  restart: string | undefined,
  noticeTone: 'info' | 'success' | 'warning' | 'error' | undefined,
): string | undefined {
  if (restart === undefined) return undefined
  if (noticeTone === 'error' || noticeTone === 'warning') return undefined
  return restart
}
