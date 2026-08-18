import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { OverlayNavigation, OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { BUILT_IN_THEMES, editableTheme } from '../src/client/theme-config.ts'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiAppearanceSettings,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiSettingsPathOp,
} from '../src/protocol.ts'

function document(value: TuiAppearanceSettings, revision = 0): TuiSettingsDocument {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: {},
    value,
    revision,
    applies: 'live',
    secrets: [],
  }
}

function settingsState(initial: TuiAppearanceSettings): {
  readonly settings: TuiManagementBridge['settings']
  readonly mutate: ReturnType<typeof vi.fn>
  current(): TuiSettingsDocument
} {
  let current = document(initial)
  const mutate = vi.fn(async (
    _namespace: string,
    ops: readonly TuiSettingsPathOp[],
    expectedRevision: number,
  ): Promise<TuiSettingsDocument> => {
    expect(expectedRevision).toBe(current.revision)
    const value = { ...(current.value as TuiAppearanceSettings) } as Record<string, unknown>
    for (const op of ops) {
      expect(op.path).toHaveLength(1)
      const key = op.path[0]
      if (key === undefined) continue
      if (op.op === 'set') value[key] = op.value
      else delete value[key]
    }
    current = document(value as unknown as TuiAppearanceSettings, current.revision + 1)
    return current
  })
  const settings = {
    describe: vi.fn(async () => [current]),
    mutate,
  } as unknown as TuiManagementBridge['settings']
  return { settings, mutate, current: () => current }
}

