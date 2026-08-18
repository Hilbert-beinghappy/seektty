/** OSC window-title text derived from the current Session facts. */

export const DEFAULT_TERMINAL_TITLE = 'DeepSeek Harness'

export interface TerminalTitleFacts {
  readonly follow: boolean
  readonly sessionTitle: string
  readonly running: boolean
  readonly pendingApproval: boolean
}

/**
 * Choose the terminal window title for the current Session state.
 * @param facts - live Session presentation facts.
 * @returns a single-line title without control characters.
 */
export function sessionTerminalTitle(facts: TerminalTitleFacts): string {
  const session = facts.sessionTitle.replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim()
    || DEFAULT_TERMINAL_TITLE
  if (!facts.follow) return DEFAULT_TERMINAL_TITLE
  if (facts.running) return `⏺ ${session}`
  if (facts.pendingApproval) return `⚠ ${session}`
  return session
}
