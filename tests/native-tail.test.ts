import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { prepareMarkdownWorker } from './helpers/native-markdown-worker.ts'
import { Markdown } from '@mariozechner/pi-tui'
import { markdownTheme } from '../src/client/theme.ts'
import { NativeMarkdownPreparation } from '../src/client/native-markdown.ts'
let workerFactory: Awaited<ReturnType<typeof prepareMarkdownWorker>>
beforeAll(async () => { workerFactory = await prepareMarkdownWorker() })
import { Writable } from 'node:stream'
import { NativeOutput, streamSink } from '../src/client/native-output.ts'
import { NativeHistory, stableParagraphEnd } from '../src/client/native-history.ts'
import { Transcript, internals } from '../src/client/transcript.ts'
import type { ChatConversationViewNode, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'

function node(key: string, text: string, running = false): ChatConversationViewNode {
  return { key, kind: running ? 'assistant-step' : 'fixture', id: key, target: 'chat', anchorSeq: 1,
    visibility: 'visible', location: { kind: 'session' },
    data: running ? { status: 'running', turn: 1, step: 1, time: 1, blocks: [{ kind: 'text', text }] }
      : { kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1, blocks: [{ kind: 'text', text }] } }
}
function snapshot(nodes: ChatConversationViewNode[], sessionId = 'fixture'): ConversationSnapshot {
  return { sessionId, views: { get: () => undefined },
    chat: { order: nodes.map(n => n.key), nodes: { get: (key: string) => nodes.find(n => n.key === key), values: () => nodes },
      locations: { getTurn: () => [], getStep: () => [] }, timeline: { turnOrder: [], turns: new Map() },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] } },
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [], pending: [], queue: [],
    running: false, subagent: null, composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false, lastAgentError: null,
  } as unknown as ConversationSnapshot
}
afterEach(() => { vi.unstubAllEnvs() })

async function drainPrepared(transcript: Transcript, width = 80): Promise<string[]> {
  const lines: string[] = []
  for (let attempts = 0; attempts < 10000; attempts++) {
    transcript.render(width)
    const batch = transcript.takeNativeHistoryBatch()
    if (!batch) { if (await transcript.waitNativePreparation()) continue; return lines }
    expect(batch.lines.length).toBeLessThanOrEqual(256)
    lines.push(...batch.lines)
    batch.acknowledge()
  }
  throw new Error('History did not drain')
}

it('prepares a complex document off-thread and pages exactly the shared authoritative rendering', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = '- first **bold** [late][ref]\n' + Array.from({ length: 4000 }, (_, i) => `- item_${i} 中文😀`).join('\n')
    + '\n\n| A | B |\n| --- | --- |\n| left | right |\n\n[ref]: https://example.com\n'
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('complex', source)]))
    const before = internals.nativeHistoryLinesPrepared
    expect(transcript.render(80).join('')).toContain('…')
    expect(internals.nativeHistoryLinesPrepared).toBe(before)
    expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
    const actual = await drainPrepared(transcript)
    const expected = new Markdown(source, 0, 0, markdownTheme).renderUnpadded(76).map(line => line === '' ? '' : '  ' + line)
    expect(actual).toEqual(expected)
    expect(await drainPrepared(transcript)).toEqual([])
  } finally { transcript.dispose() }
}, 60000)

it('keeps a large live reply mutable and flushes its exact settled content on normal exit', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = '| A | B |\n| --- | --- |\n' + Array.from({ length: 3000 }, (_, i) => `| 中文😀${i} | value |`).join('\n')
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('live-big', source, true)]))
    transcript.render(80)
    await transcript.waitNativePreparation()
    expect(transcript.render(80).length).toBeLessThanOrEqual(24)
    expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
    transcript.finishNativeHistory()
    const actual = await drainPrepared(transcript)
    expect(actual).toEqual(new Markdown(source, 0, 0, markdownTheme).renderUnpadded(76).map(line => line === '' ? '' : '  ' + line))
  } finally { transcript.dispose() }
}, 60000)

