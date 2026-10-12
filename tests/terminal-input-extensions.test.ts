import { describe, expect, it, vi } from 'vitest'
import type { TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { TerminalInputExtensions, type InsertionScope } from '../src/client/terminal-input-extensions.ts'

function fixture() {
  const editor = new PromptEditor({ terminal: { rows: 24 }, requestRender: vi.fn() } as unknown as TUI)
  let state: InsertionScope = { sessionId: 'session-a', displayTitle: 'A', generation: 1, ready: true, locked: false }
  const controller = new TerminalInputExtensions(editor, () => state)
  return { editor, controller, update: (change: Partial<InsertionScope>) => { state = { ...state, ...change } } }
}
const signal = () => new AbortController().signal
describe('guarded plugin insertion using the real pinned terminal editor', () => {
  it('replaces a reversed multi-line Unicode selection and creates exactly one undo step', () => {
    const { editor, controller } = fixture()
    editor.setText('a🙂b\n后尾')
    editor.setSelection({ line: 1, col: 1 }, { line: 0, col: 1 })
    const capture = controller.captureInsertion()
    expect(capture.target.selection).toEqual({ start: 1, end: 6 })
    expect(controller.insertText('plugin\n', capture, signal())).toBe(true)
    expect(editor.getText()).toBe('aplugin\n尾')
    editor.handleInput('\u001a')
    expect(editor.getText()).toBe('a🙂b\n后尾')
    controller.dispose()
  })
  it('inserts at the captured caret even if the caret moved, without replacing the whole draft', () => {
    const { editor, controller } = fixture(); editor.setText('abcd'); editor.setCursor(0, 1)
    const capture = controller.captureInsertion(); editor.setCursor(0, 4)
    expect(controller.insertText('X', capture, signal())).toBe(true)
    expect(editor.getText()).toBe('aXbcd'); controller.dispose()
  })
  it('rejects edits followed by undo even when text matches again', () => {
    const { editor, controller } = fixture(); editor.setText('draft')
    const capture = controller.captureInsertion()
    editor.handleInput('X'); editor.handleInput('\u001a')
    expect(editor.getText()).toBe('draft')
    expect(controller.insertText('late', capture, signal())).toBe(false)
    expect(editor.getText()).toBe('draft'); controller.dispose()
  })
  it.each(['sessionId', 'generation', 'ready', 'locked'] as const)('rejects %s changes without touching the draft or selection', field => {
    const f = fixture(); f.editor.setText('draft'); f.editor.setSelection({ line: 0, col: 1 }, { line: 0, col: 3 })
    const capture = f.controller.captureInsertion(), selection = f.editor.getSelection()
    const changes = { sessionId: 'session-b', generation: 2, ready: false, locked: true }
    f.update({ [field]: changes[field] })
    expect(f.controller.insertText('late', capture, signal())).toBe(false)
    expect(f.editor.getText()).toBe('draft'); expect(f.editor.getSelection()).toEqual(selection)
    f.controller.dispose()
  })
  it('rejects cancelled, consumed, forged, and disposed captures', () => {
    const { editor, controller } = fixture(); editor.setText('draft')
    const capture = controller.captureInsertion(), cancelled = new AbortController(); cancelled.abort()
    expect(controller.insertText('bad', { ...capture }, signal())).toBe(false)
    expect(controller.insertText('bad', capture, cancelled.signal)).toBe(false)
    expect(controller.insertText('bad', capture, signal())).toBe(false)
    const another = controller.captureInsertion(); controller.dispose()
    expect(controller.insertText('bad', another, signal())).toBe(false); expect(editor.getText()).toBe('draft')
  })
  it('does not grant submit access and preserves existing editor onChange observers', () => {
    const editor = new PromptEditor({ terminal: { rows: 24 }, requestRender: vi.fn() } as unknown as TUI), changed = vi.fn(), submitted = vi.fn()
    editor.onChange = changed; editor.onSubmit = submitted
    const controller = new TerminalInputExtensions(editor, () => ({ sessionId: 'a', displayTitle: 'A', generation: 1, ready: true, locked: false }))
    editor.setText('draft'); expect(controller.insertText('x', controller.captureInsertion(), signal())).toBe(true)
    expect(submitted).not.toHaveBeenCalled(); expect(changed).toHaveBeenCalled()
    controller.dispose(); expect(editor.onChange).toBe(changed)
  })
})
