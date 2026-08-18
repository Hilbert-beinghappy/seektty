import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { pendingInteractionStatus } from '../src/client/pending-status.ts'

afterEach(() => { setUiLocale('zh') })

describe('pending status copy', () => {
  it('describes waiting work without teaching /pending', () => {
    expect(pendingInteractionStatus([{ kind: 'approval' }])).toBe('等待工具审批')
    expect(pendingInteractionStatus([{ kind: 'question' }])).toBe('等待回答问题')
    expect(pendingInteractionStatus([
      { kind: 'approval' },
      { kind: 'approval' },
    ])).toBe('等待 2 项工具审批')
    expect(pendingInteractionStatus([
      { kind: 'approval' },
      { kind: 'question' },
    ])).toBe('等待 2 项交互')
    expect(pendingInteractionStatus([])).toBeUndefined()
    expect(pendingInteractionStatus([{ kind: 'approval' }])).not.toContain('/pending')
  })
})