it('finishes an already delivered document before reporting a smaller same-key correction', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = Array.from({ length: 4000 }, (_, i) => `- ORIGINAL_${i}`).join('\n')
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('changed', source)]))
    transcript.render(80); await transcript.waitNativePreparation(); transcript.render(80)
    const first = transcript.takeNativeHistoryBatch()!
    expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
    transcript.update(snapshot([node('changed', 'FINAL_AUTHORITATIVE')]))
    first.acknowledge()
    const actual = [...first.lines, ...await drainPrepared(transcript)].join('\n')
    expect(actual.match(/ORIGINAL_0\b/gu)).toHaveLength(1)
    expect(actual.match(/ORIGINAL_3999\b/gu)).toHaveLength(1)
    expect(actual).toContain('── 更新 · changed ──')
    expect(actual.replace(/\x1b\[[0-9;]*m/gu, '').endsWith('FINAL_AUTHORITATIVE')).toBe(true)
  } finally { transcript.dispose() }
}, 60000)

it('cancels preparation and rejects pages from a previous session', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('old', '- OLD\n'.repeat(10000))]))
    transcript.render(80)
    transcript.cancelNativeReplay()
    expect(await drainPrepared(transcript)).toEqual([])
    transcript.update(snapshot([node('new', 'NEW_SESSION')], 'other'))
    expect((await drainPrepared(transcript)).join('\n')).toContain('NEW_SESSION')
    expect(await transcript.waitNativePreparation()).toBe(false)
  } finally { transcript.dispose() }
}, 60000)

it('preserves a giant code line including surrogate pairs and source spaces', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = '```text\n  ' + '中文😀'.repeat(10000) + '  \n```'
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('giant', source)]))
    const actual = await drainPrepared(transcript)
    expect(actual).toEqual(new Markdown(source, 0, 0, markdownTheme).renderUnpadded(76).map(line => line === '' ? '' : '  ' + line))
    expect(actual.join('').match(/😀/gu)).toHaveLength(10000)
  } finally { transcript.dispose() }
}, 60000)

it('prepares a mixed reasoning header and large plain body without losing final source lines', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = Array.from({ length: 4000 }, (_, i) => `REASONING_${i} 中文😀`).join('\n')
  const reasoning = { ...node('reasoning', '', true), data: { status: 'running', turn: 1, step: 1, time: 1,
    blocks: [{ kind: 'reasoning', text: source }] } } as ChatConversationViewNode
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([reasoning]))
    transcript.render(80); await transcript.waitNativePreparation()
    expect(transcript.render(80).join('\n')).toContain('REASONING_3999')
    transcript.finishNativeHistory()
    const actual = (await drainPrepared(transcript)).join('\n')
    expect(actual.match(/REASONING_\d+/gu)).toEqual(Array.from({ length: 4000 }, (_, i) => `REASONING_${i}`))
  } finally { transcript.dispose() }
}, 60000)

it('surfaces preparation failure without producing or acknowledging a history batch', async () => {
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, () => { throw new Error('fixture worker failure') })
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('failed', '- FAIL\n'.repeat(10000))]))
    try { transcript.render(80) } catch (error) { expect(String(error)).toContain('fixture worker failure') }
    await expect(transcript.waitNativePreparation()).rejects.toThrow('fixture worker failure')
    expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
    expect(() => transcript.render(80)).toThrow('fixture worker failure')
  } finally { transcript.dispose() }
})

it('keeps the last prepared live preview visible while coalescing newer snapshots', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = '- START\n' + '- row value\n'.repeat(4000) + '- VISIBLE_PREVIEW'
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('live-coalesced', source, true)]))
    transcript.render(80); await transcript.waitNativePreparation()
    transcript.update(snapshot([node('live-coalesced', source + '\n- LATEST', true)]))
    expect(transcript.render(80).join('\n')).toContain('VISIBLE_PREVIEW')
    expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
    transcript.setNativeMode(false)
    expect(await transcript.waitNativePreparation()).toBe(false)
  } finally { transcript.dispose() }
}, 60000)

