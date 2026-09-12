#!/usr/bin/env node
// Opt-in fault injection through a real packaged TTY and an isolated native
// dsh home. No personal credentials or external model endpoints are inherited.
// Inputs: DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC (immutable local candidate tarball).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import xterm from '@xterm/headless'

const { DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC } = process.env
// Optional official xterm addon for modern emoji/grapheme display evidence.
// Without it the bundled headless emulator uses Unicode 6; data assertions
// still apply, but that legacy renderer can wrap composite emoji differently.
const unicodeAddon = process.env.SEEKTTY_QA_UNICODE_ADDON
  ? createRequire(import.meta.url)(process.env.SEEKTTY_QA_UNICODE_ADDON)
  : undefined
assert(DSH_BIN && DSH_ENTRY && SEEKTTY_SPEC, 'Set DSH_BIN, DSH_ENTRY and SEEKTTY_SPEC')
assert.equal(realpathSync(DSH_BIN), realpathSync(DSH_ENTRY))
const official = createRequire(realpathSync(DSH_ENTRY))
const exporter = createRequire(official.resolve('@deepseek-ai/dsh-session-log-export'))
const { unzipSync, strFromU8 } = exporter('fflate')
const cli = JSON.parse(readFileSync(join(dirname(realpathSync(DSH_ENTRY)), '..', 'package.json'), 'utf8'))
assert.equal(cli.name, '@deepseek-ai/dsh')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'seektty-native-faults-')))
const home = join(root, 'home'), workspace = join(root, 'workspace')
mkdirSync(home); mkdirSync(workspace)
const report = {
  root, home, workspace, candidate: resolve(SEEKTTY_SPEC),
  candidateSha256: createHash('sha256').update(readFileSync(SEEKTTY_SPEC)).digest('hex'),
  cli: realpathSync(DSH_ENTRY), cliVersion: cli.version,
  startedAt: new Date().toISOString(), cases: [],
}
const save = () => writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
const result = (name, status, detail = {}) => {
  report.cases.push({ name, status, ...detail }); save()
  console.log(JSON.stringify(report.cases.at(-1)))
}
console.log(JSON.stringify({ evidenceDirectory: root }))
const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'SystemRoot', 'ComSpec', 'PATHEXT']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off', TERM: 'xterm-256color', SEEKTTY_FAULT_KEY: 'local-fixture-only' })
const requests = [], toolResults = [], aborted = new Set()
const submitted = new Map()
const faultNames = new Set(['http401', 'http429', 'http500', 'malformed', 'cutstream'])
let count = 0
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return }
    const chunks = []; for await (const bytes of req) chunks.push(bytes)
    // A UTF-8 character can span HTTP chunks; decode only after concatenation.
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const userIndex = data.messages?.findLastIndex(message => message.role === 'user' && /QA\[[\w-]+\]/u.test(JSON.stringify(message.content))) ?? -1
    const user = data.messages?.[userIndex]?.content
    const userText = typeof user === 'string' ? user : (user ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')
    const scenario = [...userText.matchAll(/QA\[([\w-]+)\]/gu)].at(-1)?.[1] ?? 'title'
    const main = Boolean(data.tools?.length)
    const nativeResults = data.messages?.slice(userIndex + 1).filter(message => message.role === 'tool') ?? []
    const n = ++count
    const record = { n, scenario, main, model: data.model, stream: data.stream, userText, messages: data.messages?.length }
    requests.push(record); appendFileSync(join(root, 'requests.jsonl'), JSON.stringify(record) + '\n')
    if (nativeResults.length) {
      const record = { n, scenario, results: nativeResults }
      toolResults.push(record); appendFileSync(join(root, 'tool-results.jsonl'), JSON.stringify(record) + '\n')
    }
    let complete = false
    res.on('close', () => { if (!complete) aborted.add(n) })
    if (main && /^http\d+$/u.test(scenario)) {
      complete = true
      res.writeHead(Number(scenario.slice(4)), { 'content-type': 'application/json', 'retry-after': '0' })
      res.end(JSON.stringify({ error: { message: `FIXTURE_${scenario.toUpperCase()}`, type: 'fixture_error', code: scenario } })); return
    }
    if (main && scenario === 'malformed') {
      complete = true
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('data: {"choices": [THIS_IS_INVALID_JSON}\n\ndata: [DONE]\n\n'); return
    }
    const content = main ? `DONE_${scenario}` : 'Native fault acceptance'
    if (!data.stream) {
      complete = true; res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ id: `fault-${n}`, object: 'chat.completion', created: 1, model: data.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } })); return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const emit = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({ id: `fault-${n}`, object: 'chat.completion.chunk', created: 1, model: data.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n')
    emit({ role: 'assistant' })
    if (main && scenario === 'cutstream') {
      emit({ content: 'FAULT_PARTIAL_STREAM' }); await delay(200); res.destroy(); return
    }
    if (main && ['toolerror', 'badtoolargs'].includes(scenario) && nativeResults.length === 0) {
      assert(data.tools.some(tool => tool.function?.name === 'read'))
      emit({ reasoning_content: 'Exercise the native tool error contract.' })
      emit({ tool_calls: [{ index: 0, id: `fault-call-${n}`, type: 'function', function: { name: 'read', arguments: scenario === 'toolerror' ? JSON.stringify({ file_path: join(workspace, 'does-not-exist.txt') }) : '{"file_path":' } }] })
      emit({}, 'tool_calls')
    } else if (main && /^(?:cancel\d+|queue-hold|steer-hold)$/u.test(scenario)) {
      emit({ content: `PARTIAL_${scenario}` })
      const turns = scenario.startsWith('cancel') ? 100 : 10
      for (let index = 0; index < turns; index++) {
        await delay(180); if (res.destroyed) return
        emit({ content: '.' })
      }
      emit({ content: ` ${content}` }); emit({}, 'stop')
    } else {
      emit({ content: content.slice(0, 5) }); await delay(80)
      if (res.destroyed) return
      emit({ content: content.slice(5) }); emit({}, 'stop')
    }
    complete = true; res.end('data: [DONE]\n\n')
  } catch (error) {
    report.serverError = String(error.stack ?? error); save()
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

function openPty(label, id) {
  const terminal = new xterm.Terminal({ cols: 120, rows: 40, allowProposedApi: true, scrollback: 10_000 })
  if (unicodeAddon) terminal.loadAddon(new unicodeAddon.UnicodeGraphemesAddon())
  report.terminalUnicodeVersion = terminal.unicode.activeVersion
  const child = spawn(process.execPath, [DSH_ENTRY, '--profile', 'tui', ...(id ? ['--resume', id] : [])], { cwd: workspace, cols: 120, rows: 40, name: 'xterm-256color', env })
  let exit, raw = '', writes = Promise.resolve()
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
  // Session activity is rendered in the first-row header. Matching the whole
  // transcript could mistake quoted help/user content for an active spinner.
  const busy = () => /生成中|Ctrl\+C (?:停止|stop)/u.test(screen().split('\n')[0] ?? '')
  async function send(text, paste = false) {
    child.write(paste ? `\u001b[200~${text}\u001b[201~` : text)
    await delay(120); child.write('\r')
  }
  async function reply(name, text = `QA[${name}]`, paste = false) {
    submitted.set(name, text)
    const before = requests.length
    await send(text, paste)
    await wait(() => requests.slice(before).some(r => r.main && r.scenario === name) && screen().includes(`DONE_${name}`) && !busy(), `${name}: reply settled`)
    return requests.slice(before).find(r => r.main && r.scenario === name)
  }
  async function stop() {
    await send('/exit')
    const deadline = Date.now() + 5000
    while (!exit && Date.now() < deadline) await delay(40)
    assert.equal(exit?.exitCode, 0, 'Clean exit expected')
    await writes
    assert.doesNotMatch(raw, /ZodError|连接已断开|正在重连|Connection lost|Reconnecting|cannot get property .* without inject/u)
    return { exitCode: exit.exitCode, rawBytes: Buffer.byteLength(raw) }
  }
  return { screen, snapshot, wait, busy, send, reply, stop, write: data => child.write(data),
    alive: () => exit === undefined, dispose: () => { if (!exit) child.kill(); terminal.dispose() } }
}

let pty
async function test(name, action) {
  try {
    const evidence = await action()
    result(name, 'passed', { screen: pty?.snapshot(name), ...evidence })
    return true
  } catch (error) {
    result(name, 'failed', { error: String(error.stack ?? error), screen: pty?.snapshot(`${name}-failed`) })
    // Preserve the failure, then return the test-owned UI to the composer so
    // one failed overlay assertion cannot contaminate later independent cases.
    if (pty?.alive()) {
      if (pty.busy()) { pty.write('\u0003'); await delay(250) }
      pty.write('\u001b'); await delay(100); pty.write('\u001b\u0015'); await delay(100)
    }
    return false
  }
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  report.modelEndpoint = `http://127.0.0.1:${server.address().port}/v1`
  writeFileSync(join(home, 'settings.yaml'), `llm-deepseek:\n  apiKeyEnv: SEEKTTY_FAULT_KEY\n  baseURL: ${report.modelEndpoint}\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
  const install = crossSpawn.sync(DSH_BIN, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', resolve(SEEKTTY_SPEC)], { cwd: workspace, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })
  writeFileSync(join(root, 'install.log'), `${install.stdout ?? ''}\n${install.stderr ?? ''}`)
  assert.equal(install.status, 0, install.stderr)
  pty = openPty('faults')
  await pty.wait(() => /输入消息|Type a message|Enter a message/u.test(pty.screen()), 'boot')
  await test('initial-prompt', async () => { await pty.reply('initial') })

  for (const name of faultNames) {
    const before = requests.length
    await test(`${name}-failure-and-recovery`, async () => {
      await pty.send(`QA[${name}]`)
      await pty.wait(() => requests.slice(before).some(r => r.main && r.scenario === name), `${name} reached fixture`)
      const expectedCode = { http401: 'AUTH', http429: 'RATE_LIMIT', http500: 'SERVER', malformed: 'MALFORMED_RESPONSE', cutstream: 'TRANSPORT' }[name]
      await pty.wait(() => !pty.busy() && pty.screen().includes(`QA[${name}]`) && pty.screen().includes(`[${expectedCode}]`), `${name} visible failure`)
      const failureScreen = pty.snapshot(`${name}-visible-failure`)
      assert.equal(requests.slice(before).filter(r => r.main && r.scenario === name).length, 1, 'maxRetries: 0 must prevent automatic retry')
      await pty.reply(`recover-${name}`)
      return { failureScreen, recovery: true }
    })
    if (!pty.alive()) throw new Error(`PTY terminated during ${name}`)
  }

  for (const name of ['toolerror', 'badtoolargs']) {
    await test(`${name}-native-result-and-recovery`, async () => {
      const before = toolResults.length
      await pty.reply(name)
      const records = toolResults.slice(before).filter(record => record.scenario === name)
      assert(records.some(record => record.results.some(r => /Error|error|not found|ENOENT|invalid|Invalid|Unexpected/u.test(r.content))), 'Native tool failure must reach the next model request')
      await pty.reply(`recover-${name}`)
      return { results: join(root, 'tool-results.jsonl') }
    })
  }

  await test('cancel-three-consecutive-generations', async () => {
    const cancelled = []
    for (let i = 1; i <= 3; i++) {
      const name = `cancel${i}`
      await pty.send(`QA[${name}]`)
      await pty.wait(() => pty.screen().includes(`PARTIAL_${name}`), `partial ${name}`)
      const request = requests.findLast(r => r.main && r.scenario === name)
      pty.write('\u0003')
      await pty.wait(() => aborted.has(request.n) && !pty.busy(), `${name} abort settled`)
      cancelled.push(request.n)
    }
    await pty.reply('recover-cancel')
    return { cancelledRequests: cancelled }
  })

  await test('queue-two-followups-without-loss', async () => {
    await pty.send('QA[queue-hold]')
    await pty.wait(() => pty.screen().includes('PARTIAL_queue-hold'), 'queue hold active')
    const before = requests.length
    await pty.send('QA[queue-one]')
    await pty.send('QA[queue-two]')
    await pty.wait(() => requests.slice(before).some(r => r.main && r.userText.includes('QA[queue-one]')) && requests.slice(before).some(r => r.main && r.userText.includes('QA[queue-two]')) && !pty.busy(), 'both queued inputs consumed')
    await pty.send('/queue')
    await pty.wait(() => /当前队列为空|The queue is empty/u.test(pty.screen()), 'queue drained')
    const queueScreen = pty.snapshot('queue-empty'); pty.write('\u001b'); await delay(120)
    await pty.reply('recover-queue')
    return { queueScreen }
  })

  await test('steer-current-generation', async () => {
    await pty.send('QA[steer-hold]')
    await pty.wait(() => pty.screen().includes('PARTIAL_steer-hold'), 'steering hold active')
    const before = requests.length
    await pty.send('/steer QA[steer-followup]')
    await pty.wait(() => requests.slice(before).some(r => r.main && r.userText.includes('QA[steer-followup]')) && pty.screen().includes('DONE_steer-followup') && !pty.busy(), 'native steering consumed')
    await pty.reply('recover-steer')
  })

  await test('switch-native-model-and-request-route', async () => {
    await pty.send('/model')
    await pty.wait(() => /DeepSeek-V4-Pro/u.test(pty.screen()), 'native model choices')
    pty.write('DeepSeek-V4-Pro'); await delay(160); pty.write('\r')
    await pty.wait(() => /─+.*v4-pro/u.test(pty.screen()), 'model selection reflected in active session header')
    pty.write('\u001b'); await delay(120)
    const request = await pty.reply('model-pro')
    assert.equal(request.model, 'deepseek-v4-pro')
    return { model: request.model }
  })

  for (const [name, text] of [
    ['unicode', 'QA[unicode] 中文 👩🏽‍💻 café e\u0301 αβ العربية 🇨🇳'],
    ['multiline', 'QA[multiline]\n/exit\n第二行不是命令\n```js\nconst x = "中文"\n```'],
    ['long-input', `QA[long-input] ${'长输入🔬 abc '.repeat(1800)} END_LONG_INPUT`],
  ]) {
    await test(`${name}-lossless-bracketed-paste`, async () => {
      const request = await pty.reply(name, text, true)
      assert(request.userText.includes(text), 'Native request must contain the exact pasted Unicode/newline content')
      return { characters: text.length, utf8Bytes: Buffer.byteLength(text) }
    })
  }

  let exported
  await test('authoritative-log-failures-queues-and-inputs', async () => {
    await pty.send('/export faults.zip')
    await pty.wait(() => /仅当前会话|Current session only/u.test(pty.screen()), 'export scope')
    pty.write('\r')
    await pty.wait(() => existsSync(join(workspace, 'faults.zip')) && /已保存会话 ZIP|Saved session ZIP/u.test(pty.screen()), 'export durable log')
    const archive = unzipSync(readFileSync(join(workspace, 'faults.zip')))
    const path = Object.keys(archive).find(path => /^session(?:\.v\d+)?\.jsonl$/u.test(path))
    assert(path)
    exported = strFromU8(archive[path]).trim().split('\n').map(JSON.parse)
    writeFileSync(join(root, 'native-events.jsonl'), exported.map(e => JSON.stringify(e)).join('\n') + '\n')
    const interrupted = exported.filter(e => e.type === 'assistant/message' && e.data?.interrupted === true)
    assert(interrupted.length >= 3, 'Each deliberately cancelled partial must be durable')
    for (const name of ['cancel1', 'cancel2', 'cancel3']) assert(interrupted.some(e => JSON.stringify(e.data.message).includes(`PARTIAL_${name}`)))
    const errors = exported.filter(e => e.type === 'turn/end' && e.data?.reason?.kind === 'error').map(e => e.data.reason.error.code)
    for (const code of ['AUTH', 'RATE_LIMIT', 'SERVER', 'MALFORMED_RESPONSE', 'TRANSPORT']) assert(errors.includes(code), `Native log must preserve ${code}`)
    for (const name of ['queue-one', 'queue-two', 'steer-followup']) {
      const messages = exported.filter(e => e.type === 'user/message' && e.data.content?.some(block => block.type === 'text' && block.text === `QA[${name}]`))
      assert.equal(messages.length, 1, `${name} must be committed exactly once`)
    }
    assert.equal(exported.filter(e => e.type === 'tool/result' && e.data.message.content?.[0]?.isError === true).length, 2, 'Both native tool failures must remain marked isError')
    for (const name of ['unicode', 'multiline', 'long-input']) {
      const text = submitted.get(name)
      assert(exported.some(e => e.type === 'user/message' && JSON.stringify(e.data).includes(JSON.stringify(text).slice(1, -1))), `Durable user message must preserve ${name}`)
    }
    pty.write('\u001b'); await delay(120)
    return { log: join(root, 'native-events.jsonl'), events: exported.length, interrupted: interrupted.length, errorCodes: errors }
  })
  await test('exit-and-resume-model-history-recovery', async () => {
    assert(exported, 'Requires an exported native session header')
    const firstExit = await pty.stop(); pty.dispose()
    pty = openPty('resumed', exported[0].id)
    await pty.wait(() => /─+.*v4-pro/u.test(pty.screen()) && !/正在连接 Harness|Connecting to Harness/u.test(pty.screen()), 'resumed native model route')
    const request = await pty.reply('resumed-success')
    assert.equal(request.model, 'deepseek-v4-pro')
    return { firstExit, resumedExit: await pty.stop(), sessionId: exported[0].id }
  })
  report.status = report.cases.some(r => r.status === 'failed') ? 'failed' : 'passed'
  report.requestCount = requests.length
} catch (error) {
  result('harness-completion', 'failed', { error: String(error.stack ?? error), screen: pty?.snapshot('fatal') })
  report.status = 'failed'
} finally {
  pty?.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  report.completedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ status: report.status, report: join(root, 'report.json') }))
  process.exitCode = report.status === 'passed' ? 0 : 1
}
