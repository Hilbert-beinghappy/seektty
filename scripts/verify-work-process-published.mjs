/** Read-only evidence check against an unpacked official npm release; never execute its browser bundle. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WORK_PROCESS_MODES, workProcessPolicy, normalizeWorkProcessMode, workProcessNodeHidden } from '../src/client/work-process-display.ts'

const root = process.argv[2]
assert(root, 'Pass an isolated directory containing ui-chat.tgz and ui-chat/package')
const official = resolve(root)
const digest = createHash('sha512').update(readFileSync(join(official, 'ui-chat.tgz'))).digest('base64')
assert.equal(digest, '1rsCHGvWNLaO6B6t1fJa8Qsov0OvJC6bnhpyK2NmDCaLu9uzb4dC4DxCH3OzmJwJkEByHrb3j3l9kbpaV+dTCw==')
const packageRoot = join(official, 'ui-chat/package')
function verifiedFile(path) {
  const packaged = execFileSync('/usr/bin/tar', ['-xOf', join(official, 'ui-chat.tgz'), `package/${path}`], { maxBuffer: 16 * 1024 * 1024 })
  const extracted = readFileSync(join(packageRoot, path))
  assert.deepEqual(extracted, packaged, `Extracted ${path} must match the verified tarball`)
  return packaged.toString('utf8')
}
const pkg = JSON.parse(verifiedFile('package.json'))
assert.equal(pkg.name, '@deepseek-ai/dsh-client-ui-chat')
assert.equal(pkg.version, '0.2.0-rc.2')
const client = verifiedFile('lib/client.js')
const index = verifiedFile('lib/index.js')
// Parse only the static JSON-shaped policy literal. No eval, VM, import, install or official mutation.
const literal = client.match(/const POLICIES = (\{[\s\S]*?\n\t\t\});/u)?.[1]
assert(literal, 'Published policy table must be present')
const table = JSON.parse(literal.replace(/\b([A-Za-z]+):/gu, '"$1":'))
assert.deepEqual(Object.keys(table), [...WORK_PROCESS_MODES])
for (const mode of WORK_PROCESS_MODES) assert.deepEqual(workProcessPolicy(mode), table[mode])
const modeLiteral = index.match(/const TRANSCRIPT_VIEW_MODES = (\[[\s\S]*?\]);/u)?.[1]
assert(modeLiteral)
assert.deepEqual(JSON.parse(modeLiteral), [...WORK_PROCESS_MODES])
assert.match(index, /const CHAT_SETTINGS_NAMESPACE = "ui-chat";/u)
assert.match(index, /const TRANSCRIPT_VIEW_FIELD = "transcriptView";/u)
assert.match(index, /const DEFAULT_TRANSCRIPT_VIEW_MODE = "detailed";/u)
assert.match(client, /"dshDesktop" in globalThis \? "standard" : DEFAULT_TRANSCRIPT_VIEW_MODE/u)
assert.match(client, /saved === "normal" \|\| saved === "expanded" \? "detailed"/u)
assert.equal(normalizeWorkProcessMode('normal'), 'detailed')
assert.equal(normalizeWorkProcessMode('expanded'), 'detailed')
assert.match(client, /policy\.stepGrouping === "collapsed" \|\| policy\.stepGrouping === "history" && turnLocation\?\.status !== "open"/u)
assert.match(client, /initialize\(closed === false \? "bottom" : "top"\)/u)
const independent = client.match(/const TURN_PROCESS_INDEPENDENT_KINDS = new Set\((\[[\s\S]*?\])\);/u)?.[1]
assert(independent)
const turn = { turn: 1, status: 'closed', endReason: 'completed', hasInterleavedInput: false,
  spec: { turn: 1, processStartSeq: 1, answerAnchorSeq: 9, answerStep: 2 } }
for (const kind of JSON.parse(independent)) assert.equal(workProcessNodeHidden(workProcessPolicy('compact'), turn,
  { kind, anchorSeq: 2, knownProcessMember: true }), false)
console.log(JSON.stringify({ package: pkg.name, version: pkg.version, sha512: digest, modes: Object.keys(table),
  evidence: ['published policy table', 'mode enum', 'legacy aliases', 'Web/Desktop defaults', 'grouping/opening edge', 'independent node kinds'] }, null, 2))
