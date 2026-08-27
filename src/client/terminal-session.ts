import type { Terminal } from '@mariozechner/pi-tui'
import {
  encodeDisableMouseReporting,
  encodeMouseReporting,
  ENTER_ALTERNATE_SCREEN,
  LEAVE_ALTERNATE_SCREEN,
  terminalMouseDelta,
} from './mouse-protocol.ts'

export { terminalMouseDelta }

export type MouseReportingMode = 'full' | 'native'

/** Private compatibility marker consumed only by the pinned pi-tui patch. */
export interface ManagedTerminal {
  __seekttyManagedAlternateScreen?: boolean
  restoreProtocolsSync?(): void
  restoreRawModeSync?(): void
}

/** Private compatibility hook supplied by the pinned pi-tui patch. */
export interface ManagedTui {
  stopRenderingSync?(): void
  getLastFrameGeometry?(): {
    readonly terminalWidth: number
    readonly terminalHeight: number
    readonly rootScreenOrigin: { readonly col: number; readonly row: number }
    readonly rootSliceOffset: number
    readonly overlays: readonly {
      readonly row: number
      readonly col: number
      readonly width: number
      readonly height: number
      readonly zOrder: number
      readonly capturing: boolean
    }[]
  }
  onAfterRender?: () => void
}

export interface TerminalSession {
  enter(): void
  restore(): void
  setMouseReporting(mode: MouseReportingMode): void
  mouseReporting(): MouseReportingMode
}

/** Whether an interactive Surface may safely use terminal private modes. */
export function supportsManagedTerminal(interactive: boolean, term: string | undefined): boolean {
  return interactive && term?.trim().toLowerCase() !== 'dumb'
}

/**
 * Own the alternate-screen and mouse-reporting bytes around one Surface.
 * Existing pi-tui paste, keyboard, raw-mode, and listener state stays with pi-tui.
 * Live mouse toggles write only mouse/focus private modes and never 1049h/1049l.
 */
export function createTerminalSession(
  terminal: Terminal & ManagedTerminal,
  enabled: boolean,
  beforeRestore: () => void = () => undefined,
): TerminalSession {
  let active = false
  let mouseMode: MouseReportingMode = 'full'
  return {
    enter: () => {
      if (!enabled || active) return
      active = true
      terminal.__seekttyManagedAlternateScreen = true
      terminal.write(ENTER_ALTERNATE_SCREEN + encodeMouseReporting(mouseMode))
    },
    restore: () => {
      if (!active) return
      try { beforeRestore() } catch { /* terminal restoration must still run */ }
      try {
        terminal.write(encodeDisableMouseReporting())
      } finally {
        try {
          terminal.restoreProtocolsSync?.()
        } finally {
          terminal.write(LEAVE_ALTERNATE_SCREEN)
          active = false
        }
      }
    },
    setMouseReporting: (mode) => {
      if (mouseMode === mode) return
      mouseMode = mode
      if (!enabled || !active) return
      terminal.write(encodeMouseReporting(mode))
    },
    mouseReporting: () => mouseMode,
  }
}
