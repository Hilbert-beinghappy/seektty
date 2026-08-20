import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { explainFailure, pluginFailureDetail, startupTimeoutError, withRunningRetry } from '../src/client/error-advice.ts'
import { setUiLocale } from '../src/client/locale.ts'

const root = resolve(import.meta.dirname, '..')

afterEach(() => { setUiLocale('zh') })

describe('actionable failure text', () => {
  it('unwraps in-process transport failures and keeps installer warnings', () => {
    const transport = explainFailure('transport failure for /api/foo: handler failure: boom')
    expect(transport).not.toContain('\n')
    expect(transport).toContain('重试当前操作，再次失败运行 /doctor')
    expect(explainFailure('读取工作区与会话超时，请运行 /doctor 检查 Harness 状态')).not.toContain('/doctor')
    expect(explainFailure('读取工作区与会话超时，请运行 /doctor 检查 Harness 状态')).toContain('重新运行 deepseek')
    expect(explainFailure('读取工作区与会话超时')).toContain('重新运行 deepseek')
    expect(pluginFailureDetail({
      stderr: '',
      stdout: '',
      warnings: ['pnpm 不在 PATH 中；请安装 pnpm 后重试'],
    })).toContain('pnpm 不在 PATH')
  })

  it('localizes a stable 超时 machine mark instead of English timed-out copy', () => {
    setUiLocale('en')
    const message = startupTimeoutError('Reading workspace').message
    expect(message).toContain('超时')
    const explained = explainFailure(message)
    expect(explained).toBe('Confirm dsh is on PATH or DSH_BIN, check the Profile, then run deepseek again.')
    expect(explained).not.toContain('Startup timed out')
    expect(explained).not.toMatch(/\p{Script=Han}/u)
    const source = readFileSync(resolve(root, 'src/client/client-runtime.ts'), 'utf8')
    expect(source).toMatch(/startupTimeoutError\(label\)/u)
    expect(source).not.toMatch(/reject\(new Error\(ui\(/u)
  })

  it('keeps every English branch on one action-first line', () => {
    setUiLocale('en')
    const cases = [
      explainFailure('transport failure for /api/foo: handler failure: boom'),
      explainFailure(startupTimeoutError('Reading workspace').message),
      explainFailure('pnpm 不在 PATH 中；请安装 pnpm 后重试'),
      explainFailure('ENOENT: no such file'),
      explainFailure('EACCES: permission denied'),
      explainFailure('EPERM: operation not permitted'),
    ]
    for (const explained of cases) {
      expect(explained).not.toContain('\n')
      expect(explained).not.toMatch(/\p{Script=Han}/u)
    }
    expect(cases[0]).toBe('Retry this action; if it fails again, run /doctor')
    expect(cases[1]).toMatch(/^Confirm dsh is on PATH/)
    expect(cases[2]).toMatch(/^Install pnpm/)
    expect(cases[3]).toMatch(/^Confirm the path exists/)
    expect(cases[4]).toMatch(/^Check the current permission/)
    expect(cases[5]).toMatch(/^Check the current permission/)
  })

  it('turns a Host text-only model rejection into one action-first line', () => {
    expect(explainFailure('Model "deepseek-v4-flash" does not support image input.')).toBe(
      '当前模型 deepseek-v4-flash 不支持图片输入',
    )
    expect(explainFailure('attachment-error: Model "deepseek-v4-pro" does not support image input.')).toContain('deepseek-v4-pro')
    expect(explainFailure('DeepSeek model "deepseek-v4-flash" does not accept image input.')).toContain('不支持图片')
    setUiLocale('en')
    expect(explainFailure('Model "deepseek-v4-flash" does not support image input.')).toBe(
      'Model deepseek-v4-flash does not accept image input',
    )
    expect(explainFailure('Model "deepseek-v4-flash" does not support image input.')).not.toMatch(/\p{Script=Han}/u)
  })

  it('keeps a still-running turn visible after a stop or send failure', () => {
    expect(withRunningRetry('停止失败：boom', false)).toBe('停止失败：boom')
    expect(withRunningRetry('停止失败：boom', true)).toBe('停止失败：boom · 仍在生成 · Ctrl+C 重试')
    expect(withRunningRetry('引导失败：boom', true)).toContain('仍在生成 · Ctrl+C 重试')
    expect(withRunningRetry('命令失败：boom', true)).toContain('仍在生成 · Ctrl+C 重试')
    setUiLocale('en')
    expect(withRunningRetry('Command failed: boom', true)).toBe('Command failed: boom · Still generating · Ctrl+C to retry')
    expect(withRunningRetry('Command failed: boom', true)).not.toMatch(/\p{Script=Han}/u)
  })
})
