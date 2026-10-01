import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalProviderHost } from './fixtures/optional-provider-host.js'
const nodeModules = process.env.SEEKTTY_OPTIONAL_NODE_MODULES
describe.skipIf(!nodeModules)('published rc.2 optional provider → real MCP and ToolRuntime', () => {
  const cleanups = []
  afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
  async function fixture(kind) {
    const root = mkdtempSync(join(tmpdir(), 'seektty-synthetic-provider-')), log = join(root, 'calls.jsonl')
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const host = await optionalProviderHost(nodeModules, kind, log)
    cleanups.push(() => host.dispose())
    return { ...host, root, calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] }
  }
  it.each(['browser', 'computer'])('%s tools dispatch through real policy and retain driver errors/image diagnostics', async kind => {
    const h = await fixture(kind)
    expect((await h.run('click')).isError).toBe(false); expect(h.calls()).toHaveLength(1)
    const deny = h.ctx.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'synthetic permission denied' }))
    expect((await h.run('click')).isError).toBe(true); expect(h.calls()).toHaveLength(1)
    deny()
    expect((await h.run('fail')).isError).toBe(true)
    const image = await h.run('screenshot')
    expect(JSON.stringify(image.content)).toContain('image unavailable')
    expect(JSON.stringify(image.content)).not.toContain('iVBOR')
    expect(h.calls().map(call => call.name)).toEqual(['click', 'fail', 'screenshot'])
  }, 15000)
  it.each(['browser', 'computer'])('%s cancellation before dispatch performs zero calls; unloading withdraws tools and releases registration', async kind => {
    const h = await fixture(kind), abort = new AbortController(); abort.abort()
    expect((await h.run('click', h.primary, abort.signal)).isError).toBe(true); expect(h.calls()).toEqual([])
    await h.unload(); expect(h.registry.providerName).toBeUndefined()
    expect((await h.run('click')).isError).toBe(true); expect(h.calls()).toEqual([])
  }, 15000)
  it.each(['browser', 'computer'])('%s screenshots cross real model admission and durable local storage without inline bytes', async kind => {
    const h = await fixture(kind), store = await h.enableImages(h.root)
    const image = await h.run('screenshot')
    expect(image.isError).toBe(false)
    expect(image.content[0]?.type, JSON.stringify(image)).toBe('image')
    expect(image.content[0]?.attachment).toMatchObject({ mediaType: 'image/png', width: 1, height: 1 })
    expect(JSON.stringify(image.content)).not.toContain('iVBOR')
    expect(store).toBeDefined(); expect(h.calls()).toHaveLength(1)
  }, 15000)
  it('separate live browser Agents own distinct child connections and cannot inherit a retired activation', async () => {
    const h = await fixture('browser')
    await h.run('click', h.primary); await h.run('click', h.foreign)
    expect(new Set(h.calls().map(call => call.pid)).size).toBe(2)
    await h.primary.ctx.fiber.dispose()
    expect((await h.run('click', h.primary)).isError).toBe(true)
    expect(h.calls()).toHaveLength(2)
  }, 15000)
  it('cancelled asynchronous permission approval cannot dispatch after a late allow', async () => {
    const h = await fixture('computer'); let finish
    h.ctx.on('tools/pre-execute', () => new Promise(resolve => { finish = resolve }))
    const abort = new AbortController(), work = h.run('click', h.primary, abort.signal)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function')); abort.abort(); finish({ kind: 'allow' })
    expect((await work).isError).toBe(true); expect(h.calls()).toEqual([])
  }, 15000)
})
