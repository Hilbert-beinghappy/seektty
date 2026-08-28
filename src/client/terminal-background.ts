import { terminalColorLevel } from './theme.ts'

export const BACKGROUND_QUERY = '\u001B]11;?\u001B\\'
export const BACKGROUND_QUERY_TIMEOUT_MS = 500
const OSC = '\u001B]'
const ST = '\u001B\\'
const RGB_REPLY = /^\u001B\]11;(rgb:[\da-f]{1,4}\/[\da-f]{1,4}\/[\da-f]{1,4})(?:\u0007|\u001B\\)$/iu

/** Only match truecolor canvases; do not recolor a multiplexer's shared outer window. */
export function supportsTerminalBackground(env: Readonly<NodeJS.ProcessEnv> = process.env): boolean {
  return terminalColorLevel(env) === 3
    && !env.TMUX && !env.STY && !/^(?:screen|tmux)/iu.test(env.TERM ?? '')
    && !/^(?:0|off|false)$/iu.test(env.SEEKTTY_TERMINAL_BACKGROUND?.trim() ?? '')
}

/** One asynchronous probe per active lifetime; never guess a color to restore. */
export class TerminalBackground {
  private active = false
  private original: string | undefined
  private desired: string | undefined
  private applied: string | undefined
  private changed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly terminal: { write(data: string): void },
    private readonly enabled: boolean,
  ) {}

  setColor(color: string): void {
    // Only validated theme RGB values may become terminal commands.
    if (!/^#[\da-f]{6}$/iu.test(color)) return
    this.desired = `rgb:${color.slice(1, 3)}/${color.slice(3, 5)}/${color.slice(5, 7)}`.toLowerCase()
    this.apply()
  }

  start(): void {
    if (!this.enabled || this.active || this.desired === undefined) return
    this.active = true
    this.timer = setTimeout(() => {
      this.timer = undefined
      // Late replies are still consumed, but cannot enable an expired probe.
    }, BACKGROUND_QUERY_TIMEOUT_MS)
    this.timer.unref?.()
    try { this.terminal.write(BACKGROUND_QUERY) } catch { this.restore() }
  }

  /** Called after pi-tui framing and before any editor/overlay receives input. */
  consumeInput(data: string): boolean {
    // OSC reports are control messages, even if malformed or unsolicited.
    // A bracketed paste starts with CSI, so literal pasted OSC remains opaque.
    if (!data.startsWith(OSC)) return false
    const reply = RGB_REPLY.exec(data)
    if (this.active && this.timer !== undefined && reply?.[1] !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.original = reply[1].toLowerCase()
      this.apply()
    }
    return true
  }

  restore(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.active = false
    const original = this.changed ? this.original : undefined
    this.original = undefined
    this.applied = undefined
    this.changed = false
    // Keep the original channel precision; OSC 111 would reset the profile,
    // not necessarily the color set by the shell before SeekTTY started.
    if (original !== undefined) {
      try { this.terminal.write(`${OSC}11;${original}${ST}`) } catch { /* best-effort cleanup */ }
    }
  }

  private apply(): void {
    if (!this.active || this.original === undefined || this.desired === undefined || this.applied === this.desired) return
    this.changed = true
    this.applied = this.desired
    try { this.terminal.write(`${OSC}11;${this.desired}${ST}`) } catch { this.restore() }
  }
}
