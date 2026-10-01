import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { creatorHost } from './fixtures/creator-host.js'
const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
describe.skipIf(!stock)('explicit Creator composition over published rc.2 Host services', () => {
  const cleanups = []
  afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
  async function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'seektty-creator-fixture-')); cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const host = await creatorHost(stock, root); cleanups.push(() => host.dispose()); return host
  }
  it('loads official Creator plugins/skills without enabling management in standard or PTC or changing the default', async () => {
    const h = await fixture(), parse = file => h.yaml.load(readFileSync(new URL(file, import.meta.url), 'utf8'), { schema: h.entryListSchema })
    const main = h.applyEntryPatches([], parse('../cordis.patch.yml'), () => {})
    const combined = h.applyEntryPatches(main, parse('../optional/creator.patch.yml'), () => {})
    expect(main.some(row => row.id === 'preset-cordis')).toBe(false)
    expect(combined.find(row => row.id === 'agent-preset-registry').config.default).toBe('standard')
    for (const id of ['preset-standard', 'preset-ptc']) expect(combined.find(row => row.id === id).config.plugins.find(row => row.id === 'tool-plugin-manager').disabled).toBe(true)
    const creator = combined.find(row => row.id === 'preset-cordis'); expect(h.AgentPreset.Config(creator.config).id).toBe('cordis')
    expect(combined.filter(row => row.name === '@deepseek-ai/dsh-tool-cordis/host')).toHaveLength(1)
    expect(creator.config.plugins.filter(row => row.name === '@deepseek-ai/dsh-tool-cordis/host')).toEqual([])
    const manager = creator.config.plugins.find(row => row.id === 'tool-plugin-manager')
    expect(manager.disabled.__jsExpr).toBe("!ctx.get('profileContext')")
    const skill = creator.config.plugins.find(row => row.id === 'skill-filesystem')
    const expression = skill.config.customSkillDirs[0].__jsExpr
    const skillDir = new Function('baseUrl', `return (${expression})`)(new URL(`file://${join(stock, '..', 'fixture.cjs')}`).href)
    expect(skillDir).toBe(join(dirname(h.require.resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills'))
    expect(readdirSync(skillDir).length).toBeGreaterThan(0)
    expect(creator.config.plugins.find(row => row.id === 'tool-cordis')).toBeDefined()
  })
  it('only Creator can call tools; read-only inspection lists real scoped schemas and duplicate Host providers are rejected', async () => {
    const h = await fixture()
    expect(h.tools.schemas(h.standard).some(row => row.name === 'plugin_manager')).toBe(false)
    expect((await h.run('plugin_manager', { action: 'list_plugins' }, h.standard)).isError).toBe(true); expect(h.asks).toEqual([])
    const listed = await h.run('cordis_inspect_list', {})
    expect(listed.isError).toBe(false); expect(listed.value.providers.map(row => row.id)).toEqual(['Service', 'Event', 'Config', 'Tool'])
    const queried = await h.run('cordis_inspect_query', { platform: 'host', provider: 'Tool', method: 'listTools', input: {} })
    expect(queried.isError).toBe(false); expect(queried.value.data.tools.some(row => row.name === 'plugin_manager')).toBe(true)
    expect(h.asks).toEqual([]); expect(() => h.inspectHost.apply(h.ctx)).toThrow('already')
  })
  it('rejecting management, including list/install, leaves the disposable Profile unchanged; one-shot allow does not widen session policy', async () => {
    const h = await fixture(), original = h.patch()
    const blocked = await h.run('plugin_manager', { action: 'list_plugins' }); expect(blocked.isError).toBe(true)
    expect((await h.run('plugin_manager', { action: 'install_bundle', target: 'synthetic-never-installed' })).isError).toBe(true)
    expect(h.asks, JSON.stringify(blocked)).toHaveLength(2); expect(h.patch()).toBe(original)
    h.approve('allowed-once'); const rows = await h.run('plugin_manager', { action: 'list_plugins' })
    expect(rows.isError, JSON.stringify(rows)).toBe(false)
    const entry = JSON.parse(rows.value).entries.find(row => row.patchId === 'synthetic-entry')
    expect(entry).toBeDefined()
    const changed = await h.run('plugin_manager', { action: 'set_plugin', target: entry.entryId, enabled: false })
    expect(changed.isError).toBe(false); expect(JSON.parse(changed.value)).toMatchObject({ changed: true, application: 'restart-required' })
    expect(h.patch()).toContain('disabled: true')
    expect(await h.restartEnabled()).toBe(false)
    h.approve('rejected'); expect((await h.run('plugin_manager', { action: 'list_plugins' })).isError).toBe(true)
    expect(h.asks).toHaveLength(5)
  })
})
