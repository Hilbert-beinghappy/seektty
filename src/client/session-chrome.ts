/** Per-session elapsed, notify, and title snapshots for the running Surface. */

import type { DesktopNotifySnapshot } from './desktop-notify.ts'

/** Mutable chrome that must not leak across Session ids. */
export interface SessionRuntimeChrome {
  runningSince: number | undefined
  notify: DesktopNotifySnapshot
  notifyPrimed: boolean
  lastTitle: string
}

function emptyChrome(): SessionRuntimeChrome {
  return {
    runningSince: undefined,
    notify: { running: false, pending: [] },
    notifyPrimed: false,
    lastTitle: '',
  }
}

/**
 * Isolate running/notify/title state so switching sessions cannot inherit
 * the previous Session's elapsed clock or completion bell.
 */
export function createSessionChromeStore(): {
  of(sessionId: string): SessionRuntimeChrome
} {
  const states = new Map<string, SessionRuntimeChrome>()
  return {
    of(sessionId) {
      let state = states.get(sessionId)
      if (state === undefined) {
        state = emptyChrome()
        states.set(sessionId, state)
      }
      return state
    },
  }
}

/**
 * Return the next OSC title only when it differs from the last write.
 */
export function nextTitleWrite(previous: string, next: string): string | undefined {
  return previous === next ? undefined : next
}
