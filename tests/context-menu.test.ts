import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input, StdinBuffer, TUI, type Terminal } from '@mariozechner/pi-tui'
import { ContextMenuController, mouseContextChoices } from '../src/client/mouse-context-menu.ts'
import { OverlayQueue, type OverlayChoice, type OverlayNavigation } from '../src/client/overlays.ts'
import { createMouseController } from '../src/client/mouse-controller.ts'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import { decodeMouseSequence } from '../src/client/mouse-protocol.ts'
import { emptyHitMap, finalizeHitMap, HitMapBuilder, type CellPoint, type HitRegion } from '../src/client/mouse-hit-map.ts'
import { tuiFrameApi } from '../src/client/pi-tui-adapters.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { interaction, setTheme } from '../src/client/theme.ts'
import type { ContextActionNode } from '../src/client/context-actions.ts'

class VirtualTerminal implements Terminal {
  columns = 100
  rows = 30
  kittyProtocolActive = false
  writes: string[] = []
  private stdin = new StdinBuffer({ timeout: 10 })
  input = (data: string) => { this.stdin.process(data) }
  start(onInput: (data: string) => void): void {
    this.stdin.on('data', onInput)
    this.stdin.on('paste', content => { onInput(`\u001B[200~${content}\u001B[201~`) })
  }
  stop(): void { this.stdin.destroy() }
  drainInput(): Promise<void> { return Promise.resolve() }
  write(data: string): void { this.writes.push(data) }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

/** Real renderer, input framing, SGR gestures and modal ownership; clipboard writes are recorded, not executed. */
function harness(entries?: readonly OverlayChoice[] | readonly ContextActionNode[]) {
  vi.useFakeTimers()
  const terminal = new VirtualTerminal()
  const tui = new TUI(terminal, false)
  const root = new Input()
  const rootClick = vi.fn()
  const rootScroll = vi.fn()
  const drag = vi.fn()
  let map = emptyHitMap(0, terminal.columns, terminal.rows)
  let owner = 0
  const mouse = createMouseController({
    getHitMap: () => map, getBehavior: () => DEFAULT_TUI_BEHAVIOR,
    prepareGesture: () => {
      const underlay = menu.dismissForGesture()
      if (underlay === undefined) return undefined
      if (underlay === null) return 'cancel'
      map = underlay
      return 'retarget'
    },
  })
  const menu = new ContextMenuController(tui, () => {
    mouse.endGesture()
    mouse.clearHover()
    map = emptyHitMap(map.generation + 1, terminal.columns, terminal.rows)
  })
  const overlays = new OverlayQueue(tui, () => { menu.close(); mouse.endGesture(); map = emptyHitMap(map.generation + 1, terminal.columns, terminal.rows) })
  tui.addChild({
    invalidate() {},
    render: width => Array.from({ length: terminal.rows }, (_, row) => row === terminal.rows - 2 ? root.render(width)[0]! : `root text ${row}`),
  })
  tui.setFocus(root)
  const frame = async () => { await vi.advanceTimersByTimeAsync(80) }
  tuiFrameApi(tui).onAfterRender = () => {
    if (map.terminalWidth !== terminal.columns || map.terminalHeight !== terminal.rows) mouse.endGesture()
    const geometry = tuiFrameApi(tui).getLastFrameGeometry!()
    const builder = new HitMapBuilder(map.generation + 1)
      .add({ id: 'root:text', rect: { col: 0, row: 0, width: terminal.columns, height: terminal.rows - 2 }, zIndex: 1, role: 'text', enabled: true, action: { kind: 'transcript', command: 'select' } })
      .add({ id: 'root:input', rect: { col: 0, row: terminal.rows - 2, width: terminal.columns, height: 1 }, zIndex: 2, role: 'input', enabled: true, action: { kind: 'composer', command: 'caret' } })
    map = menu.decorateHitMap(finalizeHitMap(builder, geometry, overlays.hasActive()
      ? { overlayId: overlays.activeOverlayId()!, children: overlays.hitChildren() }
      : undefined), geometry)
  }
  const opened: { point: CellPoint; target: HitRegion; result: Promise<{ readonly id: string } | undefined> }[] = []
  const selected = vi.fn()
  const openFor = (point: CellPoint, region: HitRegion | undefined) => {
    if (region === undefined || !overlays.allowsContextMenu() || region.action.kind === 'context-menu') return
    const inOverlay = region.action.kind === 'overlay'
    if (inOverlay && region.role === 'passive') return
    const target = inOverlay ? overlays.textTarget(region.role === 'input' ? 'input' : 'body') : undefined
    const generation = overlays.activeGeneration()
    const originOwner = owner
    const valid = () => originOwner === owner && generation === overlays.activeGeneration() && (target?.valid() ?? true)
    const fallback = mouseContextChoices({
        target: inOverlay ? target?.editable ? 'overlay-input' : 'overlay' : region.role === 'input' ? 'composer' : 'transcript',
        hasSelection: (target?.text ?? '') !== '', pasteSupported: true,
      })
    const nodes = entries?.[0] !== undefined && 'kind' in entries[0] ? entries as readonly ContextActionNode[] : undefined
    const result: Promise<{ readonly id: string } | undefined> = nodes === undefined
      ? menu.open({ point, valid, choices: entries as readonly OverlayChoice[] | undefined ?? fallback })
      : menu.open({ point, valid, title: 'Actions', nodes })
    opened.push({ point, target: region, result })
    void result.then(choice => {
      if (choice === undefined || !valid()) return
      selected(choice.id, target?.text ?? '')
      if (choice.id === 'delete') target?.replace('')
    })
  }
  tui.addInputListener(data => {
    const event = decodeMouseSequence(data)
    if (event === undefined) {
      mouse.endGesture()
      return menu.handleInput(data) ? { consume: true } : undefined
    }
    if (event === null) return { consume: true }
    if (event.kind !== 'move' && event.kind !== 'focus') { mouse.clearHover(); menu.handleHover() }
    const outcome = mouse.handle(event)
    const semantic = outcome.semantic
    if (semantic?.kind === 'click') {
      if (!semantic.suppressed && !menu.handleClick(semantic, openFor) && semantic.region?.action.kind !== 'context-menu') {
        if (semantic.button === 'right') openFor(semantic.point, semantic.region)
        else {
          rootClick(semantic.region?.id)
          if (semantic.region?.action.kind === 'overlay' && semantic.region.role === 'button') overlays.handleFooterClick(semantic.region.action.command)
        }
      }
    } else if (semantic?.kind === 'wheel') {
      if (semantic.region?.action.kind === 'overlay') overlays.handleWheel(semantic.lines)
      else if (outcome.scrollTranscript !== undefined) rootScroll(outcome.scrollTranscript)
    } else if (semantic?.kind === 'drag') {
      drag(semantic)
      if (semantic.region?.action.kind === 'overlay') {
        const body = map.regions.find(hit => hit.id === `overlay:${overlays.activeOverlayId()}:body`)!
        const local = (point: CellPoint) => ({ col: point.col - body.rect.col, row: point.row - body.rect.row })
        overlays.handleTextPointer(local(semantic.point), semantic.origin === undefined ? undefined : local(semantic.origin), semantic.region.role === 'input', 1, semantic.ended === true)
      }
    } else if (semantic?.kind === 'hover') menu.handleHover(semantic.region)
    else if (semantic?.kind === 'focus' && !semantic.focused) menu.close()
    if (outcome.requestRender) tui.requestRender()
    return { consume: true }
  })
  tui.start()
  const send = (point: CellPoint, button: number, release = false) => {
    terminal.input(`\u001B[<${button};${point.col + 1};${point.row + 1}${release ? 'm' : 'M'}`)
  }
  const click = async (point: CellPoint, button = 0) => { send(point, button); await frame(); send(point, button, true); await frame() }
  const region = (id: string) => {
    const found = map.regions.find(hit => hit.id === id || hit.action.kind === 'context-menu' && hit.action.optionId === id)
    if (found === undefined) throw new Error(`missing region ${id}`)
    return found
  }
  const center = (hit: HitRegion): CellPoint => ({ col: hit.rect.col + 2, row: hit.rect.row })
  return {
    tui, terminal, menu, mouse, overlays, root, rootClick, rootScroll, drag, opened, selected, frame, click, send, region, center,
    key: async (data: string) => { terminal.input(data); await frame() },
    geometry: () => tuiFrameApi(tui).getLastFrameGeometry!(),
    hits: () => map,
    invalidateOwner: async () => { owner++; tui.requestRender(); await frame() },
    changeOwner: () => { owner++ },
    close: () => { menu.close(); overlays.dispose(); mouse.dispose(); tui.stop() },
  }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); setTheme(BUILT_IN_THEMES.dark) })

