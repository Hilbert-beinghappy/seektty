/** Discover themes deliberately declared by installed VS Code-family extensions. */

import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { execFile as executeFile } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import type { TuiCustomTheme } from '@deepseek-ai/dsh-tui-protocol'
import { convertVsCodeTheme, loadVsCodeThemeFile } from './theme-import.ts'
import { themeFingerprint } from './theme-fingerprint.ts'

export type VsCodeEditor = 'vscode' | 'vscode-insiders' | 'cursor'

export interface DiscoveredVsCodeTheme {
  readonly id: string
  readonly editor: VsCodeEditor
  readonly editorLabel: string
  readonly extensionId: string
  readonly extensionVersion?: string
  readonly relativeThemePath: string
  readonly label: string
  readonly theme: TuiCustomTheme
  readonly fingerprint: string
}

export interface ThemeDiscoveryDiagnostic { readonly path: string; readonly message: string }
export interface ThemeDiscoveryResult {
  readonly themes: readonly DiscoveredVsCodeTheme[]
  readonly diagnostics: readonly ThemeDiscoveryDiagnostic[]
}

export interface VsCodeThemeDiscoveryRoot {
  readonly editor: VsCodeEditor
  readonly label: string
  readonly path: string
}

const MAX_MANIFEST_BYTES = 512 * 1024
const execFile = promisify(executeFile)

async function windowsApplicationRoot(executable: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`
  try {
    const { stdout } = await execFile('reg.exe', ['query', key, '/ve'], { windowsHide: true })
    const match = stdout.match(/REG_SZ\s+(.+)$/mu)
    if (match?.[1] === undefined) return undefined
    return dirname(match[1].trim())
  } catch { return undefined }
}

/**
 * Cursor's custom Inno Setup installs do not consistently register App Paths.
 * Its per-user uninstall record still has the installation root.
 */
async function windowsUninstallRoot(displayName: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  try {
    const { stdout } = await execFile('reg.exe', ['query', key, '/s', '/f', displayName, '/d'], { windowsHide: true })
    const match = stdout.match(/^\s*InstallLocation\s+REG_SZ\s+(.+)$/mu)
    return match?.[1]?.trim() || undefined
  } catch { return undefined }
}

async function applicationExtensions(root: string): Promise<readonly string[]> {
  // The registry points to Code.exe; PATH can point to bin/code.cmd.
  const application = basename(root).toLowerCase() === 'bin' ? dirname(root) : root
  const direct = resolve(application, 'resources', 'app', 'extensions')
  try {
    const children = await readdir(application, { withFileTypes: true })
    return [direct, ...children.filter(child => child.isDirectory()).map(child =>
      resolve(application, child.name, 'resources', 'app', 'extensions'))]
  } catch { return [direct] }
}

async function defaultRoots(): Promise<readonly VsCodeThemeDiscoveryRoot[]> {
  // Unit tests inject fixture roots; never let a developer's installed themes
  // change menu-selection tests or their timing.
  if (process.env.VITEST !== undefined) return []
  const home = homedir()
  const local = process.env.LOCALAPPDATA
  const roots: VsCodeThemeDiscoveryRoot[] = [
    { editor: 'vscode', label: 'VS Code', path: resolve(home, '.vscode', 'extensions') },
    { editor: 'vscode-insiders', label: 'VS Code Insiders', path: resolve(home, '.vscode-insiders', 'extensions') },
    { editor: 'cursor', label: 'Cursor', path: resolve(home, '.cursor', 'extensions') },
  ]
  if (process.env.VSCODE_EXTENSIONS !== undefined) roots.push({ editor: 'vscode', label: 'VS Code', path: process.env.VSCODE_EXTENSIONS })
  if (local !== undefined) {
    const installed: readonly { readonly editor: VsCodeEditor; readonly label: string; readonly root: string }[] = [
      { editor: 'vscode', label: 'VS Code（内置）', root: resolve(local, 'Programs', 'Microsoft VS Code') },
      { editor: 'vscode-insiders', label: 'VS Code Insiders（内置）', root: resolve(local, 'Programs', 'Microsoft VS Code Insiders') },
      { editor: 'cursor', label: 'Cursor（内置）', root: resolve(local, 'Programs', 'cursor') },
    ]
    for (const { root, ...product } of installed) for (const path of await applicationExtensions(root)) roots.push({ ...product, path })
  }
  const registered = await Promise.all([
    windowsApplicationRoot('Code.exe'),
    windowsApplicationRoot('Code - Insiders.exe'),
    windowsApplicationRoot('Cursor.exe'),
  ])
  // Cursor supports portable/custom locations such as D:\cursor\cursor.
  if (registered[2] === undefined) registered[2] = await windowsUninstallRoot('Cursor')
  const products: readonly { readonly editor: VsCodeEditor; readonly label: string }[] = [
    { editor: 'vscode', label: 'VS Code（内置）' },
    { editor: 'vscode-insiders', label: 'VS Code Insiders（内置）' },
    { editor: 'cursor', label: 'Cursor（内置）' },
  ]
  for (const [index, root] of registered.entries()) {
    if (root !== undefined) for (const path of await applicationExtensions(root)) roots.push({ ...products[index]!, path })
  }
  return roots
}

function parseManifest(text: string, path: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors[0] !== undefined) throw new Error(`${path}: ${printParseErrorCode(errors[0].error)}`)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path}: manifest must be an object`)
  return value as Record<string, unknown>
}

