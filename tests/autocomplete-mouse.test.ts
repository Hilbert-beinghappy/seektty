import { describe, expect, it, vi } from 'vitest'
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
  TUI,
} from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'
import { autocompleteTargetId, editorMouseApi } from '../src/client/pi-tui-adapters.ts'

function item(index: number): AutocompleteItem {
  return {
    value: `/command-${index}`,
    label: `/command-${index}`,
    description: `Command ${index}`,
  }
}

function provider(
  suggestions: () => AutocompleteSuggestions,
): AutocompleteProvider {
  return {
    getSuggestions: async () => suggestions(),
    applyCompletion: (lines, cursorLine, _cursorCol, selected) => {
      const next = [...lines]
      next[cursorLine] = selected.value
      return { lines: next, cursorLine, cursorCol: selected.value.length }
    },
    shouldTriggerFileCompletion: () => true,
  }
}

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 30 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

async function open(
  composer: PromptEditor,
  suggestions: () => AutocompleteSuggestions,
): Promise<void> {
  composer.setAutocompleteProvider(provider(suggestions))
  composer.handleInput('/')
  await vi.waitFor(() => { expect(composer.isShowingAutocomplete()).toBe(true) })
  composer.render(80)
}

describe('render-bound autocomplete contract', () => {
  it('exposes exact head, middle, and tail windows without the scroll-info footer', async () => {
    const composer = editor()
    await open(composer, () => ({ prefix: '/', items: Array.from({ length: 10 }, (_, index) => item(index)) }))
    const api = editorMouseApi(composer)

    const head = api.getAutocompleteSnapshot?.()
    expect(head?.visibleRows.map(row => row.absoluteIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(composer.lastLocalGeometry()?.autocomplete.height).toBe(7)
    expect(head?.visibleRows.some(row => row.visualRow === 6)).toBe(false)

    expect(api.moveAutocompleteSelection?.(5)).toBe(true)
    composer.render(80)
    const middle = api.getAutocompleteSnapshot?.()
    expect(middle?.selectedIndex).toBe(5)
    expect(middle?.visibleRows.map(row => row.absoluteIndex)).toEqual([2, 3, 4, 5, 6, 7])

    expect(api.moveAutocompleteSelection?.(4)).toBe(true)
    composer.render(80)
    const tail = api.getAutocompleteSnapshot?.()
    expect(tail?.selectedIndex).toBe(9)
    expect(tail?.visibleRows.map(row => row.absoluteIndex)).toEqual([4, 5, 6, 7, 8, 9])
  })

  it('selects by generation and item identity while preserving the rendered window', async () => {
    const composer = editor()
    await open(composer, () => ({ prefix: '/', items: Array.from({ length: 10 }, (_, index) => item(index)) }))
    const api = editorMouseApi(composer)
    api.moveAutocompleteSelection?.(5)
    composer.render(80)
    const before = api.getAutocompleteSnapshot?.()
    const target = before?.visibleRows[0]
    expect(target?.absoluteIndex).toBe(2)
    expect(api.selectAutocompleteItem?.(before?.generation ?? -1, target?.itemId ?? '')).toBe(true)
    composer.render(80)
    const after = api.getAutocompleteSnapshot?.()
    expect(after?.selectedIndex).toBe(2)
    expect(after?.visibleRows.map(row => row.absoluteIndex)).toEqual([2, 3, 4, 5, 6, 7])
  })

  it('keeps hover visual-only and renders it differently from keyboard selection', async () => {
    const composer = editor()
    await open(composer, () => ({ prefix: '/', items: [item(0), item(1)] }))
    const api = editorMouseApi(composer)
    const before = api.getAutocompleteSnapshot?.()
    const target = before?.visibleRows[1]
    expect(target).toBeDefined()

    composer.setHoveredTarget(autocompleteTargetId(
      before?.generation ?? -1,
      target?.absoluteIndex ?? -1,
    ))
    const hoveredRender = composer.render(80)
    expect(api.getAutocompleteSnapshot?.()?.selectedIndex).toBe(0)

    composer.setHoveredTarget(undefined)
    expect(api.selectAutocompleteItem?.(before?.generation ?? -1, target?.itemId ?? '')).toBe(true)
    const selectedRender = composer.render(80)
    const row = composer.lastLocalGeometry()?.autocomplete.row ?? -1
    const visualRow = target?.visualRow ?? -1
    expect(hoveredRender[row + visualRow]).not.toBe(selectedRender[row + visualRow])
    expect(api.getAutocompleteSnapshot?.()?.selectedIndex).toBe(1)

    composer.setHoveredTarget(autocompleteTargetId(
      before?.generation ?? -1,
      target?.absoluteIndex ?? -1,
    ))
    expect(composer.render(80)[row + visualRow]).toBe(selectedRender[row + visualRow])
  })

  it('fails closed when an asynchronous refresh invalidates an old item token', async () => {
    const composer = editor()
    let revision = 0
    await open(composer, () => ({
      prefix: '/',
      items: Array.from({ length: 8 }, (_, index) => item(index + revision * 10)),
    }))
    const api = editorMouseApi(composer)
    const stale = api.getAutocompleteSnapshot?.()
    composer.setText('')
    revision += 1
    composer.handleInput('/')
    await vi.waitFor(() => {
      composer.render(80)
      expect(api.getAutocompleteSnapshot?.()?.generation).not.toBe(stale?.generation)
    })
    const row = stale?.visibleRows[0]
    expect(api.selectAutocompleteItem?.(stale?.generation ?? -1, row?.itemId ?? '')).toBe(false)
  })

  it('keeps Tab completion non-submitting and submits a selected slash command once on Enter', async () => {
    const tabEditor = editor()
    const tabSubmitted = vi.fn()
    tabEditor.onSubmit = raw => tabSubmitted(tabEditor.losslessSubmitText(raw))
    await open(tabEditor, () => ({ prefix: '/', items: [item(0), item(1)] }))
    tabEditor.handleInput('\u001B[B')
    tabEditor.handleInput('\t')
    expect(tabEditor.getText()).toBe('/command-1')
    expect(tabSubmitted).not.toHaveBeenCalled()

    const enterEditor = editor()
    const enterSubmitted = vi.fn()
    enterEditor.onSubmit = raw => enterSubmitted(enterEditor.losslessSubmitText(raw))
    await open(enterEditor, () => ({ prefix: '/', items: [item(0), item(1)] }))
    enterEditor.handleInput('\u001B[B')
    enterEditor.handleInput('\r')
    expect(enterSubmitted).toHaveBeenCalledTimes(1)
    expect(enterSubmitted).toHaveBeenCalledWith('/command-1')
    expect(enterEditor.getText()).toBe('')
  })

  it('returns one mouse submit payload for slash commands but never submits path completion', async () => {
    const slash = editor()
    await open(slash, () => ({ prefix: '/', items: [item(0), item(1)] }))
    const slashApi = editorMouseApi(slash)
    const slashSnapshot = slashApi.getAutocompleteSnapshot?.()
    const slashRow = slashSnapshot?.visibleRows[1]
    expect(slashApi.selectAutocompleteItem?.(
      slashSnapshot?.generation ?? -1,
      slashRow?.itemId ?? '',
    )).toBe(true)
    const activated = slashApi.activateAutocompleteSelection?.('mouse')
    expect(activated).toEqual({ applied: true, submitText: '/command-1' })
    expect(slashApi.activateAutocompleteSelection?.('mouse')).toEqual({ applied: false })

    const path = editor()
    await open(path, () => ({
      prefix: './',
      items: [{ value: './README.md', label: './README.md' }],
    }))
    const pathApi = editorMouseApi(path)
    const completed = pathApi.activateAutocompleteSelection?.('mouse')
    expect(completed).toEqual({ applied: true })
    expect(path.getText()).toBe('./README.md')
  })
})
