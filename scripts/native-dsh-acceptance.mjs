#!/usr/bin/env node

// Opt-in, packaged native API acceptance. All model traffic stays on loopback;
// no personal DSH_HOME, credentials or existing workspace files are read.
// DSH_BIN=official shim DSH_ENTRY=official lib/bin.js SEEKTTY_SPEC=candidate.tgz
// Evidence remains in the printed temporary directory, including on failure.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import crossSpawn from 'cross-spawn'
import { spawn } from 'node-pty'
import xterm from '@xterm/headless'

const { Terminal } = xterm

const { DSH_BIN, DSH_ENTRY, SEEKTTY_SPEC } = process.env
assert(DSH_BIN && DSH_ENTRY && SEEKTTY_SPEC, 'Set DSH_BIN, DSH_ENTRY and SEEKTTY_SPEC')
const officialRequire = createRequire(realpathSync(DSH_ENTRY))
assert.equal(realpathSync(DSH_BIN), realpathSync(DSH_ENTRY), 'DSH_BIN and DSH_ENTRY must identify the same official CLI')
const exportRequire = createRequire(officialRequire.resolve('@deepseek-ai/dsh-session-log-export'))
const { unzipSync, strFromU8 } = exportRequire('fflate')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'seektty-native-acceptance-')))
const home = join(root, 'home')
const workspace = join(root, 'workspace')
mkdirSync(home)
mkdirSync(workspace)
const cliManifest = JSON.parse(readFileSync(join(dirname(realpathSync(DSH_ENTRY)), '..', 'package.json'), 'utf8'))
assert.equal(cliManifest.name, '@deepseek-ai/dsh', 'DSH_ENTRY must belong to the official dsh package')
const report = {
  home, workspace, candidate: resolve(SEEKTTY_SPEC),
  candidateSha256: createHash('sha256').update(readFileSync(SEEKTTY_SPEC)).digest('hex'),
  cli: realpathSync(DSH_ENTRY), cliVersion: cliManifest.version, startedAt: new Date().toISOString(), steps: [],
}
const reportPath = join(root, 'report.json')
const saveReport = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
const pass = (step, evidence = {}) => {
  report.steps.push({ step, status: 'passed', ...evidence })
  saveReport()
  console.log(JSON.stringify({ step, status: 'passed', ...evidence }))
}
console.log(JSON.stringify({ evidenceDirectory: root }))
// Use only OS/process-launch variables. In particular, do not inherit provider
// API keys, endpoint overrides, NODE_OPTIONS, or a personal DSH_HOME.
const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'SystemRoot', 'ComSpec', 'PATHEXT']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, {
  DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off',
  SEEKTTY_NATIVE_FIXTURE_KEY: 'fixture-only-not-a-real-key', TERM: 'xterm-256color',
})

