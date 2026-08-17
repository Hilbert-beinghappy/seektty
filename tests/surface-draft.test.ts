import { describe, expect, it, vi } from 'vitest'
import { Key, matchesKey, type TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { clearIdleComposerDraft } from '../src/client/composer-draft.ts'

const UP = '\u001B[A'

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

describe('idle Ctrl+C draft recovery', () => {
  it('stashes multiline composer text so Up restores the original draft', () => {
    const composer = editor()
    const draft = '第一行提示\n请保留这段还没发出去的内容'
    composer.setText(draft)
    composer.render(80)

    const notice = clearIdleComposerDraft(composer, () => undefined)
    expect(notice).toBe('已清空草稿，按 ↑ 可找回')
    expect(composer.getText()).toBe('')

    composer.handleInput(UP)
    expect(composer.getText()).toBe(draft)
  })

  it('clears pending attachments even when the composer text is already empty', () => {
    const composer = editor()
    const clearAttachments = vi.fn()

    const notice = clearIdleComposerDraft(composer, clearAttachments)

    expect(notice).toBe('已清空草稿，按 ↑ 可找回')
    expect(clearAttachments).toHaveBeenCalledOnce()
    expect(composer.getText()).toBe('')
  })

  it('matches the terminal Ctrl+C chord used by the idle composer path', () => {
    expect(matchesKey('\u0003', Key.ctrl('c'))).toBe(true)
  })
})
