import { describe, expect, it } from 'vitest'
import type { RunningToolCall } from '@deepseek-ai/dsh-client-runtime/node-client'
import { composeApprovalDetail } from '../src/client/approval-preview.ts'
import { toolApprovalPreview } from '../src/client/transcript.ts'

describe('approval overlay copy (review #16)', () => {
  it('embeds the full shell command', () => {
    const call = {
      callId: 'call-1',
      name: 'shell',
      argsRaw: '{"command":"ls"}',
      callView: { card: 'terminal', title: 'rm -rf tmp' },
    } as unknown as RunningToolCall
    expect(toolApprovalPreview(call)).toBe('$ rm -rf tmp')
    expect(composeApprovalDetail({
      reason: '需要执行命令',
      fallback: '调用 call-1',
      preview: toolApprovalPreview(call),
    }).detail).toContain('$ rm -rf tmp')
  })

  it('embeds a line-level file diff', () => {
    const call = {
      callId: 'call-2',
      name: 'edit',
      argsRaw: '{}',
      callView: {
        card: 'diff',
        diffs: [{ path: 'src/index.ts', oldText: 'old\n', newText: 'new\n' }],
      },
    } as unknown as RunningToolCall
    const preview = toolApprovalPreview(call)
    expect(preview).toContain('diff -- src/index.ts')
    expect(preview).toContain('-old')
    expect(preview).toContain('+new')
  })

  it('falls back to the localized call line when there is no reason or preview', () => {
    expect(composeApprovalDetail({ fallback: '调用 call-9', preview: '' }))
      .toEqual({ detail: '调用 call-9' })
  })

  it('offers a full-parameter page when the preview is truncated', () => {
    const preview = Array.from({ length: 40 }, (_, index) => `arg ${String(index)}`).join('\n')
    const composed = composeApprovalDetail({ reason: 'long', fallback: '调用 c', preview })
    expect(composed.full).toContain('arg 39')
    expect(composed.detail.split('\n').length).toBeLessThanOrEqual(17)
    expect(composed.detail.endsWith('…')).toBe(true)
  })
})
