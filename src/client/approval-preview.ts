/** Approval overlay copy: visible command/diff plus a full-parameter subpage when truncated. */

export const APPROVAL_DETAIL_MAX_LINES = 16
export const APPROVAL_DETAIL_MAX_CHARS = 1_200

export function composeApprovalDetail(options: {
  readonly reason?: string
  readonly callId?: string
  readonly approvalId?: string
  readonly preview: string
}): { readonly detail: string; readonly full?: string } {
  const fallback = `调用 ${options.callId ?? options.approvalId ?? 'unknown'}`
  const parts = [options.reason?.trim(), options.preview.trim()].filter(part => part !== undefined && part !== '')
  const full = parts.length === 0 ? fallback : parts.join('\n\n')
  const lines = full.split('\n')
  if (lines.length <= APPROVAL_DETAIL_MAX_LINES && full.length <= APPROVAL_DETAIL_MAX_CHARS) {
    return { detail: full }
  }
  return {
    detail: `${lines.slice(0, APPROVAL_DETAIL_MAX_LINES).join('\n')}\n…`,
    full,
  }
}
