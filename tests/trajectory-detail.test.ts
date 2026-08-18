import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { trajectoryRequestDetail } from '../src/client/trajectory-detail.ts'

afterEach(() => { setUiLocale('zh') })

describe('trajectory request detail (task 6.4)', () => {
  it('prints main request fields instead of JSON', () => {
    const text = trajectoryRequestDetail({
      purpose: 'assistant',
      status: 'completed',
      startedAt: Date.parse('2026-01-01T00:00:00.000Z'),
      completedAt: Date.parse('2026-01-01T00:00:01.250Z'),
      requestConfig: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
      usage: { input: 12, output: 34 },
      prompt: { tools: [{ name: 'shell' }] },
    })
    expect(text).toContain('用途: assistant')
    expect(text).toContain('Provider: deepseek')
    expect(text).toContain('模型: deepseek-chat')
    expect(text).toContain('耗时: 1250 ms')
    expect(text).toContain('用量: input 12 · output 34')
    expect(text).not.toContain('"prompt"')
    expect(text).not.toContain('shell')
  })

  it('marks an in-flight request as running', () => {
    const text = trajectoryRequestDetail({
      purpose: 'assistant',
      status: 'running',
      startedAt: 1,
      completedAt: null,
      requestConfig: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(text).toContain('结束: 运行中')
  })

  it('omits timestamps outside the ECMAScript Date range instead of throwing', () => {
    expect(() => trajectoryRequestDetail({
      purpose: 'assistant',
      status: 'completed',
      startedAt: 8.64e15 + 1,
      completedAt: -8.64e15 - 1,
      requestConfig: { provider: 'deepseek', model: 'deepseek-chat' },
    })).not.toThrow()
    const text = trajectoryRequestDetail({
      purpose: 'assistant',
      status: 'completed',
      startedAt: 8.64e15 + 1,
      completedAt: Date.parse('2026-01-01T00:00:00.000Z'),
      requestConfig: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(text).not.toContain('开始:')
    expect(text).toContain('结束: 2026-01-01T00:00:00.000Z')
  })
})
