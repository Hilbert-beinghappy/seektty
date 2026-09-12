#!/usr/bin/env node
// Opt-in state QA against an unchanged official CLI, with an isolated Home and loopback-only model.
// Keeps the native immediate-request-id deduplication assertion red when rc.1 reproduces
// its upstream gap; this is a diagnostic, not a claim that normal UI sends are replayed.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import crossSpawn from 'cross-spawn'
import { build } from 'tsdown'
import { spawn as spawnPty } from 'node-pty'
import xterm from '@xterm/headless'
import { aliases } from '../tsdown.config.ts'
import { verifyStockDsh } from './stock-dsh-version.mjs'

const dsh = process.env.DSH_BIN
const spec = process.env.SEEKTTY_SPEC
assert(dsh && spec, 'Set DSH_BIN and SEEKTTY_SPEC')
const stock = verifyStockDsh(dsh)
const official = createRequire(stock.entry)
const reuseRoot = process.env.SEEKTTY_STATE_QA_PTY_ROOT
const root = realpathSync(reuseRoot ?? mkdtempSync(join(tmpdir(), 'seektty-native-state-qa-')))
assert(root.includes('/seektty-native-state-qa-'), 'Only reuse an isolated state QA fixture')
const home = join(root, 'home')
const workspace = join(root, 'workspace')
if (!reuseRoot) { mkdirSync(home); mkdirSync(workspace) }
const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off', SEEKTTY_STATE_QA_KEY: 'fixture-only', SEEKTTY_STATE_QA_ROOT: root })
writeFileSync(join(root, 'fixture.json'), JSON.stringify({ official: stock, candidate: resolve(spec), sha256: createHash('sha256').update(readFileSync(resolve(spec))).digest('hex'), node: process.version }, null, 2) + '\n')
console.log(JSON.stringify({ root, official: stock.entry, candidate: resolve(spec) }))
let requests = 0
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return }
  let body = ''
  for await (const chunk of req) body += chunk
  const data = JSON.parse(body)
  const text = JSON.stringify(data.messages?.findLast(message => message.role === 'user')?.content ?? '')
  const n = ++requests
  appendFileSync(join(root, 'model-requests.jsonl'), JSON.stringify({ n, stream: data.stream, messages: data.messages.length, model: data.model }) + '\n')
  const content = `QA_REPLY_${n}`
  if (!data.stream) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ id: `qa-${n}`, object: 'chat.completion', created: 1, model: data.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const emit = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({ id: `qa-${n}`, object: 'chat.completion.chunk', created: 1, model: data.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n')
  emit({ role: 'assistant', content: content.slice(0, 3) })
  if (text.includes('qa-slow')) await delay(1800)
  if (res.destroyed) return
  emit({ content: content.slice(3) }); emit({}, 'stop'); res.end('data: [DONE]\n\n')
})

