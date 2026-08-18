/** Status-bar copy for automatically presented pending interactions. */

import { ui } from './locale.ts'

/**
 * Describe waiting approvals/questions. `/pending` is reserved for retry failures.
 * @param pending - current snapshot pending rows.
 */
export function pendingInteractionStatus(
  pending: readonly { readonly kind: string }[],
): string | undefined {
  const approvals = pending.filter(item => item.kind === 'approval').length
  const questions = pending.filter(item => item.kind === 'question').length
  const total = approvals + questions
  if (total === 0) return undefined
  if (questions === 0) {
    return approvals === 1
      ? ui('等待工具审批', 'Waiting for tool approval')
      : ui(`等待 ${String(approvals)} 项工具审批`, `Waiting for ${String(approvals)} tool approval(s)`)
  }
  if (approvals === 0) {
    return questions === 1
      ? ui('等待回答问题', 'Waiting for a question')
      : ui(`等待 ${String(questions)} 项问题`, `Waiting for ${String(questions)} question(s)`)
  }
  return ui(`等待 ${String(total)} 项交互`, `Waiting for ${String(total)} interaction(s)`)
}
