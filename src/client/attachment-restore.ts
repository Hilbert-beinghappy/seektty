/** User-visible restart attachment restore notices. Must not leak filesystem paths. */

import { capabilityError } from './capabilities.ts'
import { ui } from './locale.ts'
import type { NoticeTone } from './status-priority.ts'

export function attachmentRestoreSuccessNotice(count: number): string {
  return ui(`已恢复 ${count} 个附件`, `Restored ${count} attachment(s)`)
}

export function attachmentRestoreFailureNotice(items: readonly string[]): string {
  return ui(`部分附件未恢复：${items.join('；')}`, `Some attachments were not restored: ${items.join('; ')}`)
}

/**
 * Publish the restart restore result. Failure must outrank a later startup
 * warning such as deferred provider onboarding (single warning slot).
 */
export function applyHandoffAttachmentRestoreNotice(
  setNotice: (message: string, tone: NoticeTone) => void,
  failures: readonly string[],
  restoredCount: number,
): void {
  if (failures.length === 0) {
    setNotice(attachmentRestoreSuccessNotice(restoredCount), 'success')
    return
  }
  setNotice(attachmentRestoreFailureNotice(failures), 'error')
}

function attachmentRestoreLabel(path: string, index: number): string {
  const name = path.replaceAll('\\', '/').split('/').filter(part => part !== '').at(-1) ?? ''
  if (name === '' || name === '.' || name === '..' || /^[A-Za-z]:$/u.test(name)) {
    return String(index + 1)
  }
  return name
}

function withoutOriginalPath(message: string, path: string, label: string): string {
  const spellings = new Set([
    path,
    path.replaceAll('\\', '/'),
    path.replaceAll('/', '\\'),
  ])
  let safe = message
  for (const spelling of spellings) {
    if (spelling !== '') safe = safe.replaceAll(spelling, label)
  }
  return safe
}

export function attachmentRestoreFailureItem(path: string, error: unknown, index: number): string {
  const label = attachmentRestoreLabel(path, index)
  return `${label}: ${withoutOriginalPath(capabilityError(error), path, label)}`
}
