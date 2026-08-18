import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  noticeAfterDispatchCatch,
  noticeAfterFailedHostCommand,
  noticeAfterFailedPrompt,
  noticeAfterPromptError,
} from '../src/client/capabilities.ts'
import { setUiLocale } from '../src/client/locale.ts'

afterEach(() => { setUiLocale('zh') })

describe('send, steer, Host command, and catch failures', () => {
  it('reads snapshot.running after a send prompt returns failure', async () => {
    let running = false
    const prompt = vi.fn(async () => {
      running = true
      return { ok: false as const, error: new Error('send failed') }
    })
    const notice = await noticeAfterFailedPrompt(
      { prompt, getSnapshot: () => ({ running }) },
      [{ type: 'text', text: 'hello' }],
      'queue',
    )
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }], 'queue')
    expect(notice).toContain('仍在生成 · Ctrl+C 重试')
  })

  it('reads snapshot.running after a steer prompt returns failure', async () => {
    const prompt = vi.fn(async () => ({ ok: false as const, error: new Error('steer failed') }))
    const notice = await noticeAfterFailedPrompt(
      { prompt, getSnapshot: () => ({ running: true }) },
      [{ type: 'text', text: 'steer' }],
      'steer',
    )
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'steer' }], 'steer')
    expect(notice).toContain('仍在生成 · Ctrl+C 重试')
  })

  it('reads snapshot.running after a Host command returns failure', async () => {
    const command = vi.fn(async () => ({ ok: false as const, error: new Error('command failed') }))
    const outcome = await noticeAfterFailedHostCommand(
      { command, getSnapshot: () => ({ running: true }) },
      '/compact',
    )
    expect(command).toHaveBeenCalledWith('/compact')
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('expected Host command failure')
    expect(outcome.message).toContain('仍在生成 · Ctrl+C 重试')
  })

  it('reads snapshot.running from the active session on dispatch catch', () => {
    const session = { getSnapshot: () => ({ running: true }) }
    expect(noticeAfterDispatchCatch(new Error('boom'), session)).toContain('仍在生成 · Ctrl+C 重试')
    expect(noticeAfterDispatchCatch(new Error('boom'), undefined)).not.toContain('仍在生成')
  })

  it('keeps a still-running promptError visible from the live snapshot', () => {
    expect(noticeAfterPromptError({
      promptError: { error: new Error('stop failed') },
      running: true,
    })).toContain('仍在生成 · Ctrl+C 重试')
    expect(noticeAfterPromptError({
      promptError: { error: new Error('stop failed') },
      running: false,
    })).not.toContain('仍在生成')
  })
})
