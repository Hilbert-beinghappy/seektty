import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertVsCodeTheme, loadVsCodeThemeFile } from '../src/client/theme-import.ts'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'seektty-vscode-theme-'))
  temporaryDirectories.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('VS Code theme import', () => {
  it('merges JSONC includes and preserves TextMate colors and portable code styles', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'base.jsonc'), `{
      // inherited editor and comment colors
      "type": "dark",
      "colors": {
        "editor.background": "#101820",
        "editor.foreground": "#E6EDF3",
        "textLink.foreground": "#6682FF"
      },
      "tokenColors": [
        { "scope": "comment", "settings": { "foreground": "#6A9955", "fontStyle": "italic" } }
      ],
    }`, 'utf8')
    await writeFile(join(root, 'ocean.jsonc'), `{
      "name": "Ocean Code",
      "include": "./base.jsonc",
      "colors": {
        "editor.background": "#0B1020",
        "editor.selectionBackground": "#FFFFFF22",
        "editor.fontFamily": "Ignored Font"
      },
      "tokenColors": [
        { "scope": ["keyword.control"], "settings": { "foreground": "#C586C0", "fontStyle": "bold underline" } }
      ],
      "semanticTokenColors": {
        "function": { "foreground": "#AABBCC", "bold": true }
      }
    }`, 'utf8')

    const loaded = await loadVsCodeThemeFile(join(root, 'ocean.jsonc'))
    const theme = convertVsCodeTheme(loaded, 'ocean-code', loaded.suggestedName)

    expect(loaded.suggestedName).toBe('Ocean Code')
    expect(theme).toMatchObject({
      id: 'ocean-code',
      name: 'Ocean Code',
      source: 'vscode',
      tone: 'dark',
      colors: { canvas: '#0B1020', text: '#E6EDF3', brand: '#6682FF' },
      syntax: { background: '#0B1020', comment: '#6A9955', keyword: '#C586C0', function: '#AABBCC' },
    })
    expect(theme.tokenColors).toEqual([
      { scope: ['comment'], foreground: '#6A9955', fontStyle: ['italic'] },
      { scope: ['keyword.control'], foreground: '#C586C0', fontStyle: ['bold', 'underline'] },
    ])
    expect('fontFamily' in theme).toBe(false)
  })

  it('detects recursive include cycles before saving a theme', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'a.json'), '{ "include": "./b.json" }', 'utf8')
    await writeFile(join(root, 'b.json'), '{ "include": "./a.json" }', 'utf8')

    await expect(loadVsCodeThemeFile(join(root, 'a.json'))).rejects.toThrow('include 存在循环')
  })

  it('rejects invalid JSONC and remote theme URLs', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'broken.jsonc'), '{ "colors": {', 'utf8')
    await writeFile(join(root, 'absolute.json'), `{ "include": ${JSON.stringify(join(root, 'base.json'))} }`, 'utf8')

    await expect(loadVsCodeThemeFile(join(root, 'broken.jsonc'))).rejects.toThrow('JSONC 无效')
    await expect(loadVsCodeThemeFile(join(root, 'absolute.json'))).rejects.toThrow('相对文件路径')
    await expect(loadVsCodeThemeFile('https://example.com/theme.json')).rejects.toThrow('只支持本地')
  })
})
