/** Stable focus-then-activate identity; selection, not elapsed time, arms a target. */

export type MouseArmedKind = 'example' | 'autocomplete' | 'option'

export interface MouseArmedActivation {
  readonly kind: MouseArmedKind
  readonly targetId: string
  readonly contentGeneration: number
}

export function armMouseActivation(
  kind: MouseArmedKind,
  targetId: string,
  contentGeneration: number,
): MouseArmedActivation {
  return { kind, targetId, contentGeneration }
}

export function matchesMouseActivation(
  armed: MouseArmedActivation | undefined,
  kind: MouseArmedKind,
  targetId: string,
  contentGeneration: number,
): boolean {
  return armed?.kind === kind
    && armed.targetId === targetId
    && armed.contentGeneration === contentGeneration
}