let requestCount = 0
const requests = []
const toolResults = []
const aborted = new Set()
const marker = join(workspace, 'approval-marker.txt')
const scenarios = [
  ['stream fixture', 'LOCAL_STREAM_DONE'],
  ['write tool fixture', 'LOCAL_WRITE_DONE'],
  ['question tool fixture', 'LOCAL_QUESTION_DONE'],
  ['native approval service fixture', 'LOCAL_APPROVAL_DONE'],
  ['subagent tool fixture', 'LOCAL_SUBAGENT_DONE'],
  ['image attachment fixture', 'LOCAL_IMAGE_DONE'],
  ['Return LOCAL_CHILD_FIXTURE', 'LOCAL_CHILD_FIXTURE'],
  ['resume fixture', 'LOCAL_RESUME_DONE'],
]
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404); res.end(); return
    }
    let body = ''
    for await (const bytes of req) body += bytes
    const data = JSON.parse(body)
    const n = ++requestCount
    // Native dsh can append a user-role system reminder after the actual
    // prompt. Select the latest fixture prompt, rather than that reminder.
    const lastUserIndex = data.messages?.findLastIndex(message => message.role === 'user' && [...scenarios.map(([prompt]) => prompt), 'cancel fixture'].some(prompt => JSON.stringify(message.content).includes(prompt))) ?? -1
    const userText = JSON.stringify(data.messages?.[lastUserIndex]?.content ?? '')
    const results = data.messages?.slice(lastUserIndex + 1).filter(message => message.role === 'tool') ?? []
    const scenario = scenarios.find(([prompt]) => userText.includes(prompt))
    const slow = userText.includes('cancel fixture')
    const record = { n, model: data.model, stream: data.stream, messages: data.messages?.length, scenario: slow ? 'cancel fixture' : scenario?.[0] ?? 'title', image: userText.includes('image_url') }
    requests.push(record)
    appendFileSync(join(root, 'requests.jsonl'), JSON.stringify(record) + '\n')
    if (results.length) {
      const record = { n, scenario: scenario?.[0], results }
      toolResults.push(record)
      appendFileSync(join(root, 'tool-results.jsonl'), JSON.stringify(record) + '\n')
    }
    let tool
    if (results.length === 0 && data.stream && data.tools?.length) {
      if (userText.includes('write tool fixture')) tool = { name: 'write', arguments: { file_path: 'native-tool-output.txt', content: 'NATIVE_TOOL_FILE_CONTENT\n' } }
      if (userText.includes('question tool fixture')) tool = { name: 'ask_user_question', arguments: { questions: [{ id: 'fixture-choice', question: 'Choose fixture color', options: [{ label: 'Blue' }, { label: 'Green' }] }] } }
      if (userText.includes('native approval service fixture')) tool = { name: 'fixture_approval', arguments: {} }
      if (userText.includes('subagent tool fixture')) tool = { name: 'subagent', arguments: { description: 'Fixture child reply', prompt: 'Return LOCAL_CHILD_FIXTURE only.', run_in_background: false } }
    }
    const content = data.tools?.length ? scenario?.[1] ?? 'LOCAL_FIXTURE_DONE' : 'Local native acceptance'
    if (!data.stream) {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ id: `fixture-${n}`, object: 'chat.completion', created: 1, model: data.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }))
      return
    }
    let completed = false
    res.on('close', () => { if (!completed) aborted.add(n) })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const emit = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({ id: `fixture-${n}`, object: 'chat.completion.chunk', created: 1, model: data.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n')
    emit({ role: 'assistant' })
    if (tool) {
      assert(data.tools?.some(candidate => candidate.function?.name === tool.name), `Native model catalog did not expose ${tool.name}`)
      emit({ reasoning_content: 'Fixture tool invocation.' })
      emit({ tool_calls: [{ index: 0, id: `fixture-call-${n}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] })
      emit({}, 'tool_calls')
    } else {
      const parts = slow ? ['LOCAL_CANCEL_BEGIN', ...Array(30).fill(' waiting')] : [content.slice(0, 6), content.slice(6, 13), content.slice(13)]
      for (const part of parts) {
        if (res.destroyed) return
        emit({ content: part })
        await delay(slow ? 250 : 120)
      }
      emit({}, 'stop')
    }
    completed = true
    res.end('data: [DONE]\n\n')
  } catch (error) {
    report.serverError = String(error.stack ?? error)
    saveReport()
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

function createPty(label, sessionId) {
  const terminal = new Terminal({ cols: 120, rows: 40, allowProposedApi: true, scrollback: 10_000 })
  const args = [DSH_ENTRY, '--profile', 'tui', '--patch', join(root, 'approval-fixture.patch.yml')]
  if (sessionId) args.push('--resume', sessionId)
  const child = spawn(process.execPath, args, { cwd: workspace, cols: 120, rows: 40, name: 'xterm-256color', env })
  let raw = ''
  let exit
  let writes = Promise.resolve()
  child.onData(chunk => {
    raw += chunk
    appendFileSync(join(root, `${label}.raw`), chunk)
    writes = writes.then(() => new Promise(resolve => terminal.write(chunk, resolve)))
  })
  child.onExit(event => { exit = event })
  const screen = () => {
    const buffer = terminal.buffer.active
    return Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) ?? '').join('\n')
  }
  const snapshot = name => {
    const path = join(root, `${label}-${name}.txt`)
    writeFileSync(path, screen())
    return path
  }
  async function wait(test, description, timeout = 25_000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
      await writes
      if (test()) return
      if (exit) throw new Error(`${description}: PTY exited ${JSON.stringify(exit)}\n${screen()}`)
      if (report.serverError) throw new Error(report.serverError)
      await delay(50)
    }
    snapshot('failure')
    throw new Error(`Timeout: ${description}\n${screen()}`)
  }
  async function command(text) {
    child.write(text)
    await delay(120)
    child.write('\r')
  }
  async function ready() {
    await wait(() => /输入消息|Type a message|Enter a message/u.test(screen()), 'composer ready')
    assert.match(screen(), /标准|Standard|standard/u, 'native standard preset must be selected')
  }
  async function reply(prompt, content, label) {
    const before = requests.length
    await command(prompt)
    await wait(() => requests.length > before && screen().includes(content) && !/生成中|Ctrl\+C (?:停止|stop)/u.test(screen()), `${label} reply settled`)
    pass(label, { screen: snapshot(label) })
  }
  async function close() {
    await command('/exit')
    const until = Date.now() + 10_000
    while (!exit && Date.now() < until) await delay(50)
    assert(exit, 'PTY clean exit timed out')
    assert.equal(exit.exitCode, 0, screen())
    await writes
    assert.doesNotMatch(raw, /ZodError|连接已断开|正在重连|Connection lost|Reconnecting|cannot get property .* without inject/u)
    pass(`${label}-exit`, { exitCode: exit.exitCode, terminalBytes: Buffer.byteLength(raw) })
  }
  return { screen, snapshot, wait, command, ready, reply, close, write: text => child.write(text), dispose: () => { if (!exit) child.kill(); terminal.dispose() } }
}

let pty
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  report.modelEndpoint = `http://127.0.0.1:${port}/v1`
  writeFileSync(join(home, 'settings.yaml'), `llm-deepseek:\n  apiKeyEnv: SEEKTTY_NATIVE_FIXTURE_KEY\n  baseURL: http://127.0.0.1:${port}/v1\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
  const toolsUrl = pathToFileURL(officialRequire.resolve('@deepseek-ai/dsh-tools')).href
  writeFileSync(join(root, 'approval-fixture.mjs'), `import { defineTool } from ${JSON.stringify(toolsUrl)};
import { writeFileSync } from 'node:fs';
export const name = 'seektty-native-approval-fixture';
export const inject = ['tools', 'approval'];
export function apply(ctx) {
  ctx.tools.register(defineTool({ name: 'fixture_approval', description: 'Exercise the isolated native approval fixture.', parameters: {},
    output: { schema: { type: 'object', additionalProperties: false, properties: { outcome: { type: 'string', required: true } } }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(_args, exec) {
      const outcome = await ctx.approval.request({ agent: exec.agent, toolName: 'fixture_approval', callId: exec.callId, reason: 'Create the isolated approval test marker.', signal: exec.signal });
      if (outcome === 'allowed-once') writeFileSync(${JSON.stringify(marker)}, 'APPROVAL_SERVICE_FIXTURE_ONLY\\n');
      return { outcome };
    }
  }));
}
`)
  writeFileSync(join(root, 'approval-fixture.patch.yml'), `- insert:\n    - id: seektty-native-approval-fixture\n      name: ${JSON.stringify(join(root, 'approval-fixture.mjs'))}\n`)
  const install = crossSpawn.sync(DSH_BIN, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', resolve(SEEKTTY_SPEC)], { cwd: workspace, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180_000 })
  writeFileSync(join(root, 'install.log'), `${install.stdout ?? ''}\n${install.stderr ?? ''}`)
  assert.equal(install.status, 0, `Native plugin install failed: ${install.error ?? install.stderr}`)
  pass('native-plugin-install', { log: join(root, 'install.log') })

  pty = createPty('first')
  await pty.ready()
  pass('standard-preset-boot', { screen: pty.snapshot('boot') })
  await pty.reply('stream fixture', 'LOCAL_STREAM_DONE', 'stream')

  await pty.command('cancel fixture')
  await pty.wait(() => pty.screen().includes('LOCAL_CANCEL_BEGIN'), 'cancellable partial response')
  const cancelRequest = requests.findLast(request => request.scenario === 'cancel fixture')
  // Re-enter a running session through the public UI. This checks native
  // full-text search and restoration of the compact assistantStream baseline.
  await pty.command('/new')
  await pty.wait(() => /已打开新会话|Opened a new session/u.test(pty.screen()) && !pty.screen().includes('LOCAL_CANCEL_BEGIN'), 'switch away from running session')
  await pty.command('/resume stream fixture')
  await pty.wait(() => /搜索会话|Search sessions/u.test(pty.screen()) && /Local native acceptance/u.test(pty.screen()), 'find running original session')
  pass('native-session-search', { screen: pty.snapshot('session-search') })
  pty.write('\r')
  await pty.wait(() => pty.screen().includes('LOCAL_CANCEL_BEGIN') && /生成中|Ctrl\+C (?:停止|stop)/u.test(pty.screen()), 'running compact stream restored')
  pass('running-session-baseline', { screen: pty.snapshot('running-baseline') })
  pty.write('\u0003')
  await pty.wait(() => aborted.has(cancelRequest.n) && !/生成中|Ctrl\+C (?:停止|stop)/u.test(pty.screen()), 'native request cancellation')
  pass('cancel', { request: cancelRequest.n, screen: pty.snapshot('cancel') })

  await pty.reply('write tool fixture', 'LOCAL_WRITE_DONE', 'write-tool')
  assert.equal(readFileSync(join(workspace, 'native-tool-output.txt'), 'utf8'), 'NATIVE_TOOL_FILE_CONTENT\n')
  pass('write-tool-file', { path: join(workspace, 'native-tool-output.txt') })

  await pty.command('question tool fixture')
  await pty.wait(() => /Choose fixture color/u.test(pty.screen()) && /Blue/u.test(pty.screen()), 'native question overlay')
  pty.snapshot('question-open')
  pty.write('\r')
  await pty.wait(() => toolResults.some(record => record.scenario === 'question tool fixture' && record.results.some(result => result.content.includes('"selected":["Blue"]'))) && pty.screen().includes('LOCAL_QUESTION_DONE'), 'Blue response reached native tool')
  pass('question-blue', { screen: pty.snapshot('question-blue'), results: join(root, 'tool-results.jsonl') })
  await delay(500)

  for (const allow of [false, true]) {
    const before = toolResults.length
    await pty.command('native approval service fixture')
    await pty.wait(() => /Create the isolated approval test marker/u.test(pty.screen()) && /仅本次允许|Allow once/u.test(pty.screen()), 'native approval overlay')
    assert(!existsSync(marker), 'Native tool must not write the marker before explicit approval')
    assert.match(pty.screen(), /→\s+(?:拒绝|Reject)/u, 'Approval overlay must default to rejection')
    pty.snapshot(allow ? 'approval-before-allow' : 'approval-before-reject')
    if (allow) pty.write('\u001b[A')
    await delay(120)
    pty.write('\r')
    const outcome = allow ? 'allowed-once' : 'rejected'
    await pty.wait(() => toolResults.slice(before).some(record => record.results.some(result => result.content.includes(`"outcome":"${outcome}"`))) && !/生成中|Ctrl\+C (?:停止|stop)/u.test(pty.screen()), `native approval ${outcome}`)
    assert.equal(existsSync(marker), allow)
    if (allow) assert.equal(readFileSync(marker, 'utf8'), 'APPROVAL_SERVICE_FIXTURE_ONLY\n')
    pass(`approval-${outcome}`, { screen: pty.snapshot(`approval-${outcome}`) })
  }

  await pty.reply('subagent tool fixture', 'LOCAL_SUBAGENT_DONE', 'subagent')
  assert(toolResults.some(record => record.scenario === 'subagent tool fixture' && record.results.some(result => result.content.includes('LOCAL_CHILD_FIXTURE'))), 'Native child reply must reach its parent tool result')
  pass('subagent-child-result', { results: join(root, 'tool-results.jsonl') })

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64')
  writeFileSync(join(workspace, 'tiny.png'), png)
  await pty.command('/attach tiny.png')
  await pty.wait(() => /(?:待发送|Pending).*tiny\.png/u.test(pty.screen()), 'image draft')
  pty.snapshot('image-draft')
  await pty.reply('image attachment fixture', 'LOCAL_IMAGE_DONE', 'image-send')
  assert(requests.some(request => request.scenario === 'image attachment fixture' && request.image), 'Uploaded image must appear in the native model request')
  pass('image-model-request', { requests: join(root, 'requests.jsonl') })
  await pty.command('/attachments')
  await pty.wait(() => /没有待发送图片|No pending images/u.test(pty.screen()), 'sent image removed from draft')
  pass('image-draft-cleared', { screen: pty.snapshot('image-draft-cleared') })
  pty.write('\u001b')
  await delay(150)

  await pty.command('/files')
  await pty.wait(() => /native-tool-output\.txt/u.test(pty.screen()), 'produced files overlay')
  pass('produced-files', { screen: pty.snapshot('produced-files') })
  pty.write('\u001b')
  await delay(150)
  const markdownPath = join(workspace, 'session.md')
  await pty.command('/export md session.md')
  await pty.wait(() => existsSync(markdownPath), 'Markdown export')
  const markdown = readFileSync(markdownPath, 'utf8')
  for (const text of ['stream fixture', 'LOCAL_STREAM_DONE', 'LOCAL_WRITE_DONE', 'LOCAL_IMAGE_DONE']) assert(markdown.includes(text), `Markdown must contain ${text}`)
  pass('markdown-export', { path: markdownPath })
  await delay(200)
  const zipPath = join(workspace, 'session-with-children.zip')
  await pty.command('/export session-with-children.zip')
  await pty.wait(() => /当前会话与子 Agent|Current session and subagents/u.test(pty.screen()), 'ZIP descendant selection')
  pty.write('\u001b[B')
  await delay(120)
  pty.write('\r')
  await pty.wait(() => existsSync(zipPath) && /已保存会话 ZIP|Saved session ZIP/u.test(pty.screen()), 'ZIP export committed')
  const archive = unzipSync(readFileSync(zipPath))
  const entries = Object.keys(archive)
  const rootLog = entries.find(path => /^session(?:\.v\d+)?\.jsonl$/u.test(path))
  const childLogs = entries.filter(path => /^subagents\/[^/]+\/session(?:\.v\d+)?\.jsonl$/u.test(path))
  assert(rootLog, 'ZIP must contain the official logical root session log')
  assert(childLogs.length >= 1, 'ZIP must include the native child session')
  const imagePath = entries.find(path => /^media\/.*\.png$/u.test(path))
  assert(imagePath, 'ZIP must contain the attached PNG')
  assert.deepEqual(Buffer.from(archive[imagePath]), png)
  const events = strFromU8(archive[rootLog]).trim().split('\n').map(line => JSON.parse(line))
  const header = events[0]
  assert.equal(header.agentPreset, 'standard')
  assert(childLogs.some(path => strFromU8(archive[path]).includes('LOCAL_CHILD_FIXTURE')))
  assert(events.some(event => event.type === 'assistant/message' && event.data?.interrupted === true), 'Cancelled partial must be preserved as an interrupted assistant message')
  pass('native-zip-export', { path: zipPath, entries, sessionId: header.id, screen: pty.snapshot('zip') })
  pty.write('\u001b')
  await delay(150)
  await pty.close()
  pty.dispose()

  pty = createPty('resumed', header.id)
  await pty.ready()
  await pty.wait(() => pty.screen().includes('LOCAL_IMAGE_DONE'), 'resumed native history')
  pass('resume-history-and-standard-preset', { sessionId: header.id, screen: pty.snapshot('history') })
  await pty.command('/files')
  await pty.wait(() => /native-tool-output\.txt/u.test(pty.screen()), 'resumed produced files before a new turn')
  pass('resume-produced-files', { screen: pty.snapshot('produced-files') })
  pty.write('\u001b')
  await delay(150)
  await pty.reply('resume fixture', 'LOCAL_RESUME_DONE', 'resume-new-turn')
  await pty.command('/export md resumed.md')
  await pty.wait(() => existsSync(join(workspace, 'resumed.md')), 'resumed Markdown export')
  const resumedMarkdown = readFileSync(join(workspace, 'resumed.md'), 'utf8')
  for (const text of ['LOCAL_STREAM_DONE', 'LOCAL_IMAGE_DONE', 'LOCAL_RESUME_DONE']) assert(resumedMarkdown.includes(text))
  pass('resume-export-history', { path: join(workspace, 'resumed.md') })
  await pty.close()
  report.status = 'passed'
  report.completedAt = new Date().toISOString()
  report.requests = requests.length
  saveReport()
  console.log(JSON.stringify({ status: 'passed', report: reportPath }))
} catch (error) {
  report.status = 'failed'
  report.completedAt = new Date().toISOString()
  report.error = String(error.stack ?? error)
  if (pty) report.failureScreen = pty.snapshot('failure')
  saveReport()
  console.error(report.error)
  console.error(`Evidence: ${reportPath}`)
  process.exitCode = 1
} finally {
  pty?.dispose()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
