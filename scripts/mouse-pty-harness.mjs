#!/usr/bin/env node

/**
 * Opt-in PTY mouse harness. Not part of `pnpm test`.
 *
 * PowerShell: set DSH_BIN + SEEKTTY_SPEC, then $env:SEEKTTY_MOUSE_PTY='1'; pnpm test:mouse-pty
 * Lifecycle: $env:SEEKTTY_MOUSE_PTY_CYCLES='100'; $env:SEEKTTY_MOUSE_PTY='1'; pnpm test:mouse-pty
 *
 * Injects SGR mouse events into a real PTY. This is not equivalent to GUI mouse tests.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import crossSpawn from 'cross-spawn'

const root = resolve(import.meta.dirname, '..')

if (process.env.SEEKTTY_MOUSE_PTY !== '1') {
  process.stdout.write('skip: set SEEKTTY_MOUSE_PTY=1 to run opt-in PTY mouse tests\n')
  process.exit(0)
}

const cycles = Math.max(1, Number.parseInt(process.env.SEEKTTY_MOUSE_PTY_CYCLES ?? '1', 10) || 1)
const fromEnv = process.env.DSH_BIN?.trim()
const dsh = fromEnv
  || (crossSpawn.sync('dsh', ['--version'], { encoding: 'utf8' }).status === 0 ? 'dsh' : '')
const pluginSpec = process.env.SEEKTTY_SPEC?.trim() ?? ''

if (dsh === '') {
  process.stderr.write('SEEKTTY_MOUSE_PTY=1 requires DSH_BIN or dsh on PATH\n')
  process.exit(2)
}
if (pluginSpec === '') {
  process.stderr.write('SEEKTTY_MOUSE_PTY=1 requires SEEKTTY_SPEC pointing to the candidate tarball\n')
  process.exit(2)
}

const CSI = '\u001B['
const sgr = (button, col, row, motion = false, release = false) => {
  const cb = (motion ? 32 : 0) + button
  const final = release ? 'm' : 'M'
  return `${CSI}<${cb};${col};${row}${final}`
}

function encodeWheelUp(col = 4, row = 4) {
  return `${CSI}<64;${col};${row}M`
}

function encodeFocus(focused) {
  return focused ? `${CSI}I` : `${CSI}O`
}

async function openPty(command, args, env, cols, rows) {
  try {
    const pty = await import('node-pty')
    const session = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: root,
      env,
    })
    return {
      write(data) { session.write(data) },
      resize(nextCols, nextRows) { session.resize(nextCols, nextRows) },
      kill(signal) { process.platform === 'win32' ? session.kill() : session.kill(signal) },
      onData(listener) { session.onData(listener) },
      onExit(listener) { session.onExit(({ exitCode, signal }) => listener(exitCode, signal)) },
    }
  } catch {
    /* fall through to POSIX python PTY */
  }
  if (process.platform === 'win32') {
    throw new Error('Windows PTY requires node-pty when SEEKTTY_MOUSE_PTY=1')
  }
  return pythonPty(command, args, env, cols, rows)
}

function ptyLaunch(args, home) {
  if (process.platform !== 'win32') return { command: dsh, args }
  const shell = process.env.ComSpec?.trim() || 'cmd.exe'
  const launcher = join(home, 'seektty-pty-launch.cmd')
  const executable = dsh.replaceAll('%', '%%').replaceAll('"', '""')
  const commandArgs = args.map(value => `"${value.replaceAll('%', '%%').replaceAll('"', '""')}"`).join(' ')
  writeFileSync(launcher, `@echo off\r\ncall "${executable}" ${commandArgs}\r\nexit /b %ERRORLEVEL%\r\n`)
  return { command: shell, args: ['/d', '/s', '/c', launcher] }
}

function installCandidate(home, environment) {
  const install = crossSpawn.sync(dsh, ['plugin', '--profile', 'tui', 'add', pluginSpec], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (install.error) throw install.error
  if (install.status !== 0) {
    throw new Error(`candidate install failed (${String(install.status)})\n${install.stdout}\n${install.stderr}`)
  }
  const manifestPath = join(home, 'profiles', 'tui', 'package.json')
  if (!existsSync(manifestPath)) throw new Error('candidate install did not create the tui Profile manifest')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.dependencies?.seektty === undefined || !manifest.dsh?.profile?.bundles?.includes('seektty')) {
    throw new Error('isolated tui Profile does not contain the packaged SeekTTY bundle')
  }
}

