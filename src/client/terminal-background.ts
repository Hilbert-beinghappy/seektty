import { DEFAULT_TUI_BACKGROUND_MODE, type TuiBackgroundMode } from '@deepseek-ai/dsh-tui-protocol'
import { terminalColorLevel } from './theme.ts'

export const BACKGROUND_QUERY = '\u001B]11;?\u001B\\'
export const BACKGROUND_QUERY_TIMEOUT_MS = 500
const OSC = '\u001B]'
const ST = '\u001B\\'
const RGB_REPLY = /^\u001B\]11;(rgb:[\da-f]{1,4}\/[\da-f]{1,4}\/[\da-f]{1,4})(?:\u0007|\u001B\\)$/iu

export type BackgroundSyncUnavailable = 'unsupported' | 'timeout' | 'write-failed'

/** Only match truecolor canvases; do not recolor a multiplexer's shared outer window. */
export function supportsTerminalBackground(env: Readonly<NodeJS.ProcessEnv> = process.env): boolean {
  return terminalColorLevel(env) === 3
    && !env.TMUX && !env.STY && !/^(?:screen|tmux)/iu.test(env.TERM ?? '')
    && !/^(?:0|off|false)$/iu.test(env.SEEKTTY_TERMINAL_BACKGROUND?.trim() ?? '')
}

/** One asynchronous probe per active lifetime; never guess a color to restore. */
export class TerminalBackground {
  private active = false
  private queried = false
  private mode: TuiBackgroundMode = DEFAULT_TUI_BACKGROUND_MODE
  private unavailable: BackgroundSyncUnavailable | undefined
  private notified = false
  private original: string | undefined
  private desired: string | undefined
  private applied: string | undefined
  private changed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly terminal: { write(data: string): void },
    private readonly enabled: boolean,
    private readonly onUnavailable: (reason: BackgroundSyncUnavailable) => void = () => undefined,
  ) {}

  /** Set color and policy atomically, without writing an intermediate theme. */
  setColor(color: string, mode: TuiBackgroundMode = this.mode): void {
    // Only validated theme RGB values may become terminal commands.
    if (!/^#[\da-f]{6}$/iu.test(color)) return
    this.desired = `rgb:${color.slice(1, 3)}/${color.slice(3, 5)}/${color.slice(5, 7)}`.toLowerCase()
    this.mode = mode
    if (mode === 'terminal') this.restoreOriginal()
    else this.sync()
  }

  start(): void {
    // The input listener is ready. A terminal-only start may defer its one probe
    // until the first later switch to a mode that actually needs to change color.
    this.active = true
    this.sync()
  }

  private sync(): void {
    if (!this.active || this.mode === 'terminal' || this.desired === undefined) return
    if (!this.enabled) this.unavailable = 'unsupported'
    if (this.unavailable !== undefined) {
      this.notifyUnavailable()
      return
    }
    if (this.original !== undefined) {
      this.apply()
      return
    }
    if (this.queried) return
    this.queried = true
    this.timer = setTimeout(() => {
      this.timer = undefined
      // Late replies are still consumed, but cannot enable an expired probe.
      this.unavailable = 'timeout'
      this.notifyUnavailable()
    }, BACKGROUND_QUERY_TIMEOUT_MS)
    this.timer.unref?.()
    try { this.terminal.write(BACKGROUND_QUERY) } catch {
      clearTimeout(this.timer)
      this.timer = undefined
      this.unavailable = 'write-failed'
      this.notifyUnavailable()
    }
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
      this.sync()
    }
    return true
  }

  restore(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.active = false
    this.restoreOriginal()
    this.queried = false
    this.unavailable = undefined
    this.notified = false
    this.original = undefined
    this.applied = undefined
    this.changed = false
  }

  /** Switching to terminal-only restores color without losing the lifetime snapshot. */
  private restoreOriginal(): void {
    if (!this.changed || this.original === undefined) return
    // Keep the original channel precision; OSC 111 would reset the profile,
    // not necessarily the color set by the shell before SeekTTY started.
    try {
      this.terminal.write(`${OSC}11;${this.original}${ST}`)
      this.changed = false
      this.applied = undefined
    } catch {
      // Retain ownership so exit can make one more best-effort restoration.
      this.unavailable = 'write-failed'
    }
  }

  private apply(): void {
    if (!this.active || this.original === undefined || this.desired === undefined || this.applied === this.desired) return
    this.changed = true
    this.applied = this.desired
    try { this.terminal.write(`${OSC}11;${this.desired}${ST}`) } catch {
      this.unavailable = 'write-failed'
      this.restoreOriginal()
      this.notifyUnavailable()
    }
  }

  private notifyUnavailable(): void {
    if (!this.active || this.mode !== 'theme' || this.unavailable === undefined || this.notified) return
    this.notified = true
    try { this.onUnavailable(this.unavailable) } catch { /* a notice cannot disrupt terminal cleanup */ }
  }
}
