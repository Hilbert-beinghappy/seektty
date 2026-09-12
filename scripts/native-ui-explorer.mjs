#!/usr/bin/env node
// Interactive QA driver for the packaged TUI. Commands are JSON lines on stdin.
// Owns only a fresh temporary DSH_HOME and a loopback mock model.
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import xterm from '@xterm/headless'

const { DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC } = process.env
assert(DSH_BIN && DSH_ENTRY && SEEKTTY_SPEC, 'Set DSH_BIN, DSH_ENTRY and SEEKTTY_SPEC')
const root = mkdtempSync(join(tmpdir(), 'seektty-user-qa-'))
const home = join(root, 'home'), workspace = join(root, 'workspace')
mkdirSync(home); mkdirSync(workspace)
const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off', TERM: 'xterm-256color', SEEKTTY_UI_QA_KEY: 'fixture-only-not-a-secret' })
let calls = 0
let terminal, pty, reader, exited, failure = false, cleaningUp = false
let writes = Promise.resolve()
let resolveExit
const exitObserved = new Promise(resolve => { resolveExit = resolve })
function fail(error, phase) {
  failure = true
  console.error(JSON.stringify({ error: String(error), phase }))
  reader?.close()
}
const server = createServer(async (req, res) => {
  try {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return }
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8')); calls++
  appendFileSync(join(root, 'requests.jsonl'), JSON.stringify(request) + '\n')
  const reply = '# 用户验收报告\n\n中文与 English，emoji 🐳，组合字符 e\u0301。\n\n| 项目 | 结果 |\n|---|---|\n| 中文 | 正常 |\n| 数字 | 123 |\n\n```typescript\nconst greeting: string = "你好";\nconsole.log(greeting);\n```\n\n```python\ndef hello(name):\n    return f"Hello {name}"\n```\n\n```diff\n- old value\n+ new value\n```\n\n- 第一项\n- 第二项\n\n**粗体**、*斜体*、`inline code`。\n\nUSER_QA_RESPONSE_DONE'
  if (!request.stream) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ id: `qa-${calls}`, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: '用户验收会话' }, finish_reason: 'stop' }] }))
    return
  }
  res.setHeader('content-type', 'text/event-stream')
  const emit = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: `qa-${calls}`, object: 'chat.completion.chunk', model: request.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant', reasoning_content: '先检查中文输入，再展示多语言代码与表格。' })
  for (let i = 0; i < reply.length && !res.destroyed; i += 30) { emit({ content: reply.slice(i, i + 30) }); await delay(35) }
  if (!res.destroyed) { emit({}, 'stop'); res.write('data: [DONE]\n\n'); res.end() }
  } catch (error) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    if (!res.destroyed) res.end(JSON.stringify({ error: 'Local QA fixture failed' }))
    fail(error, 'mock-http')
  }
})
try {
await new Promise((resolve, reject) => {
  const onError = error => { server.off('listening', onListening); reject(error) }
  const onListening = () => { server.off('error', onError); resolve() }
  server.once('error', onError); server.once('listening', onListening)
  server.listen(0, '127.0.0.1')
})
server.on('error', error => fail(error, 'mock-server'))
writeFileSync(join(home, 'settings.yaml'), `llm-deepseek:\n  apiKeyEnv: SEEKTTY_UI_QA_KEY\n  baseURL: http://127.0.0.1:${server.address().port}/v1\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
const installed = crossSpawn.sync(DSH_BIN, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', resolve(SEEKTTY_SPEC)], { env, cwd: workspace, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 })
writeFileSync(join(root, 'install.log'), `${installed.stdout ?? ''}\n${installed.stderr ?? ''}`)
assert.equal(installed.status, 0, installed.stderr)
terminal = new xterm.Terminal({ cols: 100, rows: 32, allowProposedApi: true, scrollback: 10000 })
pty = spawn(process.execPath, [DSH_ENTRY, '--profile', 'tui'], { env, cwd: workspace, cols: 100, rows: 32, name: 'xterm-256color' })
pty.onData(data => { appendFileSync(join(root, 'terminal.raw'), data); writes = writes.then(() => new Promise(resolve => terminal.write(data, resolve))) })
pty.onExit(event => {
  exited = event; resolveExit(event)
  if (!cleaningUp && event.exitCode !== 0) fail(`PTY exited ${event.exitCode}`, 'pty')
})
const screen = () => Array.from({ length: terminal.rows }, (_, i) => terminal.buffer.active.getLine(terminal.buffer.active.viewportY + i)?.translateToString(true, 0, terminal.cols) ?? '').join('\n')
async function snapshot(label) {
  await writes
  if (label) writeFileSync(join(root, `${label.replace(/[^\w-]/gu, '_')}.txt`), screen())
  return { root, screen: screen(), calls, exited, columns: terminal.cols, rows: terminal.rows }
}
await delay(1200)
console.log(JSON.stringify(await snapshot('initial')))
reader = createInterface({ input: process.stdin })
if (failure) throw new Error('The driver failed before accepting actions')
  for await (const line of reader) {
    try {
      const action = JSON.parse(line)
      appendFileSync(join(root, 'actions.jsonl'), JSON.stringify(action) + '\n')
      if (action.resize) { await writes; terminal.resize(...action.resize); pty.resize(...action.resize) }
      if (action.write !== undefined) pty.write(action.write)
      if (action.command !== undefined) { pty.write(action.command); await delay(120); pty.write('\r') }
      await delay(Math.min(action.wait ?? 250, 5000))
      console.log(JSON.stringify(await snapshot(action.label)))
      if (action.close) break
    } catch (error) { fail(error, 'driver-action'); break }
  }
} catch (error) {
  fail(error, 'initialization-or-driver')
} finally {
  cleaningUp = true
  reader?.close()
  if (pty && !exited) {
    pty.kill()
    await Promise.race([exitObserved, delay(2000)])
    if (!exited) {
      pty.kill('SIGKILL')
      await Promise.race([exitObserved, delay(2000)])
      if (!exited) fail('Test-owned PTY did not exit after termination', 'cleanup')
    }
  }
  await writes
  terminal?.dispose()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  process.exitCode = failure ? 1 : 0
  console.log(JSON.stringify({ root, driverClosed: true, failure, exited, verification: 'manual-review-required' }))
}
