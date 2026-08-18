import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PluginMarketplace } from '../src/host/plugin-marketplace.ts'
import type { TuiMarketplaceSource } from '../src/protocol.ts'

const root = resolve(import.meta.dirname, '..')
const source: TuiMarketplaceSource = {
  id: 'npm',
  kind: 'npm',
  label: 'npm Registry',
  url: 'https://registry.npmjs.org/',
  enabled: true,
  builtIn: true,
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function tarFile(path: string, content: string): Uint8Array {
  const data = Buffer.from(content)
  const header = Buffer.alloc(512)
  header.write(path)
  header.write(`${data.byteLength.toString(8).padStart(11, '0')}\0`, 124)
  header[156] = 0x30
  header.write('ustar\0', 257)
  header.write('        ', 148)
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  const padded = Math.ceil(data.byteLength / 512) * 512
  const block = Buffer.alloc(padded)
  data.copy(block)
  return Buffer.concat([header, block, Buffer.alloc(1024)])
}

const tarball = gzipSync(tarFile('package/package.json', JSON.stringify({
  name: 'demo-plugin',
  version: '1.2.3',
  description: 'from tarball',
})))

function searchBody(): unknown {
  return {
    objects: [{
      package: {
        name: 'demo-plugin',
        version: '1.2.3',
        description: 'from search',
        publisher: { username: 'alice' },
      },
    }],
  }
}

function metadataBody(): unknown {
  return {
    'dist-tags': { latest: '1.2.3' },
    versions: {
      '1.2.3': {
        name: 'demo-plugin',
        version: '1.2.3',
        description: 'from metadata',
        dist: { tarball: 'https://registry.npmjs.org/demo-plugin/-/demo-plugin-1.2.3.tgz' },
        maintainers: [{ name: 'alice' }],
      },
    },
  }
}

describe('plugin marketplace search (task 5.3)', () => {
  it('does not use synchronous gunzip', () => {
    const sourceText = readFileSync(resolve(root, 'src/host/plugin-marketplace.ts'), 'utf8')
    expect(sourceText).not.toMatch(/gunzipSync/u)
    expect(sourceText).toMatch(/AbortSignal\.timeout/u)
  })

  it('searches npm from registry metadata without downloading tarballs', async () => {
    const urls: string[] = []
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.includes('/-/v1/search')) return jsonResponse(searchBody())
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })
    const rows = await marketplace.search('demo', [source])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('demo-plugin')
    expect(rows[0]?.version).toBe('1.2.3')
    expect(rows[0]?.description).toBe('from search')
    expect(urls.every(url => !url.endsWith('.tgz'))).toBe(true)
  })

  it('reuses a cached search instead of hitting the registry again', async () => {
    let searches = 0
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input) => {
        const url = String(input)
        if (url.includes('/-/v1/search')) {
          searches += 1
          return jsonResponse(searchBody())
        }
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })
    await marketplace.search('demo', [source])
    await marketplace.search('demo', [source])
    expect(searches).toBe(1)
  })

  it('downloads the tarball only when inspect is called', async () => {
    const urls: string[] = []
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.includes('/demo-plugin') && url.endsWith('.tgz')) {
          return new Response(tarball, { status: 200 })
        }
        if (url.includes('demo-plugin')) return jsonResponse(metadataBody())
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })
    const candidate = await marketplace.inspect('demo-plugin@1.2.3', [source])
    expect(candidate.description).toBe('from tarball')
    expect(urls.some(url => url.endsWith('.tgz'))).toBe(true)
  })

  it('reuses a cached inspect instead of re-downloading the tarball', async () => {
    let tarballs = 0
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input) => {
        const url = String(input)
        if (url.endsWith('.tgz')) {
          tarballs += 1
          return new Response(tarball, { status: 200 })
        }
        if (url.includes('demo-plugin')) return jsonResponse(metadataBody())
        throw new Error(`unexpected fetch ${url}`)
      }) as typeof fetch,
    })
    await marketplace.inspect('demo-plugin@1.2.3', [source])
    await marketplace.inspect('demo-plugin@1.2.3', [source])
    expect(tarballs).toBe(1)
  })

  it('aborts a hung registry request with the marketplace timeout', async () => {
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      timeoutMs: 20,
      fetch: (async (_input, init) => new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new Error('aborted'))
        })
      })) as typeof fetch,
    })
    const rows = await marketplace.search('demo', [source])
    expect(rows[0]?.diagnostics.join(' ')).toMatch(/aborted|timeout/iu)
  })

  it('rethrows user abort instead of caching a source-failure diagnostic', async () => {
    const controller = new AbortController()
    let searches = 0
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input, init) => {
        const url = String(input)
        if (!url.includes('/-/v1/search')) throw new Error(`unexpected fetch ${url}`)
        searches += 1
        if (searches === 1) {
          started()
          return await new Promise<Response>((_resolve, reject) => {
            const fail = () => reject(init?.signal?.reason ?? new Error('aborted'))
            if (init?.signal?.aborted) {
              fail()
              return
            }
            init?.signal?.addEventListener('abort', fail, { once: true })
          })
        }
        return jsonResponse(searchBody())
      }) as typeof fetch,
    })
    const pending = marketplace.search('demo', [source], controller.signal)
    await ready
    controller.abort(new DOMException('The operation was aborted.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    const rows = await marketplace.search('demo', [source])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('demo-plugin')
    expect(rows[0]?.diagnostics ?? []).not.toContainEqual(expect.stringMatching(/Source failed|来源失败/u))
    expect(searches).toBe(2)
  })

  it('keeps successful sources when another catalog source fails', async () => {
    const catalog: TuiMarketplaceSource = {
      id: 'bad-catalog',
      kind: 'catalog',
      label: 'Broken catalog',
      url: 'https://example.invalid/catalog.json',
      enabled: true,
      builtIn: false,
    }
    const marketplace = new PluginMarketplace({
      cwd: root,
      resolveCredential: () => Promise.resolve(undefined),
      fetch: (async (input) => {
        const url = String(input)
        if (url.includes('/-/v1/search')) return jsonResponse(searchBody())
        throw new Error('catalog down')
      }) as typeof fetch,
    })
    const rows = await marketplace.search('demo', [source, catalog])
    expect(rows.some(row => row.name === 'demo-plugin')).toBe(true)
    expect(rows.some(row => row.sourceId === 'bad-catalog' && row.diagnostics.some(item => item.includes('catalog down')))).toBe(true)
  })
})