it('rewraps undelivered pages after a shrink without truncating their right-hand source', async () => {
  vi.stubEnv('NO_COLOR', '1')
  const source = Array.from({ length: 2000 }, (_, i) => `- ROW_${i}_abcdefghijklmnopqrstuvwxyz_END`).join('\n')
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  try {
    transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
    transcript.update(snapshot([node('resize-pages', source)]))
    transcript.render(100); await transcript.waitNativePreparation(); transcript.render(100)
    const first = transcript.takeNativeHistoryBatch()!
    first.acknowledge()
    const remaining = await drainPrepared(transcript, 24)
    const actual = [...first.lines, ...remaining].join('').replace(/\x1b\[[0-9;]*m/gu, '').replace(/ /gu, '')
    expect(actual.match(/ROW_\d+_abcdefghijklmnopqrstuvwxyz_END/gu)).toEqual(Array.from({ length: 2000 }, (_, i) => `ROW_${i}_abcdefghijklmnopqrstuvwxyz_END`))
  } finally { transcript.dispose() }
}, 60000)

it('bounds worker concurrency and starts queued preparation only after a slot is released', async () => {
  vi.stubEnv('NO_COLOR', '1')
  let started = 0, active = 0, peak = 0
  const factory = () => {
    started++; active++; peak = Math.max(peak, active)
    const worker = workerFactory()
    worker.once('exit', () => { active-- })
    return worker
  }
  const jobs = Array.from({ length: 3 }, () => new NativeMarkdownPreparation('- ROW\n'.repeat(10000), 76, 0, undefined, () => {}, factory))
  try {
    await Promise.all(jobs.slice(0, 2).map(job => job.wait()))
    expect(started).toBe(2)
    expect(jobs[2]!.page()).toBeUndefined()
    jobs[0]!.dispose()
    await jobs[2]!.wait()
    expect(started).toBe(3)
    expect(peak).toBeLessThanOrEqual(2)
  } finally { for (const job of jobs) job.dispose() }
}, 60000)

it('publishes native geometry after delivery and rejects stale generation geometry', async () => {
  let release!: () => void
  const output = new NativeOutput(() => new Promise<void>(resolve => { release = resolve }), () => {})
  const first = output.frame(['H'], ['DRAFT'], 40, 10, null)
  await Promise.resolve()
  expect(output.presentedFrame()).toBeUndefined()
  release(); await first
  expect(output.presentedFrame()).toMatchObject({ tailRow: 9, width: 40, height: 10 })
  const second = output.frame([], ['CHANGED'], 40, 10, null)
  await Promise.resolve()
  output.reset()
  release(); await second
  expect(output.presentedFrame()).toBeUndefined()
})

it('explains source removal and reordering once, including deletion of all sources', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const a = node('a', 'FIRST'), b = node('b', 'SECOND')
  const flush = () => {
    transcript.render(80)
    const batch = transcript.takeNativeHistoryBatch()
    batch?.acknowledge()
    return batch?.lines.join('\n') ?? ''
  }
  transcript.update(snapshot([a, b])); flush()
  transcript.update(snapshot([b, a])); expect(flush()).toContain('/transcript replay')
  expect(flush()).toBe('')
  transcript.update(snapshot([])); expect(flush()).toContain('/transcript replay')
  expect(flush()).toBe('')
  transcript.dispose()
})

it('preserves code source trailing spaces without padding history to the terminal width', () => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('code', '```\n  SOURCE  \n```')]))
  transcript.render(80)
  const batch = transcript.takeNativeHistoryBatch()!
  expect(batch.lines).toEqual(['      SOURCE  '])
  transcript.dispose()
})

it('retains partial physical delivery after cancellation without claiming source coverage', () => {
  const ledger = new NativeHistory()
  const receipt = ledger.reserve('long', ['source'], 0, 10000, 'source', true)
  ledger.deliver(receipt, 256)
  ledger.discardPending()
  expect(ledger.deliveredFor('long')).toEqual({ receipt, lines: 256 })
  expect(ledger.get('long')).toBeUndefined()
  expect(ledger.acknowledge(receipt)).toBe(false)
  ledger.reset()
  ledger.deliver(receipt, 256)
  expect(ledger.deliveredFor('long')).toBeUndefined()
})

it('does not rescan history when a prepared batch is acknowledged', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('a', 'FIRST'), node('b', 'SECOND')]))
  transcript.render(80)
  const batch = transcript.takeNativeHistoryBatch()!
  const scanned = internals.nativeSnapshotBlocksChecked
  batch.acknowledge()
  expect(internals.nativeSnapshotBlocksChecked).toBe(scanned)
  transcript.dispose()
})

