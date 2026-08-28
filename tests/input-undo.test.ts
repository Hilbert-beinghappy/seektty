import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Input, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { editorMouseApi } from '../src/client/pi-tui-adapters.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { Transcript } from '../src/client/transcript.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

const CTRL_Z = '\u001A'
const PASTE = (value: string) => `\u001B[200~${value}\u001B[201~`

beforeEach(() => { setUiLocale('en') })
afterEach(() => { setUiLocale('zh') })

function harness() {
  let component!: Component
  const tui = {
    terminal: { rows: 40, columns: 80 }, requestRender: vi.fn(),
    showOverlay: (value: Component) => {
      component = value
      return { hide: vi.fn() } as unknown as OverlayHandle
    },
  } as unknown as TUI
  return {
    editor: new PromptEditor(tui), overlays: new OverlayQueue(tui),
    render: () => component.render(80).map(stripCopyDecorations).join('\n'),
    key: (data: string) => { component.handleInput?.(data) },
  }
}

describe('Ctrl+Z in all text inputs', () => {
  it.each([CTRL_Z, '\u001B[122;5u', '\u001B[27;5;122~', '\u001F'])('undoes input and composer typing with %j', key => {
    const input = new Input()
    const { editor } = harness()
    input.handleInput('中文🙂')
    editor.handleInput('中文🙂')
    input.handleInput(key)
    editor.handleInput(key)
    expect(input.getValue()).toBe('')
    expect(editor.getText()).toBe('')
    input.handleInput(key)
    editor.handleInput(key)
    expect(input.getValue()).toBe('')
    expect(editor.getText()).toBe('')
  })

  it('undoes paste, delete and mouse replacement separately, restoring text and cursor', () => {
    const input = new Input()
    input.setValue('A中文🙂Z')
    input.setCursor(1)
    input.handleInput(PASTE('paste'))
    input.handleInput('\u007F')
    input.handleInput(CTRL_Z)
    expect(input.getValue()).toBe('Apaste中文🙂Z')
    expect(input.getCursor()).toBe(6)
    input.handleInput(CTRL_Z)
    expect(input.getValue()).toBe('A中文🙂Z')
    expect(input.getCursor()).toBe(1)
    input.setSelection(1, 5)
    input.replaceSelection('replacement')
    input.handleInput(CTRL_Z)
    expect(input.getValue()).toBe('A中文🙂Z')
    expect(input.getCursor()).toBe(5)
    expect(input.getSelection()).toBeUndefined()
  })

  it('restores multiline and large-paste content, not just the paste marker', () => {
    const { editor } = harness()
    const text = Array.from({ length: 15 }, (_, index) => `中文-${index}`).join('\n')
    editor.handleInput('before')
    editor.handleInput(PASTE(text))
    const pasted = editor.getExpandedText()
    expect(pasted).toContain(text)
    editor.handleInput('\u0015') // delete to start of line, including the marker
    editor.handleInput(CTRL_Z)
    expect(editor.getExpandedText()).toBe(pasted)
    editor.handleInput(CTRL_Z)
    expect(editor.getText()).toBe('before')
  })

  it('invalidates selection and old autocomplete when undo restores a different buffer', async () => {
    const { editor } = harness()
    editor.setText('original')
    editor.setText('')
    editor.setAutocompleteProvider({
      getSuggestions: async () => ({ prefix: '/', items: [{ value: '/help', label: '/help' }] }),
      applyCompletion: () => ({ lines: ['/help'], cursorLine: 0, cursorCol: 5 }),
    })
    editor.handleInput('/')
    await vi.waitFor(() => { expect(editor.isShowingAutocomplete()).toBe(true) })
    editor.render(80)
    const api = editorMouseApi(editor)
    const stale = api.getAutocompleteSnapshot?.()
    api.setSelection?.({ line: 0, col: 0 }, { line: 0, col: 1 })
    editor.handleInput(CTRL_Z)
    expect(editor.getText()).toBe('')
    expect(editor.isShowingAutocomplete()).toBe(false)
    expect(api.getSelection?.()).toBeUndefined()
    expect(api.selectAutocompleteItem?.(stale?.generation ?? -1, stale?.visibleRows[0]?.itemId ?? '')).toBe(false)
    editor.handleInput(CTRL_Z)
    expect(editor.getText()).toBe('original')
  })

  it('rejects an autocomplete result that arrives after undo', async () => {
    const { editor } = harness()
    let resolveSuggestions!: (value: { prefix: string; items: { value: string; label: string }[] }) => void
    const getSuggestions = vi.fn(() => new Promise<{ prefix: string; items: { value: string; label: string }[] }>(resolve => {
      resolveSuggestions = resolve
    }))
    editor.setAutocompleteProvider({
      getSuggestions,
      applyCompletion: () => ({ lines: ['/help'], cursorLine: 0, cursorCol: 5 }),
    })
    editor.handleInput('/')
    await vi.waitFor(() => { expect(getSuggestions).toHaveBeenCalledOnce() })
    editor.handleInput(CTRL_Z)
    resolveSuggestions({ prefix: '/', items: [{ value: '/help', label: '/help' }] })
    await Promise.resolve()
    expect(editor.getText()).toBe('')
    expect(editor.isShowingAutocomplete()).toBe(false)
  })

  it('does not get trapped in invisible newline normalization while undoing', () => {
    const { editor } = harness()
    editor.handleInput('original')
    editor.handleInput('\u0015')
    editor.handleInput('\u001B[13;2u') // Shift+Enter on a blank composer
    expect(editor.getText()).toBe('')
    for (let index = 0; index < 3 && editor.getText() !== 'original'; index++) editor.handleInput(CTRL_Z)
    expect(editor.getText()).toBe('original')
  })

  it('does not resurrect already submitted composer text', () => {
    const { editor } = harness()
    const submit = vi.fn()
    editor.onSubmit = submit
    editor.handleInput('sent')
    editor.handleInput('\r')
    editor.handleInput(CTRL_Z)
    expect(submit).toHaveBeenCalledExactlyOnceWith('sent')
    expect(editor.getText()).toBe('')
  })

  it.each(['input', 'multilineInput', 'secretInput'] as const)('undoes an edit in %s without submitting or exposing secrets', async kind => {
    const h = harness()
    const pending = h.overlays[kind]({ title: 'field' })
    h.key(PASTE('first'))
    h.key(PASTE('second'))
    h.key(CTRL_Z)
    expect(h.overlays.hasActive()).toBe(true)
    if (kind === 'secretInput') {
      expect(h.render()).not.toContain('first')
      expect(h.render()).not.toContain('second')
    } else {
      expect(h.render()).toContain('first')
      expect(h.render()).not.toContain('second')
    }
    h.overlays.handleFooterClick('footer-confirm')
    await expect(pending).resolves.toBe('first')
  })

  it.each(['input', 'multilineInput'] as const)('treats the initial %s value as a baseline, not an edit to undo', async kind => {
    const h = harness()
    const pending = h.overlays[kind]({ title: 'existing field', initialValue: 'existing value' })
    h.key(CTRL_Z)
    expect(h.render()).toContain('existing value')
    h.key(PASTE(' edit'))
    h.key(CTRL_Z)
    h.key(CTRL_Z)
    h.overlays.handleFooterClick('footer-confirm')
    await expect(pending).resolves.toBe('existing value')
  })

  it('does not undo into a previous field after programmatic reset', () => {
    const input = new Input()
    input.handleInput(PASTE('old field'))
    input.handleInput(PASTE('old edit'))
    input.setValue('new field')
    input.handleInput(CTRL_Z)
    expect(input.getValue()).toBe('new field')
  })

  it('does not restore a secret when a new secret dialog is opened', async () => {
    const h = harness()
    const first = h.overlays.secretInput({ title: 'secret one' })
    h.key(PASTE('old field'))
    h.key(PASTE('old edit'))
    h.overlays.handleFooterClick('footer-confirm')
    await expect(first).resolves.toBe('old fieldold edit')
    const second = h.overlays.secretInput({ title: 'secret two' })
    h.key(CTRL_Z)
    h.key(PASTE('new field'))
    h.overlays.handleFooterClick('footer-confirm')
    await expect(second).resolves.toBe('new field')
  })

  it.each(['select', 'multiSelect'] as const)('refilters %s after undo, including a context-menu deletion', async kind => {
    const h = harness()
    const pending = h.overlays[kind]({ title: 'search', choices: [
      { id: 'alpha', label: 'alpha' }, { id: 'beta', label: 'beta' },
    ] })
    try {
      h.key(PASTE('alpha'))
      h.key(PASTE('missing'))
      h.render()
      expect(h.overlays.hitChildren().filter(hit => hit.role === 'option')).toHaveLength(0)
      h.key(CTRL_Z)
      h.render()
      expect(h.overlays.hitChildren().filter(hit => hit.role === 'option').map(hit => hit.action))
        .toEqual([{ kind: 'overlay', command: 'focus', optionId: 'alpha' }])
      h.overlays.textTarget('input')?.selectAll()
      h.overlays.textTarget('input')?.replace('')
      h.render()
      expect(h.overlays.hitChildren().filter(hit => hit.role === 'option')).toHaveLength(2)
      h.key(CTRL_Z)
      h.render()
      expect(h.overlays.hitChildren().filter(hit => hit.role === 'option')).toHaveLength(1)
    } finally { h.overlays.dispose(); await pending }
  })

  it('keeps undo local to each modal and starts a new field with empty edit history', async () => {
    const h = harness()
    h.editor.handleInput('hidden composer')
    const pending = h.overlays.navigate(async nav => {
      const parent = nav.input({ title: 'parent' })
      await Promise.resolve() // the physical modal mounts after the navigation callback returns
      h.key(PASTE('parent draft'))
      const child = nav.input({ title: 'child', initialValue: 'existing value' })
      h.key(CTRL_Z)
      expect(h.render()).toContain('existing value')
      h.key(PASTE('child edit'))
      h.key(CTRL_Z)
      expect(h.render()).not.toContain('child edit')
      h.key('\u001B')
      await child
      expect(h.render()).toContain('parent draft')
      h.key(CTRL_Z)
      expect(h.render()).not.toContain('parent draft')
      expect(h.editor.getText()).toBe('hidden composer')
      nav.finish()
      await parent
    })
    await pending
  })

  it('undoes transcript Find text and starts a fresh history when Find is reopened', () => {
    const transcript = new Transcript(() => 8)
    const view = () => transcript.render(80).map(stripCopyDecorations).join('\n')
    transcript.handleInput('/')
    transcript.handleInput('alpha')
    transcript.handleInput(' ')
    transcript.handleInput('beta')
    expect(view()).toContain('alpha beta')
    transcript.handleInput(CTRL_Z)
    expect(view()).toContain('Find alpha')
    expect(view()).not.toContain('alpha beta')
    transcript.handleInput(CTRL_Z)
    expect(view()).not.toContain('alpha')
    transcript.cancelSearch()
    transcript.handleInput('/')
    transcript.handleInput(CTRL_Z)
    expect(view()).not.toContain('alpha')
  })

  it('undoes Find paste and grapheme deletion without consuming transcript navigation', () => {
    const transcript = new Transcript(() => 8)
    const view = () => transcript.render(80).map(stripCopyDecorations).join('\n')
    const scroll = vi.spyOn(transcript, 'scrollBy')
    transcript.handleInput('/')
    transcript.handleInput(PASTE('中文👩‍💻'))
    transcript.handleInput('\u007F')
    expect(view()).toContain('Find 中文 ·')
    transcript.handleInput(CTRL_Z)
    expect(view()).toContain('Find 中文👩‍💻')
    transcript.handleInput('\u001B[A')
    expect(scroll).toHaveBeenCalledWith(1)
    transcript.handleInput(CTRL_Z)
    expect(view()).not.toContain('中文')
  })
})
