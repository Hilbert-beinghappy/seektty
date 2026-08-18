import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { internals, Transcript } from '../src/client/transcript.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { setCodeHighlighter, setTheme } from '../src/client/theme.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'

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

const assistant = (key: string, text: string): ChatConversationViewNode => chatNode(key, {
  kind: 'assistant',
  seq: 2,
  time: 2,
  turn: 1,
  step: 1,
  blocks: [{ kind: 'text', text }],
})

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

afterEach(() => {
  internals.markdownCreated = 0
  internals.componentRenders = 0
  setCodeHighlighter()
  setTheme(BUILT_IN_THEMES.dark)
  setUiLocale('zh')
  vi.unstubAllEnvs()
})

describe('transcript node cache (task 5.2)', () => {
  it('rebuilds only the streaming node in a 5000-line session', () => {
    vi.stubEnv('NO_COLOR', '1')
    const nodes = Array.from({ length: 250 }, (_, index) =>
      assistant(`a${String(index)}`, Array.from({ length: 20 }, () => `line-${String(index)}`).join('\n')))
    const transcript = new Transcript(() => Number.POSITIVE_INFINITY)
    transcript.update(snapshot(nodes))
    expect(internals.markdownCreated).toBe(250)
    const created = internals.markdownCreated
    const last = nodes.at(-1)
    if (last === undefined) throw new Error('expected a last assistant node')
    transcript.update(snapshot([
      ...nodes.slice(0, -1),
      assistant(last.key, `${(last.data as { blocks: readonly { text: string }[] }).blocks[0]?.text ?? ''}\nstreamed`),
    ]))
    expect(internals.markdownCreated - created).toBe(1)
  })

  it('reuses unchanged component output across pulse frames', () => {
    vi.stubEnv('NO_COLOR', '1')
    const nodes = Array.from({ length: 40 }, (_, index) =>
      assistant(`a${String(index)}`, 'stable body'))
    const transcript = new Transcript(() => Number.POSITIVE_INFINITY)
    transcript.update(snapshot(nodes))
    transcript.render(80)
    const first = internals.componentRenders
    expect(first).toBeGreaterThan(0)
    transcript.render(80)
    expect(internals.componentRenders).toBe(first)
  })

  it('rebuilds when deliverables change even if node.data stays the same', () => {
    vi.stubEnv('NO_COLOR', '1')
    const data = {
      kind: 'assistant',
      seq: 2,
      time: 2,
      turn: 1,
      step: 1,
      blocks: [{ kind: 'text', text: 'done' }],
    }
    const node = (files: readonly string[]): ChatConversationViewNode => ({
      ...assistant('a1', 'done'),
      data,
      location: {
        kind: 'turn',
        turn: {
          turn: 1,
          data: {
            get: (key: string) => key === 'deliverables'
              ? { produced: files.map(path => ({ seq: 1, path })) }
              : undefined,
          },
        },
      },
    } as ChatConversationViewNode)
    const transcript = new Transcript(() => Number.POSITIVE_INFINITY)
    transcript.update(snapshot([node([])]))
    expect(transcript.render(80).join('\n')).not.toContain('notes.md')
    transcript.update(snapshot([node(['notes.md'])]))
    expect(transcript.render(80).join('\n')).toContain('notes.md')
  })
})