it('commits stable answer paragraphs from a mixed reasoning and text node before settled', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const mixed = { ...node('mixed', '', true), data: { status: 'running', turn: 1, step: 1, time: 1,
    blocks: [{ kind: 'reasoning', text: 'Reasoning complete' }, { kind: 'text', text: 'FIRSTPARAGRAPH\n\nLIVESUFFIX' }] } } as ChatConversationViewNode
  transcript.update(snapshot([mixed]))
  const tail = transcript.render(80).join('\n')
  const batch = transcript.takeNativeHistoryBatch()!
  expect(batch.lines.join('\n')).toContain('FIRSTPARAGRAPH')
  expect(tail).toContain('LIVESUFFIX')
  batch.acknowledge()
  expect(transcript.render(80).join('\n')).not.toContain('FIRSTPARAGRAPH')
  transcript.dispose()
})

it('records an in-flight success arriving after cancellation without committing or crossing epochs', () => {
  const ledger = new NativeHistory()
  const receipt = ledger.reserve('late', ['source'], 0, 1000, 'source', true)
  ledger.discardPending()
  ledger.deliver(receipt, 256)
  expect(ledger.deliveredFor('late')?.lines).toBe(256)
  expect(ledger.acknowledge(receipt)).toBe(false)
  expect(ledger.get('late')).toBeUndefined()
  ledger.reset(); ledger.deliver(receipt, 256)
  expect(ledger.deliveredFor('late')).toBeUndefined()
})

it('prepares a long code block in source batches and covers all lines once', () => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const source = Array.from({ length: 2000 }, (_, i) => `CODE_${i}`)
  transcript.update(snapshot([node('long-code', '```ts\n' + source.join('\n') + '\n```')]))
  const emitted: string[] = []
  for (let i = 0; i < 30; i++) {
    const before = internals.nativeHistoryLinesPrepared
    transcript.render(80)
    expect(internals.nativeHistoryLinesPrepared - before).toBeLessThanOrEqual(129)
    const batch = transcript.takeNativeHistoryBatch()
    if (!batch) break
    emitted.push(...batch.lines); batch.acknowledge()
  }
  expect(emitted.map(line => line.trim())).toEqual(source)
  transcript.dispose()
})

it('does not commit a pending or cancelled receipt; exact same-length edits remain visible', () => {
  const ledger = new NativeHistory()
  const receipt = ledger.reserve('a', ['abc'], 0, 3, 'abc', true)
  expect(ledger.isCommitted('a', ['abc'])).toBe(false)
  ledger.acknowledge(receipt)
  expect(ledger.isCommitted('a', ['abc'])).toBe(true)
  expect(ledger.isCommitted('a', ['xbc'])).toBe(false)
  const late = ledger.reserve('b', ['def'], 0, 3, 'def', true)
  ledger.reset()
  expect(ledger.acknowledge(late)).toBe(false)
})

it('waits for slow output before acknowledging, serializes controls, drops queued old epochs', async () => {
  const bytes: string[] = []
  let release!: () => void
  const output = new NativeOutput(async text => {
    bytes.push(text)
    if (bytes.length === 1) await new Promise<void>(resolve => { release = resolve })
  }, error => { throw error })
  const first = output.frame(['FIRST'], ['draft'], 80, 24, null)
  await Promise.resolve()
  const second = output.frame(['CANCELLED'], ['draft'], 80, 24, null)
  output.reset(); output.control('CONTROL')
  expect(bytes).toHaveLength(1)
  release()
  expect(await first).toBe(true)
  expect(await second).toBe(false)
  await output.drain()
  expect(bytes.join('')).not.toContain('CANCELLED')
  expect(bytes.at(-1)).toBe('CONTROL')
})

it('stops after an uncertain partial write without retrying or acknowledging', async () => {
  const fail = vi.fn(), sink = vi.fn(async () => { throw new Error('partial write') })
  const output = new NativeOutput(sink, fail)
  expect(await output.frame(['ONCE'], [], 80, 24, null)).toBe(false)
  expect(await output.frame(['NEVER'], [], 80, 24, null)).toBe(false)
  await expect(output.drain()).rejects.toThrow('partial write')
  expect(sink).toHaveBeenCalledTimes(1)
  expect(fail).toHaveBeenCalledTimes(1)
})

