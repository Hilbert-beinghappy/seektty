import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { setUiLocale } from '../src/client/locale.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { AppearanceSettingsSchema } from '../src/host/management.ts'
import { resolveRendering } from '../src/client/appearance-rendering.ts'
import { TUI_APPEARANCE_SETTINGS_NAMESPACE, type TuiSettingsDocument, type TuiManagementBridge, type TuiSettingsPathOp } from '../src/protocol.ts'

function harness() {
  let current: TuiSettingsDocument = {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE, schema: AppearanceSettingsSchema.toJSON(),
    value: { theme: 'dark', codeTheme: 'auto', customThemes: [] }, revision: 5, applies: 'live', secrets: [],
  }
  const mutate = vi.fn(async (_namespace: string, ops: readonly TuiSettingsPathOp[], revision: number) => {
    expect(revision).toBe(current.revision)
    const value = { ...current.value as Record<string, unknown> }
    for (const op of ops) {
      if (op.op !== 'set') throw new Error('expected set')
      value[String(op.path[0])] = op.value
    }
    current = { ...current, revision: revision + 1, value }
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
    text: (width = 120) => mounted?.render(width).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') ?? '',
    key: (data: string) => mounted?.handleInput?.(data),
  }
}

afterEach(() => { setUiLocale('zh') })

describe('shared background editor', () => {
  it.each(['zh', 'en'] as const)('exposes independent rendering controls from /theme and /settings (%s)', async locale => {
    setUiLocale(locale)
    const panels: string[] = []
    for (const entry of ['theme', 'settings']) {
      const h = harness()
      const pending = h.actions.execute(entry, entry === 'settings' ? TUI_APPEARANCE_SETTINGS_NAMESPACE : '')
      try {
        await vi.waitFor(() => { expect(h.text()).toContain(locale === 'zh' ? '显色方式' : 'Color rendering') })
        expect(h.text()).toContain(locale === 'zh' ? '背景呈现' : 'Background fill')
        expect(h.text()).toContain(locale === 'zh' ? '终端背景同步' : 'Terminal background sync')
        if (entry === 'settings') await vi.waitFor(() => { expect(h.text()).toContain(`${locale === 'zh' ? '设置' : 'Settings'} · seektty-appearance`) })
        h.key('\u001B[B')
        h.key('\u001B[B')
        h.key('\r')
        await vi.waitFor(() => { expect(h.text()).toContain(locale === 'zh' ? '原色 RGB 不主动量化' : 'Original RGB skips') })
        const panel = h.text()
        panels.push(panel)
        if (locale === 'en') expect(panel).not.toMatch(/\p{Script=Han}/u)
        expect(panel).toContain(locale === 'zh' ? '自动检测' : 'Automatic')
        expect(h.text(90)).toContain(locale === 'zh' ? '原色 RGB' : 'Original RGB')
        h.key('\u001B[B')
        h.key('\r')
        await vi.waitFor(() => { expect(h.host.applyAppearance).toHaveBeenCalledExactlyOnceWith({
          theme: 'dark', codeTheme: 'auto', customThemes: [], backgroundMode: 'theme',
          colorMode: 'rgb', backgroundFill: 'terminal', terminalBackgroundSync: 'theme',
        }) })
        expect(h.mutate).toHaveBeenCalledExactlyOnceWith(TUI_APPEARANCE_SETTINGS_NAMESPACE,
          [{ op: 'set', path: ['colorMode'], value: 'rgb' },
            { op: 'set', path: ['backgroundFill'], value: 'terminal' },
            { op: 'set', path: ['terminalBackgroundSync'], value: 'theme' }], 5)
        expect(h.host.applyTheme).not.toHaveBeenCalled()
      } finally { h.overlays.dispose(); await pending }
    }
    expect(panels[0]).toBe(panels[1])
  })

  it.each(['zh', 'en'] as const)('switches directly to RGB and recovers with revision protection (%s)', async locale => {
    setUiLocale(locale)
    const h = harness()
    for (const [mode, revision] of [['foreground', 5], ['explicit', 6]] as const) {
      await h.actions.execute('theme', `background ${mode}`)
      expect(h.mutate).toHaveBeenLastCalledWith(TUI_APPEARANCE_SETTINGS_NAMESPACE,
        [{ op: 'set', path: ['backgroundMode'], value: mode }], revision)
      expect(h.host.applyAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ backgroundMode: mode }))
    }
    await h.actions.execute('theme', 'background explicit')
    expect(h.mutate).toHaveBeenCalledTimes(2)
    expect(h.host.applyAppearance).toHaveBeenCalledTimes(2)
    expect(h.host.restart).not.toHaveBeenCalled()
    expect(h.text()).toBe('')
  })

  it.each(['invalid', 'foreground extra', 'FOREGROUND'])('rejects invalid direct arguments %s without saving', async value => {
    const h = harness()
    await h.actions.execute('theme', `background ${value}`)
    expect(h.host.notice).toHaveBeenCalledWith(expect.stringContaining('/theme background [theme|terminal|explicit|foreground]'), 'error')
    expect(h.mutate).not.toHaveBeenCalled()
    expect(h.host.applyAppearance).not.toHaveBeenCalled()
  })

  it('does not apply a direct change after a failed save', async () => {
    const h = harness()
    h.mutate.mockRejectedValueOnce(new Error('revision conflict'))
    await h.actions.execute('theme', 'background foreground')
    expect(h.host.notice).toHaveBeenCalledWith(expect.stringContaining('revision conflict'), 'error')
    expect(h.host.applyAppearance).not.toHaveBeenCalled()
    expect(h.current().revision).toBe(5)
  })

  it('opens the fill editor through the old no-argument command without changing RGB', async () => {
    const h = harness()
    await h.actions.execute('theme', 'background foreground')
    const pending = h.actions.execute('theme', 'background')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('主题铺底') })
      expect(h.text()).toContain('/theme background explicit')
      h.key('\u001B[B'); h.key('\r')
      await pending
      expect(h.host.applyAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' }))
    } finally { h.overlays.dispose(); await pending }
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
      await vi.waitFor(() => { expect(h.text()).toContain('原色 RGB 不主动量化') })
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

  it('changes each dimension separately and restores a legacy preset even when its stored name is unchanged', async () => {
    const h = harness()
    await h.actions.execute('theme', 'background foreground')
    await h.actions.execute('theme', 'fill theme')
    expect(resolveRendering(h.current().value as object)).toEqual({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
    await h.actions.execute('theme', 'sync theme')
    await h.actions.execute('theme', 'colors auto')
    expect(resolveRendering(h.current().value as object)).toEqual({ colorMode: 'auto', backgroundFill: 'theme', terminalBackgroundSync: 'theme' })
    await h.actions.execute('theme', 'background foreground')
    expect(resolveRendering(h.current().value as object)).toEqual({ colorMode: 'rgb', backgroundFill: 'terminal', terminalBackgroundSync: 'off' })
    const count = h.mutate.mock.calls.length
    for (const command of ['colors rgb', 'fill terminal', 'sync off', 'background foreground']) await h.actions.execute('theme', command)
    expect(h.mutate).toHaveBeenCalledTimes(count)
    expect(h.host.restart).not.toHaveBeenCalled()
  })

  it.each(['colors 256', 'colors RGB', 'fill foreground', 'fill theme extra', 'sync true'])('rejects %s without mutation', async command => {
    const h = harness()
    await h.actions.execute('theme', command)
    expect(h.mutate).not.toHaveBeenCalled()
    expect(h.host.notice).toHaveBeenCalledWith(expect.stringContaining(`/theme ${command.split(' ')[0]}`), 'error')
  })

  it.each(['fill theme', 'colors rgb', 'sync off'])('does not apply %s on revision conflict', async command => {
    const h = harness()
    h.mutate.mockRejectedValueOnce(new Error('revision conflict'))
    await h.actions.execute('theme', command)
    expect(h.host.applyAppearance).not.toHaveBeenCalled()
    expect(h.current().revision).toBe(5)
  })
})
