import { afterEach, expect, it, vi } from 'vitest'
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

it.each([1000, 10000, 100000])('removes %i committed history lines from ordinary render traversal', count => {
  vi.stubEnv('NO_COLOR', '1')
  const transcript = new Transcript(() => 24)
  transcript.setNativeMode(true); transcript.setNativeTailEnabled(true)
  transcript.update(snapshot([node('history', Array.from({ length: count }, (_, i) => `H${i}`).join('\n')), node('live', 'ACTIVE', true)]))
  const history: string[] = []
  for (let i = 0; i < count + 10; i++) {
    transcript.render(80)
    const batch = transcript.takeNativeHistoryBatch()
    if (!batch) break
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
