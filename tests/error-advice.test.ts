import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { explainFailure, pluginFailureDetail, startupTimeoutError, withRunningRetry } from '../src/client/error-advice.ts'
import { setUiLocale } from '../src/client/locale.ts'

const root = resolve(import.meta.dirname, '..')

afterEach(() => { setUiLocale('zh') })

describe('actionable failure text', () => {
  it('unwraps in-process transport failures and keeps installer warnings', () => {
    expect(explainFailure('transport failure for /api/foo: handler failure: boom')).toContain('内部调用失败：boom')
    expect(explainFailure('transport failure for /api/foo: handler failure: boom')).toContain('下一步')
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
    expect(explained).toContain('Startup timed out')
    expect(explained).not.toMatch(/\p{Script=Han}/u)
    const source = readFileSync(resolve(root, 'src/client/client-runtime.ts'), 'utf8')
    expect(source).toMatch(/startupTimeoutError\(label\)/u)
    expect(source).not.toMatch(/reject\(new Error\(ui\(/u)
  })

  it('keeps a still-running turn visible after a stop or send failure', () => {
    expect(withRunningRetry('停止失败：boom', false)).toBe('停止失败：boom')
    expect(withRunningRetry('停止失败：boom', true)).toBe('停止失败：boom · 仍在生成 · Ctrl+C 重试')
    expect(withRunningRetry('引导失败：boom', true)).toContain('仍在生成 · Ctrl+C 重试')
    expect(withRunningRetry('命令失败：boom', true)).toContain('仍在生成 · Ctrl+C 重试')
    setUiLocale('en')
    expect(withRunningRetry('Command failed: boom', true)).toBe('Command failed: boom · Still generating · Ctrl+C to retry')
    expect(withRunningRetry('Command failed: boom', true)).not.toMatch(/\p{Script=Han}/u)
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).toMatch(/capabilityError\(snapshot\.promptError\.error\)/u)
    expect(surface).toMatch(/withRunningRetry\(capabilityError\(result\.error\), current\.session\.getSnapshot\(\)\.running\)/u)
    expect(surface).toMatch(/withRunningRetry\(\s*capabilityError\(error\),/u)
    expect(surface).not.toMatch(/发送失败：\$\{snapshot\.promptError/u)
  })
})
