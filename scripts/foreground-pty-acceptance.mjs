#!/usr/bin/env node

// Opt-in packaged UI acceptance. Uses an isolated, keyless Harness home only.
// DSH_BIN: official CLI shim; DSH_ENTRY: its lib/bin.js; SEEKTTY_SPEC: local tgz.
import assert from 'node:assert/strict'
import { spawn as spawnProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'

const { DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC } = process.env
const useTmux = process.env.SEEKTTY_TEST_TMUX === '1'
assert(DSH_BIN && DSH_ENTRY && SEEKTTY_SPEC, 'Set DSH_BIN, DSH_ENTRY and SEEKTTY_SPEC')
const home = mkdtempSync(join(tmpdir(), 'seektty-foreground-pty-'))
const env = { ...process.env, DSH_HOME: home, SEEKTTY_UPDATE: 'off', TERM: 'xterm' }
for (const key of ['NO_COLOR', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION', 'TMUX']) delete env[key]
const installed = crossSpawn.sync(DSH_BIN, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', SEEKTTY_SPEC], {
  env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
})
assert.equal(installed.status, 0, installed.stderr)
const settings = () => readFileSync(join(home, 'settings.yaml'), 'utf8')
const saved = expected => {
  try { return Object.entries(expected).every(([key, value]) => new RegExp(`${key}: ['"]?${value}`, 'u').test(settings())) }
  catch { return false }
}

async function openPty(command, args, options) {
  try {
    const { spawn } = await import(process.env.SEEKTTY_NODE_PTY?.trim() || 'node-pty')
    return spawn(command, args, options)
  } catch (error) {
    if (process.platform === 'win32') throw error
  }
  const wrapperRoot = mkdtempSync(join(tmpdir(), 'seektty-native-python-pty-'))
  const wrapper = join(wrapperRoot, 'native_pty_runner.py')
  writeFileSync(wrapper, `
import os, pty, select, struct, sys, fcntl, termios
pid, fd = pty.fork()
if pid == 0:
    os.environ.update(${JSON.stringify(options.env)})
    os.chdir(${JSON.stringify(options.cwd)})
    os.execvpe(${JSON.stringify(command)}, ${JSON.stringify([command, ...args])}, os.environ)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ${options.rows}, ${options.cols}, 0, 0))
while True:
    readable, _, _ = select.select([fd, sys.stdin.fileno()], [], [])
    if fd in readable:
        try: chunk = os.read(fd, 8192)
        except OSError: break
        if not chunk: break
        os.write(sys.stdout.fileno(), chunk)
    if sys.stdin.fileno() in readable:
        chunk = os.read(sys.stdin.fileno(), 8192)
        if not chunk: break
        os.write(fd, chunk)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`)
  const child = spawnProcess('python3', [wrapper], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return {
    write: data => child.stdin.write(data),
    resize: () => undefined,
    kill: () => child.kill(),
    onData: listener => {
      child.stdout.on('data', chunk => listener(String(chunk)))
      child.stderr.on('data', chunk => listener(String(chunk)))
    },
    onExit: listener => child.on('exit', (code, signal) => listener({ exitCode: code ?? 1, signal })),
  }
}

async function cycle(restarted) {
  const socket = `seektty-foreground-${process.pid}-${Number(restarted)}`
  const executable = useTmux ? 'tmux' : process.execPath
  const args = [DSH_ENTRY, '--profile', 'tui', '--cwd', home]
  const child = await openPty(executable, useTmux
    ? ['-L', socket, '-f', '/dev/null', 'new-session', '-s', 'foreground', process.execPath, ...args]
    : args, {
    env: restarted ? { ...env, COLORTERM: 'truecolor' } : env,
    name: 'xterm', cols: 120, rows: 36, cwd: home,
  })
  let output = ''
  let exited = false
  const finished = new Promise(resolve => child.onExit(event => { exited = true; resolve(event) }))
  child.onData(chunk => { output += chunk })
  const plain = text => text.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gu, '').replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/gu, '')
  async function waitFor(test, label) {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (test()) return
      if (exited) break
      await delay(50)
    }
    throw new Error(`Timed out: ${label}\n${plain(output).slice(-2000)}`)
  }
  async function command(value) {
    child.write(value)
    await delay(150)
    child.write('\r')
    // Let the atomic settings transaction close before polling settings.yaml;
    // opening it continuously can race Windows replacement-file rename.
    await delay(350)
  }
  try {
    await waitFor(() => /API [Kk]ey|Configure a model Provider|配置模型|输入消息|Type a message|Enter a message/u.test(plain(output)), 'composer')
    child.write('\u001B')
    await delay(200)
    if (!useTmux && process.platform !== 'win32') {
      if (restarted) assert(!output.includes('\u001B[?1049h'), 'persisted native startup must stay on the main screen')
      else assert(output.includes('\u001B[?1049h'), 'default full startup must enter the alternate screen')
    }
    // tmux performs its own outer-terminal color probes, independently of the
    // application. Only a direct PTY attributes OSC bytes to SeekTTY itself.
    if (restarted && !useTmux) {
      assert(!output.includes('\u001B]11;'), 'RGB + fill startup with sync off must not query/recolor the background')
      assert(output.includes('\u001B[48;2;9;14;27m'), 'persisted theme canvas fill must paint on startup')
    }
    let since = output.length
    for (const [name, marker] of [
      ['colors', /原色 RGB|Original RGB/u],
      ['fill', /主题铺底|Theme fill/u],
      ['sync', /终端背景同步|Terminal background sync/u],
    ]) {
      since = output.length
      await command(`/theme ${name}`)
      await waitFor(() => marker.test(plain(output.slice(since))), `${name} editor`)
      child.write('\u001B')
      await delay(150)
    }
    since = output.length
    if (restarted) {
      await command('/theme background explicit')
      await waitFor(() => saved({ backgroundMode: 'explicit', colorMode: 'auto', backgroundFill: 'theme', terminalBackgroundSync: 'theme' }), 'legacy recovery clears independent overrides')
    } else {
      for (const [commandText, expected] of [
        ['sync off', { terminalBackgroundSync: 'off' }],
        ['colors rgb', { colorMode: 'rgb', terminalBackgroundSync: 'off' }],
        ['fill theme', { colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' }],
      ]) {
        await command(`/theme ${commandText}`)
        await waitFor(() => saved(expected), `saved ${commandText}`)
      }
      if (!useTmux) {
        await waitFor(() => output.slice(since).includes('\u001B[48;2;9;14;27m'), 'RGB canvas fill without OSC sync')
        assert(!output.slice(since).includes('\u001B]11;'), 'independent controls must not enable OSC synchronization')
      }
    }
    // A higher-priority onboarding notice may hide the transient save toast.
    // Assert authoritative persistence plus the newly painted frame instead.
    // The outer tmux renderer may quantize RGB; exact application SGR is tested
    // separately. Do not confuse multiplexer encoding with the saved policy.
    if (!restarted && !useTmux) await waitFor(() => output.slice(since).includes('\u001B[38;2;'), 'RGB frame after opting in')
    since = output.length
    if (restarted) {
      await command('/mouse full')
      await waitFor(() => saved({ mouseMode: 'full' }), 'restored full interaction mode')
      if (!useTmux && process.platform !== 'win32') assert(output.slice(since).includes('\u001B[?1049h'), 'native-to-full switch must enter the alternate screen')
    } else {
      await command('/mouse native')
      await waitFor(() => saved({ mouseMode: 'native' }), 'saved terminal native mode')
      if (!useTmux && process.platform !== 'win32') {
        assert(output.slice(since).includes('\u001B[?1049l'), 'full-to-native switch must return to the main screen')
        assert(!output.slice(since).includes('\u001B[2J'), 'native switch must not clear terminal history')
        assert(!output.slice(since).includes('\u001B[3J'), 'native switch must not clear terminal scrollback')
      }
      child.resize(82, 12)
      await delay(750)
      since = output.length
      await command('/transcript replay')
      await waitFor(() => /手动回放|Manual transcript replay/u.test(plain(output.slice(since))), 'manual native transcript replay marker')
      if (!useTmux && process.platform !== 'win32') {
        assert(!output.slice(since).includes('\u001B[?1049h'), 'native replay must remain on the main screen')
        assert(!output.slice(since).includes('\u001B[2J'), 'native replay must not clear the terminal screen')
        assert(!output.slice(since).includes('\u001B[3J'), 'native replay must not clear terminal scrollback')
      }
      await command('/mouse full')
      await waitFor(() => saved({ mouseMode: 'full' }), 'temporary full-mode toggle')
      await delay(500)
      since = output.length
      await command('/mouse native')
      await waitFor(() => saved({ mouseMode: 'native' }), 'native-mode return without replay')
      await delay(500)
      if (!useTmux) {
        const returned = plain(output.slice(since))
        assert(!/SeekTTY:\s+1\.2\.5/u.test(returned), 'returning to the same native buffer must not replay the welcome/history')
      }
    }
    child.write('\u0003')
    await delay(150)
    if (!exited) child.write('\u0003')
    const result = await Promise.race([finished, delay(10_000).then(() => { throw new Error('exit timeout') })])
    assert.equal(result.exitCode, 0, plain(output).slice(-3000))
    console.log(JSON.stringify({ cycle: restarted ? 'persisted-start-and-recovery' : 'manual-opt-in', tmux: useTmux, bytes: output.length, exitCode: result.exitCode }))
  } finally {
    // Only the test-owned isolated process can be terminated by this harness.
    if (!exited) child.kill()
    if (useTmux) crossSpawn.sync('tmux', ['-L', socket, 'kill-server'], { env, stdio: 'ignore' })
  }
}

try {
  await cycle(false)
  await cycle(true)
  console.log(`Packaged rendering and native-scrollback UI acceptance passed; isolated artifacts: ${home}`)
  // node-pty's ConPTY worker can retain handles after all test children exit.
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
