/**
 * Cordis 4.0.1 FiberState is a declaration-only const enum with no runtime export.
 * Keep the numeric map local so a Cordis reorder can be detected at boot.
 */

export const FIBER_STATE = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
} as const

const KNOWN = new Set<number>(Object.values(FIBER_STATE))

/**
 * True when the Host fiber is ACTIVE. Unknown numeric states warn instead of
 * failing silently.
 * @param state - `ctx.fiber.state` from Cordis.
 * @param warn - stderr-compatible writer used for the self-check.
 */
export function isActiveFiber(
  state: number,
  warn: (chunk: string) => unknown = () => undefined,
): boolean {
  if (!KNOWN.has(state)) warn(`seektty: unknown Cordis fiber.state ${String(state)}\n`)
  return state === FIBER_STATE.ACTIVE
}
