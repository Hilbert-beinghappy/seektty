import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { OverlayQueue, type OverlayNavigation } from '../src/client/overlays.ts'
import { renderOverlayFooter } from '../src/client/overlay-footer.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

function harness() {
  let component!: Component
  const tui = {
    terminal: { rows: 40, columns: 80 }, requestRender: vi.fn(),
    showOverlay: (value: Component) => {
      component = value
      return { hide: vi.fn() } as unknown as OverlayHandle
    },
  } as unknown as TUI
  const overlays = new OverlayQueue(tui)
  return {
    overlays,
    render: (width = 80) => component.render(width).map(stripCopyDecorations).join('\n'),
    key: (data: string) => { component.handleInput?.(data) },
    button: (command: string) => overlays.hitChildren().find(hit => hit.action.kind === 'overlay' && hit.action.command === command),
    click: (command: string) => overlays.handleFooterClick(command),
  }
}

beforeEach(() => { setUiLocale('en') })
afterEach(() => { setUiLocale('zh') })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

describe('typed overlay footer actions', () => {
  it('validates single-line input through the same submit path as Enter', async () => {
    const h = harness()
    const pending = h.overlays.input({ title: 'name', requireText: true })
    h.render()
    expect(h.click('footer-confirm')).toBe(true)
    expect(h.render()).toContain('Enter a value')
    expect(h.overlays.hasActive()).toBe(true)
    h.key('中文🙂')
    h.render()
    expect(h.click('footer-confirm')).toBe(true)
    await expect(pending).resolves.toBe('中文🙂')
  })

  it('submits multiline input without inserting an extra newline', async () => {
    const h = harness()
    const pending = h.overlays.multilineInput({ title: 'edit', initialValue: 'first' })
    h.key('\r')
    h.key('second')
    expect(h.render()).toContain('[Ctrl+Enter Submit]')
    h.click('footer-confirm')
    await expect(pending).resolves.toBe('first\nsecond')
  })

  it('validates and commits checked rows without toggling the focused row', async () => {
    const h = harness()
    const pending = h.overlays.multiSelect({ title: 'files', requireSelection: true, choices: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
    ] })
    h.click('footer-confirm')
    expect(h.render()).toContain('Select at least one option')
    h.key(' ')
    h.key('\u001B[B')
    h.render()
    h.click('footer-confirm')
    await expect(pending).resolves.toEqual([{ id: 'a', label: 'A' }])
  })

  it.each(['empty', 'disabled', 'filtered', 'danger'] as const)('disables unsafe/unavailable primary actions: %s', async mode => {
    const h = harness()
    const pending = h.overlays.select({
      title: 'picker',
      choices: mode === 'empty' ? [] : [{ id: 'a', label: 'A', ...(mode === 'disabled' ? { disabledReason: 'Unavailable' } : {}) }],
      ...(mode === 'danger' ? { mouseExecute: 'focus-only' as const } : {}),
    })
    if (mode === 'filtered') h.key('nomatch')
    const rendered = h.render()
    expect(h.button('footer-confirm')).toMatchObject({ enabled: false, hover: 'none' })
    expect(h.click('footer-confirm')).toBe(false)
    expect(h.overlays.hasActive()).toBe(true)
    if (mode === 'danger') {
      expect(rendered).toContain('keyboard only')
      h.key('\r')
      await expect(pending).resolves.toMatchObject({ id: 'a' })
    } else {
      expect(h.click('footer-back')).toBe(true)
      await expect(pending).resolves.toBeUndefined()
    }
  })

  it('keeps danger confirmation keyboard-only while its Back button cancels safely', async () => {
    const h = harness()
    const pending = h.overlays.confirm('Delete', 'Cannot undo')
    h.key('\u001B[B') // focus the affirmative choice
    h.render()
    expect(h.click('footer-confirm')).toBe(false)
    expect(h.click('footer-back')).toBe(true)
    await expect(pending).resolves.toBe(false)
  })

  it('closes detail with its real primary action', async () => {
    const h = harness()
    const pending = h.overlays.detail({ title: 'details', content: 'read only' })
    expect(h.render()).toContain('[Enter Close]')
    h.click('footer-confirm')
    await pending
    expect(h.overlays.hasActive()).toBe(false)
  })

  it('honors custom Escape handlers and returns from the page they open', async () => {
    const h = harness()
    const escaped = vi.fn()
    const pending = h.overlays.navigate(async nav => {
      await nav.selectPage({
        title: 'unsaved', choices: [{ id: 'a', label: 'A' }],
        onEscape: async () => {
          escaped()
          await nav.detail({ title: 'keep editing?', content: 'Your changes remain' })
        },
      }, () => undefined)
    })
    h.render()
    h.click('footer-back')
    await flush()
    expect(h.render()).toContain('keep editing?')
    expect(escaped).toHaveBeenCalledOnce()
    h.click('footer-back')
    await flush()
    expect(h.render()).toContain('unsaved')
    h.overlays.dispose()
    await pending
  })

  it('single-submits secrets and blocks both mouse cancellation and repeat submission while saving', async () => {
    const h = harness()
    let finish!: (result: { ok: true; value: string }) => void
    const work = vi.fn(() => new Promise<{ ok: true; value: string }>(resolve => { finish = resolve }))
    const pending = h.overlays.secretTransaction({
      input: { title: 'API key' }, busyTitle: 'Saving key', failureMessage: 'Try again',
      validate: value => ({ ok: true, value }), work,
    })
    h.key('synthetic-key-never-log')
    expect(h.render()).not.toContain('synthetic-key-never-log')
    h.click('footer-confirm')
    await flush()
    expect(h.render()).toContain('Saving key')
    expect(h.button('footer-confirm')).toBeUndefined()
    expect(h.button('footer-back')?.enabled).toBe(false)
    expect(h.click('footer-confirm')).toBe(false)
    expect(h.click('footer-back')).toBe(false)
    h.key('\r')
    h.key('\u001B')
    expect(work).toHaveBeenCalledOnce()
    expect(h.overlays.hasActive()).toBe(true)
    finish({ ok: true, value: 'saved' })
    await expect(pending).resolves.toBe('saved')
  })

  it('aborts progress through the same signal as Escape', async () => {
    const h = harness()
    let signal!: AbortSignal
    const pending = h.overlays.progress({
      title: 'working', work: async (_report, current) => {
        signal = current
        await new Promise<void>(resolve => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      },
    })
    expect(h.render()).toContain('[Esc Abort]')
    expect(h.click('footer-back')).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(h.click('footer-back')).toBe(false)
    await pending
  })

  it('rejects a second primary click while the first action is still busy', async () => {
    const h = harness()
    let finish!: () => void
    let navigation!: OverlayNavigation
    const action = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const pending = h.overlays.navigate(async nav => {
      navigation = nav
      await nav.selectPage({ title: 'work', choices: [{ id: 'run', label: 'Run' }] }, action)
    })
    h.render()
    expect(h.click('footer-confirm')).toBe(true)
    expect(h.click('footer-confirm')).toBe(false) // even before a disabled frame is painted
    await flush()
    expect(action).toHaveBeenCalledOnce()
    h.render()
    expect(h.button('footer-confirm')?.enabled).toBe(false)
    finish()
    await flush()
    h.render()
    expect(h.button('footer-confirm')?.enabled).toBe(true)
    navigation.finish()
    await pending
  })

  it.each(['en', 'zh'] as const)('keeps button hit boxes within narrow %s footers without overlap', locale => {
    setUiLocale(locale)
    for (const width of [8, 12, 20, 40, 80]) {
      const result = renderOverlayFooter([
        { command: 'footer-confirm', key: 'Enter', label: locale === 'en' ? 'Select' : '选择', enabled: true, run: vi.fn() },
        { command: 'footer-back', key: 'Esc', label: locale === 'en' ? 'Back' : '返回', enabled: true, run: vi.fn() },
      ], width, 'footer-back')
      expect(result.hits).toHaveLength(2)
      for (const line of result.lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width - 4)
      for (const hit of result.hits) {
        expect(hit.rect.col).toBeGreaterThanOrEqual(2)
        expect(hit.rect.col + hit.rect.width).toBeLessThanOrEqual(width - 2)
        expect(result.lines[hit.rect.row]).toBeDefined()
      }
      const [first, second] = result.hits
      expect(first!.rect.row !== second!.rect.row || first!.rect.col + first!.rect.width < second!.rect.col).toBe(true)
    }
  })
})
