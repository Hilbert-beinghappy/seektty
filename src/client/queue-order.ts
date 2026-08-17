/** Queue reorder helpers. Host QueueAction has no native move. */

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
