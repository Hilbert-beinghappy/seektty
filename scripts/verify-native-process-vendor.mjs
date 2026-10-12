/** Read-only byte evidence for published rc.2 pure business projections; never execute the browser bundle. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
const tarball = process.argv[2]
assert(tarball, 'Pass the official dsh-client-ui-chat 0.2.0-rc.2 tarball')
const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'vendor/ui-chat-process/provenance.json'), 'utf8'))
const hash = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding)
assert.equal('sha512-' + hash(readFileSync(tarball), 'sha512', 'base64'), manifest.tarballIntegrity)
const extract = name => execFileSync('/usr/bin/tar', ['-xOf', tarball, 'package/' + name], { maxBuffer: 16 * 1024 * 1024 })
const pkg = JSON.parse(extract('package.json'))
assert.equal(pkg.name, manifest.package); assert.equal(pkg.version, manifest.version)
const bundle = extract('lib/client.js').toString('utf8')
assert.equal(hash(bundle), manifest.bundleSha256)
assert.deepEqual(readFileSync(join(root, 'vendor/ui-chat-process/LICENSE')), extract('LICENSE'))
const paths = { 'assistant-content.js': 'contract/assistant-content.js', 'chat-visibility.js': 'contract/chat-visibility.js' }
for (const item of manifest.regions) {
  let raw
  if (item.file === 'turn-process-contract.js') {
    const start = bundle.indexOf('\t\tconst TURN_PROCESS_INDEPENDENT_KINDS')
    const end = bundle.indexOf('\t\t/**\n\t\t* Keep live, stopped, and failed Turns open.', start)
    assert(start >= 0 && end > start); raw = bundle.slice(start, end)
  } else {
    const path = paths[item.file] ?? 'conversation-nodes/' + item.file
    const start = bundle.indexOf('\t\t//#region lib/types/client/' + path + '\n')
    const end = bundle.indexOf('\t\t//#endregion', start)
    assert(start >= 0 && end > start); raw = bundle.slice(start, end)
  }
  assert.equal(hash(raw), item.rawRegionSha256, item.file + ' native region hash')
  const nativeBody = raw.split('\n').map(line => line.startsWith('\t\t') ? line.slice(2) : line).join('\n').trim() + '\n'
  const adapted = readFileSync(join(root, 'vendor/ui-chat-process', item.file), 'utf8')
  assert.equal(hash(adapted), item.sha256, item.file + ' adapted module hash')
  assert(adapted.includes(nativeBody), item.file + ' native business body must remain byte-identical after dedent')
}
console.log(JSON.stringify({ package: pkg.name, version: pkg.version, regions: manifest.regions.length, integrity: manifest.tarballIntegrity, businessBodies: 'unchanged after bundle dedent' }, null, 2))