describe('transient context menu / real frames and SGR', () => {
  it('keeps its parent page visible, leaves selection intact, and copies with one click', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'Parent field', initialValue: '中文 abc' })
    try {
      await h.frame()
      h.overlays.textTarget('input')?.selectAll()
      await h.frame()
      const selectedText = h.overlays.textTarget('input')!
      const generation = h.overlays.activeGeneration()
      const input = h.hits().regions.find(hit => hit.role === 'input' && hit.action.kind === 'overlay')!
      await h.click(h.center(input), 2)
      expect(h.geometry().overlays).toHaveLength(2)
      expect(h.overlays.activeGeneration()).toBe(generation)
      expect(selectedText.valid()).toBe(true)
      h.terminal.writes = []
      h.tui.requestRender(true)
      await h.frame()
      expect(h.terminal.writes.join('')).toContain('Parent field')
      await h.click(h.center(h.region('copy')))
      expect(h.selected).toHaveBeenCalledExactlyOnceWith('copy', '中文 abc')
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.overlays.activeGeneration()).toBe(generation)
      expect(selectedText.valid()).toBe(true)
    } finally { h.close(); await parent }
  })

  it('dismisses outside-left without clicking the parent confirm button or changing its input', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'Parent', initialValue: 'draft' })
    try {
      await h.frame()
      const confirm = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.action.command === 'footer-confirm')!
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click({ col: input.rect.col + input.rect.width - 2, row: input.rect.row }, 2)
      await h.click(h.center(confirm))
      expect(h.rootClick).not.toHaveBeenCalled()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.overlays.hasActive()).toBe(true)
      h.overlays.textTarget('input')?.selectAll()
      expect(h.overlays.textTarget('input')?.text).toBe('draft')
    } finally { h.close(); await parent }
  })

  it('deletes the original input selection and still undoes it with Ctrl+Z after the popup closes', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'Parent', initialValue: '中文🙂 draft' })
    try {
      await h.frame()
      h.overlays.textTarget('input')?.selectAll()
      await h.frame()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click(h.center(input), 2)
      await h.click(h.center(h.region('delete')))
      h.overlays.textTarget('input')?.selectAll()
      expect(h.overlays.textTarget('input')?.text).toBe('')
      await h.key('\u001A')
      h.overlays.textTarget('input')?.selectAll()
      expect(h.overlays.textTarget('input')?.text).toBe('中文🙂 draft')
    } finally { h.close(); await parent }
  })

  it('re-hits the new target after outside-right and keeps exactly one menu', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const first = h.opened[0]!
      const point = { col: 65, row: 28 }
      await h.click(point, 2)
      await expect(first.result).resolves.toBeUndefined()
      expect(h.opened).toHaveLength(2)
      expect(h.opened[1]?.target.id).toBe('root:input')
      expect(h.opened[1]?.point).toEqual(point)
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.region('paste')).toBeDefined()
      await h.click({ col: 2, row: 1 }, 2)
      expect(h.opened).toHaveLength(3)
      expect(h.opened[2]?.target.id).toBe('root:text')
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.rootClick).not.toHaveBeenCalled()
      expect(h.rootScroll).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('does not nest another menu on an inside right-click', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 5, row: 5 }, 2)
      await h.click(h.center(h.region('close')), 2)
      expect(h.opened).toHaveLength(1)
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.selected).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('Esc closes only the menu and restores editing on a nested modal', async () => {
    const h = harness()
    let nav!: OverlayNavigation
    const parent = h.overlays.navigate(async navigation => { nav = navigation; await navigation.input({ title: 'parent' }) })
    await h.frame()
    const child = nav.input({ title: 'child', initialValue: 'keep' })
    try {
      await h.frame()
      const generation = h.overlays.activeGeneration()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click(h.center(input), 2)
      await h.key('must-not-leak')
      await h.key('\u001B')
      expect(h.overlays.activeGeneration()).toBe(generation)
      expect(h.geometry().overlays).toHaveLength(1)
      h.overlays.textTarget('input')?.selectAll()
      expect(h.overlays.textTarget('input')?.text).toBe('keep')
      await h.key('new')
      h.overlays.textTarget('input')?.selectAll()
      expect(h.overlays.textTarget('input')?.text).toBe('new')
    } finally { h.close(); await child; await parent }
  })

  it('keeps modal capture when outside-right lands outside the parent dialog', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'parent' })
    try {
      await h.frame()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click(h.center(input), 2)
      await h.click({ col: 0, row: 0 }, 2)
      expect(h.opened).toHaveLength(1)
      expect(h.menu.hasActive()).toBe(false)
      expect(h.overlays.hasActive()).toBe(true)
      expect(h.geometry().overlays).toHaveLength(1)
    } finally { h.close(); await parent }
  })

  it('cancels the popup when its parent page changes, without enqueueing it for later', async () => {
    const h = harness()
    let nav!: OverlayNavigation
    const parent = h.overlays.navigate(async navigation => { nav = navigation; await nav.input({ title: 'parent' }) })
    await h.frame()
    const child = nav.input({ title: 'child' })
    try {
      await h.frame()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click(h.center(input), 2)
      nav.back()
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.geometry().overlays).toHaveLength(1)
      await expect(h.opened[0]!.result).resolves.toBeUndefined()
      await child
      nav.back()
      await h.frame()
      expect(h.geometry().overlays).toHaveLength(0)
    } finally { h.close(); await child; await parent }
  })

  it('does not open a context menu over a busy Host operation', async () => {
    const h = harness()
    let complete!: () => void
    const parent = h.overlays.progress({ title: 'Busy', work: () => new Promise<void>(resolve => { complete = resolve }) })
    try {
      await h.frame()
      const text = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'text')!
      await h.click(h.center(text), 2)
      expect(h.opened).toHaveLength(0)
      expect(h.overlays.hasActive()).toBe(true)
    } finally { complete(); h.close(); await parent }
  })

  it('uses actual clamped menu bounds at the bottom-right terminal edge', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 99, row: 27 }, 2)
      const rect = h.geometry().overlays.at(-1)!
      expect(rect.col + rect.width).toBeLessThanOrEqual(99)
      expect(rect.row + rect.height).toBeLessThanOrEqual(29)
      expect(rect.col).toBeLessThan(99)
      await h.click(h.center(h.region('close')))
      expect(h.menu.hasActive()).toBe(false)
      expect(h.selected).toHaveBeenCalledExactlyOnceWith('close', '')
    } finally { h.close() }
  })

  it.each(['inside', 'outside'] as const)('dismisses on wheel %s and delivers every detent once before the next frame', async where => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const point = where === 'inside' ? h.center(h.region('close')) : { col: 80, row: 20 }
      h.send(point, 64)
      h.send(point, 64)
      expect(h.menu.hasActive()).toBe(false)
      expect(h.rootScroll.mock.calls).toEqual([[3], [6]])
      await h.frame()
      expect(h.geometry().overlays).toHaveLength(0)
      expect(h.selected).not.toHaveBeenCalled()
      expect(h.rootClick).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('dismisses on horizontal wheel without synthesizing vertical scrolling', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      h.send(h.center(h.region('close')), 66)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.rootScroll).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('delivers dismissal wheel to the parent list without losing its modal capture', async () => {
    const h = harness()
    const parent = h.overlays.select({ title: 'Parent list', choices: Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` })) })
    try {
      await h.frame()
      const first = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.action.optionId === 'item-0')!
      const generation = h.overlays.activeGeneration()
      await h.click(h.center(first), 2)
      h.send(h.center(first), 65)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.overlays.activeGeneration()).toBe(generation)
      const visible = h.hits().regions.filter(hit => hit.action.kind === 'overlay' && hit.action.optionId !== undefined)
      expect(visible[0]?.action).toMatchObject({ optionId: 'item-3' })
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.rootScroll).not.toHaveBeenCalled()
    } finally { h.close(); await parent }
  })

  it('dismisses wheel over input without changing text or scrolling the transcript', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.key('keep draft')
      await h.click({ col: 3, row: 3 }, 2)
      h.send(h.center(h.region('root:input')), 65)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.root.getValue()).toBe('keep draft')
      expect(h.rootScroll).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it.each(['inside', 'outside'] as const)('starts a left drag %s the menu at the original press, even without intermediate frames', async where => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const origin = where === 'inside' ? h.center(h.region('close')) : { col: 50, row: 15 }
      const point = { col: 70, row: 16 }
      h.send(origin, 0)
      h.send(point, 32)
      h.send(point, 0, true)
      expect(h.menu.hasActive()).toBe(false)
      expect(h.drag).toHaveBeenCalledTimes(2)
      expect(h.drag).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'drag', button: 'left', origin, point, ended: true, region: expect.objectContaining({ id: 'root:text' }) }))
      await h.frame()
      expect(h.rootClick).not.toHaveBeenCalled()
      expect(h.selected).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('continues selection in the parent input after dismissing the menu', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'Parent', initialValue: 'hello world' })
    try {
      await h.frame()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      await h.click({ col: input.rect.col + input.rect.width - 2, row: input.rect.row }, 2)
      const origin = { col: input.rect.col + 2, row: input.rect.row } // Input's visible prompt is two cells.
      const point = { ...origin, col: origin.col + 4 }
      h.send(origin, 0)
      h.send(point, 32)
      await h.frame()
      h.send(point, 0, true)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.overlays.textTarget('input')?.text).toBe('hello')
      expect(h.rootClick).not.toHaveBeenCalled()
      expect(h.selected).not.toHaveBeenCalled()
    } finally { h.close(); await parent }
  })

  it('does not drag through a modal blocker or activate a parent button after dragging back', async () => {
    const h = harness()
    const parent = h.overlays.input({ title: 'Parent', initialValue: 'draft' })
    try {
      await h.frame()
      const input = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.role === 'input')!
      const confirm = h.hits().regions.find(hit => hit.action.kind === 'overlay' && hit.action.command === 'footer-confirm')!
      for (const origin of [{ col: 0, row: 0 }, h.center(confirm)]) {
        await h.click({ col: input.rect.col + input.rect.width - 2, row: input.rect.row }, 2)
        h.send(origin, 0)
        h.send({ col: origin.col + 3, row: origin.row }, 32)
        h.send(origin, 32)
        h.send(origin, 0, true)
        await h.frame()
        expect(h.menu.hasActive()).toBe(false)
        expect(h.overlays.hasActive()).toBe(true)
      }
      expect(h.drag).not.toHaveBeenCalled()
      expect(h.rootClick).not.toHaveBeenCalled()
    } finally { h.close(); await parent }
  })

  it.each([false, true])('opens right-drag menu only at release, with previous menu=%s', async existing => {
    const h = harness()
    try {
      await h.frame()
      if (existing) await h.click({ col: 3, row: 3 }, 2)
      const origin = existing ? h.center(h.region('close')) : { col: 50, row: 15 }
      const point = { col: 70, row: 28 }
      h.send(origin, 2)
      h.send({ col: 65, row: 20 }, 34)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.opened).toHaveLength(existing ? 1 : 0)
      h.send(point, 2, true)
      await h.frame()
      expect(h.opened).toHaveLength(existing ? 2 : 1)
      expect(h.opened.at(-1)).toMatchObject({ point, target: { id: 'root:input' } })
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.region('paste')).toBeDefined()
      expect(h.rootClick).not.toHaveBeenCalled()
      expect(h.drag).not.toHaveBeenCalled()
      expect(h.selected).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it('uses the release coordinate even when right motion reports are coalesced away', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      h.send(h.center(h.region('close')), 2)
      const point = { col: 80, row: 20 }
      h.send(point, 2, true)
      await h.frame()
      expect(h.opened).toHaveLength(2)
      expect(h.opened[1]?.point).toEqual(point)
    } finally { h.close() }
  })

  it.each(['wheel', 'drag'] as const)('interrupts pending menu replacement with %s before its first paint', async gesture => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const origin = { col: 80, row: 20 }
      h.send(origin, 2)
      h.send(origin, 2, true)
      if (gesture === 'wheel') h.send(origin, 64)
      else {
        h.send(origin, 0)
        h.send({ col: 85, row: 20 }, 32)
        h.send({ col: 85, row: 20 }, 0, true)
      }
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.opened).toHaveLength(1)
      if (gesture === 'wheel') expect(h.rootScroll).toHaveBeenCalledExactlyOnceWith(3)
      else expect(h.drag).toHaveBeenLastCalledWith(expect.objectContaining({ origin, ended: true }))
      expect(h.rootClick).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it.each(['owner', 'resize'] as const)('does not hand off a gesture when %s invalidates the underlying frame', async reason => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      if (reason === 'owner') h.changeOwner()
      else h.terminal.columns = 60
      h.send({ col: 50, row: 20 }, 64)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.rootScroll).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it.each(['Escape', 'blur', 'resize', 'page'] as const)('cancels right-drag positioning on %s', async reason => {
    const h = harness()
    let parent: Promise<unknown> | undefined
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      h.send(h.center(h.region('close')), 2)
      h.send({ col: 50, row: 20 }, 34)
      await h.frame()
      if (reason === 'Escape') await h.key('\u001B')
      else if (reason === 'blur') await h.key('\u001B[O')
      else if (reason === 'resize') { h.terminal.columns = 90; h.tui.requestRender(); await h.frame() }
      else { parent = h.overlays.input({ title: 'New page' }); await h.frame() }
      h.send({ col: 60, row: 20 }, 2, true)
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.opened).toHaveLength(1)
    } finally { h.close(); await parent }
  })

  it('keeps a long menu keyboard-accessible when wheel now dismisses it', async () => {
    const h = harness(Array.from({ length: 16 }, (_, index) => ({ id: `action-${index}`, label: `Action ${index}` })))
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      for (let i = 0; i < 10; i++) await h.key('\u001B[B')
      await h.click(h.center(h.region('action-10')))
      expect(h.selected).toHaveBeenCalledExactlyOnceWith('action-10', '')
    } finally { h.close() }
  })

  it('never executes a disabled menu action', async () => {
    const h = harness([{ id: 'paste', label: 'Paste', disabledReason: 'Unavailable' }, { id: 'cancel', label: 'Cancel' }])
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      await h.click(h.center(h.region('paste')))
      await h.key('\r')
      expect(h.menu.hasActive()).toBe(true)
      expect(h.selected).not.toHaveBeenCalled()
      await h.click(h.center(h.region('cancel')))
      expect(h.menu.hasActive()).toBe(false)
    } finally { h.close() }
  })

  it('discards an old held press if the menu is closed before release', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const point = h.center(h.region('close'))
      h.send(point, 0)
      h.menu.close()
      await h.frame()
      h.send(point, 0, true)
      await h.frame()
      expect(h.selected).not.toHaveBeenCalled()
      expect(h.rootClick).not.toHaveBeenCalled()
    } finally { h.close() }
  })

  it.each(['blur', 'resize', 'owner'] as const)('dismisses on %s and leaves no stale menu targets', async reason => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const opened = h.opened[0]!
      if (reason === 'blur') await h.key('\u001B[O')
      else if (reason === 'owner') await h.invalidateOwner()
      else { h.terminal.columns = 40; h.tui.requestRender(); await h.frame() }
      expect(h.menu.hasActive()).toBe(false)
      expect(h.geometry().overlays).toHaveLength(0)
      expect(h.hits().regions.some(hit => hit.action.kind === 'context-menu')).toBe(false)
      await expect(opened.result).resolves.toBeUndefined()
    } finally { h.close() }
  })

  it('cancels pending outside-right reopening on Escape without passing Escape to the parent', async () => {
    const h = harness()
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      const outside = { col: 80, row: 20 }
      h.send(outside, 2)
      h.send(outside, 2, true)
      h.terminal.input('\u001B')
      await h.frame()
      expect(h.menu.hasActive()).toBe(false)
      expect(h.opened).toHaveLength(1)
      expect(h.root.getValue()).toBe('')
    } finally { h.close() }
  })

  it.each(['dark', 'light'] as const)('reuses %s hover without forcing full redraws', async theme => {
    const h = harness()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    setTheme(BUILT_IN_THEMES[theme])
    try {
      await h.frame()
      const fullRedraws = h.tui.fullRedraws
      await h.click({ col: 3, row: 3 }, 2)
      h.terminal.writes = []
      h.send(h.center(h.region('close')), 35)
      await h.frame()
      const color = interaction.hover('probe').match(/\u001B\[38;2;\d+;\d+;\d+m/u)?.[0]
      expect(color).toBeDefined()
      expect(h.terminal.writes.join('')).toContain(color)
      await h.click({ col: 80, row: 20 })
      expect(h.tui.fullRedraws).toBe(fullRedraws)
    } finally { h.close() }
  })

  it('opens one child submenu by keyboard and returns its leaf action', async () => {
    const h = harness([
      { kind: 'submenu', id: 'export', label: 'Export', children: [
        { kind: 'action', id: 'markdown', label: 'Markdown' },
        { kind: 'action', id: 'zip', label: 'ZIP' },
      ] },
      { kind: 'action', id: 'close', label: 'Close' },
    ])
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      await h.key('\u001B[C')
      expect(h.geometry().overlays).toHaveLength(2)
      await h.key('\r')
      expect(h.selected).toHaveBeenCalledExactlyOnceWith('markdown', '')
      expect(h.menu.hasActive()).toBe(false)
    } finally { h.close() }
  })

  it('flips a child submenu to the left when the right edge has no room', async () => {
    const h = harness([
      { kind: 'submenu', id: 'export', label: 'Export a session archive', children: [
        { kind: 'action', id: 'markdown', label: 'Export as Markdown' },
        { kind: 'action', id: 'descendants', label: 'Export descendants as ZIP' },
      ] },
      { kind: 'action', id: 'close', label: 'Close' },
    ])
    try {
      h.terminal.columns = 58
      h.tui.requestRender(true)
      await h.frame()
      await h.click({ col: 57, row: 10 }, 2)
      await h.key('\u001B[C')
      const [rootMenu, childMenu] = h.geometry().overlays
      expect(rootMenu).toBeDefined()
      expect(childMenu).toBeDefined()
      expect(childMenu!.col).toBeLessThan(rootMenu!.col)
      expect(childMenu!.col).toBeGreaterThanOrEqual(0)
      expect(childMenu!.col + childMenu!.width).toBeLessThanOrEqual(h.terminal.columns)
      expect(childMenu!.row).toBeGreaterThanOrEqual(0)
      expect(childMenu!.row + childMenu!.height).toBeLessThanOrEqual(h.terminal.rows)
    } finally { h.close() }
  })

  it('opens a submenu only after the 250 ms hover delay and Esc returns one level', async () => {
    const h = harness([
      { kind: 'submenu', id: 'move', label: 'Move', children: [
        { kind: 'action', id: 'up', label: 'Up' },
      ] },
      { kind: 'action', id: 'close', label: 'Close' },
    ])
    try {
      await h.frame()
      await h.click({ col: 3, row: 3 }, 2)
      h.send(h.center(h.region('move')), 35)
      await vi.advanceTimersByTimeAsync(249)
      expect(h.geometry().overlays).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      await h.frame()
      expect(h.geometry().overlays).toHaveLength(2)
      await h.key('\u001B')
      expect(h.geometry().overlays).toHaveLength(1)
      expect(h.menu.hasActive()).toBe(true)
      await h.key('\u001B')
      expect(h.menu.hasActive()).toBe(false)
    } finally { h.close() }
  })
})
