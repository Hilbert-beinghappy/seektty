#!/usr/bin/env node
// Default stock boot of one immutable candidate. No fixture patch, provider key, or globals shim.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import { verifyStockDsh } from './stock-dsh-version.mjs'

const [candidateArg, dshArg, expected, inspectPrivacy] = process.argv.slice(2)
assert(inspectPrivacy === undefined || ['--privacy', '--host-files'].includes(inspectPrivacy), 'Only --privacy or --host-files read-only journeys are accepted')
assert(candidateArg && dshArg && /^[a-f0-9]{64}$/.test(expected ?? ''), 'candidate, official dsh path, SHA256 required')
const candidate = resolve(candidateArg)
const digest = () => createHash('sha256').update(readFileSync(candidate)).digest('hex')
assert.equal(digest(), expected)
const stock = verifyStockDsh(resolve(dshArg))
const root = mkdtempSync(join(tmpdir(), 'seektty-default-settings-pty-'))
const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
for (const key of ['HOME', 'DSH_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR']) {
  env[key] = join(root, key.toLowerCase()); mkdirSync(env[key], { mode: 0o700 })
}
const workspace = join(root, 'workspace'); mkdirSync(workspace)
if (inspectPrivacy === '--host-files') writeFileSync(join(workspace, 'seektty-host-file.txt'), 'PUBLIC_HOST_FILE_INITIAL\n')
Object.assign(env, { TERM: 'xterm-256color', SEEKTTY_UPDATE: 'off' })
// The policy journey observes composed defaults without a telemetry override.
// It never submits a message or grants feedback authorization.
if (inspectPrivacy !== '--privacy') env.DSH_TELEMETRY_DISABLED = '1'
const pnpm = process.env.SEEKTTY_PNPM_ENTRY
assert(pnpm, 'Set SEEKTTY_PNPM_ENTRY to installed pnpm CLI')
const bin = join(root, 'bin'); mkdirSync(bin)
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(pnpm)} "$@"\n`); chmodSync(join(bin, 'pnpm'), 0o700)
env.PATH = `${bin}:${env.PATH ?? ''}`
const report = { root, candidate, candidateSha256: expected, cliVersion: stock.version, defaultProfile: 'tui', fixturePatch: false, globalsShim: false, providerCredentials: false, telemetryEnvironmentOverride: env.DSH_TELEMETRY_DISABLED !== undefined, status: 'running', steps: [] }
const save = () => writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ evidenceDirectory: root })); save()
let child, exited, finished
let raw = ''
try {
  const install = crossSpawn.sync(resolve(dshArg), ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', candidate], { cwd: workspace, env, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
  writeFileSync(join(root, 'install.log'), `${install.stdout ?? ''}\n${install.stderr ?? ''}`)
  assert.equal(install.status, 0, `native install failed: ${install.error ?? install.stderr}`)
  report.steps.push('immutable-candidate-install'); save()
  child = spawn(process.execPath, [stock.entry, '--profile', 'tui', '--cwd', workspace], { cwd: workspace, env, name: 'xterm-256color', cols: 120, rows: 40 })
  finished = new Promise(resolveExit => child.onExit(event => { exited = event; resolveExit(event) }))
  child.onData(chunk => { raw += chunk; appendFileSync(join(root, 'default.raw'), chunk) })
  const plain = () => raw.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/gu, '')
  const ready = () => /输入消息|Type a message|Enter a message|Configure a model Provider|配置模型|API [Kk]ey/u.test(plain())
  const deadline = Date.now() + 30000
  while (!ready() && !exited && Date.now() < deadline) await delay(50)
  assert(!exited, `default PTY exited: ${JSON.stringify(exited)}\n${plain().slice(-5000)}`)
  assert(ready(), `default PTY did not reach composer/onboarding:\n${plain().slice(-5000)}`)
  assert(!/keyBindingsIssue is not defined|sanitizeKeyBindings is not defined|Harness did not register settings seektty-behavior/u.test(raw), 'behavior schema activation failed')
  report.steps.push('default-stock-pty-composer-or-onboarding');
  report.ui = /输入消息|Type a message|Enter a message/u.test(plain()) ? 'composer' : 'keyless-onboarding'
  writeFileSync(join(root, 'default-screen.txt'), plain()); save()
  child.write('\x1b'); await delay(200)
  if (inspectPrivacy === '--privacy') {
    const before = raw.length
    child.write('/privacy\r')
    const policyDeadline = Date.now() + 7000
    while (!/Privacy and session uploads|隐私与会话上传/u.test(raw.slice(before)) && !exited && Date.now() < policyDeadline) await delay(50)
    assert(!exited && /Privacy and session uploads|隐私与会话上传/u.test(raw.slice(before)), 'read-only privacy entry did not open')
    await delay(250)
    writeFileSync(join(root, 'privacy-screen.txt'), plain())
    report.steps.push('read-only-mounted-privacy-policy-view')
    report.privacy = { observation: 'actual mounted policy view; absence is unknown, not disabled', mutationsRequested: 0 }
    save(); child.write('\x1b'); await delay(200)
  }
  if (inspectPrivacy === '--host-files') {
    const wait = async (needle, since = raw.length) => {
      const deadline = Date.now() + 10_000
      const found = () => typeof needle === 'string' ? raw.slice(since).includes(needle) : needle.test(raw.slice(since))
      while (!found() && !exited && Date.now() < deadline) await delay(50)
      assert(!exited && found(), `Host files did not reach ${needle}: ${plain().slice(-5000)}`)
    }
    let before = raw.length; child.write('/files\r'); await wait(/Host workspace files|Host 工作区文件/u, before)
    before = raw.length; child.write('\r'); await wait('seektty-host-file.txt', before)
    before = raw.length; child.write('\x1b[B\r'); await wait('Read text and observe changes', before)
    before = raw.length; child.write('\r'); await wait('PUBLIC_HOST_FILE_INITIAL', before)
    writeFileSync(join(root, 'host-file-initial-screen.txt'), plain())
    report.steps.push('stock-public-files-directory-and-text')
    before = raw.length; writeFileSync(join(workspace, 'seektty-host-file.txt'), 'PUBLIC_HOST_FILE_CHANGED\n')
    await wait('PUBLIC_HOST_FILE_CHANGED', before)
    writeFileSync(join(root, 'host-file-changed-screen.txt'), plain())
    report.steps.push('stock-public-native-file-watch-refresh')
    // Exactly four nested pages: observed file, read/bytes chooser, directory,
    // then /files root. Return through their own navigation lifetimes.
    for (let i = 0; i < 4; i++) { child.write('\x1b'); await delay(100) }
    report.steps.push('stock-public-file-watch-close-backstack')
    save()
  }
  child.write('/exit\r')
  await Promise.race([finished, delay(5000)])
  assert(exited, 'default PTY failed to exit within bound')
  report.exit = exited
  assert.equal(exited.exitCode, 0, 'default PTY did not exit successfully')
  assert.equal(digest(), expected, 'candidate changed during acceptance')
  report.status = 'passed'
} catch (error) { report.status = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1 }
finally {
  if (child && !exited) { child.kill('SIGKILL'); await Promise.race([finished, delay(1000)]) }
  report.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify(report))
}
