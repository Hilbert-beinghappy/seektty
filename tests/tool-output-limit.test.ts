import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { foldLineBlock } from '../src/client/tool-output-limit.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { Transcript } from '../src/client/transcript.ts'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'
import { normalizeBehavior } from '../src/client/behavior.ts'

function chatNode(key: string, data: unknown): ChatConversationViewNode {
  return {
    key,
    kind: 'fixture',
    id: key,
    target: 'chat',
    anchorSeq: 1,
    location: { kind: 'session' },
    visibility: 'visible',
    data,
  }
}

function tool(output: string): ChatConversationViewNode {
  return {
    ...chatNode('shell-1', {
      root: {
        kind: 'tool-result',
        callId: 'shell-1',
        call: { name: 'bash', argsRaw: '{"command":"seq"}' },
        callView: { card: 'terminal', title: 'seq 1 250' },
        resultView: { card: 'terminal', output, exitCode: 0 },
        content: [],
        meta: undefined,
        isError: false,
        turn: 1,
        step: 1,
        time: 25,
        callTime: 10,
        subCalls: [],
      },
    }),
    kind: 'tool-call',
  }
}

function snapshot(nodes: readonly ChatConversationViewNode[]): ConversationSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    sessionId: 'session',
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

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;:]*m/gu, '')
}

afterEach(() => {
  vi.unstubAllEnvs()
  setUiLocale('zh')
})

describe('tool output folding', () => {
  it('keeps the first N lines and appends a remaining-line footer', () => {
    const lines = Array.from({ length: 250 }, (_, index) => `line-${String(index + 1)}`)
    const folded = foldLineBlock(lines.join('\n'), 200)
    expect(folded.omitted).toBe(50)
    expect(folded.text.split('\n')).toEqual([
      ...lines.slice(0, 200),
      '还有 50 行',
    ])
    expect(foldLineBlock(lines.join('\n'), 0).omitted).toBe(0)
    expect(foldLineBlock(lines.join('\n'), 0).text).toBe(lines.join('\n'))
  })

  it('folds expanded shell output using the behavior default of 200 lines', () => {
    vi.stubEnv('NO_COLOR', '1')
    expect(normalizeBehavior(undefined).toolOutputLineLimit).toBe(200)
    expect(DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit).toBe(200)
    const output = Array.from({ length: 250 }, (_, index) => `line-${String(index + 1)}`).join('\n')
    const transcript = new Transcript()
    transcript.cycleToolVisibility()
    transcript.update(snapshot([tool(output)]))
    const rendered = stripAnsi(transcript.render(80).join('\n'))
    expect(rendered).toContain('line-1')
    expect(rendered).toContain('line-200')
    expect(rendered).not.toContain('line-201')
    expect(rendered).toContain('还有 50 行')
  })
})