it('honors a real Writable high-water mark and asynchronous completion', async () => {
  const callbacks: (() => void)[] = []
  const stream = new Writable({ highWaterMark: 1, write(_bytes, _encoding, callback) { callbacks.push(callback) } })
  const write = streamSink(stream)
  let done = false
  const pending = write('中文😀').then(() => { done = true })
  await Promise.resolve()
  expect(stream.writableNeedDrain).toBe(true)
  expect(done).toBe(false)
  callbacks[0]!()
  await pending
  expect(done).toBe(true)
  expect(stream.listenerCount('drain')).toBe(0)
  stream.destroy()
})

it('handles Writable callback failure followed by error emission without an uncaught error', async () => {
  const stream = new Writable({ write(_bytes, _encoding, callback) { callback(new Error('EPIPE fixture')) } })
  await expect(streamSink(stream)('pending')).rejects.toThrow('EPIPE fixture')
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(stream.listenerCount('error')).toBe(0)
})

it('holds Markdown with unstable block or inline syntax instead of guessing a boundary', () => {
  expect(stableParagraphEnd('中文😀\n\nnext')).toBe(6)
  for (const text of ['```ts\na\n\n', '[label]\n\n', '*open\n\n', '- item\n\n', '<div>\n\n', 'a\r\n\r\n']) {
    expect(stableParagraphEnd(text)).toBe(0)
  }
})

it.each([1000, 10000, 100000])('removes %i committed history lines from ordinary render traversal', async count => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24, undefined, undefined, undefined, workerFactory)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('history', Array.from({ length: count }, (_, i) => `H${i}`).join('\n')), node('live', 'ACTIVE', true)]))
  const history: string[] = []
  for (let i = 0; i < count + 10; i++) {
    transcript.render(80)
    const batch = transcript.takeNativeHistoryBatch()
    if (!batch) { if (await transcript.waitNativePreparation()) continue; break }
    history.push(...batch.lines); batch.acknowledge()
  }
  expect(history.join('\n')).toContain(`H${count - 1}`)
  const prepared = internals.nativeHistoryLinesPrepared
  const checked = internals.nativeSnapshotBlocksChecked
  const visited = internals.nativeTailBlocksVisited
  for (let i = 0; i < 10; i++) expect(transcript.render(80).join('\n')).toContain('ACTIVE')
  expect(internals.nativeHistoryLinesPrepared).toBe(prepared)
  expect(internals.nativeSnapshotBlocksChecked).toBe(checked)
  expect(internals.nativeTailBlocksVisited - visited).toBe(10)
  transcript.dispose()
}, 60000)

it('preserves appended paragraphs and settled suffix once, and labels same-length historical revisions', () => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const emitted: string[] = []
  const flush = (): void => {
    for (let i = 0; i < 20; i++) {
      transcript.render(80)
      const batch = transcript.takeNativeHistoryBatch()
      if (!batch) return
      emitted.push(...batch.lines); batch.acknowledge()
    }
    throw new Error('did not settle')
  }
  transcript.update(snapshot([node('a', 'FIRST\n\nSECOND', true)])); flush()
  transcript.update(snapshot([node('a', 'FIRST\n\nSECOND FINAL')])); flush()
  const before = emitted.join('\n')
  expect(before.match(/FIRST/g)).toHaveLength(1)
  expect(before.match(/SECOND FINAL/g)).toHaveLength(1)
  transcript.refreshPresentation(); flush()
  expect(emitted.join('\n')).toBe(before)
  transcript.update(snapshot([node('a', 'OTHER\n\nSECOND FINAL')])); flush()
  expect(emitted.join('\n')).toContain('OTHER')
  expect(emitted.join('\n')).toMatch(/更新|Update/)
  transcript.dispose()
})

