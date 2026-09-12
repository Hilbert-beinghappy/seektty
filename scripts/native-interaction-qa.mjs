#!/usr/bin/env node
// Native attachment and human-interaction edge cases. All inputs, storage,
// keys, tool side effects and model traffic are disposable local fixtures.
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fixture, delay } from './helpers/native-qa-base.mjs'

const qa = fixture('seektty-native-interactions-')
const { root, home, workspace, official, report } = qa
const exporter = createRequire(official.resolve('@deepseek-ai/dsh-session-log-export'))
const { unzipSync, strFromU8 } = exporter('fflate')
const requests = [], results = [], aborted = new Set()
let n = 0, pty
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64')
const marker = join(workspace, 'approval-executions.jsonl')
const approvalEvents = join(root, 'approval-events.jsonl')
const question = id => ({ id, question: `Fixture ${id}?`, options: [{ label: 'Alpha' }, { label: 'Beta' }, { label: 'Gamma' }] })
const questionCalls = {
  multi: { questions: [{ ...question('multi'), multi_select: true }] },
  custom: { questions: [question('custom')] },
  skip: { questions: [question('skip')] },
  batchcancel: { questions: [question('batch-one'), question('batch-two')] },
  background: { questions: [question('background')] },
}
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return }
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const index = data.messages.findLastIndex(m => m.role === 'user' && /IQ\[[\w-]+\]/u.test(JSON.stringify(m.content)))
    const user = data.messages[index]?.content
    const text = typeof user === 'string' ? user : (user ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const scenario = [...text.matchAll(/IQ\[([\w-]+)\]/gu)].at(-1)?.[1] ?? 'title'
    const main = Boolean(data.tools?.length)
    const nativeResults = data.messages.slice(index + 1).filter(m => m.role === 'tool')
    const record = { n: ++n, scenario, main, images: (Array.isArray(user) ? user : []).filter(b => b.type === 'image_url').length }
    requests.push(record); appendFileSync(join(root, 'requests.jsonl'), JSON.stringify(record) + '\n')
    if (nativeResults.length) {
      const result = { n, scenario, results: nativeResults }
      results.push(result); appendFileSync(join(root, 'tool-results.jsonl'), JSON.stringify(result) + '\n')
    }
    let complete = false
    res.on('close', () => { if (!complete) aborted.add(record.n) })
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const emit = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({ id: `interaction-${record.n}`, object: 'chat.completion.chunk', created: 1, model: data.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n')
    emit({ role: 'assistant' })
    if (main && nativeResults.length === 0 && (questionCalls[scenario] || scenario.startsWith('approval-'))) {
      if (scenario === 'background') await delay(650)
      if (res.destroyed) return
      emit({ reasoning_content: 'Local interaction fixture.' })
      const name = questionCalls[scenario] ? 'ask_user_question' : 'fixture_approval_edge'
      assert(data.tools.some(tool => tool.function?.name === name))
      emit({ tool_calls: [{ index: 0, id: `interaction-call-${record.n}`, type: 'function', function: { name, arguments: JSON.stringify(questionCalls[scenario] ?? {}) } }] })
      emit({}, 'tool_calls')
    } else if (main && scenario === 'image-cancel') {
      emit({ content: 'PARTIAL_IMAGE_CANCEL' })
      for (let i = 0; i < 100; i++) { await delay(150); if (res.destroyed) return; emit({ content: '.' }) }
      emit({}, 'stop')
    } else {
      const output = main ? `DONE_${scenario}` : scenario === 'seed-A' ? 'Interaction Alpha' : 'Interaction Secondary'
      emit({ content: output.slice(0, 5) }); await delay(80)
      if (res.destroyed) return
      emit({ content: output.slice(5) }); emit({}, 'stop')
    }
    complete = true; res.end('data: [DONE]\n\n')
  } catch (error) { report.serverError = String(error.stack ?? error); qa.save(); res.end() }
})

