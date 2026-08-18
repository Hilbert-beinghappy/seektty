/** Decide whether Ctrl+C stops generation before an overlay can consume it. */

export type CtrlCTarget = 'cancel-session' | 'overlay' | 'idle-surface'

/**
 * Running sessions consume Ctrl+C before overlays. Idle overlays still close.
 * @param input - current session and overlay state.
 */
export function ctrlCTarget(input: {
  readonly running: boolean
  readonly overlayActive: boolean
}): CtrlCTarget {
  if (input.running) return 'cancel-session'
  if (input.overlayActive) return 'overlay'
  return 'idle-surface'
}
