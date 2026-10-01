#!/usr/bin/env node
// Run one existing acceptance suite with an immutable candidate and fresh user environment.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  assert(process.argv[i]?.startsWith('--') && process.argv[i + 1], 'Use --suite, --candidate, --sha256, --dsh-bin, --dsh-entry and --out')
  assert(!args.has(process.argv[i]), 'Duplicate option')
  args.set(process.argv[i], process.argv[i + 1])
}
for (const key of args.keys()) assert(['--suite', '--candidate', '--sha256', '--dsh-bin', '--dsh-entry', '--out', '--pnpm-entry'].includes(key), 'Unknown option')
const suites = {
  stock: 'scripts/stock-dsh-cycle.mjs',
  terminal: 'scripts/native-dsh-acceptance.mjs',
  management: 'scripts/native-management-acceptance.mjs',
}
const suite = args.get('--suite')
assert(Object.hasOwn(suites, suite), 'Suite must be stock, terminal or management')
for (const key of ['--candidate', '--sha256', '--dsh-bin', '--dsh-entry', '--out']) assert(args.has(key), 'Missing ' + key)
const candidate = realpathSync(args.get('--candidate'))
const expected = args.get('--sha256')
assert(/^[a-f0-9]{64}$/.test(expected), 'SHA256 must be a lowercase 64 digit digest')
const digest = () => createHash('sha256').update(readFileSync(candidate)).digest('hex')
assert.equal(digest(), expected, 'Candidate digest changed before acceptance')
const output = resolve(args.get('--out'))
mkdirSync(output, { recursive: true })
const root = mkdtempSync(join(output, suite + '-'))
const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'SystemRoot', 'ComSpec', 'PATHEXT'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
for (const key of ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'DSH_HOME']) {
  env[key] = join(root, key.toLowerCase())
  mkdirSync(env[key], { mode: 0o700 })
}
Object.assign(env, {
  DSH_BIN: realpathSync(args.get('--dsh-bin')), DSH_ENTRY: realpathSync(args.get('--dsh-entry')),
  SEEKTTY_SPEC: candidate, SEEKTTY_UPDATE: 'off', DSH_TELEMETRY_DISABLED: '1',
})
assert.equal(env.DSH_BIN, env.DSH_ENTRY, 'CLI shim and entry must resolve to the same official CLI')
if (args.has('--pnpm-entry')) {
  env.SEEKTTY_PNPM_ENTRY = realpathSync(args.get('--pnpm-entry'))
  // Stock/packed launcher spawn pnpm by name; a fresh XDG cache must not let
  // machine Corepack choose a different or unmaterialized package manager.
  const bin = join(root, 'bin'); mkdirSync(bin)
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(env.SEEKTTY_PNPM_ENTRY)} "$@"\n`)
  chmodSync(join(bin, 'pnpm'), 0o700)
  env.PATH = `${bin}:${env.PATH ?? ''}`
}
const manifest = { suite, candidate, candidateSha256: expected, dshEntry: env.DSH_ENTRY, evidenceDirectory: root, startedAt: new Date().toISOString(), status: 'running' }
const report = join(root, 'wrapper-report.json')
writeFileSync(report, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ evidenceDirectory: root, suite, candidateSha256: expected }))
try {
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [suites[suite]], { cwd: process.cwd(), env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveResult({ code, signal }))
  })
  manifest.exit = result
  assert.equal(digest(), expected, 'Candidate digest changed during acceptance')
  manifest.status = result.code === 0 ? 'passed' : 'failed'
  process.exitCode = result.code === 0 ? 0 : 1
} catch (error) {
  manifest.status = 'failed'
  manifest.error = String(error.message ?? error)
  process.exitCode = 1
} finally {
  manifest.completedAt = new Date().toISOString()
  writeFileSync(report, JSON.stringify(manifest, null, 2) + '\n')
}
// This wrapper's pass means one suite passed. Privacy defaults, GVS and GUI need separate evidence.
