/** Approval overlay copy: visible command/diff plus a full-parameter subpage when truncated. */

export const APPROVAL_DETAIL_MAX_LINES = 16
export const APPROVAL_DETAIL_MAX_CHARS = 1_200

/**
 * Compose the approval overlay detail from the localized fallback line,
 * the wait reason, and the transcript-shaped tool preview.
 * @param options - reason from the wait payload, caller-localized fallback,
 * and the flattened tool preview.
 * @returns the visible detail plus the full text when truncated.
 */
export function composeApprovalDetail(options: {
  readonly reason?: string
  readonly fallback: string
  readonly preview: string
}): { readonly detail: string; readonly full?: string } {
  const parts = [options.reason?.trim(), options.preview.trim()]
    .filter((part): part is string => part !== undefined && part !== '')
  const full = parts.length === 0 ? options.fallback : parts.join('\n\n')
  const lines = full.split('\n')
  if (lines.length <= APPROVAL_DETAIL_MAX_LINES && full.length <= APPROVAL_DETAIL_MAX_CHARS) {
    return { detail: full }
  }
  return {
    detail: `${lines.slice(0, APPROVAL_DETAIL_MAX_LINES).join('\n')}\n…`,
    full,
  }
}
