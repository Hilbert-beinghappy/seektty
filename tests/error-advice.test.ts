import { describe, expect, it } from 'vitest'
import { explainFailure, pluginFailureDetail } from '../src/client/error-advice.ts'

describe('actionable failure text', () => {
  it('unwraps in-process transport failures and keeps installer warnings', () => {
    expect(explainFailure('transport failure for /api/foo: handler failure: boom')).toContain('内部调用失败：boom')
    expect(explainFailure('transport failure for /api/foo: handler failure: boom')).toContain('下一步')
    expect(explainFailure('读取工作区与会话超时，请运行 /doctor 检查 Harness 状态')).not.toContain('/doctor')
    expect(explainFailure('读取工作区与会话超时，请运行 /doctor 检查 Harness 状态')).toContain('重新运行 deepseek')
    expect(pluginFailureDetail({
      stderr: '',
      stdout: '',
      warnings: ['pnpm 不在 PATH 中；请安装 pnpm 后重试'],
    })).toContain('pnpm 不在 PATH')
  })
})
