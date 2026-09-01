import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth } from '@mariozechner/pi-tui'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { Transcript } from '../src/client/transcript.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { color, interaction, setCodeHighlighter, setTheme } from '../src/client/theme.ts'
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

function tool(
  key: string,
  callView: unknown,
  resultView: unknown,
  content: readonly unknown[] = [],
  call: { readonly name: string; readonly argsRaw: string } = {
    name: 'fixture_tool',
    argsRaw: '{"path":"src/index.ts"}',
  },
): ChatConversationViewNode {
  return {
    ...chatNode(key, {
      root: {
        kind: 'tool-result',
        callId: key,
        call,
        callView,
        resultView,
        content,
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

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;:]*m/gu, '')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  setCodeHighlighter()
  setTheme(BUILT_IN_THEMES.dark)
  setUiLocale('zh')
})

describe('conversation viewport', () => {
  it('localizes terminal presentation without translating assistant content', () => {
    vi.stubEnv('NO_COLOR', '1')
    setUiLocale('en')
    const empty = new Transcript(() => 5)
    empty.update(snapshot([]))
    expect(empty.render(60).join('\n')).toContain('Enter a message below')

    const transcript = new Transcript(() => 5)
    transcript.update(snapshot([assistant('a1', '命令面板')]))
    const rendered = transcript.render(60).join('\n')
    expect(rendered).toContain('命令面板')
    expect(rendered).not.toContain('Command palette')
  })

  it('re-localizes the default empty prompt when the UI language changes', () => {
    vi.stubEnv('NO_COLOR', '1')
    setUiLocale('en')
    const transcript = new Transcript(() => 5)
    transcript.empty()
    expect(transcript.render(60).join('\n')).toContain('Enter a message below')
    setUiLocale('zh')
    transcript.refreshPresentation()
    expect(transcript.render(60).join('\n')).toContain('在下方输入消息')
  })

  it('renders every loaded line into the default terminal scrollback', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    transcript.update(snapshot([
      user('u1', '第一个问题'),
      assistant('a1', '第一段回答\n第二段回答\n第三段回答'),
      user('u2', '最新问题'),
      assistant('a2', '最新回答'),
    ]))

    const rendered = transcript.render(40).join('\n')
    expect(rendered).toContain('第一个问题')
    expect(rendered).toContain('第三段回答')
    expect(rendered).toContain('最新问题')
    expect(rendered).toContain('最新回答')
    expect(rendered).not.toContain('行更早内容')
  })

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
    expect(dim).toContain('内部推理')

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
    const answered = transcript.render(40).join('\n')
    expect(answered).not.toContain('正在思考…')
    expect(answered).not.toContain('内部推理')
    expect(answered).toContain('开始回答')
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
    expect(transcript.render(40).join('\n')).toContain('内部推理')
    vi.advanceTimersByTime(640)
    expect(requestRender).not.toHaveBeenCalled()
    transcript.dispose()
  })

  it('streams folded reasoning under the thinking marker until answer text begins', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistantStep('a1', 'running', [{ kind: 'reasoning', text: '先拆问题\n再核对边界' }]),
    ]))
    const thinking = transcript.render(40).join('\n')
    expect(thinking).toContain('正在思考…')
    expect(thinking).toContain('先拆问题')
    expect(thinking).toContain('再核对边界')

    transcript.toggleReasoning()
    transcript.update(snapshot([
      assistantStep('a1', 'settled', [
        { kind: 'reasoning', text: '先拆问题\n再核对边界' },
        { kind: 'text', text: '结论' },
      ]),
    ]))
    const shown = transcript.render(40).join('\n')
    expect(shown).not.toContain('正在思考…')
    expect(shown).toContain('思考')
    expect(shown).toContain('先拆问题')
    expect(shown).toContain('结论')
    transcript.dispose()
  })

  it('keeps a manually folded live reasoning region folded while tokens continue', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistantStep('a1', 'running', [{ kind: 'reasoning', text: '第一段推理' }]),
    ]))
    transcript.render(60)
    const key = 'a1'
    expect(transcript.pointerToggleReasoning(key)).toBe(true)
    expect(transcript.render(60).join('\n')).not.toContain('第一段推理')
    expect(transcript.render(60).join('\n')).toContain('已折叠')

    transcript.update(snapshot([
      assistantStep('a1', 'running', [{ kind: 'reasoning', text: '第一段推理\n新收到的推理' }]),
    ]))
    expect(transcript.render(60).join('\n')).not.toContain('新收到的推理')
    expect(transcript.pointerToggleReasoning(key)).toBe(true)
    expect(transcript.render(60).join('\n')).toContain('新收到的推理')
    transcript.dispose()
  })

  it('shows a clickable collapsed reasoning header after completion', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistantStep('a1', 'settled', [
        { kind: 'reasoning', text: '完成后的推理' },
        { kind: 'text', text: '结论' },
      ]),
    ]))
    const collapsedLines = transcript.render(60)
    const collapsed = collapsedLines.join('\n')
    expect(collapsed).toContain('思考（已折叠）')
    expect(collapsed).not.toContain('完成后的推理')
    const hits = transcript.controlHitRegions({ col: 0, row: 0, width: 60, height: 12 })
    const reasoningHit = hits.find(region => region.id === 'transcript:reasoning:a1')
    expect(reasoningHit?.rect.row).toBe(collapsedLines.findIndex(line => line.includes('思考（已折叠）')))
    expect(hits.some(region => region.id === 'transcript:reasoning:a1'
      && region.activation === 'direct'
      && region.action.kind === 'transcript'
      && region.action.command === 'toggle-reasoning')).toBe(true)

    expect(transcript.pointerToggleReasoning('a1')).toBe(true)
    expect(transcript.render(60).join('\n')).toContain('完成后的推理')
    transcript.dispose()
  })

  it('uses the theme hover color only on the reasoning disclosure triangle', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistantStep('a1', 'settled', [
        { kind: 'reasoning', text: '完成后的推理' },
        { kind: 'text', text: '结论' },
      ]),
    ]))
    const idle = transcript.render(60).find(line => stripAnsi(line).includes('思考（已折叠）')) ?? ''
    expect(transcript.setHoveredRegion('transcript:reasoning:a1')).toBe(true)
    const collapsed = transcript.render(60).find(line => stripAnsi(line).includes('思考（已折叠）')) ?? ''
    const hoverPrefix = interaction.hover('▸').slice(0, interaction.hover('▸').indexOf('▸'))
    const mutedPrefix = color.muted('x').slice(0, color.muted('x').indexOf('x'))
    expect(collapsed).not.toBe(idle)
    expect(collapsed).toContain(`${hoverPrefix}▸${mutedPrefix} `)
    expect(visibleWidth(collapsed)).toBe(visibleWidth(idle))

    expect(transcript.pointerToggleReasoning('a1')).toBe(true)
    const expanded = transcript.render(60).find(line => stripAnsi(line).includes('▾ 思考')) ?? ''
    const expandedPrefix = interaction.hover('▾').slice(0, interaction.hover('▾').indexOf('▾'))
    expect(expanded).toContain(`${expandedPrefix}▾`)
    expect(stripAnsi(expanded)).toContain('▾ 思考')
    transcript.dispose()
  })

  it('keeps a collapsed reasoning hit on its rendered row when the viewport starts with a block gap', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 3)
    transcript.update(snapshot([
      user('u1', 'earlier question'),
      assistantStep('a1', 'settled', [
        { kind: 'reasoning', text: '完成后的推理' },
        { kind: 'text', text: '结论' },
      ]),
    ]))

    const rendered = transcript.render(60)
    const headerRow = rendered.findIndex(line => line.includes('思考（已折叠）'))
    expect(headerRow).toBe(1)

    const origin = { col: 0, row: 4, width: 60, height: 3 }
    const hit = transcript.controlHitRegions(origin)
      .find(region => region.id === 'transcript:reasoning:a1')
    expect(hit?.rect.row).toBe(origin.row + headerRow)
    transcript.dispose()
  })

  it('keeps a running tool duration live when color animation is disabled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    vi.stubEnv('NO_COLOR', '1')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 8, requestRender)
    transcript.update(snapshot([], {
      runningCalls: [{
        callId: 'call-no-color',
        name: 'read',
        argsRaw: '{"file_path":"package.json"}',
        turn: 1,
        step: 1,
        time: 20_000,
        callView: { card: 'generic', title: 'Read package.json', kind: 'read' },
        subCalls: [],
      }],
    }))

    expect(transcript.render(60).join('\n')).toContain('◆ Read package.json · 0s')
    vi.advanceTimersByTime(2_000)
    expect(transcript.render(60).join('\n')).toContain('◆ Read package.json · 2s')
    expect(requestRender).toHaveBeenCalled()
    transcript.dispose()
  })

  it('breathes on a running tool marker and stops when the tool leaves the running set', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([], {
      runningCalls: [{
        callId: 'call-1',
        name: 'web_search',
        argsRaw: '{"query":"Russia Ukraine war latest news ceasefire 2025"}',
        turn: 1,
        step: 1,
        time: 10_000,
        callView: {
          card: 'generic',
          title: 'Russia Ukraine war latest news ceasefire 2025',
          kind: 'search',
          rawInput: 'Russia Ukraine war latest news ceasefire 2025',
        },
        subCalls: [],
      }],
    }))

    const dim = transcript.render(80).join('\n')
    expect(dim).toContain('\u001B[38;2;52;65;95m◆')
    expect(dim).toContain('Russia Ukraine war latest news ceasefire 2025')
    expect(dim).not.toContain('web_search({')
    expect(dim).not.toContain('"query": "Russia Ukraine war latest news ceasefire 2025"')
    expect(dim).toContain(' · 0s')
    expect(dim).not.toContain('运行中')

    expect(transcript.pointerToggleTool('call-1')).toEqual({ kind: 'tool', key: 'call-1' })
    const expanded = transcript.render(80).join('\n')
    expect(expanded).toContain('web_search({')
    expect(expanded).toContain('"query": "Russia Ukraine war latest news ceasefire 2025"')
    expect(transcript.pointerToggleTool('call-1')).toEqual({ kind: 'tool', key: 'call-1' })
    expect(transcript.render(80).join('\n')).not.toContain('web_search({')

    const beforePulse = requestRender.mock.calls.length
    vi.advanceTimersByTime(640)
    expect(transcript.render(80).join('\n')).toContain('\u001B[38;2;145;167;255m◆')
    expect(requestRender).toHaveBeenCalledTimes(beforePulse + 4)

    vi.advanceTimersByTime(5_360)
    expect(transcript.render(80).join('\n')).toContain(' · 6s')

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
    expect(rows.slice(0, 3).every(row => stripAnsi(row).replace(/[▐│▴▾⇡]/gu, '').trim() === '')).toBe(true)
    expect(rows.at(-4)).toContain('> 问题')
    expect(rows.join('\n')).not.toContain('❯ 问题')
    expect(rows.at(-1)).toContain('回答')
  })

  it.each(['dark', 'light'] as const)('frames sent messages with open rules without a background in %s', (theme) => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    setTheme(BUILT_IN_THEMES[theme])
    const transcript = new Transcript()
    transcript.update(snapshot([user('u1', '问题'), assistant('a1', '回答')]))

    const rows = transcript.render(40)
    expect(rows.map(row => stripAnsi(row).trimEnd())).toEqual([
      `  ${'─'.repeat(36)}`, '  > 问题', `  ${'─'.repeat(36)}`, '', '  回答',
    ])
    expect(rows.slice(0, 3).join('\n')).not.toContain('\u001B[48;')
  })

  it('keeps one pair of rules around wrapped multiline messages after resizing', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    transcript.update(snapshot([user('u1', '中文长消息 abcdefghijklmnopqrstuvwxyz\n第二行')]))

    for (const width of [40, 12, 8, 1, 60]) {
      const rows = transcript.render(width).map(stripAnsi)
      const ruleWidth = width >= 12 ? width - 4 : width
      expect(rows[0]?.trim()).toBe('─'.repeat(ruleWidth))
      expect(rows.at(-1)?.trim()).toBe('─'.repeat(ruleWidth))
      expect(rows.filter(row => /^\s*─+\s*$/u.test(row))).toHaveLength(2)
      // A double-width CJK glyph cannot fit in a one-cell terminal.
      if (width > 1) expect(rows.every(row => visibleWidth(row) <= width)).toBe(true)
    }
  })

  it('frames empty prompts, steering, and submitted commands but not subagent notices', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    const command = { ...chatNode('cmd', { text: '/help' }), kind: 'command-input' }
    transcript.update(snapshot([
      user('empty', ''),
      chatNode('steering', { kind: 'steering', seq: 2, time: 2, content: [{ type: 'text', text: '换个方向' }] }),
      command,
      chatNode('subagent', { kind: 'user', seq: 3, time: 3, source: { kind: 'subagent-settled' }, content: [] }),
    ]))

    const rows = transcript.render(40).map(stripAnsi)
    expect(rows.filter(row => /^\s*─+\s*$/u.test(row))).toHaveLength(6)
    expect(rows.join('\n')).toContain('> 引导 换个方向')
    expect(rows.join('\n')).toContain('> /help')
    expect(rows.at(-1)).toContain('◆ 子 Agent 已结束')
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
    expect(rendered).toContain('最新回答')
    expect(rendered).not.toContain('思考完成')
    expect(rendered).toMatch(/[▐│▴▾]/u)
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

    transcript.focused = true
    transcript.handleInput('\u001B[5~')
    const previousPage = transcript.render(40).join('\n')
    expect(requestRender).toHaveBeenCalledTimes(1)
    expect(previousPage).not.toBe(latest)
    expect(previousPage).not.toContain('最新回答')

    transcript.handleInput('\u001B[H')
    expect(transcript.render(40).join('\n')).toContain('第一个问题')

    transcript.handleInput('\u001B[F')
    const returned = transcript.render(40).join('\n')
    expect(returned).toContain('最新回答')
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
    expect(transcript.render(40).join('\n')).toContain('第三段回答')
    expect(transcript.render(40).join('\n')).not.toContain('最新回答')
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
    expect(transcript.render(40).join('\n')).toContain('当前已加载的最早问题')
    expect(transcript.scrollBy(3)).toBe(false)
    expect(requestOlder).toHaveBeenCalledTimes(1)

    transcript.update(snapshot(nodes, { hasMore: true, loadingOlder: true }))
    expect(transcript.render(40).join('\n')).toContain('⇡')
    expect(transcript.scrollBy(3)).toBe(false)
    expect(requestOlder).toHaveBeenCalledTimes(1)
  })

  it('fills Markdown code rows with one continuous inherited background', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistant('a1', '示例：\n\n```ts\nconst answer = 42\nreturn answer\n```'),
    ]))

    const rendered = transcript.render(44)
    const codeLines = rendered.filter(row => row.includes('const answer') || row.includes('return answer'))
    expect(codeLines).toHaveLength(2)
    for (const codeLine of codeLines) {
      expect(codeLine).toContain('\u001B[49m')
      expect(codeLine).not.toContain('\u001B[48;')
      expect(codeLine).toMatch(/ +\u001B\[0m(?:\s*(?:\u001B\[[0-9;:]*m)?▐(?:\u001B\[0m)?)?\s*$/u)
    }
    expect(new Set(codeLines.map(codeLine => stripAnsi(codeLine).length)).size).toBe(1)
    expect(stripAnsi(rendered.join('\n'))).not.toContain('```')
  })

  it('renders code inside list items without Markdown fences', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      assistant('a1', '- 示例：\n\n  ```ts\n  const nested = 7\n  ```'),
    ]))

    const rendered = transcript.render(52)
    const codeLine = rendered.find(row => row.includes('const nested = 7'))
    expect(codeLine).toContain('\u001B[49m')
    expect(codeLine).not.toContain('\u001B[48;')
    expect(stripAnsi(rendered.join('\n'))).not.toContain('```')
  })

  it('renders expanded tool invocations with the connected themed code surface', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const transcript = new Transcript(() => 16)
    transcript.update(snapshot([
      tool(
        'terminal-1',
        {
          card: 'terminal',
          title: 'printf "%s\\n" "$HOME"',
          description: '检查主题支持',
          cwd: '/tmp',
        },
        { card: 'terminal', output: 'RESULT', exitCode: 0 },
      ),
    ]))
    transcript.pointerToggleTool('terminal-1')

    const rendered = transcript.render(70)
    const plain = stripAnsi(rendered.join('\n'))
    const command = rendered.find(row => row.includes('$ printf'))
    expect(plain).toContain('◆ 检查主题支持 · 15ms')
    expect(plain).not.toContain('完成')
    expect(plain).toContain('RESULT')
    expect(command).toContain('⎿')
    expect(command).toContain('\u001B[49m')
    expect(command).not.toContain('\u001B[48;')
  })

  it('shows structured tool parameters only while expanded', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      tool(
        'json-1',
        { card: 'generic', title: 'Inspect', rawInput: { path: 'src/index.ts', line: 12 } },
        { card: 'generic', content: [{ type: 'text', text: 'done' }] },
      ),
    ]))

    const collapsed = transcript.render(60).join('\n')
    expect(collapsed).toContain('◆ Inspect · 15ms')
    expect(collapsed).not.toContain('fixture_tool({')
    expect(collapsed).not.toContain('"path": "src/index.ts"')
    expect(collapsed).not.toContain('done')

    transcript.pointerToggleTool('json-1')
    const expanded = transcript.render(60).join('\n')
    expect(expanded).toContain('⎿  fixture_tool({')
    expect(expanded).toContain('"path": "src/index.ts"')
    expect(expanded).toContain('done')
  })

  it('renders a search as its tool invocation instead of repeating the title', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      tool(
        'search-1',
        {
          card: 'generic',
          title: 'Donald Trump latest news today',
          kind: 'search',
          rawInput: 'Donald Trump latest news today',
        },
        { card: 'generic', content: [{ type: 'text', text: 'search result' }] },
        [],
        { name: 'web_search', argsRaw: '{"query":"Donald Trump latest news today"}' },
      ),
    ]))
    transcript.pointerToggleTool('search-1')

    const rendered = transcript.render(80).join('\n')
    expect(rendered).toContain('◆ Donald Trump latest news today · 15ms')
    expect(rendered).toContain('⎿  web_search({')
    expect(rendered).toContain('"query": "Donald Trump latest news today"')
    expect(rendered.split('\n').map(line => line.trim())).not.toContain('Donald Trump latest news today')
  })

  it('routes only code regions through syntax highlighting and leaves Chinese prose untouched', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const highlighter = vi.fn((code: string) => code.split('\n').map(line => `\u001B[3m${line}\u001B[0m`))
    setCodeHighlighter(highlighter)
    const transcript = new Transcript(() => 16)
    transcript.update(snapshot([
      user('u1', '普通中文输入，不应高亮'),
      assistant('a1', '中文说明保持原样。\n\n```ts\nconst answer = 42\n```'),
    ]))

    const rendered = transcript.render(60).join('\n')
    const highlighted = highlighter.mock.calls.map(call => call[0]).join('\n')
    expect(rendered).toContain('普通中文输入，不应高亮')
    expect(rendered).toContain('中文说明保持原样。')
    expect(rendered.split('\n').find(line => line.includes('中文说明保持原样。'))).not.toContain('\u001B[3m')
    expect(rendered.split('\n').find(line => line.includes('const answer = 42'))).toContain('\u001B[3m')
    expect(highlighted).toContain('const answer = 42')
    expect(highlighted).not.toContain('普通中文输入')
    expect(highlighted).not.toContain('中文说明')
  })

  it('renders read results with syntax metadata and durable file line numbers', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.cycleToolVisibility()
    transcript.update(snapshot([
      tool(
        'read-1',
        { card: 'generic', title: 'Read src/example.ts', kind: 'read' },
        {
          card: 'read',
          path: 'src/example.ts',
          offset: 10,
          totalLines: 30,
          lang: 'ts',
          lines: [
            { number: 10, text: 'const answer = 42' },
            { number: 11, text: 'export { answer }' },
          ],
        },
        [],
        { name: 'read', argsRaw: '{"file_path":"src/example.ts","offset":10,"limit":2}' },
      ),
    ]))

    const rendered = transcript.render(60).join('\n')
    expect(rendered).toContain('src/example.ts · 10–11 / 30')
    expect(rendered).toContain('⎿  read({')
    expect(rendered).toContain('"file_path": "src/example.ts"')
    expect(rendered).toContain('⎿  src/example.ts · 10–11 / 30')
    expect(rendered).toContain('10 const answer = 42')
    expect(rendered).toContain('11 export { answer }')
  })

  it('hides both the read invocation and result while collapsed', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      tool(
        'read-collapsed',
        {
          card: 'generic',
          title: 'Reading bwq1gladk',
          kind: 'read',
          locations: [{ path: 'tasks/bwq1gladk.output' }],
        },
        {
          card: 'read',
          path: '/private/tmp/claude-501/tasks/bwq1gladk.output',
          offset: 1,
          totalLines: 1,
          lines: [{ number: 1, text: 'complete' }],
        },
        [],
        {
          name: 'read',
          argsRaw: '{"file_path":"/private/tmp/claude-501/tasks/bwq1gladk.output"}',
        },
      ),
    ]))

    const rendered = transcript.render(100).join('\n')
    expect(rendered).toContain('◆ Reading bwq1gladk · 15ms')
    expect(rendered).not.toContain('read({')
    expect(rendered).not.toContain('"file_path": "/private/tmp/claude-501/tasks/bwq1gladk.output"')
    expect(rendered).not.toContain('complete')

    transcript.pointerToggleTool('read-collapsed')
    const expanded = transcript.render(100).join('\n')
    expect(expanded).toContain('  ⎿  read({')
    expect(expanded).toContain('"file_path": "/private/tmp/claude-501/tasks/bwq1gladk.output"')
    expect(expanded).toContain('complete')
  })

  it('highlights tool JSON and diffs while leaving terminal ANSI output untouched', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const highlighter = vi.fn((code: string, _language?: string) => code.split('\n'))
    setCodeHighlighter(highlighter)
    const transcript = new Transcript(() => 40)
    transcript.cycleToolVisibility()
    transcript.update(snapshot([
      tool(
        'json-1',
        { card: 'generic', title: 'Inspect', rawInput: { path: 'src/index.ts' } },
        { card: 'generic', content: [{ type: 'text', text: 'done' }] },
      ),
      tool(
        'diff-1',
        {
          card: 'diff',
          title: 'Edit src/index.ts',
          diffs: [{ path: 'src/index.ts', oldText: 'old\n', newText: 'new\n' }],
        },
        {
          card: 'diff',
          diffs: [{ path: 'src/index.ts', oldText: 'old\n', newText: 'new\n' }],
        },
      ),
      tool(
        'terminal-1',
        { card: 'terminal', title: 'printf red', cwd: '/tmp' },
        { card: 'terminal', output: '\u001B[31mRED\u001B[0m', exitCode: 0 },
      ),
    ]))

    const rendered = transcript.render(70).join('\n')
    expect(rendered).toContain('"path": "src/index.ts"')
    expect(rendered).toContain('diff -- src/index.ts')
    expect(rendered).toContain('+new')
    expect(rendered).toContain('\u001B[31mRED\u001B[0m')
    expect(highlighter.mock.calls.map(call => call[1])).toEqual(expect.arrayContaining(['typescript', 'diff']))
    expect(highlighter.mock.calls.some(call => call[0].includes('RED'))).toBe(false)
  })

  it('recolors existing history without moving the current viewport', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 5, requestRender)
    transcript.update(snapshot([
      user('u1', '较早问题'),
      assistant('a1', '较早回答一\n较早回答二\n较早回答三'),
      user('u2', '最新问题'),
      assistant('a2', '最新回答一\n最新回答二'),
    ]))
    transcript.render(50)
    expect(transcript.scrollBy(2)).toBe(true)
    const before = transcript.render(50).join('\n')

    setTheme(BUILT_IN_THEMES.light)
    transcript.refreshPresentation()
    const after = transcript.render(50).join('\n')

    expect(stripAnsi(after)).toBe(stripAnsi(before))
    expect(after).not.toBe(before)
    expect(requestRender).toHaveBeenCalledTimes(2)
  })

  it('keeps an explicitly scrolled viewport anchored while the tail grows', () => {
    const transcript = new Transcript(() => 7)
    const history = [
      user('u1', '较早问题'),
      assistant('a1', '锚点回答一\n锚点回答二\n锚点回答三'),
      user('u2', '当前问题'),
      assistant('a2', '当前回答一\n当前回答二\n当前回答三'),
    ]
    transcript.update(snapshot(history))
    transcript.render(50)
    expect(transcript.scrollBy(3)).toBe(true)
    expect(stripAnsi(transcript.render(50).join('\n'))).toContain('锚点回答二')

    transcript.update(snapshot([
      ...history,
      user('u3', '新增问题'),
      assistant('a3', '新增回答一\n新增回答二'),
    ]))
    const anchored = stripAnsi(transcript.render(50).join('\n'))
    expect(anchored).toContain('锚点回答二')
    expect(anchored).not.toContain('新增回答二')

    transcript.followLatest()
    expect(stripAnsi(transcript.render(50).join('\n'))).toContain('新增回答二')
  })

  it('searches rendered lines from focus mode and jumps with n/N', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 12)
    transcript.update(snapshot([
      user('u1', 'alpha unique-token'),
      assistant('a1', 'beta unique-token gamma'),
    ]))
    transcript.render(60)
    transcript.handleInput('/')
    for (const character of 'unique-token') transcript.handleInput(character)
    const composing = stripAnsi(transcript.render(60).join('\n'))
    expect(composing).toContain('查找 unique-token')
    transcript.handleInput('\r')
    transcript.handleInput('n')
    const jumped = stripAnsi(transcript.render(60).join('\n'))
    expect(jumped).toMatch(/查找 unique-token · 2\/2/)
    expect(transcript.cancelSearch()).toBe(true)
    expect(transcript.cancelSearch()).toBe(false)
    expect(stripAnsi(transcript.render(60).join('\n'))).not.toContain('查找 unique-token')
  })
})
