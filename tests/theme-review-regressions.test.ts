import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Component } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { loadVsCodeThemeUrl } from '../src/client/theme-import.ts'
import { discoverVsCodeThemes, platformApplicationRoots } from '../src/client/vscode-theme-discovery.ts'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  type TuiAppearanceSettings,
  type TuiManagementBridge,
  type TuiSettingsDocument,
  type TuiSettingsPathOp,
} from '../src/protocol.ts'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34' }]),
}))

const temporaryDirectories: string[] = []

function document(value: TuiAppearanceSettings, revision = 0): TuiSettingsDocument {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: {}, value, revision, applies: 'live', secrets: [],
  }
}

function settingsState(initial: TuiAppearanceSettings): {
  readonly settings: TuiManagementBridge['settings']
  readonly current: () => TuiSettingsDocument
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
      const key = op.path[0]
      if (key === undefined) continue
      if (op.op === 'set') value[key] = op.value
      else delete value[key]
    }
    current = document(value as unknown as TuiAppearanceSettings, current.revision + 1)
    return current
  })
  return {
    settings: {
      describe: vi.fn(async () => [current]), mutate,
    } as unknown as TuiManagementBridge['settings'],
    current: () => current,
  }
}

function actionHarness(settings: TuiManagementBridge['settings'], overlays: Partial<OverlayQueue>): {
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
    transcript: {} as TuiActionHost['transcript'],
    notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn(),
    applyTheme: vi.fn(), applyAppearance: vi.fn(), applyLocale: vi.fn(),
    setEditor: vi.fn(), copy: vi.fn(), close: vi.fn(), restart: vi.fn(), requireRestart: vi.fn(),
  }
  return { actions: new TuiActions(capabilities, host), host }
}

afterEach(async () => {
  vi.restoreAllMocks()
  setUiLocale('zh')
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Issue 183 review regressions', () => {
  it('keeps the original import URL for updates while following redirected versions', async () => {
    const originalFetch = globalThis.fetch
    let phase = 1
    const calls: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://example.com/latest/theme.json') {
        return new Response(null, { status: 302, headers: { location: phase === 1 ? '/v1/theme.json' : '/v2/theme.json' } })
      }
      if (url === 'https://example.com/v1/theme.json') {
        return new Response(JSON.stringify({ name: 'Demo', include: 'base.json', colors: { 'editor.background': '#111111' } }), { status: 200 })
      }
      if (url === 'https://example.com/v1/base.json') {
        return new Response(JSON.stringify({ colors: { 'editor.foreground': '#EEEEEE' } }), { status: 200 })
      }
      if (url === 'https://example.com/v2/theme.json') {
        return new Response(JSON.stringify({ name: 'Demo', include: 'base.json', colors: { 'editor.background': '#222222' } }), { status: 200 })
      }
      if (url === 'https://example.com/v2/base.json') {
        return new Response(JSON.stringify({ colors: { 'editor.foreground': '#DDDDDD' } }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      const state = settingsState({ theme: 'dark', codeTheme: 'auto', backgroundMode: 'theme', customThemes: [] })
      const overlays = {
        select: vi.fn().mockResolvedValue({ id: 'apply', label: '应用并保存' }),
        confirm: vi.fn().mockResolvedValue(true),
      }
      const { actions } = actionHarness(state.settings, overlays)

      await actions.execute('theme', 'import-url Demo https://example.com/latest/theme.json')
      const imported = state.current().value as TuiAppearanceSettings
      expect(imported.customThemes[0]).toMatchObject({
        name: 'Demo', remoteSource: { url: 'https://example.com/latest/theme.json' },
        colors: { canvas: '#111111' },
      })

      phase = 2
      await actions.execute('theme', 'update Demo')
      const updated = state.current().value as TuiAppearanceSettings
      expect(updated.customThemes[0]).toMatchObject({
        name: 'Demo', remoteSource: { url: 'https://example.com/latest/theme.json' },
        colors: { canvas: '#222222' },
      })
      expect(calls).toEqual([
        'https://example.com/latest/theme.json', 'https://example.com/v1/theme.json', 'https://example.com/v1/base.json',
        'https://example.com/latest/theme.json', 'https://example.com/v2/theme.json', 'https://example.com/v2/base.json',
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('resolves redirected relative includes from the final response URL', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://example.com/theme.json') return new Response(null, { status: 302, headers: { location: '/v2/theme.json' } })
      if (url === 'https://example.com/v2/theme.json') return new Response(JSON.stringify({ include: 'base.json' }), { status: 200 })
      if (url === 'https://example.com/v2/base.json') return new Response(JSON.stringify({ colors: { 'editor.background': '#112233' } }), { status: 200 })
      return new Response(null, { status: 404 })
    }) as typeof fetch
    try {
      const loaded = await loadVsCodeThemeUrl('https://example.com/theme.json')
      expect(loaded.path).toBe('https://example.com/v2/theme.json')
      expect(loaded.sourceUrl).toBe('https://example.com/theme.json')
      expect(loaded.value.colors['editor.background']).toBe('#112233')
    } finally { globalThis.fetch = originalFetch }
  })

  it('keeps different IDs for different extension versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seektty-theme-discovery-'))
    temporaryDirectories.push(root)
    for (const [version, background] of [['1.0.0', '#101010'], ['2.0.0', '#202020']] as const) {
      const extension = join(root, `acme-colors-${version}`)
      await mkdir(join(extension, 'themes'), { recursive: true })
      await writeFile(join(extension, 'package.json'), JSON.stringify({ publisher: 'acme', name: 'colors', version, contributes: { themes: [{ label: 'Shared', path: './themes/theme.json' }] } }), 'utf8')
      await writeFile(join(extension, 'themes', 'theme.json'), JSON.stringify({ name: 'Shared', type: 'dark', colors: { 'editor.background': background } }), 'utf8')
    }
    const result = await discoverVsCodeThemes([{ editor: 'vscode', label: 'VS Code', path: root }])
    expect(result.themes).toHaveLength(2)
    expect(new Set(result.themes.map(theme => theme.id)).size).toBe(2)
  })

  it('declares built-in application roots for macOS and Linux', () => {
    const normalized = (value: string): string => value.replaceAll('\\', '/')
    const mac = platformApplicationRoots('darwin', '/Users/test').map(root => normalized(root.path))
    expect(mac).toEqual(expect.arrayContaining([
      expect.stringMatching(/Visual Studio Code\.app\/Contents\/Resources\/app\/extensions$/u),
      expect.stringMatching(/Visual Studio Code - Insiders\.app\/Contents\/Resources\/app\/extensions$/u),
      expect.stringMatching(/Cursor\.app\/Contents\/Resources\/app\/extensions$/u),
    ]))
    const linux = platformApplicationRoots('linux', '/home/test').map(root => normalized(root.path))
    expect(linux).toEqual(expect.arrayContaining([
      '/usr/share/code/resources/app/extensions',
      '/usr/share/code-insiders/resources/app/extensions',
      '/opt/cursor/resources/app/extensions',
    ]))
  })
})
