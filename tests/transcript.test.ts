import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
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

function assistantStep(
  key: string,
  status: 'running' | 'settled',
  blocks: readonly unknown[],
): ChatConversationViewNode {
  return {
    ...chatNode(key, { status, turn: 1, step: 1, blocks, time: 1 }),
    kind: 'assistant-step',
  }
}

function snapshot(
  nodes: readonly ChatConversationViewNode[],
  history: {
    readonly hasMore?: boolean
    readonly loadingOlder?: boolean
    readonly runningCalls?: ConversationSnapshot['runningCalls']
  } = {},
): ConversationSnapshot {
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
    runningCalls: history.runningCalls ?? [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: history.hasMore ?? false,
    loadingOlder: history.loadingOlder ?? false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}

const user = (key: string, text: string): ChatConversationViewNode => chatNode(key, {
  kind: 'user',
  seq: 1,
  time: 1,
  source: null,
  content: [{ type: 'text', text }],
})

const assistant = (key: string, text: string): ChatConversationViewNode => chatNode(key, {
  kind: 'assistant',
  seq: 2,
  time: 2,
  turn: 1,
  step: 1,
  blocks: [
    { kind: 'reasoning', text: '内部推理' },
    { kind: 'text', text },
  ],
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('conversation viewport', () => {
  it('breathes while reasoning and stops as soon as answer text begins', () => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([
      assistantStep('a1', 'running', [{ kind: 'reasoning', text: '内部推理' }]),
    ]))

    const dim = transcript.render(40).join('\n')
    expect(dim).toContain('\u001B[38;2;52;65;95m◆')
    expect(dim).toContain('正在思考…')

    vi.advanceTimersByTime(640)
    const bright = transcript.render(40).join('\n')
    expect(bright).toContain('\u001B[38;2;145;167;255m◆')
    expect(requestRender).toHaveBeenCalledTimes(4)

    transcript.update(snapshot([
      assistantStep('a1', 'running', [
        { kind: 'reasoning', text: '内部推理' },
        { kind: 'text', text: '开始回答' },
      ]),
    ]))
    expect(transcript.render(40).join('\n')).not.toContain('正在思考…')
    const calls = requestRender.mock.calls.length
    vi.advanceTimersByTime(640)
    expect(requestRender).toHaveBeenCalledTimes(calls)
    transcript.dispose()
  })

  it('keeps a static thinking indicator when terminal color is disabled', () => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', '1')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([
      assistantStep('a1', 'running', [{ kind: 'reasoning', text: '内部推理' }]),
    ]))

    expect(transcript.render(40).join('\n')).toContain('◆ 正在思考…')
    vi.advanceTimersByTime(640)
    expect(requestRender).not.toHaveBeenCalled()
    transcript.dispose()
  })

  it('breathes on a running tool marker and stops when the tool leaves the running set', () => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([], {
      runningCalls: [{
        callId: 'call-1',
        name: 'Russia Ukraine war latest news ceasefire 2025',
        argsRaw: '{}',
        turn: 1,
        step: 1,
        time: 1,
        callView: null,
        subCalls: [],
      }],
    }))

    const dim = transcript.render(80).join('\n')
    expect(dim).toContain('\u001B[38;2;52;65;95m◆')
    expect(dim).toContain('Russia Ukraine war latest news ceasefire 2025')
    expect(dim).toContain('运行中')

    vi.advanceTimersByTime(640)
    expect(transcript.render(80).join('\n')).toContain('\u001B[38;2;145;167;255m◆')
    expect(requestRender).toHaveBeenCalledTimes(4)

    transcript.update(snapshot([]))
    const calls = requestRender.mock.calls.length
    vi.advanceTimersByTime(640)
    expect(requestRender).toHaveBeenCalledTimes(calls)
    transcript.dispose()
  })

  it('grows a short conversation upward from the composer edge', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot([user('u1', '问题'), assistant('a1', '回答')]))

    const rows = transcript.render(40)
    expect(rows).toHaveLength(8)
    expect(rows.slice(0, 5)).toEqual(['', '', '', '', ''])
    expect(rows.at(-3)).toContain('> 问题')
    expect(rows.join('\n')).not.toContain('❯ 问题')
    expect(rows.at(-1)).toContain('回答')
  })

  it('renders a sent message as a plain prompt line without a background strip', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const transcript = new Transcript(() => 4)
    transcript.update(snapshot([user('u1', '问题'), assistant('a1', '回答')]))

    const userRow = transcript.render(40).find(row => row.includes('问题'))
    expect(userRow).toBeDefined()
    expect(userRow).not.toContain('\u001B[48;')
  })

  it('marks silently clipped history and removes settled thinking chrome', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 5)
    transcript.update(snapshot([
      user('u1', '第一个问题'),
      assistant('a1', '第一段回答\n第二段回答\n第三段回答'),
      user('u2', '第二个问题'),
      assistant('a2', '最新回答'),
    ]))

    const rendered = transcript.render(40).join('\n')
    expect(rendered).toContain('行更早内容 · 滚轮上翻')
    expect(rendered).not.toContain('思考完成')
    expect(rendered).toContain('最新回答')
  })

  it('starts the latest viewport at a complete user turn when it fits', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 7)
    transcript.update(snapshot([
      user('u1', '较早问题'),
      assistant('a1', '较早回答第一行\n不应悬在顶部的尾行'),
      user('u2', '最新问题'),
      assistant('a2', '最新回答第一行\n最新回答第二行'),
    ]))

    const rendered = transcript.render(40).join('\n')
    expect(rendered).toContain('行更早内容 · 滚轮上翻')
    expect(rendered).not.toContain('不应悬在顶部的尾行')
    expect(rendered).toContain('> 最新问题')
    expect(rendered).toContain('最新回答第二行')
  })

  it('pages through older history and returns to the latest output', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([
      user('u1', '第一个问题'),
      assistant('a1', '第一段回答\n第二段回答\n第三段回答'),
      user('u2', '第二个问题'),
      assistant('a2', '第四段回答\n第五段回答'),
      user('u3', '第三个问题'),
      assistant('a3', '最新回答'),
    ]))

    const latest = transcript.render(40).join('\n')
    expect(latest).toContain('最新回答')
    expect(latest).toContain('滚轮上翻')

    transcript.focused = true
    transcript.handleInput('\u001B[5~')
    const previousPage = transcript.render(40).join('\n')
    expect(requestRender).toHaveBeenCalledTimes(1)
    expect(previousPage).not.toBe(latest)
    expect(previousPage).toContain('行更新内容 · PgDn/End')

    transcript.handleInput('\u001B[H')
    expect(transcript.render(40).join('\n')).toContain('第一个问题')

    transcript.handleInput('\u001B[F')
    const returned = transcript.render(40).join('\n')
    expect(returned).toContain('最新回答')
    expect(returned).toContain('行更早内容 · PgUp/Home')
    expect(requestRender).toHaveBeenCalledTimes(3)
  })

  it('scrolls by mouse-sized line increments without changing focus', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([
      user('u1', '第一个问题'),
      assistant('a1', '第一段回答\n第二段回答\n第三段回答\n第四段回答'),
      user('u2', '最新问题'),
      assistant('a2', '最新回答'),
    ]))
    transcript.render(40)

    expect(transcript.scrollBy(3)).toBe(true)
    expect(transcript.render(40).join('\n')).toContain('滚轮下翻')
    expect(requestRender).toHaveBeenCalledTimes(1)
    expect(transcript.focused).toBe(false)

    expect(transcript.scrollBy(-3)).toBe(true)
    expect(transcript.render(40).join('\n')).toContain('最新回答')
    expect(requestRender).toHaveBeenCalledTimes(2)
  })

  it('requests the preceding Harness page at the loaded history boundary', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestOlder = vi.fn()
    const transcript = new Transcript(() => 5, () => undefined, requestOlder)
    const nodes = [
      user('u1', '当前已加载的最早问题'),
      assistant('a1', '第一段回答\n第二段回答\n第三段回答\n第四段回答'),
      user('u2', '最新问题'),
      assistant('a2', '最新回答'),
    ]
    transcript.update(snapshot(nodes, { hasMore: true }))
    transcript.render(40)

    expect(transcript.scrollBy(100)).toBe(true)
    expect(transcript.render(40).join('\n')).toContain('还有更早内容 · 滚轮上翻')
    expect(transcript.scrollBy(3)).toBe(false)
    expect(requestOlder).toHaveBeenCalledTimes(1)

    transcript.update(snapshot(nodes, { hasMore: true, loadingOlder: true }))
    expect(transcript.render(40).join('\n')).toContain('正在加载更早内容')
    expect(transcript.scrollBy(3)).toBe(false)
    expect(requestOlder).toHaveBeenCalledTimes(1)
  })
})
