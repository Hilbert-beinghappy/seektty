import { afterEach, describe, expect, it, vi } from 'vitest'
import { isExperimentalPackage, pluginDisplayIdentity } from '../src/client/experimental-package.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { TuiPluginEntry } from '../src/protocol.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'

afterEach(() => setUiLocale('zh'))
describe('published rc.2 experimental package presentation', () => {
  it.each([
    ['@deepseek-ai/dsh-experimental-auto-review', true],
    ['@deepseek-ai/dsh-experimental-agent-team', true],
    ['@deepseek-ai/dsh-client-ui-plugin-manager', false],
    ['dsh-experimental-auto-review', false], ['@other/dsh-experimental-auto-review', false],
    ['@deepseek-ai/dsh-tools-experimental', false],
  ])('uses the exact official package rule: %s', (name, experimental) => {
    expect(isExperimentalPackage(name)).toBe(experimental)
  })
  it.each(['zh', 'en'] as const)('labels installed list and detail without changing package ids or invoking mutations (%s)', async locale => {
    setUiLocale(locale)
    const plugin: TuiPluginEntry = { name: '@deepseek-ai/dsh-experimental-auto-review', version: '0.2.0-rc.2',
      spec: '0.2.0-rc.2', source: 'npm', bundle: false, active: false, patchValid: false, scripts: [], diagnostics: [] }
    let mounted: Component | undefined
    const overlays = new OverlayQueue({ showOverlay: (component: Component) => {
      mounted = component; return { hide: vi.fn() } as unknown as OverlayHandle
    }, requestRender: vi.fn() } as unknown as TUI)
    const snapshot = vi.fn(async () => ({ profile: 'fixture', plugins: [plugin] }))
    const capabilities = { managementBridge: () => ({ plugins: { snapshot } }) } as unknown as HarnessTuiCapabilities
    const notice = vi.fn()
    const actions = new TuiActions(capabilities, { overlays, notice } as unknown as TuiActionHost)
    const pending = actions.execute('plugins', 'list')
    const identity = pluginDisplayIdentity(plugin, locale)
    const text = () => mounted?.render(180).join('\n').replace(/\u001b\[[0-9;:]*m/gu, '') ?? ''
    try {
      await vi.waitFor(() => expect(text()).toContain(locale === 'zh' ? '实验性' : 'Experimental'))
      mounted?.handleInput?.('\r')
      await vi.waitFor(() => expect(text()).toContain(identity))
      expect(text()).toContain(locale === 'zh' ? '来源：npm' : 'Source: npm')
      expect(plugin.active).toBe(false)
      expect(plugin.name).toBe('@deepseek-ai/dsh-experimental-auto-review')
      expect(notice).not.toHaveBeenCalled()
    } finally { overlays.dispose(); await pending }
  })
})
