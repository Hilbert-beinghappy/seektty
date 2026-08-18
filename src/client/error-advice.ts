/** Map opaque Host/runtime failures into what happened plus a next step. */

import { ui } from './locale.ts'

/** Host timeout copy stays Chinese so matching does not follow the UI locale. */
const TIMEOUT_MARK = { zh: '超时' }

export interface PluginFailureOutput {
  readonly stderr: string
  readonly stdout: string
  readonly warnings: readonly string[]
}

function unwrapTransport(message: string): string | undefined {
  const match = /^transport failure for .+?: handler failure: ([\s\S]+)$/u.exec(message)
  return match === null ? undefined : match[1]?.trim()
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
 * Rewrite a raw failure message into what happened plus a next action.
 * @param message - original Error.message or stringified failure.
 */
export function explainFailure(message: string): string {
  const inner = unwrapTransport(message)
  if (inner !== undefined) {
    return ui(
      `内部调用失败：${inner}\n下一步：重试当前操作；若反复出现，运行 /doctor 或 /restart。`,
      `An internal call failed: ${inner}\nNext: retry this action; if it keeps happening, run /doctor or /restart.`,
    )
  }
  if (message.includes(TIMEOUT_MARK.zh) && message.includes('/doctor')) {
    return ui(
      `${message.replace(/，请运行 \/doctor 检查 Harness 状态$/u, '')}。下一步：确认 dsh 在 PATH 或 DSH_BIN 中，检查 Profile 后重新运行 deepseek。`,
      'Startup timed out. Next: confirm dsh is on PATH or DSH_BIN, check the Profile, then run deepseek again.',
    )
  }
  if (/pnpm 不在 PATH/u.test(message) || /exit 127/u.test(message)) {
    return ui(
      `${message}\n下一步：安装 pnpm 并确保它在 PATH 中，然后重试。`,
      `${message}\nNext: install pnpm, keep it on PATH, then retry.`,
    )
  }
  if (/\bENOENT\b/u.test(message)) {
    return ui(
      `${message}\n下一步：确认路径存在且当前进程有权读取。`,
      `${message}\nNext: confirm the path exists and this process can read it.`,
    )
  }
  if (/\bEACCES\b/u.test(message) || /\bEPERM\b/u.test(message)) {
    return ui(
      `${message}\n下一步：检查文件权限，或换一个可写目录。`,
      `${message}\nNext: check file permissions, or use a writable directory.`,
    )
  }
  return message
}
