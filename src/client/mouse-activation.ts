/** Stable, expiring identity for focus-then-activate mouse targets. */

export const MOUSE_ARM_TTL_MS = 1_500

export type MouseArmedKind = 'example' | 'autocomplete' | 'option'

export interface MouseArmedActivation {
  readonly kind: MouseArmedKind
  readonly targetId: string
  readonly contentGeneration: number
  readonly armedAt: number
}

export function armMouseActivation(
  kind: MouseArmedKind,
  targetId: string,
  contentGeneration: number,
  now = Date.now(),
): MouseArmedActivation {
  return { kind, targetId, contentGeneration, armedAt: now }
}

export function matchesMouseActivation(
  armed: MouseArmedActivation | undefined,
  kind: MouseArmedKind,
  targetId: string,
  contentGeneration: number,
  now = Date.now(),
): boolean {
  return armed?.kind === kind
    && armed.targetId === targetId
    && armed.contentGeneration === contentGeneration
    && now >= armed.armedAt
    && now - armed.armedAt <= MOUSE_ARM_TTL_MS
}