async function probe(ctx) {
  const root = process.env.SEEKTTY_STATE_QA_ROOT
  if (process.env.SEEKTTY_STATE_QA_VERIFY_ID) {
    const inspected = await ctx.sessionController.inspect(process.env.SEEKTTY_STATE_QA_VERIFY_ID)
    writeFileSync(join(root, 'pty-native-events.json'), JSON.stringify(inspected.events, null, 2) + '\n')
    ctx.get('appExit')?.(0)
    return
  }
  const reportPath = join(root, 'report.json')
  const report = { steps: [], errors: [], startedAt: new Date().toISOString() }
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  const check = async (name, task) => {
    try { const evidence = await task(); report.steps.push({ name, passed: true, evidence }); console.log('STATE_QA_PASS ' + name) }
    catch (error) { report.steps.push({ name, passed: false, error: String(error.stack ?? error) }); report.errors.push(name); console.error('STATE_QA_FAIL ' + name + ': ' + String(error.stack ?? error)) }
    save()
  }
  const wait = async (predicate, description, timeout = 15000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) { if (predicate()) return; await delay(10) }
    throw new Error('Timeout: ' + description)
  }
  const signal = new AbortController().signal
  const api = new NativeTerminalApi(ctx)
  const value = async result => { const reply = await result; assert(reply.result.ok, JSON.stringify(reply.result)); return reply.result.value }
  const events = id => ctx.agents.get(id)?.session.snapshotEvents() ?? []
  const turns = id => events(id).filter(event => event.type === 'turn/end').length
  const prompt = async (id, text) => {
    const before = turns(id)
    await value(api.sessions.prompt({ sessionId: id, mode: 'queue', content: [{ type: 'text', text }] }))
    await wait(() => turns(id) > before && ctx.agents.get(id)?.status !== 'running', 'prompt settled ' + text)
  }
  const invoke = (namespace, method, args) => ctx.typertGateway.invoke({ namespace, method, args, signal })
  const client = new Context()
  installRegistry(client)
  client.provide('connection')
  client.set('connection', { rpc: { call: async (_channel, endpoint, payload, signal) => {
    const [namespace, method] = endpoint.split('/')
    try { return { ok: true, value: await ctx.typertGateway.invoke({ namespace, method, args: payload.args, signal }) } }
    catch (error) { return { ok: false, error: { code: error.code ?? 'internal', message: error.message, details: error.details ?? {} } } }
  } } })
  installGateway(client)
  await client.remote.$mount(TYPERT_REMOTE)
  let sessionId, forkId, workspaceId, otherWorkspaceId
  try {
    await check('workspace-create-idempotent', async () => {
      const a = await value(api.workspace.create({ path: join(root, 'workspace') }))
      const b = await value(api.workspace.create({ path: join(root, 'workspace') }))
      assert.equal(a.workspace.workspaceId, b.workspace.workspaceId); assert.equal(b.created, false)
      workspaceId = a.workspace.workspaceId
      assert.equal(typeof workspaceId, 'string')
      return { workspaceId }
    })
    await check('blank-fork-rejected', async () => {
      sessionId = (await value(api.sessions.create({ workspaceId }))).sessionId
      report.sessionId = sessionId
      const reply = await api.sessions.fork({ sessionId })
      assert.equal(reply.result.ok, false); assert.equal(reply.result.error.code, 'fork-unavailable')
      return { sessionId }
    })
    await check('native-preset-command-catalog', async () => {
      const catalog = await invoke('commands', 'list', { agentId: sessionId })
      const names = catalog.map(command => command.name)
      for (const name of ['plan', 'goal', 'compact', 'feedback']) assert(names.includes(name), 'missing ' + name)
      return { commands: names }
    })
    const uiSession = () => new ClientSession(sessionId, api, client.remote)
    for (const line of ['/plan', '/goal', '/feedback state QA']) {
      await check('client-native-command ' + line, async () => {
        const result = await uiSession().command(line)
        assert(result.ok && result.value.matched, JSON.stringify(result))
        const done = events(sessionId).findLast(event => event.type === 'command/done')
        assert(done, 'native command lifecycle missing')
        return { lifecycle: done.data }
      })
    }
    await check('long-history-dense-pages', async () => {
      // One actual native prompt per turn: validates journal cuts, not hand-constructed log rows.
      for (let index = 0; index < 60; index++) await prompt(sessionId, 'qa-page-' + index)
      let page = await value(api.sessions.history({ sessionId, maxMessages: 7 }))
      const seqs = page.events.map(entry => entry.event.seq)
      let pages = 1
      while (page.hasMore) {
        const next = await value(api.sessions.history({ sessionId, maxMessages: 7, beforeSeq: seqs[0] }))
        assert(next.events.length > 0)
        assert.equal(next.events.at(-1).event.seq + 1, seqs[0])
        seqs.unshift(...next.events.map(entry => entry.event.seq)); page = next; pages++
      }
      assert.deepEqual(seqs, Array.from({ length: seqs.at(-1) + 1 }, (_, index) => index))
      assert.equal(turns(sessionId), 60)
      return { pages, events: seqs.length, turns: turns(sessionId) }
    })
    await check('completed-fork-inherits-history-and-preset', async () => {
      forkId = (await value(api.sessions.fork({ sessionId }))).sessionId
      const parent = await ctx.sessionController.inspect(sessionId)
      const fork = await ctx.sessionController.inspect(forkId)
      assert.equal(fork.meta.parentSession, sessionId)
      assert.equal(fork.meta.agentPreset, parent.meta.agentPreset)
      assert(fork.inheritedEventCount > 0)
      assert.deepEqual(fork.events.slice(0, fork.inheritedEventCount), parent.events.slice(0, fork.inheritedEventCount))
      await prompt(forkId, 'qa-fork-only')
      assert.equal(turns(sessionId), 60)
      return { forkId, inheritedEventCount: fork.inheritedEventCount }
    })
    await check('running-fork-keeps-completed-boundary', async () => {
      const before = turns(sessionId)
      await value(api.sessions.prompt({ sessionId, mode: 'queue', content: [{ type: 'text', text: 'qa-slow' }] }))
      await wait(() => ctx.agents.get(sessionId)?.status === 'running', 'slow run start')
      const child = (await value(api.sessions.fork({ sessionId }))).sessionId
      const inspected = await ctx.sessionController.inspect(child)
      assert.equal(inspected.events.filter(event => event.type === 'turn/end').length, before)
      assert(!inspected.events.some(event => event.type === 'user/message' && JSON.stringify(event.data.content).includes('qa-slow')))
      return { child, inheritedTurns: before }
    })
    await check('queue-edit-remove-and-steer', async () => {
      for (const text of ['qa-queued-edit', 'qa-queued-remove', 'qa-queued-steer']) await value(api.sessions.prompt({ sessionId, mode: 'queue', content: [{ type: 'text', text }] }))
      const agent = ctx.agents.get(sessionId)
      const pending = () => [...agent.inbox.nextTurn, ...agent.inbox.nextStep]
      const find = text => pending().find(message => JSON.stringify(message.content).includes(text))
      const edit = find('qa-queued-edit'), remove = find('qa-queued-remove'), steer = find('qa-queued-steer')
      assert(edit && remove && steer, 'three queued messages must be observable')
      await value(api.sessions.updateQueue({ sessionId, itemId: edit.id, action: { kind: 'edit', content: [{ type: 'text', text: 'qa-edited' }] } }))
      await value(api.sessions.updateQueue({ sessionId, itemId: remove.id, action: { kind: 'remove' } }))
      await value(api.sessions.updateQueue({ sessionId, itemId: steer.id, action: { kind: 'steer' } }))
      assert(find('qa-edited')); assert(!find('qa-queued-remove'))
      assert(agent.inbox.nextStep.some(message => message.id === steer.id))
      await wait(() => pending().length === 0 && agent.status !== 'running', 'all queued work settled')
      await delay(100)
      await wait(() => pending().length === 0 && agent.status !== 'running', 'queue settlement stable')
      assert(!events(sessionId).some(event => event.type === 'user/message' && JSON.stringify(event.data.content).includes('qa-queued-remove')))
      return { edited: edit.id, removed: remove.id, steered: steer.id }
    })
    await check('prompt-idempotency-native-request-id', async () => {
      const before = turns(sessionId)
      const request = { sessionId, mode: 'queue', content: [{ type: 'text', text: 'qa-idempotent' }], requestId: 'qa-repeated-request' }
      await invoke('session', 'prompt', { request }); await invoke('session', 'prompt', { request })
      await wait(() => turns(sessionId) > before && ctx.agents.get(sessionId)?.status !== 'running', 'idempotent prompt settled')
      await delay(100)
      const matching = events(sessionId).filter(event => event.type === 'user/message' && event.data.source.rpcId === request.requestId)
      report.idempotentEvents = matching.map(event => ({ seq: event.seq, surfaceOp: event.surfaceOp, source: event.data.source, content: event.data.content }))
      assert.equal(matching.filter(event => event.surfaceOp === 'append').length, 1)
    })
    await check('prompt-idempotency-after-durable-append', async () => {
      const request = { sessionId, mode: 'queue', content: [{ type: 'text', text: 'qa-durable-idempotent' }], requestId: 'qa-durable-request' }
      await invoke('session', 'prompt', { request })
      await wait(() => events(sessionId).some(event => event.type === 'user/message' && event.data.source.rpcId === request.requestId), 'first request durably appended')
      await invoke('session', 'prompt', { request })
      await wait(() => ctx.agents.get(sessionId)?.status !== 'running', 'durable retry idle')
      await delay(100)
      const matching = events(sessionId).filter(event => event.type === 'user/message' && event.data.source.rpcId === request.requestId && event.surfaceOp === 'append')
      assert.equal(matching.length, 1)
      return { event: matching[0].seq, requestId: request.requestId }
    })
    await check('goal-create-pause-edit-stale-ref-clear', async () => {
      const goalSession = (await value(api.sessions.create({ workspaceId }))).sessionId
      const created = await value(api.goals.create({ sessionId: goalSession, objective: 'qa-goal-objective', maxGoalRounds: 1 }))
      const paused = await value(api.goals.pause({ sessionId: goalSession, ref: created.ref }))
      assert.equal((await invoke('goals', 'get', { agentId: goalSession })).phase, 'paused')
      const edited = await value(api.goals.edit({ sessionId: goalSession, ref: paused.ref, objective: 'qa-goal-edited' }))
      assert.equal((await invoke('goals', 'get', { agentId: goalSession })).objective, 'qa-goal-edited')
      const stale = await api.goals.edit({ sessionId: goalSession, ref: created.ref, objective: 'stale edit must not land' })
      assert.equal(stale.result.ok, false)
      assert.equal((await invoke('goals', 'get', { agentId: goalSession })).objective, 'qa-goal-edited')
      await value(api.goals.clear({ sessionId: goalSession, ref: edited.ref }))
      assert.equal(await invoke('goals', 'get', { agentId: goalSession }), undefined)
      return { goalSession, staleError: stale.result.error }
    })
    await check('native-compact-command', async () => {
      const result = await uiSession().command('/compact')
      assert(result.ok && result.value.matched, JSON.stringify(result))
      const done = events(sessionId).findLast(event => event.type === 'command/done')
      assert.equal(done.data.kind, 'success', JSON.stringify(done.data))
      const history = await value(api.sessions.history({ sessionId, maxMessages: 1000 }))
      assert(history.events.some(entry => entry.event.type === 'user/message' && JSON.stringify(entry.event.data.content).includes('qa-page-0')))
      return { eventCount: history.events.length, lifecycle: done.data }
    })
    await check('workspace-concurrent-title-conflict', async () => {
      const other = join(root, 'other-workspace'); mkdirSync(other)
      otherWorkspaceId = (await value(api.workspace.create({ path: other }))).workspace.workspaceId
      const results = await Promise.all([
        api.workspace.rename({ workspaceId, title: 'State QA unique' }),
        api.workspace.rename({ workspaceId: otherWorkspaceId, title: 'State QA unique' }),
      ])
      assert.equal(results.filter(result => result.result.ok).length, 1)
      assert.equal(results.filter(result => !result.result.ok).length, 1)
      return { results: results.map(result => result.result) }
    })
    await check('archive-keeps-history-readable', async () => {
      const result = await value(api.workspace.archiveSession({ sessionId: forkId }))
      assert(result.archivedSessionIds.includes(forkId))
      const history = await value(api.sessions.history({ sessionId: forkId }))
      assert(history.events.length > 0)
    })
    await check('workspace-delete-retains-session-and-files', async () => {
      const file = join(root, 'workspace', 'retained.txt'); writeFileSync(file, 'retained')
      await value(api.workspace.delete({ workspaceId }))
      assert.equal(readFileSync(file, 'utf8'), 'retained')
      assert((await value(api.sessions.history({ sessionId }))).events.length > 0)
    })
  } finally {
    report.finishedAt = new Date().toISOString(); report.status = report.errors.length ? 'failed' : 'passed'; save()
    await client.fiber.dispose()
    ctx.get('appExit')?.(report.errors.length ? 1 : 0)
  }
}

