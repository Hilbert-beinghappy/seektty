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
