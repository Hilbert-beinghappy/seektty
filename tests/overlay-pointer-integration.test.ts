import { afterEach, describe, expect, it, vi } from 'vitest'
import { StdinBuffer, TUI, type Terminal } from '@mariozechner/pi-tui'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import { armMouseActivation, matchesMouseActivation, type MouseArmedActivation } from '../src/client/mouse-activation.ts'
import { createMouseController, FOCUS_GUARD_MS } from '../src/client/mouse-controller.ts'
import { emptyHitMap, finalizeHitMap, HitMapBuilder, type HitRegion } from '../src/client/mouse-hit-map.ts'
import { decodeMouseSequence } from '../src/client/mouse-protocol.ts'
import { OverlayQueue, type OverlayNavigation } from '../src/client/overlays.ts'
import { tuiFrameApi } from '../src/client/pi-tui-adapters.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { background, setTheme } from '../src/client/theme.ts'

class VirtualTerminal implements Terminal {
  columns = 100
  rows = 30
  kittyProtocolActive = false
  writes: string[] = []
  private readonly stdin = new StdinBuffer({ timeout: 10 })
  input: (data: string) => void = () => undefined
  start(onInput: (data: string) => void): void {
    this.stdin.on('data', onInput)
    this.stdin.on('paste', content => { onInput(`\u001B[200~${content}\u001B[201~`) })
    this.input = data => { this.stdin.process(data) }
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

/** Real pi-tui frames + SGR events; only Host actions and the terminal device are synthetic. */
function pointerHarness(hoverFeedback: boolean) {
  const terminal = new VirtualTerminal()
  const tui = new TUI(terminal, false)
  let map = emptyHitMap(0, terminal.columns, terminal.rows)
  let armed: MouseArmedActivation | undefined
  const controller = createMouseController({
    getHitMap: () => map,
    getBehavior: () => ({ ...DEFAULT_TUI_BEHAVIOR, hoverFeedback }),
  })
  const overlays = new OverlayQueue(tui, () => {
    controller.endGesture()
    controller.clearHover()
    armed = undefined
    map = emptyHitMap(map.generation + 1, terminal.columns, terminal.rows)
  })
  tui.addChild({ render: () => ['background'], invalidate: () => undefined })
  tuiFrameApi(tui).onAfterRender = () => {
    const geometry = tuiFrameApi(tui).getLastFrameGeometry?.()
    if (geometry === undefined) throw new Error('missing frame geometry')
    map = finalizeHitMap(new HitMapBuilder(map.generation + 1), geometry, {
      overlayId: overlays.activeOverlayId() ?? '', children: overlays.hitChildren(),
    })
  }
  const keyInputs: string[] = []
  const textPointer = (point: { col: number; row: number }, origin: { col: number; row: number } | undefined, input: boolean, count = 1, ended = false) => {
    const body = map.regions.find(region => region.id === `overlay:${overlays.activeOverlayId()}:body`)
    if (body === undefined) throw new Error('missing overlay body')
    const local = (value: { col: number; row: number }) => ({ col: value.col - body.rect.col, row: value.row - body.rect.row })
    overlays.handleTextPointer(local(point), origin === undefined ? undefined : local(origin), input, count, ended)
  }
  tui.addInputListener(data => {
    const event = decodeMouseSequence(data)
    if (event === undefined) {
      keyInputs.push(data)
      armed = undefined
      controller.endGesture()
      controller.clearHover()
      overlays.handleHover()
      return undefined
    }
    if (event === null) return { consume: true }
    let render = false
    if (event.kind !== 'move' && event.kind !== 'focus') {
      const controllerChanged = controller.clearHover()
      render = overlays.handleHover() || controllerChanged || render
    }
    const outcome = controller.handle(event)
    const semantic = outcome.semantic
    if (semantic?.kind === 'wheel' && semantic.region?.action.kind === 'overlay') {
      armed = undefined
      overlays.handleWheel(semantic.lines)
    } else if (semantic?.kind === 'hover') {
      overlays.handleHover(
        semantic.region?.action.kind === 'overlay' ? semantic.region.action.optionId : undefined,
        semantic.region?.action.kind === 'overlay' ? semantic.region.action.command : undefined,
      )
    } else if (semantic?.kind === 'drag' && semantic.region?.action.kind === 'overlay') {
      armed = undefined
      textPointer(semantic.point, semantic.origin, semantic.region.role === 'input', 1, semantic.ended === true)
    } else if (semantic?.kind === 'click' && semantic.button === 'left' && !semantic.suppressed && semantic.region?.action.kind === 'overlay') {
      const id = semantic.region.action.optionId
      if (id !== undefined) {
        const generation = overlays.activeGeneration()
        const result = overlays.handleOptionClick(id)
        if (result === 'activated' && matchesMouseActivation(armed, 'option', id, generation)) {
          overlays.activateArmedOption()
          armed = undefined
        } else if (result === 'focused' || result === 'activated') {
          armed = armMouseActivation('option', id, generation)
        }
      } else if (semantic.region.role === 'button') {
        armed = undefined
        overlays.handleFooterClick(semantic.region.action.command)
      } else if (semantic.region.role === 'input' || semantic.region.role === 'text') {
        textPointer(semantic.point, undefined, semantic.region.role === 'input', semantic.count)
      }
    }
    render = outcome.requestRender === true || render
    if (render) tui.requestRender()
    return { consume: true }
  })
  tui.start()
  const frame = async () => { await vi.advanceTimersByTimeAsync(50) }
  const region = (optionId: string): HitRegion => {
    const hit = map.regions.find(hit => hit.action.kind === 'overlay'
      && (hit.action.optionId === optionId || hit.action.command === optionId))
    if (hit === undefined) throw new Error(`missing hit for ${optionId}`)
    return hit
  }
  const emit = (hit: HitRegion, button: number, release = false) => {
    terminal.input(`\u001B[<${button};${hit.rect.col + 3};${hit.rect.row + 1}${release ? 'm' : 'M'}`)
  }
  return {
    overlays, terminal, region, frame, keyInputs, emit,
    hover: async (id: string) => { emit(region(id), 35); await frame() },
    click: async (id: string) => {
      const hit = region(id)
      emit(hit, 0)
      await frame() // Exercise the formerly lost release after hover-clear repaint.
      emit(hit, 0, true)
      await frame()
    },
    repaint: async () => { tui.requestRender(); await frame() },
    drag: async (role: 'input' | 'option' | 'text', start: number, end: number) => {
      const hit = map.regions.find(region => region.role === role && region.action.kind === 'overlay')
      if (hit === undefined) throw new Error(`missing ${role} hit`)
      const sgr = (button: number, col: number, release = false) => `\u001B[<${button};${hit.rect.col + col + 1};${hit.rect.row + 1}${release ? 'm' : 'M'}`
      terminal.input(sgr(0, start))
      await frame()
      terminal.input(sgr(32, end))
      await frame()
      terminal.input(sgr(0, end, true))
      await frame()
    },
    close: () => { overlays.dispose(); controller.dispose(); tui.stop() },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setTheme(BUILT_IN_THEMES.dark)
})

describe('overlay pointer / frame integration', () => {
  it.each(['select', 'multiSelect'] as const)('keeps %s description-row SGR targets through width changes and wheel browsing', async method => {
    vi.useFakeTimers()
    const h = pointerHarness(true)
    const choices = Array.from({ length: 16 }, (_, index) => ({
      id: `mode-${index}`, label: `Mode ${index}`, description: 'Long description 中文🙂 '.repeat(8),
    }))
    const pending = h.overlays[method]({ title: 'modes', maxVisible: 4, choices })
    try {
      await h.frame()
      h.emit(h.region('mode-0'), 65) // Wheel down changes the viewport, not the selection.
      await h.frame()
      await h.click('mode-4')
      if (method === 'multiSelect') h.terminal.input(' ')
      await h.frame()
      for (const columns of [240, 70, 180, 100]) {
        h.terminal.columns = columns
        await h.repaint()
        const rect = h.region('mode-4').rect
        await h.hover('mode-5')
        expect(h.region('mode-4').rect).toEqual(rect)
        expect(h.region('mode-4').rect.height).toBe(1)
        expect(h.region('mode-5').rect.row).toBe(rect.row + 1)
      }
      await h.click('footer-confirm')
      await expect(pending).resolves.toEqual(method === 'select' ? choices[4] : [choices[4]])
      // Mouse reports must not become search text at any width.
      expect(h.keyInputs).toEqual(method === 'select' ? [] : [' '])
    } finally { h.close(); await pending }
  })

  it.each(['dark', 'light'] as const)('single-clicks footer navigation through nested pages with %s hover and no focus cycle', async theme => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    setTheme(BUILT_IN_THEMES[theme])
    const h = pointerHarness(true)
    const visited = vi.fn()
    const page = async (nav: OverlayNavigation, depth: number): Promise<void> => {
      await nav.selectPage({ title: `level-${depth}`, choices: [
        { id: 'stay', label: 'Stay' }, { id: 'next', label: 'Next' },
      ] }, async choice => {
        visited(depth, choice.id)
        if (choice.id === 'next') await page(nav, depth + 1)
      })
    }
    const pending = h.overlays.navigate(async nav => { await page(nav, 0) })
    try {
      await h.frame()
      const pageIds = [h.overlays.activeOverlayId()]
      for (let depth = 0; depth < 3; depth++) {
        await h.click('next') // selects, but does not enter
        expect(visited).toHaveBeenCalledTimes(depth)
        h.terminal.writes = []
        await h.hover('footer-confirm')
        const hoverColor = background.hover('probe').match(/\u001B\[48;2;\d+;\d+;\d+m/u)?.[0]
        expect(hoverColor).toBeDefined()
        expect(h.terminal.writes.join('')).toContain(hoverColor)
        await h.click('footer-confirm') // one click, unlike an option's select-then-activate
        expect(visited).toHaveBeenLastCalledWith(depth, 'next')
        pageIds.push(h.overlays.activeOverlayId())
      }
      expect(new Set(pageIds).size).toBe(4)
      for (let depth = 0; depth < 3; depth++) {
        await h.click('footer-back')
        expect(h.overlays.hasActive()).toBe(true)
      }
      await h.click('footer-back')
      expect(h.overlays.hasActive()).toBe(false)
      await pending
    } finally { h.close(); await pending }
  })

  it('suppresses a held refocus click, then accepts the next footer click', async () => {
    vi.useFakeTimers()
    const h = pointerHarness(false)
    const pending = h.overlays.select({ title: 'picker', choices: [{ id: 'one', label: 'One' }] })
    try {
      await h.frame()
      h.terminal.input('\u001B[O\u001B[I')
      const hit = h.region('footer-confirm')
      h.emit(hit, 0)
      await vi.advanceTimersByTimeAsync(FOCUS_GUARD_MS + 1)
      h.emit(hit, 0, true)
      await h.frame()
      expect(h.overlays.hasActive()).toBe(true)
      await h.click('footer-confirm')
      await expect(pending).resolves.toMatchObject({ id: 'one' })
    } finally { h.close(); await pending }
  })

  it('drops a held footer press when keyboard input or a page change invalidates it', async () => {
    vi.useFakeTimers()
    const h = pointerHarness(true)
    let navigation!: OverlayNavigation
    const activated = vi.fn()
    const pending = h.overlays.navigate(async nav => {
      navigation = nav
      await nav.selectPage({ title: 'old', choices: [{ id: 'old', label: 'Old' }] }, activated)
    })
    try {
      await h.frame()
      let hit = h.region('footer-confirm')
      h.emit(hit, 0)
      h.terminal.input('o')
      await h.frame()
      h.emit(hit, 0, true)
      await h.frame()
      expect(activated).not.toHaveBeenCalled()
      hit = h.region('footer-confirm')
      h.emit(hit, 0)
      navigation.replaceSelectPage({ title: 'new', choices: [{ id: 'new', label: 'New' }] }, activated)
      await h.frame()
      h.emit(hit, 0, true)
      await h.frame()
      expect(activated).not.toHaveBeenCalled()
      await h.click('footer-confirm')
      expect(activated).toHaveBeenCalledOnce()
      expect(activated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }))
    } finally { h.close(); await pending }
  })

  it('drags and edits search text through three logical modal levels using real SGR input', async () => {
    vi.useFakeTimers()
    const h = pointerHarness(true)
    const visited = vi.fn()
    const page = async (nav: OverlayNavigation, depth: number): Promise<void> => {
      await nav.selectPage({ title: `level-${depth}`, choices: [{ id: 'next', label: 'abcdef next' }] }, async () => {
        visited(depth)
        await page(nav, depth + 1)
      })
    }
    const pending = h.overlays.navigate(async nav => { await page(nav, 0) })
    try {
      for (let depth = 0; depth < 3; depth++) {
        await h.frame()
        h.terminal.input('abcdef')
        await h.frame()
        await h.drag('input', 2, 4)
        expect(h.overlays.textTarget()?.text).toBe('abc')
        h.terminal.input('\u007F')
        await h.frame()
        h.overlays.textTarget()?.selectAll()
        expect(h.overlays.textTarget()?.text).toBe('def')
        h.terminal.input('\u001A') // undo the deletion, not the preceding SGR drag
        await h.frame()
        h.overlays.textTarget()?.selectAll()
        expect(h.overlays.textTarget()?.text).toBe('abcdef')
        h.overlays.textTarget()?.replace('')
        await h.frame()
        h.terminal.input('\u001A') // context-menu replacement also keeps an undo boundary
        await h.frame()
        h.overlays.textTarget()?.selectAll()
        expect(h.overlays.textTarget()?.text).toBe('abcdef')
        h.overlays.textTarget()?.replace('')
        await h.frame()
        await h.drag('option', 5, 10)
        expect(h.overlays.textTarget()?.text).toContain('abcdef')
        expect(visited).toHaveBeenCalledTimes(depth)
        await h.click('next')
        await h.click('next')
        expect(visited).toHaveBeenCalledTimes(depth + 1)
      }
    } finally { h.close(); await pending }
  })

  it.each([0, 5, 20, 100])('goes back once without polluting search when hover follows Escape after %d ms', async delay => {
    vi.useFakeTimers()
    const harness = pointerHarness(true)
    const visited = vi.fn()
    const page = async (nav: OverlayNavigation, depth: number): Promise<void> => {
      await nav.selectPage({ title: `page-${depth}`, searchable: true, choices: [
        { id: 'stay', label: 'Stay' }, { id: 'next', label: 'Next page' },
      ] }, async () => { visited(depth); await page(nav, depth + 1) })
    }
    const pending = harness.overlays.navigate(async nav => { await page(nav, 0) })
    try {
      await harness.frame()
      await harness.click('next')
      await harness.click('next')
      const childId = harness.overlays.activeOverlayId()
      const hit = harness.region('next')
      const motion = `\u001B[<35;${hit.rect.col + 3};${hit.rect.row + 1}M`
      if (delay === 0) harness.terminal.input('\u001B' + motion)
      else {
        harness.terminal.input('\u001B')
        await vi.advanceTimersByTimeAsync(delay)
        harness.terminal.input(motion)
      }
      await harness.frame()
      expect(harness.keyInputs).toEqual(['\u001B'])
      expect(harness.overlays.hasActive()).toBe(true)
      expect(harness.overlays.activeOverlayId()).not.toBe(childId)
      expect(harness.region('next')).toBeDefined() // A polluted search would hide this option.
      expect(visited).toHaveBeenCalledTimes(1)
    } finally {
      harness.close()
      await pending
    }
  })

  it.each(['dark', 'light'] as const)('shows distinct hover through three logical pages in the %s theme', async theme => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    setTheme(BUILT_IN_THEMES[theme])
    const harness = pointerHarness(true)
    let navigation: OverlayNavigation | undefined
    const visited = vi.fn()
    const page = async (nav: OverlayNavigation, depth: number): Promise<void> => {
      await nav.selectPage({ title: `page-${depth}`, choices: [
        { id: 'stay', label: 'Stay' },
        { id: 'next', label: `Open page ${depth + 1}` },
      ] }, async () => { visited(depth); await page(nav, depth + 1) })
    }
    const pending = harness.overlays.navigate(async nav => { navigation = nav; await page(nav, 0) })
    try {
      await harness.frame()
      const identities = new Set<string>()
      for (let depth = 0; depth < 3; depth++) {
        const target = harness.region('next')
        expect(identities.has(target.id)).toBe(false)
        identities.add(target.id)
        harness.terminal.writes = []
        await harness.hover('next')
        const hoverColor = background.hover('probe').match(/\u001B\[48;2;\d+;\d+;\d+m/u)?.[0]
        expect(hoverColor).toBeDefined()
        expect(harness.terminal.writes.join('')).toContain(hoverColor)
        expect(visited).toHaveBeenCalledTimes(depth)
        await harness.click('next')
        expect(harness.region('next').rect).toEqual(target.rect)
        expect(visited).toHaveBeenCalledTimes(depth)
        await vi.advanceTimersByTimeAsync(10_000)
        await harness.repaint()
        await harness.click('next')
        expect(visited).toHaveBeenCalledTimes(depth + 1)
      }
      navigation?.back()
      await harness.frame()
      harness.terminal.writes = []
      await harness.hover('next')
      expect(harness.terminal.writes.length).toBeGreaterThan(0)
      await harness.click('next')
      expect(visited).toHaveBeenCalledTimes(3) // Returning must not inherit an armed parent.
    } finally {
      harness.close()
      await pending
    }
  })

  it('selects and then activates with hover disabled and without a terminal focus cycle', async () => {
    vi.useFakeTimers()
    const harness = pointerHarness(false)
    const pending = harness.overlays.select({ title: 'picker', choices: [
      { id: 'one', label: 'One' }, { id: 'two', label: 'Two' },
    ] })
    try {
      await harness.frame()
      await harness.click('two')
      expect(harness.overlays.hasActive()).toBe(true)
      await vi.advanceTimersByTimeAsync(60_000)
      await harness.click('two')
      await expect(pending).resolves.toMatchObject({ id: 'two' })
    } finally {
      harness.close()
    }
  })
})