async function ptyCommands() {
  const reportPath = join(root, 'report.json')
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const terminal = new xterm.Terminal({ cols: 120, rows: 40, allowProposedApi: true, scrollback: 10000 })
  const pty = spawnPty(process.execPath, [stock.entry, '--profile', 'tui', '--resume', report.sessionId], {
    cwd: workspace, cols: 120, rows: 40, name: 'xterm-256color', env: { ...env, TERM: 'xterm-256color' },
  })
  let exit, writes = Promise.resolve(), raw = ''
  pty.onData(chunk => { raw += chunk; appendFileSync(join(root, 'commands-pty.raw'), chunk); writes = writes.then(() => new Promise(resolve => terminal.write(chunk, resolve))) })
  pty.onExit(event => { exit = event })
  const screen = () => Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n')
  const wait = async (predicate, label, timeout = 20000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) { await writes; if (predicate()) return; if (exit) throw new Error(label + ': exit ' + JSON.stringify(exit)); await delay(50) }
    throw new Error('Timeout: ' + label + '\n' + screen())
  }
  const command = async line => { pty.write(line); await delay(100); pty.write('\r') }
  try {
    await wait(() => /输入消息|Type a message|Enter a message/u.test(screen()), 'resumed composer')
    // Add substantive fresh context after the earlier headless compaction. Re-compacting
    // an already minimal summary correctly fails the native "must get smaller" check.
    const beforePrompt = raw.length
    const beforeRequests = requests
    await command('qa-pty-fresh-context ' + 'This fixture verifies original terminal command behavior after restoring a long session. '.repeat(20))
    await wait(() => requests > beforeRequests && raw.slice(beforePrompt).includes('QA_REPLY_' + requests) && /就绪|Ready/u.test(screen()), 'fresh PTY turn')
    await delay(500); await writes
    for (const [line, expected] of [['/plan off', /Plan mode disabled|计划模式已关闭/u], ['/plan', /Plan mode enabled|计划模式已开启/u], ['/plan off', /Plan mode disabled|计划模式已关闭/u], ['/goal', /No goal is currently set|当前.*(?:没有|未设置).*目标/u], ['/compact', /Compacted \d+ history items|Nothing to compact/u]]) {
      const before = raw.length
      await command(line)
      await wait(() => expected.test(raw.slice(before)), line + ' result')
      await delay(250); await writes
      const path = join(root, 'pty-' + line.replace(/[^a-z]/g, '-') + '.txt')
      writeFileSync(path, screen())
      assert.doesNotMatch(raw.slice(before), /expected 3 business|without inject|ZodError|Connection lost/u)
      report.steps.push({ name: 'PTY ' + line, passed: true, evidence: { screen: path } })
      console.log('STATE_QA_PASS PTY ' + line)
    }
    await command('/exit'); await wait(() => exit !== undefined, 'PTY clean exit')
    assert.equal(exit.exitCode, 0)
  } catch (error) {
    report.steps.push({ name: 'PTY native commands', passed: false, error: String(error.stack ?? error) })
    report.errors.push('PTY native commands'); writeFileSync(join(root, 'pty-failure.txt'), screen())
    process.exitCode = 1
  } finally {
    if (!exit) pty.kill()
    terminal.dispose()
    report.status = report.errors.length ? 'failed' : 'passed'
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  writeFileSync(join(home, 'settings.yaml'), `llm-deepseek:\n  apiKeyEnv: SEEKTTY_STATE_QA_KEY\n  baseURL: http://127.0.0.1:${server.address().port}/v1\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
  if (!reuseRoot) {
    const install = crossSpawn.sync(dsh, ['plugin', '--profile', 'tui', 'add', '--config.enable-global-virtual-store=false', resolve(spec)], { cwd: workspace, env, encoding: 'utf8', timeout: 180000 })
    writeFileSync(join(root, 'install.log'), `${install.stdout}\n${install.stderr}`)
    assert.equal(install.status, 0, 'native package install failed')
  }
  const source = `import assert from 'node:assert/strict';\nimport {join} from 'node:path';\nimport {readFileSync,writeFileSync,mkdirSync} from 'node:fs';\nimport {setTimeout as delay} from 'node:timers/promises';\nimport {Context} from '@deepseek-ai/cordis';\nimport {TYPERT_REMOTE} from '@deepseek-ai/dsh-commands/remote';\nimport {NativeTerminalApi} from ${JSON.stringify(resolve('src/host/api-compat.ts'))};\nimport {Session as ClientSession} from ${JSON.stringify(resolve('vendor/client-runtime/client/sessions/session.js'))};\nimport {apply as installRegistry} from ${JSON.stringify(resolve('vendor/typert-registry/client/index.js'))};\nimport {apply as installGateway} from ${JSON.stringify(resolve('vendor/api-gateway/client/index.js'))};\nexport const name='seektty-native-state-qa';\nexport const inject=['agents','tools','sessionController','workspaceController','typertGateway','sessionQuery','agentPresets','commands','sessionProjections'];\nconst probe=${probe.toString()};\nexport function apply(ctx){queueMicrotask(()=>{void ctx.get('loader').await().then(()=>probe(ctx)).catch(error=>{console.error(error);ctx.get('appExit')?.(1)})})}\n`
  const entry = join(root, 'probe.ts'); writeFileSync(entry, source)
  await build({ config: false, entry: { probe: entry }, outDir: join(root, 'built'), clean: true, format: 'esm', platform: 'node', target: 'node24', dts: false, sourcemap: false, tsconfig: resolve('tsconfig.build.json'),
    alias: aliases, external: id => id.startsWith('@deepseek-ai/') && !id.startsWith('@deepseek-ai/dsh-host-apiproxy'),
    outputOptions: { paths: id => id.startsWith('@deepseek-ai/') || id === 'zod' ? pathToFileURL(official.resolve(id)).href : id },
  })
  const patch = join(root, 'probe.patch.yml')
  writeFileSync(patch, `- id: tui-runner\n  disabled: true\n- insert:\n    - id: native-state-qa\n      name: ${JSON.stringify(join(root, 'built', 'probe.js'))}\n`)
  const runProbe = async extraEnv => {
    const child = crossSpawn(dsh, ['--profile', 'tui', '--patch', patch], { cwd: workspace, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = join(root, 'runtime.log')
    child.stdout.on('data', bytes => { appendFileSync(output, bytes); process.stdout.write(bytes) })
    child.stderr.on('data', bytes => { appendFileSync(output, bytes); process.stderr.write(bytes) })
    const timeout = setTimeout(() => child.kill('SIGTERM'), 180000)
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    clearTimeout(timeout)
    return code
  }
  if (!reuseRoot) {
    const code = await runProbe({})
    console.log(JSON.stringify({ root, exitCode: code, requests }))
    process.exitCode = code ?? 1
  }
  await ptyCommands()
  const reportPath = join(root, 'report.json')
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(await runProbe({ SEEKTTY_STATE_QA_VERIFY_ID: report.sessionId }), 0, 'inspect PTY durable command state')
  const nativeEvents = JSON.parse(readFileSync(join(root, 'pty-native-events.json'), 'utf8'))
  const plan = nativeEvents.findLast(event => event.type === 'plan/mode')
  assert.equal(plan.data.active, false, 'PTY /plan off persisted actual native state')
  const done = nativeEvents.filter(event => event.type === 'command/done').slice(-3)
  assert.equal(done.length, 3)
  assert(done.every(event => event.data.kind === 'success'), 'PTY commands completed successfully in native history')
  assert.match(done.at(-1).data.text, /Compacted \d+ history items|Nothing to compact/u)
  report.steps.push({ name: 'PTY durable command state after restart', passed: true, evidence: { plan: plan.data, completed: done.map(event => event.data) } })
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.errors.length ? 1 : 0
  console.log('STATE_QA_PASS PTY durable command state after restart')
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
}