async function test(name, action) {
  try { const evidence = await action(); qa.result(name, 'passed', { screen: pty.snapshot(name), ...evidence }); return true }
  catch (error) {
    qa.result(name, 'failed', { error: String(error.stack ?? error), screen: pty.snapshot(`${name}-failed`) })
    if (pty.alive()) {
      if (pty.busy()) pty.write('\u0003')
      await delay(150); pty.write('\u001b'); await delay(100); pty.write('\u001b\u0015'); await delay(100)
      if (/待发送.*tiny.png/u.test(pty.screen())) { pty.write('\u0003'); await delay(120) }
    }
    return false
  }
}
async function reply(scenario) {
  const before = requests.length
  await pty.send(`IQ[${scenario}]`)
  await pty.wait(() => requests.slice(before).some(r => r.main && r.scenario === scenario) && pty.screen().includes(`DONE_${scenario}`) && !pty.busy(), `${scenario} reply`)
}
async function clearDraft(confirm = true) {
  await pty.send('/attachments')
  await pty.wait(() => /清空待发送图片|Clear pending images/u.test(pty.screen()), 'clear image confirmation')
  if (!confirm) { pty.write('\u001b'); await delay(150); return }
  pty.write('\u001b[A'); await delay(80); pty.write('\r')
  await pty.wait(() => !pty.screen().includes('tiny.png') && !/清空待发送图片|Clear pending images/u.test(pty.screen()), 'draft cleared')
}
async function resumeAlpha() {
  await pty.send('/resume seed-A')
  await pty.wait(() => /搜索会话|Search sessions/u.test(pty.screen()) && /Interaction Alpha/u.test(pty.screen()), 'find original session')
  pty.write('\r'); await delay(200)
}
function latestAnswer(scenario) {
  const row = results.findLast(r => r.scenario === scenario)
  assert(row, `Missing native tool result for ${scenario}`)
  return JSON.parse(row.results.at(-1).content)
}
async function questionStart(scenario) {
  await pty.send(`IQ[${scenario}]`)
  await pty.wait(() => pty.screen().includes(`Fixture ${scenario === 'batchcancel' ? 'batch-one' : scenario}?`), `${scenario} overlay`)
}
async function questionDone(scenario) {
  await pty.wait(() => results.some(r => r.scenario === scenario) && pty.screen().includes(`DONE_${scenario}`) && !pty.busy(), `${scenario} native answer settled`)
}
async function exportLog(filename) {
  await pty.send(`/export ${filename}`)
  await pty.wait(() => /仅当前会话|Current session only/u.test(pty.screen()), 'export scope')
  pty.write('\r')
  await pty.wait(() => existsSync(join(workspace, filename)) && /已保存会话 ZIP|Saved session ZIP/u.test(pty.screen()), 'export finished')
  const archive = unzipSync(readFileSync(join(workspace, filename)))
  const key = Object.keys(archive).find(k => /^session(?:\.v\d+)?\.jsonl$/u.test(k))
  const events = strFromU8(archive[key]).trim().split('\n').map(JSON.parse)
  writeFileSync(join(root, filename + '.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n')
  pty.write('\u001b'); await delay(120)
  return events
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  report.modelEndpoint = `http://127.0.0.1:${server.address().port}/v1`
  writeFileSync(join(home, 'settings.yaml'), `llm-deepseek:\n  apiKeyEnv: SEEKTTY_QA_KEY\n  baseURL: ${report.modelEndpoint}\n  retryPolicy:\n    mode: normal\n    maxRetries: 0\n`)
  writeFileSync(join(workspace, 'tiny.png'), png)
  writeFileSync(join(workspace, 'not-image.txt'), 'NOT AN IMAGE\n')
  writeFileSync(join(workspace, 'oversize.png'), Buffer.concat([png, Buffer.alloc(129 - png.length)]))
  const toolsUrl = pathToFileURL(official.resolve('@deepseek-ai/dsh-tools')).href
  writeFileSync(join(root, 'interaction-fixture.mjs'), `import { defineTool } from ${JSON.stringify(toolsUrl)};
import { appendFileSync, writeFileSync } from 'node:fs';
export const name='interaction-qa'; export const inject=['tools','approval','attachments'];
export function apply(ctx){
writeFileSync(${JSON.stringify(join(root, 'native-image-limits.json'))},JSON.stringify(ctx.attachments.imageLimits));
ctx.tools.register(defineTool({name:'fixture_approval_edge',description:'Test the local native approval edge.',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{outcome:{type:'string',required:true}}},render:(_a,r)=>[{type:'text',text:JSON.stringify(r)}]},async execute(_args,exec){
appendFileSync(${JSON.stringify(approvalEvents)},JSON.stringify({event:'requested',callId:exec.callId})+'\\n');
const outcome=await ctx.approval.request({agent:exec.agent,toolName:'fixture_approval_edge',callId:exec.callId,reason:'Append one isolated approval execution marker.',signal:exec.signal});
if(outcome==='allowed-once')appendFileSync(${JSON.stringify(marker)},JSON.stringify({callId:exec.callId})+'\\n');
appendFileSync(${JSON.stringify(approvalEvents)},JSON.stringify({event:'outcome',callId:exec.callId,outcome})+'\\n');return {outcome};}}));}
`)
  writeFileSync(join(root, 'interaction.patch.yml'), `- id: attachment-local\n  config:\n    dshHome: ${JSON.stringify(home)}\n    maxImageBytes: 128\n    maxImagesPerMessage: 2\n    maxMessageImageBytes: 256\n- insert:\n    - id: interaction-qa\n      name: ${JSON.stringify(join(root, 'interaction-fixture.mjs'))}\n`)
  qa.install()
  pty = qa.open('interactions', ['--patch', join(root, 'interaction.patch.yml')])
  await pty.wait(() => /─+.*flash/u.test(pty.screen()), 'native composer')
  await reply('seed-A')
  await test('missing-image-path-rejected', async () => {
    await pty.send('/attach missing.png')
    await pty.wait(() => /ENOENT|no such file|不存在|确认路径存在且可读/u.test(pty.screen()), 'missing file error')
    assert(!/待发送.*missing.png/u.test(pty.screen()))
  })
  await test('non-image-rejected', async () => {
    await pty.send('/attach not-image.txt')
    await pty.wait(() => /只支持 PNG|Only PNG/u.test(pty.screen()), 'unsupported image error')
  })
  await test('native-dynamic-byte-and-count-limits', async () => {
    const limits = JSON.parse(readFileSync(join(root, 'native-image-limits.json'), 'utf8'))
    assert.equal(limits.maxImageBytes, 128); assert.equal(limits.maxImagesPerMessage, 2)
    await pty.send('/attach oversize.png')
    await pty.wait(() => /单文件限制 128|per-file limit of 128/u.test(pty.screen()), 'native byte cap projection')
    await pty.send('/attach tiny.png'); await pty.wait(() => /待发送.*tiny.png/u.test(pty.screen()), 'first image')
    await pty.send('/attach tiny.png'); await delay(150)
    await pty.send('/attach tiny.png')
    await pty.wait(() => /每条消息最多 2|at most 2/u.test(pty.screen()), 'native image count cap')
    await clearDraft(); return { limits }
  })
  await test('draft-confirm-cancel-switch-and-idle-clear', async () => {
    await pty.send('/attach tiny.png'); await pty.wait(() => /待发送.*tiny.png/u.test(pty.screen()), 'draft added')
    await clearDraft(false); assert.match(pty.screen(), /待发送.*tiny.png/u)
    await pty.send('/new'); await pty.wait(() => /SeekTTY:/u.test(pty.screen()) && !pty.screen().includes('DONE_seed-A'), 'new blank session')
    assert.match(pty.screen(), /待发送.*tiny.png/u)
    await resumeAlpha(); assert.match(pty.screen(), /待发送.*tiny.png/u)
    pty.write('\u0003'); await pty.wait(() => !/待发送.*tiny.png/u.test(pty.screen()), 'idle interrupt clears composer draft')
    await pty.send('/attachments'); await pty.wait(() => /没有待发送图片|No images waiting/u.test(pty.screen()), 'empty draft confirmed')
  })
  await test('accepted-image-cancel-does-not-restore-draft', async () => {
    await pty.send('/attach tiny.png'); await pty.wait(() => /待发送.*tiny.png/u.test(pty.screen()), 'image draft')
    await pty.send('IQ[image-cancel]'); await pty.wait(() => pty.screen().includes('PARTIAL_IMAGE_CANCEL'), 'image request admitted')
    const request = requests.findLast(r => r.main && r.scenario === 'image-cancel')
    assert.equal(request.images, 1); assert(!/待发送.*tiny.png/u.test(pty.screen()))
    pty.write('\u0003'); await pty.wait(() => aborted.has(request.n) && !pty.busy(), 'image generation aborted')
    await pty.send('/attachments'); await pty.wait(() => /没有待发送图片|No images waiting/u.test(pty.screen()), 'accepted image draft remains cleared')
  })
  await test('question-multi-select-two-options', async () => {
    await questionStart('multi'); pty.write(' '); pty.write('\u001b[B'); pty.write(' '); await delay(80); pty.write('\r')
    await questionDone('multi'); assert.deepEqual(latestAnswer('multi'), { answers: [{ id: 'multi', selected: ['Alpha', 'Beta'] }] })
  })
  await test('question-custom-multiline-text', async () => {
    await questionStart('custom'); pty.write('\u001b[B\u001b[B\u001b[B'); await delay(80); pty.write('\r')
    await pty.wait(() => /Enter 换行|Enter newline/u.test(pty.screen()), 'custom answer editor')
    pty.write('\u001b[200~自定义答案\nsecond line\u001b[201~'); await delay(80); pty.write('\u001b[13;5u')
    await questionDone('custom'); assert.deepEqual(latestAnswer('custom'), { answers: [{ id: 'custom', selected: [], custom: '自定义答案\nsecond line' }] })
  })
  await test('question-skip-empty-answer', async () => {
    await questionStart('skip'); pty.write('\u001b[B\u001b[B\u001b[B\u001b[B'); await delay(80); pty.write('\r')
    await questionDone('skip'); assert.deepEqual(latestAnswer('skip'), { answers: [{ id: 'skip', selected: [] }] })
  })
  await test('question-batch-cancel-discards-previous-answer', async () => {
    await questionStart('batchcancel'); pty.write('\r')
    await pty.wait(() => pty.screen().includes('Fixture batch-two?'), 'second batch question')
    pty.write('\u001b'); await pty.wait(() => /取消这批问题|Cancel this question batch/u.test(pty.screen()), 'cancel confirmation')
    pty.write('\u001b[B\u001b[B'); await delay(80); pty.write('\r')
    await questionDone('batchcancel')
    const answer = results.findLast(r => r.scenario === 'batchcancel').results.at(-1).content
    assert.match(answer, /Error|cancel|abort/iu); assert(!answer.includes('"selected":["Alpha"]'))
    return { nativeResult: answer }
  })
  await test('background-question-return-to-owning-session', async () => {
    await pty.send('IQ[background]')
    await pty.wait(() => requests.some(r => r.main && r.scenario === 'background'), 'delayed question in flight')
    await pty.send('/new'); await pty.wait(() => /SeekTTY:/u.test(pty.screen()) && !pty.screen().includes('Fixture background?'), 'switch before question modal')
    await delay(800); assert(!pty.screen().includes('Fixture background?'), 'A background session must not display its question over another active session')
    await reply('background-witness')
    const other = await exportLog('other-session.zip')
    assert(!other.some(e => JSON.stringify(e).includes('Fixture background?')))
    await resumeAlpha(); await pty.wait(() => pty.screen().includes('Fixture background?'), 'pending question restored for its original session')
    pty.write('\u001b[B'); await delay(80); pty.write('\r'); await questionDone('background')
    assert.deepEqual(latestAnswer('background'), { answers: [{ id: 'background', selected: ['Beta'] }] })
    return { otherSessionId: other[0].id }
  })
  await test('approval-escape-and-duplicate-confirm-once', async () => {
    await pty.send('IQ[approval-cancel]')
    await pty.wait(() => /Append one isolated approval execution marker/u.test(pty.screen()), 'approval modal')
    pty.write('\u001b'); await questionDone('approval-cancel')
    assert.equal(latestAnswer('approval-cancel').outcome, 'rejected'); assert(!existsSync(marker))
    await pty.send('IQ[approval-double]')
    await pty.wait(() => /Append one isolated approval execution marker/u.test(pty.screen()), 'second approval modal')
    pty.write('\u001b[A'); await delay(80); pty.write('\r'); await delay(20); pty.write('\r')
    await questionDone('approval-double'); assert.equal(latestAnswer('approval-double').outcome, 'allowed-once')
    const writes = readFileSync(marker, 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(writes.length, 1)
    await reply('after-approval')
    return { executions: writes, nativeApprovalEvents: approvalEvents }
  })
  const events = await exportLog('interaction-log.zip')
  const nativeResults = events.filter(e => e.type === 'tool/result')
  assert.equal(nativeResults.length, 7, 'Exactly seven native interaction results must be committed')
  const durable = nativeResults.map(event => {
    const block = event.data.message.content[0]
    assert.equal(block.type, 'tool-result')
    const text = block.content.find(part => part.type === 'text')?.text
    assert.equal(typeof text, 'string')
    return { event, block, value: block.isError ? undefined : JSON.parse(text) }
  })
  for (const expected of [
    { answers: [{ id: 'multi', selected: ['Alpha', 'Beta'] }] },
    { answers: [{ id: 'custom', selected: [], custom: '自定义答案\nsecond line' }] },
    { answers: [{ id: 'skip', selected: [] }] },
    { answers: [{ id: 'background', selected: ['Beta'] }] },
  ]) {
    const matching = durable.filter(row => row.value?.answers?.[0]?.id === expected.answers[0].id)
    assert.equal(matching.length, 1, `${expected.answers[0].id} must be committed exactly once`)
    assert.deepEqual(matching[0].value, expected)
  }
  const cancelled = durable.filter(row => row.block.isError)
  assert.equal(cancelled.length, 1)
  assert.equal(cancelled[0].event.data.error.code, 'ASK_ABORTED')
  assert.equal(cancelled[0].block.content[0].text, 'Error: Question cancelled')
  assert.deepEqual(durable.filter(row => row.value?.outcome).map(row => row.value.outcome), ['rejected', 'allowed-once'])
  const executions = readFileSync(marker, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(executions.length, 1)
  const allowed = durable.find(row => row.value?.outcome === 'allowed-once')
  assert.equal(executions[0].callId, allowed.event.data.message.source.callId)
  const otherId = report.cases.find(row => row.name === 'background-question-return-to-owning-session')?.otherSessionId
  assert(otherId && otherId !== events[0].id, 'Background question must be answered in its original session')
  assert(!events.some(event => event.type === 'user/message' && event.data.content?.some(part => part.type === 'text' && part.text === 'IQ[background-witness]')))
  report.nativeLog = join(root, 'interaction-log.zip.jsonl')
  report.nativeToolResults = nativeResults.length
  report.nativeInteractionAssertions = 'four exact answers, one ASK_ABORTED, rejected then allowed-once, one matching execution, separate session ownership'
  report.exit = await pty.stop()
  report.status = report.cases.some(r => r.status === 'failed') ? 'failed' : 'passed'
} catch (error) {
  qa.result('harness-completion', 'failed', { error: String(error.stack ?? error), screen: pty?.snapshot('fatal') }); report.status = 'failed'
} finally {
  pty?.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  report.completedAt = new Date().toISOString(); qa.save()
  console.log(JSON.stringify({ status: report.status, report: join(root, 'report.json') }))
  process.exitCode = report.status === 'passed' ? 0 : 1
}
