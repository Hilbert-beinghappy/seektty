import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { setUiLocale } from '../src/client/locale.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { AppearanceSettingsSchema } from '../src/host/management.ts'
import { TUI_APPEARANCE_SETTINGS_NAMESPACE, type TuiSettingsDocument, type TuiManagementBridge, type TuiSettingsPathOp } from '../src/protocol.ts'

function harness() {
  let current: TuiSettingsDocument = {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE, schema: AppearanceSettingsSchema.toJSON(),
    value: { theme: 'dark', codeTheme: 'auto', customThemes: [] }, revision: 5, applies: 'live', secrets: [],
  }
  const mutate = vi.fn(async (_namespace: string, ops: readonly TuiSettingsPathOp[], revision: number) => {
    expect(revision).toBe(current.revision)
    const op = ops[0]
    if (op?.op !== 'set') throw new Error('expected set')
    current = { ...current, revision: revision + 1, value: { ...current.value as object, backgroundMode: op.value } }
    return current
  })
  const management = { settings: { describe: async () => [current], mutate } } as unknown as TuiManagementBridge
  const capabilities = { managementBridge: () => management, active: () => undefined } as unknown as HarnessTuiCapabilities
  let mounted: Component | undefined
  const overlays = new OverlayQueue({
    showOverlay: (component: Component) => { mounted = component; return { hide: vi.fn() } as unknown as OverlayHandle },
    requestRender: vi.fn(),
  } as unknown as TUI)
  const host: TuiActionHost = {
    overlays, transcript: {} as Transcript,
    notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn(), applyTheme: vi.fn(), applyAppearance: vi.fn(),
    applyLocale: vi.fn(), setEditor: vi.fn(), copy: vi.fn(), close: vi.fn(), restart: vi.fn(), requireRestart: vi.fn(),
  }
  return {
    actions: new TuiActions(capabilities, host), overlays, host, mutate, current: () => current,
    text: () => mounted?.render(120).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') ?? '',
    key: (data: string) => mounted?.handleInput?.(data),
  }
}

afterEach(() => { setUiLocale('zh') })

describe('shared background editor', () => {
  it.each(['zh', 'en'] as const)('exposes the same three choices from /theme and /settings (%s)', async locale => {
    setUiLocale(locale)
    const panels: string[] = []
    for (const entry of ['theme', 'settings']) {
      const h = harness()
      const pending = h.actions.execute(entry, entry === 'settings' ? TUI_APPEARANCE_SETTINGS_NAMESPACE : '')
      try {
        await vi.waitFor(() => { expect(h.text()).toContain(locale === 'zh' ? '背景模式' : 'Background mode') })
        if (entry === 'settings') await vi.waitFor(() => { expect(h.text()).toContain(`${locale === 'zh' ? '设置' : 'Settings'} · seektty-appearance`) })
        h.key('\u001B[B')
        h.key('\u001B[B')
        h.key('\r')
        await vi.waitFor(() => { expect(h.text()).toContain(locale === 'zh' ? '主画布、弹窗面板和代码基础背景' : 'Canvas, panels and base code backgrounds') })
        const panel = h.text()
        panels.push(panel)
        if (locale === 'en') expect(panel).not.toMatch(/\p{Script=Han}/u)
        expect(panel).toContain(locale === 'zh' ? '跟随终端' : 'Follow terminal')
        expect(panel).toContain(locale === 'zh' ? '显式主题底色' : 'Explicit fill')
        h.key('\u001B[B')
        h.key('\r')
        await vi.waitFor(() => { expect(h.host.applyAppearance).toHaveBeenCalledExactlyOnceWith({
          theme: 'dark', codeTheme: 'auto', customThemes: [], backgroundMode: 'terminal',
        }) })
        expect(h.mutate).toHaveBeenCalledExactlyOnceWith(TUI_APPEARANCE_SETTINGS_NAMESPACE,
          [{ op: 'set', path: ['backgroundMode'], value: 'terminal' }], 5)
        expect(h.host.applyTheme).not.toHaveBeenCalled()
      } finally { h.overlays.dispose(); await pending }
    }
    expect(panels[0]).toBe(panels[1])
  })

  it.each(['cancel', 'same', 'failure'])('does not apply a background on %s', async outcome => {
    const h = harness()
    if (outcome === 'failure') h.mutate.mockRejectedValueOnce(new Error('save failed'))
    const pending = h.actions.execute('settings', TUI_APPEARANCE_SETTINGS_NAMESPACE)
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('设置 · seektty-appearance') })
      h.key('\u001B[B')
      h.key('\u001B[B')
      h.key('\r')
      await vi.waitFor(() => { expect(h.text()).toContain('主画布、弹窗面板和代码基础背景') })
      if (outcome === 'failure') h.key('\u001B[B')
      h.key(outcome === 'cancel' ? '\u001B' : '\r')
      await vi.waitFor(() => {
        if (outcome === 'failure') expect(h.host.notice).toHaveBeenCalledWith(expect.stringContaining('save failed'), 'error')
        else expect(h.text()).toContain('设置 · seektty-appearance')
      })
      expect(h.host.applyAppearance).not.toHaveBeenCalled()
      expect(h.host.applyTheme).not.toHaveBeenCalled()
      expect(h.current().revision).toBe(5)
      if (outcome !== 'failure') expect(h.mutate).not.toHaveBeenCalled()
    } finally { h.overlays.dispose(); await pending }
  })
})