async function extensionLocalization(extension: string): Promise<Readonly<Record<string, unknown>>> {
  const path = resolve(extension, 'package.nls.json')
  try {
    if ((await stat(path)).size > MAX_MANIFEST_BYTES) return {}
    return parseManifest(await readFile(path, 'utf8'), path)
  } catch { return {} }
}

function localizedLabel(value: unknown, localization: Readonly<Record<string, unknown>>, fallback: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  const key = value.match(/^%(.+)%$/u)?.[1]
  const translated = key === undefined ? undefined : localization[key]
  return typeof translated === 'string' && translated.trim() !== '' ? translated.trim() : value.trim()
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!path.startsWith('..') && !path.startsWith(`..${sep}`))
}

async function extensionDirectories(path: string): Promise<readonly string[]> {
  try {
    return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => resolve(path, entry.name))
  } catch { return [] }
}

/**
 * Read only manifests' contributes.themes lists. Individual bad extensions are
 * reported as diagnostics and never prevent other editors from being listed.
 */
export async function discoverVsCodeThemes(
  roots?: readonly VsCodeThemeDiscoveryRoot[],
): Promise<ThemeDiscoveryResult> {
  const candidates: DiscoveredVsCodeTheme[] = []
  const diagnostics: ThemeDiscoveryDiagnostic[] = []
  for (const product of roots ?? await defaultRoots()) {
    for (const extension of await extensionDirectories(product.path)) {
      const manifestPath = resolve(extension, 'package.json')
      let manifest: Record<string, unknown>
      try {
        if ((await stat(manifestPath)).size > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds 512 KiB')
        manifest = parseManifest(await readFile(manifestPath, 'utf8'), manifestPath)
      } catch (error) {
        diagnostics.push({ path: manifestPath, message: error instanceof Error ? error.message : String(error) })
        continue
      }
      const contributes = manifest.contributes
      const declared = contributes !== null && typeof contributes === 'object' && !Array.isArray(contributes)
        ? (contributes as Record<string, unknown>).themes : undefined
      if (!Array.isArray(declared)) continue
      let extensionRoot: string
      try { extensionRoot = await realpath(extension) } catch { continue }
      const localization = await extensionLocalization(extensionRoot)
      const publisher = typeof manifest.publisher === 'string' ? manifest.publisher : ''
      const name = typeof manifest.name === 'string' ? manifest.name : basename(extension)
      const extensionId = publisher === '' ? name : `${publisher}.${name}`
      const version = typeof manifest.version === 'string' ? manifest.version : undefined
      for (const entry of declared) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
        const record = entry as Record<string, unknown>
        if (typeof record.path !== 'string' || record.path.trim() === '') continue
        const themePath = resolve(extensionRoot, record.path)
        try {
          const canonical = await realpath(themePath)
          if (!inside(extensionRoot, canonical) || !(await stat(canonical)).isFile() || !/\.jsonc?$/iu.test(canonical)) continue
          const loaded = await loadVsCodeThemeFile(canonical)
          const label = localizedLabel(record.label, localization, loaded.suggestedName)
          const theme = convertVsCodeTheme(loaded, 'discovered', label)
          candidates.push({
            id: `${product.editor}:${extensionId}:${relative(extensionRoot, canonical)}`,
            editor: product.editor, editorLabel: product.label, extensionId,
            ...(version === undefined ? {} : { extensionVersion: version }),
            relativeThemePath: relative(extensionRoot, canonical), label, theme, fingerprint: themeFingerprint(theme),
          })
        } catch (error) {
          diagnostics.push({ path: themePath, message: error instanceof Error ? error.message : String(error) })
        }
      }
    }
  }
  candidates.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
  const unique = new Map<string, DiscoveredVsCodeTheme>()
  for (const candidate of candidates) if (!unique.has(candidate.fingerprint)) unique.set(candidate.fingerprint, candidate)
  return { themes: [...unique.values()], diagnostics }
}
