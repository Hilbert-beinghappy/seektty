import { describe, expect, it, vi } from 'vitest'
import { Input, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { OverlayQueue, type OverlayNavigation } from '../src/client/overlays.ts'
import { ContextMenuController } from '../src/client/mouse-context-menu.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

function harness() {
  const layers: Component[] = []
  const tui = {
    terminal: { rows: 40, columns: 80 }, requestRender: vi.fn(),
    showOverlay: vi.fn((value: Component) => {
      layers.push(value)
      return {
        hide: () => { const index = layers.indexOf(value); if (index >= 0) layers.splice(index, 1) },
        isFocused: () => layers.at(-1) === value,
      } as unknown as OverlayHandle
    }),
  } as unknown as TUI
  const contextMenu = new ContextMenuController(tui)
  const overlays = new OverlayQueue(tui, () => { contextMenu.close() })
  const render = (width = 80) => layers.at(-1)!.render(width)
  const key = (data: string) => { layers.at(-1)!.handleInput?.(data) }
  const dragInput = (start: number, end: number) => {
    const region = overlays.hitChildren().find(hit => hit.role === 'input')
    if (region === undefined) throw new Error('input hit missing')
    const origin = { col: region.rect.col + start, row: region.rect.row }
    const focus = { col: region.rect.col + end, row: region.rect.row }
    overlays.handleTextPointer(focus, origin, true)
    render()
    overlays.handleTextPointer(focus, origin, true, 1, true)
    render()
  }
  return { overlays, contextMenu, layers, render, key, dragInput }
}

describe('single-line pointer selection', () => {
  it.each(['\u007F', '\u001B[3~', 'Z', '\u001B[200~Z\u001B[201~'])('replaces a reversed Unicode selection with %j and supports undo', key => {
    const input = new Input()
    input.setValue('A中文🙂e\u0301Z')
    input.setSelection(6, 1) // snaps inside e + combining mark to the grapheme start
    expect(input.getSelection()).toEqual({ anchor: 5, focus: 1 })
    input.handleInput(key)
    expect(input.getValue()).toBe(key === '\u007F' || key === '\u001B[3~' ? 'Ae\u0301Z' : 'AZe\u0301Z')
    input.handleInput('\u001F')
    expect(input.getValue()).toBe('A中文🙂e\u0301Z')
  })

  it('maps wide graphemes through horizontal scrolling and extends with Shift+arrows', () => {
    const input = new Input()
    input.setValue('prefix prefix 中文🙂 tail')
    input.setCursor(14)
    const line = stripCopyDecorations(input.render(14)[0] ?? '')
    const chineseCol = line.indexOf('中')
    expect(chineseCol).toBeGreaterThanOrEqual(2)
    expect(input.getPointerOffset(chineseCol)).toBe(14)
    expect(input.getPointerOffset(chineseCol + 1)).toBe(14)
    input.handleInput('\u001B[1;2C')
    expect(input.getSelection()).toEqual({ anchor: 14, focus: 15 })
    input.handleInput('\u001B[1;2C')
    expect(input.getSelection()).toEqual({ anchor: 14, focus: 16 })
    input.handleInput('\u001B[1;2C')
    expect(input.getSelection()).toEqual({ anchor: 14, focus: 18 })
  })
})

describe('modal text / editing ownership', () => {
  it.each(['select', 'multiSelect'] as const)('selects and edits the %s search without resetting the chosen item on cursor movement', async method => {
    const h = harness()
    const done = h.overlays[method]({ title: 'search', choices: [{ id: 'a', label: 'abc def' }] })
    try {
      h.key('abc def')
      h.render()
      h.dragInput(2, 4)
      expect(h.overlays.textTarget()).toMatchObject({ text: 'abc', editable: true })
      h.key('\u001B[3~')
      h.render()
      const target = h.overlays.textTarget()
      target?.selectAll()
      expect(h.overlays.textTarget()?.text).toBe(' def')
      expect(h.overlays.textTarget()?.replace('abc')).toBe(true)
      h.render()
      expect(h.overlays.hitChildren().some(hit => hit.role === 'option')).toBe(true)
    } finally { h.overlays.dispose(); await done }
  })

  it('copies modal body text after release and never treats read-only text as editable', async () => {
    const h = harness()
    const done = h.overlays.detail({ title: 'detail', content: '中文🙂 hello\nsecond line' })
    try {
      h.render()
      const origin = { col: 2, row: 1 }
      const point = { col: 6, row: 1 }
      h.overlays.handleTextPointer(point, origin, false)
      h.render()
      h.overlays.handleTextPointer(point, origin, false, 1, true)
      const rendered = h.render()
      expect(rendered[1]).toContain('\u001B[7m')
      const target = h.overlays.textTarget()
      expect(target).toMatchObject({ text: '中文🙂', editable: false })
      expect(target?.replace('bad')).toBe(false)
    } finally { h.overlays.dispose(); await done }
  })

  it('opens a separate context popup without changing the page stack or original input selection', async () => {
    const h = harness()
    const done = h.overlays.input({ title: 'rename', initialValue: 'abcdef' })
    try {
      h.render()
      h.dragInput(3, 5)
      const target = h.overlays.textTarget()
      expect(target?.text).toBe('bcd')
      const generation = h.overlays.activeGeneration()
      const menu = h.contextMenu.open({
        point: { col: 6, row: 6 }, choices: [{ id: 'delete', label: 'Delete selection' }],
        valid: () => target?.valid() === true,
      })
      expect(h.layers).toHaveLength(2)
      expect(h.overlays.activeGeneration()).toBe(generation)
      expect(target?.valid()).toBe(true)
      expect(h.render().join('')).toContain('Delete selection')
      h.key('\r')
      await expect(menu).resolves.toMatchObject({ id: 'delete' })
      expect(h.layers).toHaveLength(1)
      h.render()
      expect(target?.valid()).toBe(true)
      expect(target?.replace('')).toBe(true)
      h.key('\r')
      await expect(done).resolves.toBe('aef')
    } finally { h.overlays.dispose() }
  })

  it('rejects stale clipboard writes after cursor movement or page navigation', async () => {
    const h = harness()
    let nav!: OverlayNavigation
    const done = h.overlays.navigate(async value => { nav = value; await value.input({ title: 'field', initialValue: 'abcdef' }) })
    try {
      h.render()
      h.dragInput(3, 5)
      const stale = h.overlays.textTarget()
      h.key('\u001B[C')
      expect(stale?.replace('oops')).toBe(false)
      const other = h.overlays.textTarget()
      const child = nav.input({ title: 'other' })
      h.render()
      expect(other?.replace('oops')).toBe(false)
      h.key('\u001B')
      await child
    } finally { h.overlays.dispose(); await done }
  })

  it('maps a multiline editor selection to logical text, then deletes and submits it', async () => {
    const h = harness()
    const done = h.overlays.multilineInput({ title: 'edit', initialValue: '中文 hello\nsecond' })
    try {
      h.render()
      h.dragInput(0, 4)
      expect(h.overlays.textTarget()?.text).toBe('中文 ')
      h.key('\u007F')
      h.key('\u001B[13;5u')
      await expect(done).resolves.toBe('hello\nsecond')
    } finally { h.overlays.dispose() }
  })

  it('does not expose masked secrets through selection or clipboard actions', async () => {
    const h = harness()
    const done = h.overlays.secretInput({ title: 'secret' })
    try {
      h.key('synthetic-secret-never-copy')
      h.render()
      expect(h.overlays.hitChildren().some(hit => hit.role === 'input')).toBe(false)
      h.overlays.handleTextPointer({ col: 25, row: 1 }, { col: 2, row: 1 }, false, 1, true)
      const target = h.overlays.textTarget()
      expect(target?.editable).toBe(false)
      expect(target?.text).not.toContain('synthetic')
      expect(target?.replace('bad')).toBe(false)
    } finally { h.overlays.dispose(); await done }
  })
})
