import { arch, platform, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { internals, Transcript } from '../src/client/transcript.ts'

function assistant(key: string, text: string): ChatConversationViewNode {
  return {
    key,
    kind: 'fixture',
    id: key,
    target: 'chat',
    anchorSeq: 1,
    location: { kind: 'session' },
    visibility: 'visible',
    data: {
      kind: 'assistant',
      seq: 2,
      time: 2,
      turn: 1,
      step: 1,
      blocks: [{ kind: 'text', text }],
    },
  }
}

function snapshot(nodes: readonly ChatConversationViewNode[]): ConversationSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    sessionId: 'performance-fixture',
    views: { get: () => undefined },
    chat: {
      order: nodes.map(node => node.key),
      nodes: { get: (key: string) => byKey.get(key), values: () => nodes },
      locations: { getTurn: () => [], getStep: () => [] },
      timeline: { turnOrder: [], turns: new Map() },
      legacy: {
        nodes: [],
        turnTimings: new Map(),
        turnEnds: new Map(),
        partial: null,
        runningCalls: [],
      },
    },
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[Math.max(0, index)] ?? 0
}

function summary(values: readonly number[]): { p50: number, p95: number, p99: number } {
  const round = (value: number): number => Number(value.toFixed(3))
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
  }
}

function positiveIntegers(value: string | undefined, fallback: readonly number[]): number[] {
  const parsed = (value ?? '').split(',').map(item => Number(item.trim()))
    .filter(item => Number.isInteger(item) && item > 0)
  return parsed.length === 0 ? [...fallback] : parsed
}

const enabled = process.env.SEEKTTY_PERF_RUN === '1'

describe('TUI performance harness', () => {
  if (!enabled) {
    it('stays opt-in during the ordinary test suite', () => {
      expect(process.env.SEEKTTY_PERF_RUN).not.toBe('1')
    })
    return
  }

  it('records repeatable transcript update and render samples', () => {
    vi.stubEnv('NO_COLOR', '1')
    const sizes = positiveIntegers(process.env.SEEKTTY_PERF_SIZES, [1_000, 10_000, 50_000, 100_000])
    const repeats = positiveIntegers(process.env.SEEKTTY_PERF_REPEATS, [3])[0] ?? 3
    const repeatIndex = positiveIntegers(process.env.SEEKTTY_PERF_REPEAT_INDEX, [1])[0] ?? 1
    const width = positiveIntegers(process.env.SEEKTTY_PERF_WIDTH, [80])[0] ?? 80
    const rows = positiveIntegers(process.env.SEEKTTY_PERF_ROWS, [24])[0] ?? 24
    const runs: unknown[] = []

    for (let localRepeat = 0; localRepeat < repeats; localRepeat += 1) {
      const repeat = repeatIndex + localRepeat
      for (const requestedLines of sizes) {
        globalThis.gc?.()
        const memoryBefore = process.memoryUsage()
        const nodeCount = Math.max(1, Math.ceil(requestedLines / 100))
        let nodes = Array.from({ length: nodeCount }, (_, index) => assistant(
          `assistant-${String(index)}`,
          Array.from({ length: 100 }, (_, line) => `line-${String(index)}-${String(line)}`).join('\n'),
        ))
        const transcript = new Transcript(() => rows)
        const initialStarted = performance.now()
        transcript.update(snapshot(nodes))
        const initialUpdateMs = performance.now() - initialStarted
        transcript.render(width) // Populate component line caches before cached-render samples.

        const cachedRenderMs: number[] = []
        const cachedRenderComponents: number[] = []
        for (let sample = 0; sample < 25; sample += 1) {
          const beforeComponents = internals.componentRenders
          const started = performance.now()
          const visible = transcript.render(width)
          cachedRenderMs.push(performance.now() - started)
          cachedRenderComponents.push(internals.componentRenders - beforeComponents)
          expect(visible.length).toBe(rows)
        }

        const tailUpdateRenderMs: number[] = []
        for (let sample = 0; sample < 10; sample += 1) {
          const previous = nodes.at(-1)
          if (previous === undefined) throw new Error('performance fixture requires one node')
          const previousText = (previous.data as { blocks: readonly { text: string }[] }).blocks[0]?.text ?? ''
          nodes = [...nodes.slice(0, -1), assistant(previous.key, `${previousText}\nstream-${String(sample)}`)]
          const next = snapshot(nodes)
          const started = performance.now()
          transcript.update(next)
          const visible = transcript.render(width)
          tailUpdateRenderMs.push(performance.now() - started)
          expect(visible.length).toBe(rows)
        }

        globalThis.gc?.()
        const memoryAfter = process.memoryUsage()
        const toMiB = (bytes: number): number => Number((bytes / (1024 * 1024)).toFixed(3))
        transcript.dispose()
        runs.push({
          repeat,
          requestedLines,
          nodeCount,
          initialUpdateMs: Number(initialUpdateMs.toFixed(3)),
          cachedRenderMs: summary(cachedRenderMs),
          tailUpdateRenderMs: summary(tailUpdateRenderMs),
          cachedRenderComponentCalls: {
            max: Math.max(...cachedRenderComponents),
            total: cachedRenderComponents.reduce((sum, value) => sum + value, 0),
          },
          memoryMiB: {
            heapUsed: toMiB(memoryAfter.heapUsed),
            heapDelta: toMiB(memoryAfter.heapUsed - memoryBefore.heapUsed),
            rss: toMiB(memoryAfter.rss),
            rssDelta: toMiB(memoryAfter.rss - memoryBefore.rss),
          },
        })
      }
    }

    console.log(`SEEKTTY_PERF_RESULT ${JSON.stringify({
      schema: 1,
      commit: process.env.SEEKTTY_PERF_COMMIT,
      runtime: {
        node: process.version,
        platform: platform(),
        release: release(),
        arch: arch(),
      },
      fixture: {
        width,
        rows,
        linesPerNode: 100,
        cachedRenderSamples: 25,
        tailUpdateSamples: 10,
        repeats,
        sizes,
      },
      runs,
    })}`)
  }, 120_000)
})
