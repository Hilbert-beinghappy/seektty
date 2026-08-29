import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui'

/** Open composer and transcript borders, optionally labelled at the right edge. */
export function horizontalRule(
  label: string,
  width: number,
  paint: (text: string) => string,
  paintLabel?: (text: string) => string,
): string {
  if (width <= 1) return paint('─'.repeat(Math.max(1, width)))
  const labelWidth = Math.max(0, width - 2)
  const safeLabel = labelWidth === 0 ? '' : truncateToWidth(label, labelWidth, '…')
  const suffix = safeLabel === '' ? '' : ` ${safeLabel}`
  const rule = '─'.repeat(Math.max(1, width - visibleWidth(suffix)))
  return paintLabel === undefined || safeLabel === ''
    ? paint(`${rule}${suffix}`)
    : `${paint(rule)} ${paintLabel(safeLabel)}`
}
