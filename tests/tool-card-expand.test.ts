import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { setUiLocale } from '../src/client/locale.ts'
import { Transcript } from '../src/client/transcript.ts'

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

function tool(key: string, title: string, result: string): ChatConversationViewNode {
  return {
    ...chatNode(key, {
      root: {
        kind: 'tool-result',
        callId: key,
        call: { name: 'fixture_tool', argsRaw: `{"title":"${title}"}` },
        callView: { card: 'generic', title, rawInput: { title } },
        resultView: { card: 'generic', content: [{ type: 'text', text: result }] },
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

describe('per-card tool expand', () => {
  it('expands only the focused tool card on Enter while leaving others collapsed', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    transcript.update(snapshot([
      tool('a', 'First tool', 'result-a'),
      tool('b', 'Second tool', 'result-b'),
    ]))
    transcript.focused = true
    expect(stripAnsi(transcript.render(80).join('\n'))).not.toContain('result-a')
    expect(stripAnsi(transcript.render(80).join('\n'))).not.toContain('result-b')

    expect(transcript.enterToolFocus()).toBe(true)
    expect(stripAnsi(transcript.render(80).join('\n'))).toMatch(/›.*First tool/u)
    expect(transcript.activateFocused()).toEqual({ kind: 'tool', key: 'a' })
    const first = stripAnsi(transcript.render(80).join('\n'))
    expect(first).toContain('result-a')
    expect(first).not.toContain('result-b')

    transcript.handleInput('\u001b[B')
    expect(stripAnsi(transcript.render(80).join('\n'))).toMatch(/›.*Second tool/u)
    expect(transcript.activateFocused()).toEqual({ kind: 'tool', key: 'b' })
    const both = stripAnsi(transcript.render(80).join('\n'))
    expect(both).toContain('result-a')
    expect(both).toContain('result-b')
  })

  it('lets arrow keys scroll until tool-card focus mode is entered', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    transcript.update(snapshot([
      tool('a', 'First tool', 'result-a'),
      tool('b', 'Second tool', 'result-b'),
    ]))
    transcript.focused = true
    transcript.handleInput('\u001b[B')
    expect(stripAnsi(transcript.render(80).join('\n'))).not.toMatch(/›/u)
    expect(transcript.activateFocused()).toBeUndefined()
    expect(transcript.enterToolFocus()).toBe(true)
    expect(transcript.exitToolFocus()).toBe(true)
    expect(stripAnsi(transcript.render(80).join('\n'))).not.toMatch(/›/u)
  })
})
