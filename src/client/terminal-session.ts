import type { Terminal } from '@mariozechner/pi-tui'

const ENTER_ALTERNATE_SCREEN = '\u001B[?1049h\u001B[H'
const ENABLE_MOUSE = '\u001B[?1002l\u001B[?1003l\u001B[?1007l\u001B[?1000h\u001B[?1006h'
const DISABLE_MOUSE = '\u001B[?1000l\u001B[?1002l\u001B[?1003l\u001B[?1006l\u001B[?1007l'
const SHOW_CURSOR_AND_LEAVE = '\u001B[?25h\u001B[?1049l'
const SGR_MOUSE = /^\u001B\[<(\d+);(\d+);(\d+)[Mm]$/u

/** Private compatibility marker consumed only by the pinned pi-tui patch. */
export interface ManagedTerminal {
  __seekttyManagedAlternateScreen?: boolean
  restoreProtocolsSync?(): void
  restoreRawModeSync?(): void
}

/** Private compatibility hook supplied by the pinned pi-tui patch. */
export interface ManagedTui {
  stopRenderingSync?(): void
}

export interface TerminalSession {
  enter(): void
  restore(): void
}

/** Whether an interactive Surface may safely use terminal private modes. */
export function supportsManagedTerminal(interactive: boolean, term: string | undefined): boolean {
  return interactive && term?.trim().toLowerCase() !== 'dumb'
}

/**
 * Own the alternate-screen and mouse-reporting bytes around one Surface.
 * Existing pi-tui paste, keyboard, raw-mode, and listener state stays with pi-tui.
 */
export function createTerminalSession(
  terminal: Terminal & ManagedTerminal,
  enabled: boolean,
  beforeRestore: () => void = () => undefined,
): TerminalSession {
  let active = false
  return {
    enter: () => {
      if (!enabled || active) return
      active = true
      terminal.__seekttyManagedAlternateScreen = true
      terminal.write(ENTER_ALTERNATE_SCREEN + ENABLE_MOUSE)
    },
    restore: () => {
      if (!active) return
      try { beforeRestore() } catch { /* terminal restoration must still run */ }
      try {
        terminal.write(DISABLE_MOUSE)
      } finally {
        try {
          terminal.restoreProtocolsSync?.()
        } finally {
          terminal.write(SHOW_CURSOR_AND_LEAVE)
          active = false
        }
      }
    },
  }
}

/**
 * Decode one SGR mouse report.
 * @returns positive/negative wheel lines, null for a consumed mouse sequence,
 * or undefined when the input is not mouse data.
 */
export function terminalMouseDelta(data: string): number | null | undefined {
  const match = SGR_MOUSE.exec(data)
  if (match !== null) {
    const button = Number(match[1])
    const normalized = button & ~28 // Ignore Shift/Alt/Ctrl modifier bits.
    if (normalized === 64) return 3
    if (normalized === 65) return -3
    return null
  }
  if (data.startsWith('\u001B[<') || data.startsWith('\u001B[M')) return null
  return undefined
}
