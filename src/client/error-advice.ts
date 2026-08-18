/** Map opaque Host/runtime failures into one status-bar line, action first. */

import { ui } from './locale.ts'

/** Stable Chinese machine mark for startup timeouts; matching must not follow the UI locale. */
const STARTUP_TIMEOUT = { zh: '超时', en: 'timed out' } as const
export const STARTUP_TIMEOUT_MARK = STARTUP_TIMEOUT.zh

export interface PluginFailureOutput {
  readonly stderr: string
  readonly stdout: string
  readonly warnings: readonly string[]
}

function unwrapTransport(message: string): string | undefined {
  const match = /^transport failure for .+?: handler failure: ([\s\S]+)$/u.exec(message)
  return match === null ? undefined : match[1]?.trim()
}

/** Collapse Host text so StatusBar never receives an embedded newline. */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/gu, ' ').replace(/[ \t]+/gu, ' ').trim()
}

/**
 * Build the language-agnostic timeout Error thrown by snapshot waits.
 * @param label - startup phase already chosen by the caller.
 */
export function startupTimeoutError(label: string): Error {
  return new Error(`${label}${STARTUP_TIMEOUT_MARK}`)
}

/**
 * Combine installer streams so pnpm PATH warnings survive a non-zero exit.
 * @param result - host plugin operation output.
 */
export function pluginFailureDetail(result: PluginFailureOutput): string {
  const chunks = [...result.warnings, result.stderr, result.stdout]
    .map(chunk => chunk.trim())
    .filter(chunk => chunk !== '')
  return chunks.length === 0 ? ui('无 pnpm 输出', 'No pnpm output') : chunks.join('\n')
}

/**
 * Rewrite a raw failure into a single action-first StatusBar line.
 * @param message - original Error.message or stringified failure.
 */
export function explainFailure(message: string): string {
  if (unwrapTransport(message) !== undefined) {
    return ui(
      '重试当前操作，再次失败运行 /doctor',
      'Retry this action; if it fails again, run /doctor',
    )
  }
  if (message.includes(STARTUP_TIMEOUT_MARK)) {
    return ui(
      '确认 dsh 在 PATH 或 DSH_BIN 中，检查 Profile 后重新运行 deepseek',
      'Confirm dsh is on PATH or DSH_BIN, check the Profile, then run deepseek again.',
    )
  }
  if (/pnpm 不在 PATH/u.test(message) || /exit 127/u.test(message)) {
    return ui(
      '安装 pnpm 并确保它在 PATH 中后重试',
      'Install pnpm; it is not on PATH, then retry',
    )
  }
  if (/\bENOENT\b/u.test(message)) {
    return ui(
      '确认路径存在且可读后重试',
      'Confirm the path exists and is readable, then retry',
    )
  }
  if (/\bEACCES\b/u.test(message) || /\bEPERM\b/u.test(message)) {
    return ui(
      '权限不足，检查当前权限后重试',
      'Check the current permission and retry',
    )
  }
  return oneLine(message)
}
