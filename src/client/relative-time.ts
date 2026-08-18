/** Relative timestamps for session list rows. */

import { ui } from './locale.ts'

/**
 * Format an updatedAt epoch as a compact relative clock.
 * @param updatedAt - epoch milliseconds.
 * @param now - comparison instant; defaults to Date.now().
 * @returns a short relative label, or a calendar date after seven days.
 */
export function relativeTime(updatedAt: number, now = Date.now()): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return ui('未知时间', 'unknown time')
  const delta = now - updatedAt
  if (delta < 45_000) return ui('刚刚', 'just now')
  if (delta < 90_000) return ui('1 分钟前', '1 minute ago')
  if (delta < 3_600_000) {
    const minutes = Math.round(delta / 60_000)
    return ui(`${String(minutes)} 分钟前`, `${String(minutes)} minutes ago`)
  }
  if (delta < 5_400_000) return ui('1 小时前', '1 hour ago')
  if (delta < 86_400_000) {
    const hours = Math.round(delta / 3_600_000)
    return ui(`${String(hours)} 小时前`, `${String(hours)} hours ago`)
  }
  if (delta < 172_800_000) return ui('昨天', 'yesterday')
  if (delta < 7 * 86_400_000) {
    const days = Math.round(delta / 86_400_000)
    return ui(`${String(days)} 天前`, `${String(days)} days ago`)
  }
  return new Date(updatedAt).toISOString().slice(0, 10)
}

/**
 * Sort session rows by recency without mutating the Host list order.
 * @param rows - current Session summaries.
 * @returns newest-first copies.
 */
export function sortSessionsByUpdatedAt<T extends { readonly updatedAt: number }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((left, right) => right.updatedAt - left.updatedAt)
}
