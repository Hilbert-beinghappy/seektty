/** Approval overlay copy: visible command/diff plus a full-parameter subpage when truncated. */
import { uiLocale } from './locale.ts'
import { escapeTerminalText } from './theme.ts'

export const APPROVAL_DETAIL_MAX_LINES = 16
export const APPROVAL_DETAIL_MAX_CHARS = 1_200

/** Untrusted approval copy is plain text. The shared renderer intentionally
 * preserves SGR for trusted styles; strip those too at this decision boundary.
 */
function plainApprovalText(text: string): string {
  return escapeTerminalText(text).replace(/\u001b\[[0-9;:]*m/gu, '')
}

/**
 * Compose the approval overlay detail from the localized fallback line,
 * the wait reason, and the transcript-shaped tool preview.
 * @param options - reason from the wait payload, caller-localized fallback,
 * and the flattened tool preview.
 * @returns the visible detail plus the full text when truncated.
 */
export function composeApprovalDetail(options: {
  readonly reason?: string
  readonly displayReason?: Readonly<{ en: string; [locale: string]: string }>
  readonly locale?: string
  readonly fallback: string
  readonly preview: string
}): { readonly detail: string; readonly full?: string } {
  const localized = options.displayReason?.[options.locale ?? uiLocale()] ?? options.displayReason?.en
  const parts = [localized ?? options.reason, options.preview]
    .map(part => part === undefined ? undefined : plainApprovalText(part).trim())
    .filter((part): part is string => part !== undefined && part !== '')
  const full = parts.length === 0 ? plainApprovalText(options.fallback) : parts.join('\n\n')
  const lines = full.split('\n')
  if (lines.length <= APPROVAL_DETAIL_MAX_LINES && full.length <= APPROVAL_DETAIL_MAX_CHARS) {
    return { detail: full }
  }
  return {
    detail: `${lines.slice(0, APPROVAL_DETAIL_MAX_LINES).join('\n').slice(0, APPROVAL_DETAIL_MAX_CHARS - 2)}\n…`,
    full,
  }
}
