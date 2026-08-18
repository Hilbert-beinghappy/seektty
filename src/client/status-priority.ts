/** Status-bar line priority: important state is never replaced by a toast. */

export interface StatusPriorityInput {
  readonly error?: string
  readonly pending?: string
  readonly restart?: string
  readonly running?: string
  readonly warning?: string
  readonly facts?: string
  readonly notice?: string
}

/**
 * Pick one status-bar line. Order: error, pending, restart, running, warning, facts, toast.
 * @param input - already-colored or plain candidates; omitted keys are skipped.
 */
export function pickStatusLine(input: StatusPriorityInput): string | undefined {
  return input.error
    ?? input.pending
    ?? input.restart
    ?? input.running
    ?? input.warning
    ?? input.facts
    ?? input.notice
}

/** Success and info toasts leave the status bar after this many milliseconds. */
export const EPHEMERAL_NOTICE_MS = 2_000
