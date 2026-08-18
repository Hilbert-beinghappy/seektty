import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { clearIdleComposerDraft } from '../src/client/composer-draft.ts'

const UP = '\u001B[A'

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

describe('idle Ctrl+C draft recovery (review #6)', () => {
  it('stashes multiline composer text so Up restores the original draft', () => {
    const composer = editor()
    const draft = '第一行提示\n请保留这段还没发出去的内容'
    composer.setText(draft)
    composer.render(80)

    const remembered: string[] = []
    const clearAttachments = vi.fn()
    const notice = clearIdleComposerDraft(composer, clearAttachments, (text) => { remembered.push(text) })
    expect(notice).toBe('已清空文字草稿，按 ↑ 可找回；图片仍保留')
    expect(composer.getText()).toBe('')
    expect(remembered).toEqual([draft])
    expect(clearAttachments).not.toHaveBeenCalled()

    composer.handleInput(UP)
    expect(composer.getText()).toBe(draft)
  })

  it('clears pending attachments without touching history when the composer is empty', () => {
    const composer = editor()
    const clearAttachments = vi.fn()
    const remember = vi.fn()

    const notice = clearIdleComposerDraft(composer, clearAttachments, remember)

    expect(notice).toBe('已清除待发送图片')
    expect(clearAttachments).toHaveBeenCalledOnce()
    expect(remember).not.toHaveBeenCalled()
    expect(composer.getText()).toBe('')
  })

  it('keeps pending attachments when Ctrl+C clears non-empty draft text', () => {
    const composer = editor()
    composer.setText('还没发出去的提示')
    const clearAttachments = vi.fn()
    const remember = vi.fn()

    const notice = clearIdleComposerDraft(composer, clearAttachments, remember)

    expect(notice).toBe('已清空文字草稿，按 ↑ 可找回；图片仍保留')
    expect(clearAttachments).not.toHaveBeenCalled()
    expect(remember).toHaveBeenCalledOnce()
    expect(composer.getText()).toBe('')
  })

  it('wires idle Ctrl+C through the draft helper and the durable history path', () => {
    const surface = readFileSync(new URL('../src/client/surface.ts', import.meta.url), 'utf8')
    const wiringAt = surface.indexOf('clearIdleComposerDraft(')
    expect(wiringAt).toBeGreaterThan(-1)
    const persistAt = surface.indexOf('persistComposerHistory(composerHistory)', wiringAt)
    expect(persistAt).toBeGreaterThan(wiringAt)
  })
})
