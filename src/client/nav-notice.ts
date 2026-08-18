/** Pure navigation and successful Host commands stay off the status bar. */

import { ui } from './locale.ts'

export type HostCommandNotice = {
  readonly message: string
  readonly tone: 'error' | 'warning'
}

/**
 * Tab/Esc composer and transcript navigation must not write a toast.
 */
export function noticeForPureNavigation(): undefined {
  return undefined
}

/**
 * Successful matched Host commands are silent. Failures and unknown names still speak.
 * @param result - Host command dispatch outcome.
 * @param name - command token without a slash.
 */
export function noticeForHostCommand(
  result: { readonly ok: true; readonly matched: boolean } | { readonly ok: false; readonly message: string },
  name: string,
): HostCommandNotice | undefined {
  if (!result.ok) {
    return { message: ui(`命令失败：${result.message}`, `Command failed: ${result.message}`), tone: 'error' }
  }
  if (!result.matched) {
    return { message: ui(`未识别命令 /${name}`, `Command /${name} was not recognized`), tone: 'warning' }
  }
  return undefined
}
