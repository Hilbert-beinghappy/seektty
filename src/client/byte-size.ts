/** Human-readable byte counts for export notices. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Format a byte count using 1024-based units.
 * @param bytes - non-negative integer byte length.
 * @returns a compact label such as `11.8 MB`.
 */
export function formatByteSize(bytes: number): string {
  const amount = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  let value = amount
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(amount)} B`
  const scaled = value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
  return `${scaled} ${UNITS[unit]}`
}
