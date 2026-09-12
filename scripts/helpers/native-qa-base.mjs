/** Shared fixture plumbing for opt-in native PTY QA; never opens a personal home. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import xterm from '@xterm/headless'

export { delay }
export function fixture(prefix) {
  const { DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC } = process.env
  assert(DSH_BIN && DSH_ENTRY && SEEKTTY_SPEC, 'Set DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC')
  assert.equal(realpathSync(DSH_BIN), realpathSync(DSH_ENTRY))
  const official = createRequire(realpathSync(DSH_ENTRY))
  const manifest = JSON.parse(readFileSync(join(dirname(realpathSync(DSH_ENTRY)), '..', 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@deepseek-ai/dsh')
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  const home = join(root, 'home'), workspace = join(root, 'workspace')
  mkdirSync(home); mkdirSync(workspace)
  const report = { root, home, workspace, candidate: resolve(SEEKTTY_SPEC),
    candidateSha256: createHash('sha256').update(readFileSync(SEEKTTY_SPEC)).digest('hex'),
    cli: realpathSync(DSH_ENTRY), cliVersion: manifest.version, startedAt: new Date().toISOString(), cases: [] }
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'SystemRoot', 'ComSpec', 'PATHEXT']
    .filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
  Object.assign(env, { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off', TERM: 'xterm-256color', SEEKTTY_QA_KEY: 'local-fixture-only' })
  const save = () => writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const result = (name, status, evidence = {}) => {
    report.cases.push({ name, status, ...evidence }); save(); console.log(JSON.stringify(report.cases.at(-1)))
  }
  console.log(JSON.stringify({ evidenceDirectory: root }))
  const install = () => {
    const installed = crossSpawn.sync(DSH_BIN, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', resolve(SEEKTTY_SPEC)], { cwd: workspace, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })
    writeFileSync(join(root, 'install.log'), `${installed.stdout ?? ''}\n${installed.stderr ?? ''}`)
    assert.equal(installed.status, 0, installed.stderr)
  }
  function open(label, extraArgs = []) {
    const terminal = new xterm.Terminal({ cols: 120, rows: 40, allowProposedApi: true, scrollback: 10_000 })
    if (process.env.SEEKTTY_QA_UNICODE_ADDON) {
      const { UnicodeGraphemesAddon } = createRequire(import.meta.url)(process.env.SEEKTTY_QA_UNICODE_ADDON)
      terminal.loadAddon(new UnicodeGraphemesAddon())
    }
    report.terminalUnicodeVersion = terminal.unicode.activeVersion
    const child = spawn(process.execPath, [DSH_ENTRY, '--profile', 'tui', ...extraArgs], { cwd: workspace, env, cols: 120, rows: 40, name: 'xterm-256color' })
    let raw = '', exit, writes = Promise.resolve()
    child.onData(data => {
      raw += data; appendFileSync(join(root, `${label}.raw`), data)
      writes = writes.then(() => new Promise(resolve => terminal.write(data, resolve)))
    })
    child.onExit(event => { exit = event })
    const screen = () => {
      const b = terminal.buffer.active
      return Array.from({ length: b.length }, (_, i) => b.getLine(i)?.translateToString(true) ?? '').join('\n')
    }
    const snapshot = name => { const path = join(root, `${label}-${name}.txt`); writeFileSync(path, screen()); return path }
    const busy = () => /生成中|Ctrl\+C (?:停止|stop)/u.test(screen().split('\n')[0] ?? '')
    async function wait(check, label, timeout = 15_000) {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        await writes
        if (check()) return
        if (exit) throw new Error(`${label}: PTY exited ${JSON.stringify(exit)}`)
        if (report.serverError) throw new Error(report.serverError)
        await delay(40)
      }
      throw new Error(`Timeout: ${label}\n${screen()}`)
    }
    async function send(text, paste = false) {
      child.write(paste ? `\u001b[200~${text}\u001b[201~` : text); await delay(120); child.write('\r')
    }
    async function stop() {
      await send('/exit')
      const deadline = Date.now() + 5000
      while (!exit && Date.now() < deadline) await delay(40)
      assert.equal(exit?.exitCode, 0)
      await writes
      assert.doesNotMatch(raw, /ZodError|连接已断开|正在重连|cannot get property .* without inject/u)
      return { exitCode: exit.exitCode, rawBytes: Buffer.byteLength(raw) }
    }
    return { screen, snapshot, busy, wait, send, stop, write: text => child.write(text), alive: () => !exit,
      dispose: () => { if (!exit) child.kill(); terminal.dispose() } }
  }
  return { root, home, workspace, official, report, env, save, result, install, open }
}
