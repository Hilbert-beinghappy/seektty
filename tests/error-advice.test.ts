import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { explainFailure, pluginFailureDetail, startupTimeoutError } from '../src/client/error-advice.ts'
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
})
