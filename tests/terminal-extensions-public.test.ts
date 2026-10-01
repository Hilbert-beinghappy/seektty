import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { TUI } from '@mariozechner/pi-tui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalExtensionRegistry } from '../src/host/terminal-extensions.ts'
import { TerminalInputExtensions } from '../src/client/terminal-input-extensions.ts'
import { PromptEditor } from '../src/client/chrome.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { scopedSource, scriptedOverlays } from './fixtures/optional-native-views.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
async function fixture() {
  const root = new Context()
  cleanups.push(() => root.fiber.dispose())
  await root.plugin({ name: 'fixture-registry', apply: ctx => { new TerminalExtensionRegistry(ctx) } })
  await root.plugin(Loader, { baseUrl: import.meta.url })
  await root.loader.create({ name: new URL('./fixtures/terminal-extension-plugin.mjs', import.meta.url).href }); await root.loader.await()
  const service = root.get('seekttyExtensions')!, scoped = scopedSource()
  const targets = new Map(['synthetic-root', 'target-session'].map(id => [id, { session: {}, summary: { id, displayTitle: `Title ${id}` } }]))
  const target = (id: string) => targets.get(id)
  const cap = { managementBridge: () => ({ terminalExtensions: service }), sessionTarget: target, terminalExtensionSource: () => scoped.source }
  return { root, service, scoped, targets, cap: cap as unknown as HarnessTuiCapabilities }
}
describe('loaded terminal extensions at public menus and composer entry', () => {
  it('dispatches the right-clicked Session rather than the current root and keeps builtin archive last', async () => {
    const f = await fixture(), script = scriptedOverlays([]), notice = vi.fn()
    const actions = new TuiActions(f.cap, { overlays: script.overlays, notice } as unknown as TuiActionHost)
    const menu = actions.contextMenuFor({ kind: 'session', sessionId: 'target-session' })!
    const row = menu.nodes.find(node => node.kind === 'action' && node.label === 'Fixture Session action')!
    expect(menu.nodes.at(-1)).toMatchObject({ id: 'archive' })
    expect(row.id).toMatch(/^seektty-extension:\d+:fixture.session$/u)
    await actions.executeContext({ target: menu.target, actionId: row.id }, script.overlays)
    expect(notice).toHaveBeenCalledWith('Session target: target-session', 'info')
  })
  it('rejects registration replacement between menu display and dispatch with zero stale callback calls', async () => {
    const f = await fixture(), script = scriptedOverlays([]), notice = vi.fn(), run = vi.fn(async () => 'late')
    const remove = f.service.registerSessionAction({ id: 'fixture.replace', label: 'Replace', run })
    const actions = new TuiActions(f.cap, { overlays: script.overlays, notice } as unknown as TuiActionHost)
    const menu = actions.contextMenuFor({ kind: 'session', sessionId: 'target-session' })!
    const row = menu.nodes.find(node => node.kind === 'action' && node.label === 'Replace')!
    remove(); f.service.registerSessionAction({ id: 'fixture.replace', label: 'New', run })
    await actions.executeContext({ target: menu.target, actionId: row.id }, script.overlays)
    expect(run).not.toHaveBeenCalled(); expect(notice).toHaveBeenCalledWith(expect.stringContaining('changed'), 'error')
  })
  it('performs real overlay selection, releases progress focus, then inserts into the original selection without sending', async () => {
    const f = await fixture(); let input!: (text: string) => void; let mounted: { render(width: number): string[] } | undefined
    const terminal = { columns: 100, rows: 30, kittyProtocolActive: false,
      start: (handler: (text: string) => void) => { input = handler }, stop() {}, write() {}, drainInput: async () => {},
      moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} }
    const tui = new TUI(terminal, false), editor = new PromptEditor(tui), overlays = new OverlayQueue(tui), submitted = vi.fn()
    const show = tui.showOverlay.bind(tui)
    vi.spyOn(tui, 'showOverlay').mockImplementation((component, options) => { mounted = component; return show(component, options) })
    const controller = new TerminalInputExtensions(editor, () => ({ ...f.scoped.source.getSnapshot(), displayTitle: 'Root', locked: false }))
    cleanups.push(() => { controller.dispose(); overlays.dispose(); tui.stop() })
    editor.onSubmit = submitted; editor.setText('hello'); editor.setSelection({ line: 0, col: 1 }, { line: 0, col: 4 })
    tui.addChild(editor); tui.setFocus(editor); tui.start()
    const insert = vi.fn((text, capture, signal) => { expect(overlays.hasActive()).toBe(false); const applied = controller.insertText(text, capture, signal); tui.setFocus(editor); return applied })
    const actions = new TuiActions(f.cap, { overlays, notice: vi.fn(), captureInsertion: () => controller.captureInsertion(), insertExtensionText: insert } as unknown as TuiActionHost)
    const work = actions.execute('input-activities', '')
    await vi.waitFor(() => expect(mounted?.render(90).join('\n')).toContain('Fixture input activity'))
    input('\r'); await work
    expect(insert).toHaveBeenCalledOnce(); expect(editor.getText()).toBe('hinput:1-4o')
    expect(overlays.hasActive()).toBe(false); expect(submitted).not.toHaveBeenCalled()
    input(' ordinary draft'); expect(editor.getText()).toContain('ordinary draft'); expect(submitted).not.toHaveBeenCalled()
    editor.handleInput('\u001a'); expect(editor.getText()).toBe('hinput:1-4o')
  })
  it('offers input activities on the composer context target and refuses late results after session loss', async () => {
    const f = await fixture(), editor = new PromptEditor({ terminal: { rows: 24 }, requestRender: vi.fn() } as unknown as TUI)
    editor.setText('draft')
    const controller = new TerminalInputExtensions(editor, () => ({ ...f.scoped.source.getSnapshot(), displayTitle: 'Root', locked: false }))
    cleanups.push(() => controller.dispose())
    let finish!: (value: string) => void
    f.service.registerInputActivity({ id: 'fixture.slow', label: 'Slow activity', run: () => new Promise(resolve => { finish = resolve }) })
    const script = scriptedOverlays([]), insert = vi.fn((text, capture, signal) => controller.insertText(text, capture, signal)), notice = vi.fn()
    const actions = new TuiActions(f.cap, { overlays: script.overlays, notice, captureInsertion: () => controller.captureInsertion(), insertExtensionText: insert } as unknown as TuiActionHost)
    const menu = actions.contextMenuFor({ kind: 'text', surface: 'composer' })!, row = menu.nodes.find(node => node.kind === 'action' && node.label === 'Slow activity')!
    const work = actions.executeContext({ target: menu.target, actionId: row.id }, script.overlays)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    f.scoped.set({ sessionId: 'another-root', generation: 2 }); await work; finish('late')
    expect(insert).not.toHaveBeenCalled(); expect(editor.getText()).toBe('draft'); expect(f.scoped.listeners.size).toBe(0)
  })
  it('rechecks an inactive target when real queued progress starts after an unrelated detail overlay closes', async () => {
    const f = await fixture(); let input!: (text: string) => void; let mounted: { render(width: number): string[] } | undefined
    const terminal = { columns: 100, rows: 30, kittyProtocolActive: false,
      start: (handler: (text: string) => void) => { input = handler }, stop() {}, write() {}, drainInput: async () => {},
      moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {} }
    const tui = new TUI(terminal, false), overlays = new OverlayQueue(tui), notice = vi.fn(), run = vi.fn(async () => 'stale result')
    const show = tui.showOverlay.bind(tui)
    vi.spyOn(tui, 'showOverlay').mockImplementation((component, options) => { mounted = component; return show(component, options) })
    cleanups.push(() => { overlays.dispose(); tui.stop() }); tui.start()
    f.service.registerSessionAction({ id: 'fixture.queue', label: 'Queued Session action', run })
    const actions = new TuiActions(f.cap, { overlays, notice } as unknown as TuiActionHost)
    const menu = actions.contextMenuFor({ kind: 'session', sessionId: 'target-session' })!, row = menu.nodes.find(node => node.kind === 'action' && node.label === 'Queued Session action')!
    const detail = overlays.detail({ title: 'Unrelated first overlay', content: 'Hold the real queue' })
    await vi.waitFor(() => expect(mounted?.render(90).join('\n')).toContain('Hold the real queue'))
    const work = actions.executeContext({ target: menu.target, actionId: row.id }, overlays)
    expect(run).not.toHaveBeenCalled()
    f.targets.delete('target-session'); f.scoped.set({}); input('\u001b'); await detail
    await vi.waitFor(() => expect(mounted?.render(90).join('\n')).toContain('scope unavailable'))
    expect(run).not.toHaveBeenCalled(); expect(notice).not.toHaveBeenCalled()
    input('\u001b'); await work
    expect(f.scoped.source.getSnapshot()).toEqual({ sessionId: 'synthetic-root', generation: 1, ready: true })
    expect(f.scoped.listeners.size).toBe(0)
  })
  it('suppresses a dispatched action reply after its inactive target disappears or is replaced without changing the active root', async () => {
    for (const replacement of [false, true]) {
      const f = await fixture(), script = scriptedOverlays([]), notice = vi.fn(); let resolve!: (value: string) => void
      const run = vi.fn(() => new Promise<string>(finish => { resolve = finish }))
      f.service.registerSessionAction({ id: 'fixture.pending', label: 'Pending action', run })
      const actions = new TuiActions(f.cap, { overlays: script.overlays, notice } as unknown as TuiActionHost)
      const menu = actions.contextMenuFor({ kind: 'session', sessionId: 'target-session' })!, row = menu.nodes.find(node => node.kind === 'action' && node.label === 'Pending action')!
      const work = actions.executeContext({ target: menu.target, actionId: row.id }, script.overlays)
      await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
      if (replacement) f.targets.set('target-session', { session: {}, summary: { id: 'target-session', displayTitle: 'New activation' } })
      else f.targets.delete('target-session')
      f.scoped.set({}); await work; resolve('Unconfirmed late success')
      expect(notice).not.toHaveBeenCalled(); expect(script.details.at(-1)?.content).toContain('may have completed')
      expect(f.scoped.listeners.size).toBe(0)
    }
  })
})