function pythonPty(command, args, env, cols, rows) {
  const wrapper = join(mkdtempSync(join(tmpdir(), 'seektty-mouse-pty-')), 'pty.py')
  writeFileSync(wrapper, `
import os, pty, select, signal, struct, sys, fcntl, termios
cols, rows = ${cols}, ${rows}
pid, fd = pty.fork()
if pid == 0:
    os.environ.update(${JSON.stringify(env)})
    os.execvpe(${JSON.stringify(command)}, ${JSON.stringify([command, ...args])}, os.environ)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
def pump():
    while True:
        readable, _, _ = select.select([fd, sys.stdin.fileno()], [], [])
        if fd in readable:
            chunk = os.read(fd, 8192)
            if not chunk:
                break
            os.write(sys.stdout.fileno(), chunk)
        if sys.stdin.fileno() in readable:
            chunk = os.read(sys.stdin.fileno(), 8192)
            if not chunk:
                break
            os.write(fd, chunk)
try:
    pump()
finally:
    os.close(fd)
    os.waitpid(pid, 0)
`)
  const child = spawn('python3', [wrapper], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return {
    write(data) { child.stdin.write(data) },
    resize() { /* python wrapper is a smoke PTY; SIGWINCH covered in the node-pty path */ },
    kill(signal) { child.kill(signal) },
    onData(listener) { child.stdout.on('data', chunk => listener(String(chunk))) },
    onExit(listener) { child.on('exit', (code, signal) => listener(code ?? 1, signal)) },
  }
}

function collect(session) {
  let output = ''
  session.onData(chunk => { output += chunk })
  return {
    text: () => output,
    waitFor(pattern, ms = 15_000, since = 0) {
      const started = Date.now()
      return new Promise((resolveWait, reject) => {
        const timer = setInterval(() => {
          if (pattern.test(output.slice(since))) {
            clearInterval(timer)
            resolveWait()
          } else if (Date.now() - started > ms) {
            clearInterval(timer)
            reject(new Error(`timed out waiting for ${pattern}\n${output.slice(-2_000)}`))
          }
        }, 50)
      })
    },
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

async function oneCycle(index, home, env) {
  const launch = ptyLaunch(['--profile', 'tui'], home)
  const session = await openPty(launch.command, launch.args, env, 80, 24)
  const log = collect(session)
  let exited = false
  const finished = new Promise((resolveExit) => {
    session.onExit((code, signal) => {
      exited = true
      resolveExit({ code, signal })
    })
  })
  try {
    // ConPTY may consume DEC mouse-mode writes instead of forwarding them to
    // the captured output. The isolated manifest above proves the package;
    // SeekTTY's OSC title proves that exact bundle reached its interactive UI.
    await log.waitFor(/\]0;seektty/u, 20_000)
    await log.waitFor(/API Key|输入消息|Type a message/u, 20_000)
    session.write('\u001B')
    await delay(100)
    // Exercise the packed slash-completion path without a Provider request:
    // an exact /help candidate survives Down wrapping and Enter opens Help.
    session.write('/help')
    await delay(250)
    session.write('\u001B[B')
    session.write('\r')
    await log.waitFor(/键位速查|Keyboard shortcuts/u, 10_000)
    session.write('\u001B')
    await delay(100)
    // Exercise the packaged transient popup, outside-left dismissal and outside-right replacement.
    // These gestures do not select a menu action or make a Provider request.
    for (const [col, row] of [[10, 6], [65, 18]]) {
      const since = log.text().length
      session.write(sgr(2, col, row))
      session.write(sgr(2, col, row, false, true))
      await log.waitFor(/文本操作|Text actions/u, 10_000, since)
    }
    session.write(sgr(0, 2, 2))
    session.write(sgr(0, 2, 2, false, true))
    await delay(100)
    const openContextMenu = async () => {
      const since = log.text().length
      session.write(sgr(2, 10, 6))
      session.write(sgr(2, 10, 6, false, true))
      await log.waitFor(/文本操作|Text actions/u, 10_000, since)
    }
    await openContextMenu()
    session.write(encodeWheelUp(10, 6))
    await delay(100)
    // Reopening at the same point would be an ignored inside-right-click if
    // the previous gesture had left the popup open.
    await openContextMenu()
    session.write(sgr(0, 10, 6) + sgr(0, 18, 8, true) + sgr(0, 18, 8, false, true))
    await delay(100)
    await openContextMenu()
    session.write(sgr(2, 10, 6) + sgr(2, 30, 10, true))
    await delay(100)
    const sinceRelease = log.text().length
    session.write(sgr(2, 45, 12, false, true))
    await log.waitFor(/文本操作|Text actions/u, 10_000, sinceRelease)
    session.write(sgr(0, 2, 2) + sgr(0, 2, 2, false, true))
    await delay(100)
    session.write(encodeWheelUp())
    session.write(encodeWheelUp())
    session.write(sgr(0, 10, 6))
    session.write(sgr(0, 18, 8, true))
    session.write(sgr(0, 18, 8, false, true))
    session.write(sgr(0, 80, 8))
    session.write(sgr(0, 80, 12, true))
    session.write(sgr(0, 80, 12, false, true))
    session.write('/')
    session.write(encodeWheelUp(20, 10))
    session.write(sgr(0, 22, 12))
    session.write(sgr(0, 22, 12, false, true))
    session.resize(100, 32)
    session.write(encodeWheelUp(4, 4))
    session.write(encodeFocus(false))
    session.write(encodeFocus(true))
    session.write(sgr(0, 10, 6))
    session.write(sgr(0, 10, 6, false, true))
    await delay(300)
    if (index % 3 === 2 && process.platform !== 'win32') {
      session.kill('SIGTERM')
    } else {
      session.write('\u001B')
      await delay(100)
      const beforeExit = log.text().length
      for (let press = 0; press < 3; press += 1) {
        // Once TUI restoration starts, another Ctrl+C can hit cmd.exe instead
        // of dsh and leave Windows waiting at "Terminate batch job (Y/N)?".
        if (exited || /\?1004l|\?1049l/u.test(log.text().slice(beforeExit))) break
        session.write('\u0003')
        await delay(100)
      }
    }
    const result = await Promise.race([
      finished,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`exit timeout\n${log.text().slice(-2_000)}`)), 20_000)
      }),
    ])
    const text = log.text()
    if (!/\?1004l|\?1049l|headless|TTY/u.test(text) && result.code !== 0 && result.signal == null) {
      throw new Error(`restore markers missing\n${text.slice(-1_500)}`)
    }
    return { result, bytes: text.length }
  } finally {
    if (!exited) {
      try { session.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
}

const home = mkdtempSync(join(tmpdir(), 'seektty-mouse-pty-home-'))
const env = {
  ...process.env,
  DSH_HOME: home,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  NO_COLOR: '',
  SEEKTTY_UPDATE: 'off',
}
const results = []
try {
  installCandidate(home, env)
  for (let index = 0; index < cycles; index += 1) {
    results.push(await oneCycle(index, home, env))
  }
} finally {
  rmSync(home, { recursive: true, force: true })
}

const report = `${JSON.stringify({
  schema: 1,
  script: 'scripts/mouse-pty-harness.mjs',
  cycles,
  pty: true,
  contextMenus: true,
  contextMenuGestures: true,
  guiEquivalent: false,
  urlLaunchCount: 0,
  results: results.map(entry => ({
    bytes: entry.bytes,
    code: entry.result.code,
    signal: entry.result.signal,
  })),
}, null, 2)}\n`
await new Promise(resolveWrite => { process.stdout.write(report, resolveWrite) })
// node-pty can retain an idle ConPTY addon handle after the child has exited.
// All child results and cleanup are complete at this point, so finish the
// standalone harness only after its JSON report has flushed.
process.exit(0)
