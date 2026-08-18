import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { themePreviewFooter } from '../src/client/actions.ts'
import { setUiLocale } from '../src/client/locale.ts'
import {
  applyTranscriptEscape,
  applyTranscriptFocusToggle,
  noticeForHostCommand,
} from '../src/client/nav-notice.ts'
import { OverlayQueue } from '../src/client/overlays.ts'

afterEach(() => { setUiLocale('zh') })

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

function liveOverlays(): {
  readonly overlays: OverlayQueue
  component(): Component
} {
  let mounted: Component | undefined
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide: vi.fn() } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
    terminal: { rows: 24, cols: 80 },
  } as unknown as TUI
  return {
    overlays: new OverlayQueue(tui),
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted
    },
  }
}

describe('navigation noise', () => {
  it('runs Tab and Esc transcript branches without a status toast', () => {
    const cancelSearch = vi.fn(() => false)
    const exitToolFocus = vi.fn(() => false)
    const returnToComposer = vi.fn()
    const transcript = { cancelSearch, exitToolFocus }

    applyTranscriptFocusToggle(transcript)
    expect(cancelSearch).toHaveBeenCalledOnce()
    expect(exitToolFocus).toHaveBeenCalledOnce()

    applyTranscriptEscape({ cancelSearch: () => true, exitToolFocus }, returnToComposer)
    expect(returnToComposer).not.toHaveBeenCalled()

    applyTranscriptEscape({ cancelSearch: () => false, exitToolFocus: () => true }, returnToComposer)
    expect(returnToComposer).not.toHaveBeenCalled()

    applyTranscriptEscape({ cancelSearch: () => false, exitToolFocus: () => false }, returnToComposer)
    expect(returnToComposer).toHaveBeenCalledOnce()
  })

  it('keeps successful Host commands silent and still reports unknown names', () => {
    expect(noticeForHostCommand({ ok: true, matched: true }, 'compact')).toBeUndefined()
    expect(noticeForHostCommand({ ok: true, matched: false }, 'compact')).toEqual({
      message: '未识别命令 /compact',
      tone: 'warning',
    })
    const surface = readFileSync(resolve(import.meta.dirname, '../src/client/surface.ts'), 'utf8')
    expect(surface).toContain('noticeAfterFailedHostCommand(current.session, trimmed)')
    expect(surface).toContain('noticeForHostCommand({ ok: true, matched: outcome.matched }, name)')
    expect(surface).not.toMatch(/已执行 \/\${name}/u)
  })

  it('names Space on multi-select and Esc abort on progress pages', async () => {
    const multi = liveOverlays()
    void multi.overlays.multiSelect({
      title: 'files',
      choices: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
    })
    await vi.waitFor(() => { expect(plain(multi.component().render(80))).toContain('Space 勾选') })

    const progress = liveOverlays()
    const pending = progress.overlays.progress({
      title: 'install',
      work: async (_report, signal) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve()
            return
          }
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
        return undefined
      },
    })
    await vi.waitFor(() => { expect(plain(progress.component().render(80))).toContain('Esc 中止') })
    const handle = progress.component().handleInput
    if (handle === undefined) throw new Error('progress overlay has no handleInput')
    handle.call(progress.component(), '\u001B')
    await pending
  })

  it('keeps selector footers short and names Esc abort on progress pages', () => {
    const overlays = new OverlayQueue({
      showOverlay: vi.fn((component: Component) => {
        expect(plain(component.render(80))).toContain('Enter 选择 · Esc 返回')
        return { hide: vi.fn() } as unknown as OverlayHandle
      }),
      requestRender: vi.fn(),
      terminal: { rows: 24, cols: 80 },
    } as unknown as TUI)
    void overlays.select({
      title: 'models',
      choices: [{ id: 'a', label: 'a' }],
    })
  })

  it('tells theme preview that Esc cancels, restores, and discards unsaved edits', () => {
    expect(themePreviewFooter()).toBe('Enter 选择 · Esc 取消并恢复')
    setUiLocale('en')
    expect(themePreviewFooter()).toBe('Enter select · Esc cancel and restore')
    expect(themePreviewFooter()).not.toMatch(/\p{Script=Han}/u)
  })
})
