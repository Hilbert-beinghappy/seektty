import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { WelcomeSettingsSchema } from '../src/host/management.ts'
import {
  DEFAULT_TUI_WELCOME,
  TUI_WELCOME_SETTINGS_NAMESPACE,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiSettingsPathOp,
  type TuiWelcomeSettings,
} from '../src/protocol.ts'

const ENTER = '\r'
const DOWN = '\u001B[B'
const END = '\u001B[F'
const HOME = '\u001B[H'

function harness() {
  let value = structuredClone(DEFAULT_TUI_WELCOME) as TuiWelcomeSettings
  let document: TuiSettingsDocument = {
    namespace: TUI_WELCOME_SETTINGS_NAMESPACE,
    schema: WelcomeSettingsSchema.toJSON(),
    value,
    revision: 7,
    applies: 'live',
    secrets: [],
  }
  const describe = vi.fn(async () => [document])
  const mutate = vi.fn(async (_namespace: string, ops: readonly TuiSettingsPathOp[], revision: number) => {
    expect(revision).toBe(document.revision)
    const next = { ...value } as Record<string, unknown>
    for (const op of ops) if (op.op === 'set' && op.path.length === 1) next[op.path[0]!] = op.value
    value = next as unknown as TuiWelcomeSettings
    document = { ...document, value, revision: revision + 1 }
    return document
  })
  const management = { settings: { describe, mutate } } as unknown as TuiManagementBridge
  const capabilities = {
    managementBridge: () => management,
    active: () => undefined,
  } as unknown as HarnessTuiCapabilities
  let mounted: Component | undefined
  const hide = vi.fn()
  const overlays = new OverlayQueue({
    showOverlay: (component: Component) => {
      mounted = component
      return { hide } as unknown as OverlayHandle
    },
    requestRender: vi.fn(),
  } as unknown as TUI)
  const applyWelcome = vi.fn()
  const refreshWelcome = vi.fn(async () => undefined)
  const previewWelcome = vi.fn(async (settings: TuiWelcomeSettings) => `preview:${settings.infoMode}`)
  const host: TuiActionHost = {
    overlays,
    transcript: {} as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyAppearance: vi.fn(),
    applyLocale: vi.fn(),
    applyWelcome,
    refreshWelcome,
    previewWelcome,
    workspacePath: () => process.cwd(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
  return {
    actions: new TuiActions(capabilities, host),
    overlays,
    mutate,
    applyWelcome,
    refreshWelcome,
    previewWelcome,
    notice: host.notice,
    text: () => mounted?.render(120).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') ?? '',
    key: (data: string) => { mounted?.handleInput?.(data) },
  }
}

afterEach(() => { setUiLocale('zh') })

describe('/welcome configuration', () => {
  it('keeps edits in a draft and applies the full value only after Save', async () => {
    const h = harness()
    const pending = h.actions.execute('welcome', '')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('实时预览') })
      expect(h.text()).toContain('preview:custom')
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('欢迎页信息模式') })
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('preview:fastfetch') })
      expect(h.mutate).not.toHaveBeenCalled()
      expect(h.applyWelcome).not.toHaveBeenCalled()
      h.key(END)
      h.key('\u001B[A')
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.applyWelcome).toHaveBeenCalledOnce() })
      expect(h.applyWelcome.mock.calls[0]?.[0]).toMatchObject({ infoMode: 'fastfetch' })
      expect(h.mutate).toHaveBeenCalledOnce()
      expect(h.notice).toHaveBeenCalledWith(expect.stringContaining('立即生效'), 'success')
    } finally {
      h.overlays.dispose()
      await pending
    }
  })

  it('cancels the whole draft without mutating Settings', async () => {
    const h = harness()
    const pending = h.actions.execute('welcome', '')
    await vi.waitFor(() => { expect(h.text()).toContain('取消全部修改') })
    h.key(END)
    h.key(ENTER)
    await pending
    expect(h.mutate).not.toHaveBeenCalled()
    expect(h.applyWelcome).not.toHaveBeenCalled()
  })

  it('refreshes Fastfetch without changing the persisted draft', async () => {
    const h = harness()
    await h.actions.execute('welcome', 'refresh')
    expect(h.refreshWelcome).toHaveBeenCalledOnce()
    expect(h.mutate).not.toHaveBeenCalled()
    expect(h.notice).toHaveBeenCalledWith(expect.stringContaining('重新采集'), 'success')
  })

  it('warns before trusting a Fastfetch user config', async () => {
    const h = harness()
    const pending = h.actions.execute('welcome', '')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('实时预览') })
      h.key(DOWN)
      h.key(DOWN)
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('Fastfetch') })
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('Fastfetch 数据来源') })
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => {
        expect(h.text()).toContain('信任 Fastfetch 用户配置')
        expect(h.text()).toContain('任意外部命令')
      })
      expect(h.mutate).not.toHaveBeenCalled()
      expect(h.applyWelcome).not.toHaveBeenCalled()
    } finally {
      h.overlays.dispose()
      await pending
    }
  })

  it('stays in custom-row management after each edit so rows can be changed continuously', async () => {
    const h = harness()
    const pending = h.actions.execute('welcome', '')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('自定义信息行') })
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('可连续编辑') })
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('新增自定义行') })
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('标题文字') })
      h.key('Alpha')
      h.key(ENTER)
      await vi.waitFor(() => {
        expect(h.text()).toContain('9. 标题 · Alpha')
        expect(h.text()).toContain('可连续编辑')
        expect(h.text()).not.toContain('实时预览')
      })
      h.key(HOME)
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('新增自定义行') })
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('标题文字') })
      h.key('Beta')
      h.key(ENTER)
      await vi.waitFor(() => {
        expect(h.text()).toContain('10. 标题 · Beta')
        expect(h.text()).toContain('可连续编辑')
      })
      expect(h.mutate).not.toHaveBeenCalled()
    } finally {
      h.overlays.dispose()
      await pending
    }
  })

  it('keeps leaf changes inside their subgroup and lets Esc return exactly one level', async () => {
    const h = harness()
    const pending = h.actions.execute('welcome', '')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('实时预览') })
      h.key(DOWN)
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('修改字段后留在本页') })
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('复用本机 Fastfetch Logo') })
      h.key(DOWN)
      h.key(DOWN)
      h.key(ENTER)
      await vi.waitFor(() => {
        expect(h.text()).toContain('Fastfetch · 保留原色')
        expect(h.text()).toContain('修改字段后留在本页')
      })
      h.key('\u001B')
      await vi.waitFor(() => {
        expect(h.text()).toContain('实时预览')
        expect(h.text()).toContain('Logo')
      })
      expect(h.mutate).not.toHaveBeenCalled()
    } finally {
      h.overlays.dispose()
      await pending
    }
  })

  it('keeps the live welcome unchanged when saving fails', async () => {
    const h = harness()
    h.mutate.mockRejectedValueOnce(new Error('save failed'))
    const pending = h.actions.execute('welcome', '')
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('保存并立即应用') })
      h.key(END)
      h.key('\u001B[A')
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.notice).toHaveBeenCalledWith(expect.stringContaining('save failed'), 'error') })
      expect(h.applyWelcome).not.toHaveBeenCalled()
    } finally {
      h.overlays.dispose()
      await pending
    }
  })

  it('opens the same dedicated center from /settings', async () => {
    const h = harness()
    const pending = h.actions.execute('settings', TUI_WELCOME_SETTINGS_NAMESPACE)
    try {
      await vi.waitFor(() => { expect(h.text()).toContain('设置 · seektty-welcome') })
      expect(h.text()).toContain('配置欢迎页')
      h.key(ENTER)
      await vi.waitFor(() => { expect(h.text()).toContain('实时预览') })
      expect(h.previewWelcome).toHaveBeenCalled()
    } finally {
      h.overlays.dispose()
      await pending
    }
  })
})
