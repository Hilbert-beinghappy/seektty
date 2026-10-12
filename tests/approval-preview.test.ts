import { describe, expect, it } from 'vitest'
import type { RunningToolCall } from '@deepseek-ai/dsh-client-runtime/node-client'
import { composeApprovalDetail } from '../src/client/approval-preview.ts'
import { toolApprovalPreview } from '../src/client/transcript.ts'

describe('approval overlay copy (review #16)', () => {
  it.each(['reason', 'displayReason'] as const)('strips all SGR and control strings from %s without modifying its source', field => {
    const raw = 'Looks safe\u001b[8m\u001b[7m\u001b[38;2;0;0;0m\u001b[48:2::0:0:0m\u001b]8;;https://invalid\u0007\u009b8m'
    const options: Parameters<typeof composeApprovalDetail>[0] = { ...(field === 'reason' ? { reason: raw } : { displayReason: { en: raw } }),
      fallback: 'call', preview: 'DANGEROUS_COMMAND_VISIBLE', locale: 'en' }
    expect(composeApprovalDetail(options).detail).toBe('Looks safe\n\nDANGEROUS_COMMAND_VISIBLE')
    expect(field === 'reason' ? options.reason : options.displayReason?.en).toBe(raw)
  })
  it('selects localized display copy without replacing the audited reason, with English fallback', () => {
    const displayReason = { en: 'Auto review denied this call: 保留理由', zh: 'Auto review 拒绝了此调用：保留理由' }
    const options = { reason: 'Audited English reason', displayReason, fallback: 'call', preview: '' }
    expect(composeApprovalDetail({ ...options, locale: 'zh' }).detail).toBe(displayReason.zh)
    expect(composeApprovalDetail({ ...options, locale: 'fr' }).detail).toBe(displayReason.en)
    expect(options.reason).toBe('Audited English reason')
  })
  it('sanitizes terminal control strings and bounds one long reason while retaining full safe copy', () => {
    const composed = composeApprovalDetail({ displayReason: { en: `reason\u001b]52;c;secret\u0007${'x'.repeat(1500)}\u001b[2J` },
      fallback: 'call', preview: '', locale: 'en' })
    expect(composed.detail.length).toBeLessThanOrEqual(1200)
    expect(composed.full).toBe(`reason${'x'.repeat(1500)}`)
  })
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