it('commits complete fenced code lines without fences, duplicate prefixes or a missing final line', () => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const emitted: string[] = []
  const flush = (): void => {
    for (let i = 0; i < 20; i++) {
      transcript.render(80)
      const batch = transcript.takeNativeHistoryBatch()
      if (!batch) return
      emitted.push(...batch.lines); batch.acknowledge()
    }
    throw new Error('did not settle')
  }
  transcript.update(snapshot([node('code', '```ts\nconst 中文 = "😀";\n/* unfinished', true)])); flush()
  expect(emitted.join('\n')).toContain('const 中文')
  expect(emitted.join('\n')).not.toContain('unfinished')
  expect(transcript.render(80).join('\n')).toContain('unfinished')
  transcript.update(snapshot([node('code', '```ts\nconst 中文 = "😀";\n/* unfinished\nEND_COMMENT */\nFINAL_LINE\n```\n')])); flush()
  const result = emitted.join('\n')
  for (const marker of ['const 中文', 'unfinished', 'END_COMMENT', 'FINAL_LINE']) expect(result.split(marker)).toHaveLength(2)
  expect(result).not.toContain('```')
  transcript.dispose()
})

it('keeps the uncommitted suffix visible while a receipt waits for output', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('a', 'COMPLETE\n\nUNCOMMITTED', true)]))
  expect(transcript.render(80).join('\n')).toContain('UNCOMMITTED')
  const batch = transcript.takeNativeHistoryBatch()!
  expect(transcript.render(80).join('\n')).toContain('UNCOMMITTED')
  expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
  batch.acknowledge()
  expect(transcript.render(80).join('\n')).not.toContain('COMPLETE\n')
  transcript.dispose()
})

it('ignores a late receipt from the previous Session and preserves the new Session output', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('a', 'OLD')], 'old'))
  transcript.render(80)
  const old = transcript.takeNativeHistoryBatch()!
  transcript.update(snapshot([node('a', 'NEW')], 'new'))
  old.acknowledge()
  transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()!.lines.join('\n')).toContain('NEW')
  transcript.dispose()
})

it('flushes the final mutable suffix for graceful shutdown without altering Harness data', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const value = snapshot([node('a', 'FINAL_WITHOUT_NEWLINE', true)])
  transcript.update(value)
  transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
  transcript.finishNativeHistory()
  transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()!.lines.join('\n')).toContain('FINAL_WITHOUT_NEWLINE')
  expect(value.chat.nodes.get('a')?.data).toMatchObject({ status: 'running' })
  transcript.dispose()
})

it('cancels replay without committing skipped history, accepts new messages, and allows explicit full replay', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const old = node('old', 'OLD_HISTORY\n'.repeat(1000))
  transcript.update(snapshot([old])); transcript.render(80)
  const cancelled = transcript.takeNativeHistoryBatch()!
  transcript.cancelNativeReplay(); cancelled.acknowledge()
  transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
  transcript.update(snapshot([old, node('new', 'NEW_MESSAGE')]))
  transcript.render(80)
  const next = transcript.takeNativeHistoryBatch()!
  expect(next.lines.join('\n')).toContain('NEW_MESSAGE')
  expect(next.lines.join('\n')).not.toContain('OLD_HISTORY')
  next.acknowledge()
  transcript.resetNativeHistory(); transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()!.lines.join('\n')).toContain('OLD_HISTORY')
  transcript.dispose()
})

it('does not treat Welcome or full-mode content as cancellable native backfill', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeTailEnabled(true); transcript.setNativeMode(true)
  transcript.update(snapshot([])); transcript.render(80)
  expect(transcript.nativeHistoryPending()).toBe(false)
  transcript.setNativeMode(false)
  transcript.update(snapshot([node('a', 'full mode history')]))
  expect(transcript.nativeHistoryPending()).toBe(false)
  transcript.dispose()
})

it('does not duplicate a legacy partial when its durable node appears under a different key', () => {
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  const partial = { ...snapshot([]), partial: { blocks: [{ kind: 'text', text: 'PREFIX\n\nSUFFIX' }] } } as unknown as ConversationSnapshot
  transcript.update(partial); transcript.render(80)
  expect(transcript.takeNativeHistoryBatch()).toBeUndefined()
  transcript.update(snapshot([node('durable', 'PREFIX\n\nSUFFIX')]))
  transcript.render(80)
  const batch = transcript.takeNativeHistoryBatch()!
  expect(batch.lines.join('\n').match(/PREFIX/gu)).toHaveLength(1)
  transcript.dispose()
})