function actionHarness(
  settings: TuiManagementBridge['settings'],
  overlays: Partial<OverlayQueue> & Partial<OverlayNavigation> = {},
): {
  readonly actions: TuiActions
  readonly host: TuiActionHost
} {
  const management = { settings } as unknown as TuiManagementBridge
  const capabilities = {
    managementBridge: () => management,
    active: () => undefined,
  } as unknown as HarnessTuiCapabilities
  const host: TuiActionHost = {
    overlays: overlays as OverlayQueue,
    transcript: {} as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
  return { actions: new TuiActions(capabilities, host), host }
}

describe('/theme commands', () => {
  it('switches a built-in theme through Harness Settings and applies the resolved theme live', async () => {
    const state = settingsState({ theme: 'dark', codeTheme: 'auto', customThemes: [] })
    const { actions, host } = actionHarness(state.settings)

    await actions.execute('theme', 'light')

    expect(state.current().value).toMatchObject({ theme: 'light' })
    expect(state.mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        { op: 'set', path: ['theme'], value: 'light' },
        { op: 'set', path: ['codeTheme'], value: 'auto' },
      ],
      0,
    )
    expect(host.applyTheme).toHaveBeenCalledWith(expect.objectContaining({ id: 'light' }))
    expect(host.applyTheme).toHaveBeenCalledWith(expect.objectContaining({
      syntax: BUILT_IN_THEMES.light.syntax,
    }))
  })

  it('restores matching light code when the light interface is selected again', async () => {
    const state = settingsState({ theme: 'light', codeTheme: 'dark', customThemes: [] })
    const { actions, host } = actionHarness(state.settings)

    await actions.execute('theme', 'light')

    expect(state.current().value).toEqual({ theme: 'light', codeTheme: 'auto', customThemes: [] })
    expect(host.applyTheme).toHaveBeenCalledWith(expect.objectContaining({
      id: 'light',
      syntax: BUILT_IN_THEMES.light.syntax,
    }))
  })

  it('switches to dark code independently while keeping the light interface', async () => {
    const state = settingsState({ theme: 'light', codeTheme: 'auto', customThemes: [] })
    const { actions, host } = actionHarness(state.settings)

    await actions.execute('theme', 'code dark')

    expect(state.current().value).toMatchObject({ theme: 'light', codeTheme: 'dark' })
    expect(state.mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['codeTheme'], value: 'dark' }],
      0,
    )
    expect(host.applyTheme).toHaveBeenCalledWith(expect.objectContaining({
      id: 'light',
      syntax: BUILT_IN_THEMES.dark.syntax,
    }))
  })

  it('generates, previews, and atomically saves a named palette theme', async () => {
    const state = settingsState({ theme: 'dark', codeTheme: 'auto', customThemes: [] })
    const input = vi.fn()
      .mockResolvedValueOnce('Ocean')
      .mockResolvedValueOnce('#071426 #F4F8FF #6682FF #37C99B #E7AE5B #F0717F')
    const select = vi.fn().mockResolvedValue({ id: 'apply', label: '应用并保存' })
    const { actions, host } = actionHarness(state.settings, { input, select } as Partial<OverlayQueue> & Partial<OverlayNavigation>)

    await actions.execute('theme', 'palette')

    const appearance = state.current().value as TuiAppearanceSettings
    expect(appearance.theme).toBe('custom:ocean')
    expect(appearance.codeTheme).toBe('custom:ocean')
    expect(appearance.customThemes).toHaveLength(1)
    expect(appearance.customThemes[0]).toMatchObject({ id: 'ocean', name: 'Ocean', source: 'palette' })
    expect(state.mutate).toHaveBeenCalledWith(
      TUI_APPEARANCE_SETTINGS_NAMESPACE,
      [
        expect.objectContaining({ op: 'set', path: ['customThemes'] }),
        { op: 'set', path: ['theme'], value: 'custom:ocean' },
        { op: 'set', path: ['codeTheme'], value: 'custom:ocean' },
      ],
      0,
    )
    expect(host.applyTheme).toHaveBeenCalledTimes(2)
  })

  it('restores the original theme when a palette preview is cancelled', async () => {
    const state = settingsState({ theme: 'dark', codeTheme: 'auto', customThemes: [] })
    const input = vi.fn()
      .mockResolvedValueOnce('Ocean')
      .mockResolvedValueOnce('#071426 #F4F8FF #6682FF')
    const select = vi.fn().mockResolvedValue({ id: 'cancel', label: '取消' })
    const { actions, host } = actionHarness(state.settings, { input, select } as Partial<OverlayQueue> & Partial<OverlayNavigation>)

    await actions.execute('theme', 'palette')

    expect(state.mutate).not.toHaveBeenCalled()
    expect(host.applyTheme).toHaveBeenCalledTimes(2)
    expect(host.applyTheme).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'dark' }))
  })

  it('imports a local VS Code JSONC theme and saves it through Harness Settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seektty-theme-action-'))
    try {
      const themeDirectory = join(root, 'themes with spaces')
      await mkdir(themeDirectory)
      const path = join(themeDirectory, 'ocean.jsonc')
      await writeFile(path, `{
        "name": "Ocean Imported",
        "type": "dark",
        "colors": { "editor.background": "#0B1020", "editor.foreground": "#E8ECF5" },
        "tokenColors": [
          { "scope": "keyword", "settings": { "foreground": "#91A7FF", "fontStyle": "bold" } }
        ]
      }`, 'utf8')
      const state = settingsState({ theme: 'light', codeTheme: 'auto', customThemes: [] })
      const select = vi.fn().mockResolvedValue({ id: 'apply', label: '应用并保存' })
      const { actions, host } = actionHarness(state.settings, { select } as Partial<OverlayQueue> & Partial<OverlayNavigation>)

      await actions.execute('theme', `import "${path}"`)

      const appearance = state.current().value as TuiAppearanceSettings
      expect(appearance.theme).toBe('light')
      expect(appearance.codeTheme).toBe('custom:ocean-imported')
      expect(appearance.customThemes[0]).toMatchObject({
        name: 'Ocean Imported',
        source: 'vscode',
        tokenColors: [{ scope: ['keyword'], foreground: '#91A7FF', fontStyle: ['bold'] }],
      })
      expect(host.applyTheme).toHaveBeenCalledTimes(2)
      expect(host.applyTheme).toHaveBeenLastCalledWith(expect.objectContaining({
        id: 'light',
        syntaxTone: 'dark',
      }))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires confirmation before editing and overwriting a named theme', async () => {
    const custom = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const state = settingsState({ theme: 'custom:ocean', codeTheme: 'custom:ocean', customThemes: [custom] })
    const confirm = vi.fn().mockResolvedValue(false)
    const select = vi.fn()
    const { actions } = actionHarness(state.settings, { confirm, select } as Partial<OverlayQueue> & Partial<OverlayNavigation>)

    await actions.execute('theme', 'edit Ocean')

    expect(confirm).toHaveBeenCalledWith(
      '编辑并覆盖主题 Ocean？',
      expect.stringContaining('替换这个命名主题'),
      '继续编辑',
    )
    expect(select).not.toHaveBeenCalled()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('confirms deletion and atomically returns an active custom theme to DeepSeek dark', async () => {
    const custom = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
    const state = settingsState({ theme: 'custom:ocean', codeTheme: 'custom:ocean', customThemes: [custom] })
    const confirm = vi.fn().mockResolvedValue(true)
    const { actions, host } = actionHarness(state.settings, { confirm } as Partial<OverlayQueue> & Partial<OverlayNavigation>)

    await actions.execute('theme', 'delete Ocean')

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(state.current().value).toEqual({ theme: 'dark', codeTheme: 'auto', customThemes: [] })
    expect(host.applyTheme).toHaveBeenCalledWith(expect.objectContaining({ id: 'dark' }))
  })
})
