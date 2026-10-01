import { readFileSync, readdirSync } from 'node:fs'
import { load } from 'js-yaml'
import { entryListSchema, applyEntryPatches, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { describe, expect, it } from 'vitest'

function parse(name: string): PatchOptions[] {
  return load(readFileSync(new URL(`../optional/${name}.patch.yml`, import.meta.url), 'utf8'), { schema: entryListSchema }) as PatchOptions[]
}
describe('explicit optional published-provider compositions', () => {
  it.each(['browser-playwright-mcp', 'browser-chrome-devtools-mcp', 'browser-stagehand-native', 'computer-cua-native', 'computer-cua-mcp'])('%s is an isolated two-entry official provider choice', name => {
    const warnings: string[] = []
    const rows = applyEntryPatches([], parse(name), message => warnings.push(message))
    expect(warnings).toEqual([]); expect(rows).toHaveLength(2)
    expect(rows[0]?.name).toBe(`@deepseek-ai/dsh-${name.startsWith('browser-') ? 'browser' : 'computer'}-use`)
    expect(rows[1]?.name).toBe(`@deepseek-ai/dsh-experimental-${name.startsWith('browser-') ? `browser-use-${name.slice(8)}` : `computer-use-cua-driver-${name.slice(13)}`}`)
    expect(new Set(rows.map(row => row.id)).size).toBe(2)
    if (name.startsWith('browser-')) expect(rows[1]?.config).toMatchObject({ mode: 'launch', headless: true })
    if (name === 'browser-stagehand-native') expect(rows[1]?.config.model).toEqual({ modelName: { __jsExpr: 'process.env.SEEKTTY_STAGEHAND_MODEL' }, apiKey: { __jsExpr: 'process.env.SEEKTTY_STAGEHAND_API_KEY' } })
    if (name === 'computer-cua-mcp') expect(rows[1]?.config).toMatchObject({ command: 'cua-driver', args: ['mcp'] })
  })
  it('ships exactly six opt-in patch files and the default bundle does not apply any of them', () => {
    const names = readdirSync(new URL('../optional', import.meta.url)).filter(name => name.endsWith('.patch.yml'))
    expect(names).toHaveLength(6)
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dsh: { bundle: { patch: string } }; files: string[] }
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('optional/*.patch.yml')
    expect(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')).not.toMatch(/dsh-(?:experimental-(?:browser|computer)-use|tool-cordis\/host)/u)
  })
  it.each(['creator', 'browser-playwright-mcp', 'browser-chrome-devtools-mcp', 'browser-stagehand-native', 'computer-cua-native', 'computer-cua-mcp'])('%s has a native-installable private companion bundle with pinned published dependencies', name => {
    const manifest = JSON.parse(readFileSync(new URL(`../optional/${name}/package.json`, import.meta.url), 'utf8')) as { name: string; private: boolean; dsh: { bundle: { patch: string } }; dependencies: Record<string, string>; files: string[] }
    expect(manifest.name).toBe(`seektty-${name}`); expect(manifest.private).toBe(true)
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml'); expect(manifest.files).toEqual(['cordis.patch.yml'])
    expect(Object.values(manifest.dependencies)).toEqual(['0.2.0-rc.2', '0.2.0-rc.2'])
    expect(readFileSync(new URL(`../optional/${name}/cordis.patch.yml`, import.meta.url), 'utf8')).toBe(readFileSync(new URL(`../optional/${name}.patch.yml`, import.meta.url), 'utf8'))
  })
})
