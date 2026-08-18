import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { themePreviewFooter } from '../src/client/actions.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { noticeForHostCommand, noticeForPureNavigation } from '../src/client/nav-notice.ts'
import { OverlayQueue } from '../src/client/overlays.ts'

afterEach(() => { setUiLocale('zh') })

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

describe('navigation noise', () => {
  it('does not toast Tab/Esc navigation or a successful Host command', () => {
    expect(noticeForPureNavigation()).toBeUndefined()
    expect(noticeForHostCommand({ ok: true, matched: true }, 'compact')).toBeUndefined()
    expect(noticeForHostCommand({ ok: true, matched: false }, 'compact')).toEqual({
      message: '未识别命令 /compact',
      tone: 'warning',
    })
    expect(noticeForHostCommand({ ok: false, message: 'boom' }, 'compact')).toEqual({
      message: '命令失败：boom',
      tone: 'error',
    })
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
