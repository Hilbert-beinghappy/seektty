#!/usr/bin/env node
/** Fetch four exact official artifacts; preserve stock Host dependency identities. */
import { mkdirSync, readdirSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const [stockInput, outputInput] = process.argv.slice(2)
if (!stockInput || !outputInput) throw new Error('Usage: node scripts/prepare-optional-provider-fixture.mjs <verified-stock-node_modules> <new-isolated-output-dir>')
const stock = resolve(stockInput), output = resolve(outputInput), modules = join(output, 'node_modules')
if (existsSync(output)) throw new Error('Output must be a new directory; existing fixtures and user files are never overwritten')
const names = ['dsh-browser-use', 'dsh-computer-use', 'dsh-experimental-browser-use-runtime', 'dsh-experimental-computer-use-cua-driver-mcp']
mkdirSync(modules, { recursive: true })
for (const row of readdirSync(stock)) {
  if (row.startsWith('.')) continue
  if (row === '@deepseek-ai') {
    mkdirSync(join(modules, row))
    for (const name of readdirSync(join(stock, row))) {
      if (names.includes(name)) continue
      symlinkSync(join(stock, row, name), join(modules, row, name))
    }
  } else symlinkSync(join(stock, row), join(modules, row))
}
const receipts = []
for (const short of names) {
  const name = `@deepseek-ai/${short}`, response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/0.2.0-rc.2`, { signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw new Error(`${name}: npm metadata HTTP ${response.status}`)
  const metadata = await response.json()
  if (metadata.name !== name || metadata.version !== '0.2.0-rc.2') throw new Error(`${name}: wrong published package identity`)
  const url = new URL(metadata.dist.tarball)
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error(`${name}: unexpected artifact origin`)
  const archiveResponse = await fetch(url, { signal: AbortSignal.timeout(45000) })
  if (!archiveResponse.ok) throw new Error(`${name}: archive HTTP ${archiveResponse.status}`)
  const bytes = Buffer.from(await archiveResponse.arrayBuffer()), integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (integrity !== metadata.dist.integrity) throw new Error(`${name}: SHA512 integrity mismatch`)
  const archive = join(output, `${short}.tgz`); writeFileSync(archive, bytes)
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  if (listing.some(path => !path.startsWith('package/') || path.split('/').includes('..'))) throw new Error(`${name}: unsafe archive path`)
  const verbose = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }).trim().split('\n')
  if (verbose.some(line => !line.startsWith('-') && !line.startsWith('d'))) throw new Error(`${name}: unexpected link or special archive member`)
  const destination = join(modules, '@deepseek-ai', short); mkdirSync(destination)
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', destination])
  receipts.push({ name, version: metadata.version, integrity, sha256: createHash('sha256').update(bytes).digest('hex') })
}
writeFileSync(join(output, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`)
writeFileSync(join(output, 'integrity-receipts.json'), `${JSON.stringify(receipts, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ nodeModules: modules, receipts }, null, 2)}\n`)
