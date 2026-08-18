import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveHarnessUserPath } from '../src/client/workspace-path.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import { BUILT_IN_THEMES, editableTheme } from '../src/client/theme-config.ts'
import {
  serializeThemeExport,
  themeForExport,
  writeThemeExport,
} from '../src/client/theme-export.ts'
import type { Transcript } from '../src/client/transcript.ts'
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

describe('theme export path resolution', () => {
  it('expands ~ and file URLs, then resolves relative paths against the workspace', () => {
    const workspace = '/tmp/seektty-workspace'
    expect(resolveHarnessUserPath('./ocean.json', workspace)).toBe(resolve(workspace, 'ocean.json'))
    expect(resolveHarnessUserPath('~/Themes/ocean.json', workspace)).toBe(resolve(homedir(), 'Themes/ocean.json'))
    expect(resolveHarnessUserPath('~', workspace)).toBe(homedir())
    expect(resolveHarnessUserPath(pathToFileURL('/tmp/ocean.json').href, workspace)).toBe('/tmp/ocean.json')
  })
})

describe('theme export payload', () => {
  it('serializes a portable custom-theme snapshot from a built-in theme', () => {
    const payload = themeForExport(BUILT_IN_THEMES.dark)
    expect(payload).toMatchObject({
      id: 'dark',
      name: 'DeepSeek 暗色',
      tone: 'dark',
      colors: { canvas: '#090E1B', brand: '#6682FF' },
    })
    const text = serializeThemeExport(payload)
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(payload)
  })
})

describe('theme export files', () => {
  let root = ''

  afterEach(async () => {
    if (root !== '') await rm(root, { recursive: true, force: true })
  })

  it('creates the destination exclusively and refuses to overwrite', async () => {
    root = await mkdtemp(join(tmpdir(), 'seektty-theme-export-'))
    const path = join(root, 'nested', 'ocean.json')
    const text = serializeThemeExport(editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean'))
    const bytes = await writeThemeExport(path, text)
    expect(bytes).toBe(Buffer.byteLength(text, 'utf8'))
    expect(await readFile(path, 'utf8')).toBe(text)
    await expect(writeThemeExport(path, text)).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('/theme export', () => {
  it('writes the named custom theme to a new JSON file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seektty-theme-export-action-'))
    try {
      const custom = editableTheme(BUILT_IN_THEMES.dark, 'ocean', 'Ocean')
      let current = document({
        theme: 'custom:ocean',
        codeTheme: 'auto',
        customThemes: [custom],
      })
      const mutate = vi.fn(async (
        _namespace: string,
        _ops: readonly TuiSettingsPathOp[],
        _revision: number,
      ) => current)
      const settings = {
        describe: vi.fn(async () => [current]),
        mutate,
      } as unknown as TuiManagementBridge['settings']
      const host: TuiActionHost = {
        overlays: {} as OverlayQueue,
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
      const capabilities = {
        managementBridge: () => ({ settings }) as TuiManagementBridge,
        active: () => ({ workspacePath: root }),
      } as unknown as HarnessTuiCapabilities
      const actions = new TuiActions(capabilities, host)
      const path = join(root, 'ocean.json')

      await actions.execute('theme', `export Ocean "${path}"`)

      expect(mutate).not.toHaveBeenCalled()
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
        id: 'ocean',
        name: 'Ocean',
        colors: custom.colors,
      })
      expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('ocean.json'), 'success')

      await actions.execute('theme', 'export Ocean ./nested/workspace-ocean.json')
      expect(JSON.parse(await readFile(join(root, 'nested', 'workspace-ocean.json'), 'utf8'))).toMatchObject({
        id: 'ocean',
        name: 'Ocean',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
