/** Queue order helpers. Host QueueAction has no atomic move; the TUI must not fake one. */

/**
 * Return a new array with one item swapped toward `direction`.
 * @param items - current order.
 * @param index - item to move.
 * @param direction - -1 up, +1 down.
 */
export function moveIndex<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction
  if (index < 0 || next < 0 || next >= items.length) return [...items]
  const copy = [...items]
  const [row] = copy.splice(index, 1)
  if (row === undefined) return copy
  copy.splice(next, 0, row)
  return copy
}

/**
 * Message rows first, bulk actions last, so Enter targets a queued message.
 * @param rowIds - snapshot queue ids in Host order.
 * @param queuedCount - number of rows still in `queued` placement.
 */
export function queueListChoiceOrder(rowIds: readonly string[], queuedCount: number): readonly string[] {
  return [
    ...rowIds,
    ...(queuedCount > 1 ? ['__all_steer__'] : []),
    ...(queuedCount > 0 ? ['__clear__'] : []),
  ]
}
