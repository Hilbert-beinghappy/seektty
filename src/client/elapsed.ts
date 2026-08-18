/** Shared live-duration formatting for transcript rows and the status strip. */

/**
 * Format an in-flight duration using the same compact clock as transcript rows.
 * @param milliseconds - elapsed milliseconds; negative values clamp to zero.
 * @returns `3.2s` under a minute, otherwise `1m5s`.
 */
export function formatElapsed(milliseconds: number): string {
  const clamped = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0
  const seconds = clamped / 1_000
  if (seconds < 60) return `${String(Math.round(seconds * 10) / 10)}s`
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60))}m${String(whole % 60)}s`
}
