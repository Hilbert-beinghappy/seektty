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

export type NoticeTone = 'info' | 'success' | 'warning' | 'error'

export interface NoticeBoardView {
  readonly error?: { readonly message: string }
  readonly warning?: { readonly message: string }
  readonly toast?: { readonly message: string; readonly tone: 'success' | 'info' }
}

/**
 * Keep persistent error/warning notices in a separate slot from 2s success/info toasts.
 * A later toast must not delete a higher-priority notice.
 */
export class NoticeBoard {
  private persistent: { message: string; tone: 'error' | 'warning' } | undefined
  private toast: { message: string; tone: 'success' | 'info'; seq: number } | undefined
  private seq = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private onExpire: (() => void) | undefined

  /**
   * @param onExpire - called after an ephemeral toast leaves on its own.
   */
  constructor(onExpire?: () => void) {
    this.onExpire = onExpire
  }

  /** Replace the expire callback after surrounding status refresh exists. */
  setOnExpire(onExpire: () => void): void {
    this.onExpire = onExpire
  }

  /**
   * Record a notice. Error/warning persist; success/info expire without clearing them.
   * @param message - already localized status text.
   * @param tone - notice severity.
   */
  set(message: string, tone: NoticeTone): void {
    if (tone === 'error' || tone === 'warning') {
      this.persistent = { message, tone }
      return
    }
    this.seq += 1
    const seq = this.seq
    this.toast = { message, tone, seq }
    this.clearTimer()
    this.timer = setTimeout(() => {
      if (this.toast?.seq !== seq) return
      this.toast = undefined
      this.timer = undefined
      this.onExpire?.()
    }, EPHEMERAL_NOTICE_MS)
    this.timer.unref()
  }

  /** Clear persistent and toast slots, including any pending expire timer. */
  dismiss(): void {
    this.persistent = undefined
    this.toast = undefined
    this.seq += 1
    this.clearTimer()
  }

  /** True when Esc should consume the key to clear status-bar notices. */
  hasVisible(): boolean {
    return this.persistent !== undefined || this.toast !== undefined
  }

  /** Current slots for `pickStatusLine`. */
  view(): NoticeBoardView {
    return {
      ...(this.persistent?.tone === 'error' ? { error: { message: this.persistent.message } } : {}),
      ...(this.persistent?.tone === 'warning' ? { warning: { message: this.persistent.message } } : {}),
      ...(this.toast === undefined ? {} : { toast: { message: this.toast.message, tone: this.toast.tone } }),
    }
  }

  /** Drop the expire timer when the surface closes. */
  dispose(): void {
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}
