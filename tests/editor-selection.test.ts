import { describe, expect, it, vi } from 'vitest'
import type { TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { editorMouseApi } from '../src/client/pi-tui-adapters.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

describe('pinned pi-tui editor selection contract', () => {
  it('renders a persistent selection without changing visible text', () => {
    const composer = editor()
    composer.setText('hello')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 1 }, { line: 0, col: 4 })
    const rendered = composer.render(40)
    expect(rendered.some(line => line.includes('\u001B[7m'))).toBe(true)
    expect(rendered.map(stripCopyDecorations).some(line => line.includes('hello'))).toBe(true)
    expect(editorMouseApi(composer).getSelection?.()).toEqual({
      anchor: { line: 0, col: 1 },
      focus: { line: 0, col: 4 },
    })
  })

  it('replaces forward and reverse selections with normal input', () => {
    const composer = editor()
    composer.setText('hello')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 4 }, { line: 0, col: 1 })
    composer.handleInput('X')
    expect(composer.getText()).toBe('hXo')
    expect(editorMouseApi(composer).getSelection?.()).toBeUndefined()
  })

  it('deletes a multi-line selection with Backspace or Delete', () => {
    const composer = editor()
    composer.setText('one\ntwo\nthree')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 1 }, { line: 2, col: 2 })
    composer.handleInput('\u007F')
    expect(composer.getText()).toBe('oree')
    composer.setText('abcde')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 1 }, { line: 0, col: 4 })
    composer.handleInput('\u001B[3~')
    expect(composer.getText()).toBe('ae')
  })

  it('replaces the selection atomically for bracketed and public plain-text paste', () => {
    const composer = editor()
    composer.setText('hello')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 1 }, { line: 0, col: 4 })
    composer.handleInput('\u001B[200~A\nB\u001B[201~')
    expect(composer.getText()).toBe('hA\nBo')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 0 }, { line: 1, col: 1 })
    expect(editorMouseApi(composer).replaceSelection?.('safe')).toBe(true)
    expect(composer.getText()).toBe('safeo')
  })

  it('clears selection on submit while preserving the submitted value', () => {
    const composer = editor()
    const submitted = vi.fn()
    composer.onSubmit = submitted
    composer.setText('hello')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 1 }, { line: 0, col: 4 })
    composer.handleInput('\r')
    expect(submitted).toHaveBeenCalledWith('hello')
    expect(editorMouseApi(composer).getSelection?.()).toBeUndefined()
  })

  it('keeps a released selection until Escape explicitly clears it', () => {
    const composer = editor()
    composer.setText('persistent')
    editorMouseApi(composer).setSelection?.({ line: 0, col: 0 }, { line: 0, col: 4 })
    composer.render(40)
    expect(editorMouseApi(composer).getSelection?.()).toBeDefined()
    composer.handleInput('\u001B')
    expect(editorMouseApi(composer).getSelection?.()).toBeUndefined()
  })
})
