import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode,
  ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { internals, Transcript } from '../src/client/transcript.ts'
import type { TranscriptImagePayload } from '../src/client/transcript.ts'
import { terminalMouseDelta } from '../src/client/terminal-session.ts'
import { background, setBackgroundMode, setTerminalCanvasBackground } from '../src/client/theme.ts'

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

function user(key: string, text: string): ChatConversationViewNode {
  return {
    ...assistant(key, text),
    data: {
      kind: 'user',
      seq: 1,
      time: 1,
      source: null,
      content: [{ type: 'text', text }],
    },
  }
}

const imageAttachment = {
  attachmentId: 'image-1',
  mediaType: 'image/png',
  bytes: 68,
  width: 1,
  height: 1,
  name: 'pixel.png',
} as const

function imageNode(key: string): ChatConversationViewNode {
  return {
    ...assistant(key, ''),
    data: {
      kind: 'assistant',
      seq: 2,
      time: 2,
      turn: 1,
      step: 1,
      blocks: [{ kind: 'image', attachment: imageAttachment }],
    },
  } as ChatConversationViewNode
}

function snapshot(
  nodes: readonly ChatConversationViewNode[],
  runningCalls: ConversationSnapshot['runningCalls'] = [],
  options: {
    readonly hasMore?: boolean
    readonly loadingOlder?: boolean
    readonly sessionId?: string
  } = {},
): ConversationSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    sessionId: options.sessionId ?? 'viewport-fixture',
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
    runningCalls,
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: options.hasMore ?? false,
    loadingOlder: options.loadingOlder ?? false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}

function resetRenderCounters(): void {
  internals.blocksVisited = 0
  internals.linesEscaped = 0
  internals.lastFullLinesCopied = 0
}

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

afterEach(() => {
  setBackgroundMode('theme')
  setTerminalCanvasBackground(undefined)
  resetRenderCounters()
  internals.fingerprintsComputed = 0
  internals.markdownCreated = 0
  internals.componentRenders = 0
  internals.imageBlocksUpdated = 0
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('transcript block viewport', () => {
  it('preserves the historical viewport, selection, hit maps and render budget across background mode changes', () => {
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('COLORTERM', 'truecolor')
    vi.stubEnv('TERM', 'xterm-256color')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 100 }, (_, index) =>
      assistant(`background-${index}`, `line-${index}`))))
    transcript.render(80)
    transcript.scrollBy(20)
    transcript.render(80)
    const before = transcript.hitViewportEdgeAnchor(4, 80, 'older', 'before')
    const after = transcript.hitViewportEdgeAnchor(20, 80, 'newer', 'after')
    expect(before).toBeDefined()
    expect(after).toBeDefined()
    transcript.applyPointerSelection(before!, after!, 'character')
    const selection = transcript.currentSelection()
    const copied = transcript.copySelectionText()
    const lines = plain(transcript.render(80))
    const maps = transcript.viewportMaps()
    resetRenderCounters()
    for (const [mode, color] of [['terminal', '#ffffff'], ['explicit', undefined], ['theme', undefined], ['terminal', '#000000']] as const) {
      setBackgroundMode(mode)
      setTerminalCanvasBackground(color)
      transcript.invalidate()
      expect(plain(transcript.render(80).map(background.canvas))).toBe(lines)
      expect(transcript.currentSelection()).toEqual(selection)
      expect(transcript.copySelectionText()).toBe(copied)
      expect(transcript.viewportMaps()).toEqual(maps)
    }
    expect(internals.lastFullLinesCopied).toBe(0)
    expect(internals.blocksVisited).toBeLessThan(40)
    transcript.dispose()
  })

  it('bounds editor-only render work by the viewport instead of history size', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 1_000 }, (_, index) =>
      assistant(`node-${String(index)}`, `line-${String(index)}`))))
    transcript.render(80)
    resetRenderCounters()

    const rendered = transcript.render(80)

    expect(rendered).toHaveLength(8)
    expect(internals.blocksVisited).toBeLessThanOrEqual(10)
    expect(internals.linesEscaped).toBeLessThanOrEqual(10)
    expect(internals.lastFullLinesCopied).toBe(0)
  })

  it('keeps the same historical block anchored when older nodes are prepended', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 5)
    const history = Array.from({ length: 12 }, (_, index) =>
      assistant(`node-${String(index)}`, `token-${String(index)}-a\ntoken-${String(index)}-b`))
    transcript.update(snapshot(history))
    transcript.render(60)
    expect(transcript.scrollBy(9)).toBe(true)
    const before = plain(transcript.render(60))
    expect(before).toContain('token-7-a')

    transcript.update(snapshot([
      assistant('older-0', 'prepended-0-a\nprepended-0-b'),
      assistant('older-1', 'prepended-1-a\nprepended-1-b'),
      ...history,
    ]))
    const after = plain(transcript.render(60))

    expect(after).toContain('token-7-a')
    expect(after).not.toContain('prepended-')
  })

  it('resumes following tail growth after scrolling back to the latest page', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 5)
    const history = Array.from({ length: 12 }, (_, index) =>
      assistant(`follow-${String(index)}`, `follow-${String(index)}`))
    transcript.update(snapshot(history))
    transcript.render(60)

    expect(transcript.scrollBy(4)).toBe(true)
    transcript.render(60)
    expect(transcript.scrollBy(-4)).toBe(true)
    expect(plain(transcript.render(60))).toContain('follow-11')

    transcript.update(snapshot([...history, assistant('follow-12', 'new-tail-token')]))
    expect(plain(transcript.render(60))).toContain('new-tail-token')
    transcript.dispose()
  })

  it('moves one logical line per wheel step across the latest marker', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 5)
    transcript.update(snapshot([
      assistant('wheel-lines', Array.from({ length: 10 }, (_, index) => `wheel-line-${String(index)}`).join('\n')),
    ]))
    const latest = plain(transcript.render(60))
    expect(latest).toContain('wheel-line-9')
    expect(latest).toContain('wheel-line-5')
    expect(latest).not.toContain('wheel-line-4')

    expect(transcript.scrollBy(1)).toBe(true)
    const oneStepOlder = plain(transcript.render(60))
    expect(oneStepOlder).toContain('wheel-line-4')
    expect(oneStepOlder).not.toContain('wheel-line-3')
    expect(oneStepOlder).not.toContain('wheel-line-9')

    expect(transcript.scrollBy(-1)).toBe(true)
    expect(plain(transcript.render(60))).toContain('wheel-line-9')
    transcript.dispose()
  })

  it('requests older history when Home is pressed again at the loaded boundary', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestOlder = vi.fn()
    const transcript = new Transcript(() => 5, () => undefined, requestOlder)
    transcript.update(snapshot(
      Array.from({ length: 12 }, (_, index) => assistant(`home-${String(index)}`, `home-${String(index)}`)),
      [],
      { hasMore: true },
    ))
    transcript.render(60)

    transcript.handleInput('\u001B[H')
    const atStart = plain(transcript.render(60))
    expect(atStart).toContain('home-0')
    expect(atStart).not.toContain(String(Number.MAX_SAFE_INTEGER))
    transcript.handleInput('\u001B[H')

    expect(requestOlder).toHaveBeenCalledTimes(1)
    transcript.dispose()
  })

  it('detaches follow and backfills older history on a short page (#151)', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestOlder = vi.fn()
    const transcript = new Transcript(() => 10, () => undefined, requestOlder)
    const latest = [
      assistant('short-0', 'visible-latest-0'),
      assistant('short-1', 'visible-latest-1'),
      assistant('short-2', 'visible-latest-2'),
    ]
    transcript.update(snapshot(latest, [], { hasMore: true }))
    expect(plain(transcript.render(60))).toContain('visible-latest-2')
    expect(transcript.isFollowingLatest()).toBe(true)

    expect(transcript.scrollBy(3)).toBe(false)
    expect(requestOlder).toHaveBeenCalledTimes(1)
    expect(transcript.isFollowingLatest()).toBe(false)

    const older = Array.from({ length: 20 }, (_, index) =>
      assistant(`older-${String(index)}`, `prepended-older-${String(index)}`))
    transcript.update(snapshot([...older, ...latest], [], { hasMore: false }))
    const after = plain(transcript.render(60))

    expect(transcript.isFollowingLatest()).toBe(false)
    expect(after).toContain('visible-latest-0')
    expect(after).toContain('prepended-older-')
    expect(after).not.toContain('prepended-older-0')
    transcript.dispose()
  })

  it('hides the scrollbar when the terminal is narrower than 12 columns', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 20 }, (_, index) =>
      assistant(`narrow-${String(index)}`, `narrow-${String(index)}`))))
    const wide = plain(transcript.render(40))
    expect(wide).toMatch(/[▐│▴]/u)
    const narrow = plain(transcript.render(11))
    expect(narrow).not.toMatch(/[▐▴▾]/u)
    transcript.dispose()
  })

  it('records exact height-index entries only for visited viewport blocks', () => {
    vi.stubEnv('NO_COLOR', '1')
    internals.heightIndexExact = 0
    internals.heightIndexEstimated = 0
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot(Array.from({ length: 40 }, (_, index) =>
      assistant(`height-${String(index)}`, `height-${String(index)}`))))
    transcript.render(80)
    expect(internals.heightIndexExact).toBeGreaterThan(0)
    expect(internals.heightIndexExact).toBeLessThanOrEqual(8)
    expect(internals.heightIndexEstimated).toBeGreaterThan(20)
    transcript.dispose()
  })

  it('requests an older page from the scrollbar older end-cap', () => {
    vi.stubEnv('NO_COLOR', '1')
    const requestOlder = vi.fn()
    const transcript = new Transcript(() => 6, () => undefined, requestOlder)
    transcript.update(snapshot(
      Array.from({ length: 12 }, (_, index) => assistant(`cap-${String(index)}`, `cap-${String(index)}`)),
      [],
      { hasMore: true },
    ))
    transcript.render(40)
    const origin = { col: 0, row: 0, width: 40, height: 6 }
    const cap = transcript.scrollbarHitRegions(origin).find(region => region.id.endsWith('cap-older'))
    expect(cap).toBeDefined()
    expect(transcript.handleScrollbarClick(cap!, { col: 39, row: 0 }, origin)).toBe(true)
    expect(requestOlder).toHaveBeenCalledTimes(1)
    expect(transcript.isFollowingLatest()).toBe(false)
    transcript.dispose()
  })

  it('excludes user rules from selection and preserves copied newlines across resize', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 20)
    const text = '123456789012345678\n中文第二行'
    transcript.update(snapshot([user('framed', text)]))

    for (const width of [24, 40]) {
      const rows = transcript.render(width)
      const borders = rows.flatMap((line, row) => /─{3}/u.test(line) ? [row] : [])
      expect(borders).toHaveLength(2)
      for (const row of borders) expect(transcript.hitAnchor(3, row, width)).toBeUndefined()
      const maps = transcript.viewportMaps().filter(map => map.ownerKey === 'framed')
      const first = maps.find(map => map.cellOffsets.some(offset => offset !== undefined))!
      const last = maps.findLast(map => map.cellOffsets.some(offset => offset !== undefined))!
      transcript.applyPointerSelection(
        { surface: 'transcript', ownerKey: 'framed', textOffset: first.startOffset, affinity: 'before' },
        { surface: 'transcript', ownerKey: 'framed', textOffset: last.startOffset + '中文第二行'.length, affinity: 'before' },
        'character',
      )
      expect(transcript.copySelectionText()).toBe('> 123456789012345678\n中文第二行')
      expect(transcript.hitViewportEdgeAnchor(3, width, 'older')?.ownerKey).toBe('framed')
      expect(transcript.hitViewportEdgeAnchor(3, width, 'newer')?.ownerKey).toBe('framed')
    }
    transcript.dispose()
  })

  it('copies fenced Python as semantic source without code presentation padding', () => {
    vi.stubEnv('NO_COLOR', '1')
    const source = [
      '@lru_cache(maxsize=256)',
      'def tokenize(text: str) -> list[str]:',
      '    return [w for w in text.lower().split() if w]',
      '',
      'def fetch(url: str, *, retries: int = RETRY) -> dict | None:',
      '    for attempt in range(retries):',
      '        try:',
      '            resp = requests.get(url, timeout=5)',
      '            return resp.json() if resp.status_code == 200 else None',
      '        except requests.Timeout as exc:',
      '            raise ValueError(f"timeout after {attempt}") from exc',
      '    return None',
    ].join('\n')
    const transcript = new Transcript(() => 40)
    transcript.update(snapshot([assistant('python-copy', `\`\`\`python\n${source}\n\`\`\``)]))

    let selected = false
    for (const width of [48, 96]) {
      transcript.render(width)
      const maps = transcript.viewportMaps().filter(map => map.ownerKey === 'python-copy'
        && map.cellOffsets.some(offset => offset !== undefined))
      const first = maps[0]!
      const last = maps[maps.length - 1]!
      if (!selected) {
        transcript.applyPointerSelection(
          { surface: 'transcript', ownerKey: 'python-copy', textOffset: first.startOffset, affinity: 'before' },
          { surface: 'transcript', ownerKey: 'python-copy', textOffset: last.endOffset, affinity: 'before' },
          'character',
        )
        selected = true
      } else expect(transcript.currentSelection()).toBeDefined()
      expect(transcript.copySelectionText()).toBe(source)
    }
    transcript.update(snapshot([assistant('python-copy', `\`\`\`python\n${source}\n# changed\n\`\`\``)]))
    transcript.render(96)
    expect(transcript.currentSelection()).toBeUndefined()
    transcript.dispose()
  })

  it('rejoins visual Markdown wraps with the omitted source whitespace', () => {
    vi.stubEnv('NO_COLOR', '1')
    const source = 'A paragraph with  two spaces, 中文 and 👨‍👩‍👧‍👦 that wraps without changing its logical text.'
    const transcript = new Transcript(() => 20)
    transcript.update(snapshot([assistant('markdown-copy', source)]))

    for (const width of [24, 40]) {
      transcript.render(width)
      const maps = transcript.viewportMaps().filter(map => map.ownerKey === 'markdown-copy'
        && map.cellOffsets.some(offset => offset !== undefined))
      const first = maps[0]!
      const last = maps[maps.length - 1]!
      transcript.applyPointerSelection(
        { surface: 'transcript', ownerKey: 'markdown-copy', textOffset: first.startOffset, affinity: 'before' },
        { surface: 'transcript', ownerKey: 'markdown-copy', textOffset: last.endOffset, affinity: 'before' },
        'character',
      )
      expect(transcript.copySelectionText()).toBe(source)
    }
    transcript.dispose()
  })

  it('omits both user borders when a selection crosses conversation blocks', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 20)
    transcript.update(snapshot([
      user('first', 'first question'),
      assistant('answer', 'answer'),
      user('last', 'last question'),
    ]))
    transcript.render(40)
    transcript.applyPointerSelection(
      { surface: 'transcript', ownerKey: 'first', textOffset: 0, affinity: 'before' },
      { surface: 'transcript', ownerKey: 'last', textOffset: 100, affinity: 'before' },
      'character',
    )
    const copied = transcript.copySelectionText()
    expect(copied).toContain('> first question')
    expect(copied).toContain('answer')
    expect(copied).toContain('> last question')
    expect(copied).not.toContain('─')
    transcript.dispose()
  })

  it('encloses an image-first user message and its text in one frame', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript()
    transcript.update(snapshot([{
      ...user('image-prompt', ''),
      data: {
        kind: 'user', seq: 1, time: 1, source: null,
        content: [{ type: 'image', attachment: imageAttachment }, { type: 'text', text: '描述图片' }],
      },
    }]))
    const rows = transcript.render(60)
    expect(rows.filter(row => /─{3}/u.test(row))).toHaveLength(2)
    expect(rows[0]).toContain('─'.repeat(56))
    expect(rows[1]).toContain('>')
    expect(plain(rows.slice(2, -1))).toContain('描述图片')
    expect(rows.at(-1)).toContain('─'.repeat(56))
    transcript.dispose()
  })

  it('copies a transcript selection without a full-history render', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot([
      assistant('copy-a', 'selectable-alpha'),
      assistant('copy-b', 'selectable-beta'),
    ]))
    transcript.render(80)
    resetRenderCounters()
    const maps = transcript.viewportMaps()
    const first = maps.find(map => map.ownerKey === 'copy-a')
    const offset = first?.cellOffsets.find(value => value !== undefined) ?? 0
    transcript.applyPointerSelection(
      { surface: 'transcript', ownerKey: 'copy-a', textOffset: offset, affinity: 'before' },
      { surface: 'transcript', ownerKey: 'copy-b', textOffset: 32, affinity: 'before' },
      'character',
    )
    expect(transcript.currentSelection()).toBeDefined()
    expect(transcript.viewportMaps().some(map => map.ownerKey === 'copy-a' && map.cellOffsets.some(value => value !== undefined))).toBe(true)
    expect(transcript.copySelectionText()).toContain('selectable-alpha')
    expect(transcript.copySelectionText()).toContain('selectable-beta')
    const painted = transcript.render(80).join('\n')
    expect(painted).toContain('\u001B[7m')
    expect(internals.lastFullLinesCopied).toBe(0)
    transcript.dispose()
  })

  it('keeps one logical anchor while an edge drag crosses multiple viewports', () => {
    vi.stubEnv('NO_COLOR', '1')
    const nodes = Array.from({ length: 24 }, (_, index) => (
      assistant(`selection-${String(index).padStart(2, '0')}`, `long-selection-${String(index).padStart(2, '0')}`)
    ))
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot(nodes))
    transcript.render(60)
    const initialOwners = new Set(transcript.viewportMaps().map(map => map.ownerKey))
    const originBefore = transcript.hitViewportEdgeAnchor(59, 60, 'newer', 'before')
    const originAfter = transcript.hitViewportEdgeAnchor(59, 60, 'newer', 'after')
    expect(originBefore).toBeDefined()
    expect(originAfter).toBeDefined()

    let focus = transcript.hitViewportEdgeAnchor(2, 60, 'older', 'before')
    for (let page = 0; page < 3; page += 1) {
      expect(focus).toBeDefined()
      transcript.applyPointerSelection(originAfter!, focus!, 'character')
      expect(transcript.scrollBy(5)).toBe(true)
      transcript.render(60)
      focus = transcript.hitViewportEdgeAnchor(2, 60, 'older', 'before')
    }
    transcript.applyPointerSelection(originAfter!, focus!, 'character')

    expect(focus).toBeDefined()
    expect(initialOwners.has(focus!.ownerKey)).toBe(false)
    expect(transcript.currentSelection()?.anchor).toEqual(originAfter)
    const copied = transcript.copySelectionText()
    expect(copied).toContain(focus!.ownerKey.replace('selection-', 'long-selection-'))
    expect(copied).toContain('long-selection-23')
    expect(internals.lastFullLinesCopied).toBe(0)
    transcript.dispose()
  })

  it('renders the latest tail without visiting old blocks', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot(Array.from({ length: 1_000 }, (_, index) =>
      assistant(`node-${String(index)}`, `tail-${String(index)}`))))
    resetRenderCounters()

    const rendered = plain(transcript.render(80))

    expect(rendered).toContain('tail-999')
    expect(internals.blocksVisited).toBeLessThanOrEqual(8)
  })

  it.each([1_000, 10_000, 50_000, 100_000])(
    'keeps first tail render viewport-bound for %d logical lines',
    (lineCount) => {
      vi.stubEnv('NO_COLOR', '1')
      const nodeCount = lineCount / 100
      const transcript = new Transcript(() => 12)
      transcript.update(snapshot(Array.from({ length: nodeCount }, (_, index) =>
        assistant(
          `bulk-${String(index)}`,
          Array.from({ length: 100 }, (_, line) => `bulk-${String(index)}-${String(line)}`).join('\n'),
        ))))
      resetRenderCounters()

      const rendered = transcript.render(80)

      expect(rendered).toHaveLength(12)
      expect(rendered.join('\n')).toContain(`bulk-${String(nodeCount - 1)}-99`)
      expect(internals.blocksVisited).toBeLessThanOrEqual(2)
      expect(internals.linesEscaped).toBeLessThanOrEqual(102)
      expect(internals.lastFullLinesCopied).toBe(0)
      transcript.dispose()
    },
  )

  it('rebuilds one changed middle block and searches its new text correctly', () => {
    vi.stubEnv('NO_COLOR', '1')
    const nodes = Array.from({ length: 40 }, (_, index) =>
      assistant(`middle-${String(index)}`, `original-${String(index)}`))
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(nodes))
    const created = internals.markdownCreated
    transcript.update(snapshot([
      ...nodes.slice(0, 20),
      assistant('middle-20', 'updated-middle-token'),
      ...nodes.slice(21),
    ]))

    expect(internals.markdownCreated - created).toBe(1)
    transcript.handleInput('/')
    transcript.handleInput('updated-middle-token')
    transcript.handleInput('\r')
    expect(plain(transcript.render(80))).toContain('updated-middle-token')
    transcript.cancelSearch()
    transcript.dispose()
  })

  it('searches framed user text without treating decorative rules as matches', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 40 }, (_, index) =>
      user(`prompt-${String(index)}`, `question-${String(index)}-end`))))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.handleInput('question-0-end')
    transcript.handleInput('\r')
    expect(plain(transcript.render(80))).toContain('question-0-end')
    transcript.cancelSearch()
    transcript.handleInput('/')
    transcript.handleInput('───')
    transcript.handleInput('\r')
    expect(plain(transcript.render(80))).toContain('无匹配')
    transcript.dispose()
  })

  it('indexes logical source text without rendering the full history', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 200 }, (_, index) =>
      assistant(`search-${String(index)}`, `searchable-${String(index)}`))))
    transcript.render(80)
    resetRenderCounters()

    transcript.handleInput('/')
    expect(internals.blocksVisited).toBe(0)
    expect(internals.lastFullLinesCopied).toBe(0)
    resetRenderCounters()
    transcript.render(80)
    expect(internals.blocksVisited).toBeLessThanOrEqual(10)
    expect(internals.lastFullLinesCopied).toBe(0)
    transcript.cancelSearch()
    resetRenderCounters()
    transcript.render(80)
    expect(internals.blocksVisited).toBeLessThanOrEqual(10)
    transcript.dispose()
  })

  it('scrolls search with its rendered index and honors Home and End', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot(Array.from({ length: 30 }, (_, index) =>
      assistant(`search-scroll-${String(index)}`, `search-scroll-${String(index)}`))))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.render(80)

    transcript.handleInput('\u001B[H')
    expect(plain(transcript.render(80))).toContain('search-scroll-0')
    transcript.handleInput('\u001B[B')
    expect(plain(transcript.render(80))).toContain('search-scroll-1')
    transcript.handleInput('\u001B[F')
    expect(plain(transcript.render(80))).toContain('search-scroll-29')
    transcript.dispose()
  })

  it('keeps a searched Home viewport after one SGR wheel instead of jumping to the tail', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(Array.from({ length: 40 }, (_, index) =>
      assistant(`k-${String(index)}`, `token-${String(index)}`))))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.render(80)
    transcript.handleInput('\u001B[H')
    const afterHome = plain(transcript.render(80))
    expect(afterHome).toContain('token-0')
    expect(afterHome).not.toContain('token-39')

    const downDelta = terminalMouseDelta('\u001B[<65;10;5M')
    const upDelta = terminalMouseDelta('\u001B[<64;10;5M')
    expect(downDelta).toBe(-3)
    expect(upDelta).toBe(3)
    expect(transcript.scrollBy(downDelta!)).toBe(true)
    const afterWheel = plain(transcript.render(80))
    expect(afterWheel).not.toContain('token-39')
    expect(afterWheel).toContain('token-2')
    expect(afterWheel).not.toMatch(/↑ \d+ 行更早内容/u)

    const keyboard = new Transcript(() => 8)
    keyboard.update(snapshot(Array.from({ length: 40 }, (_, index) =>
      assistant(`k-${String(index)}`, `token-${String(index)}`))))
    keyboard.render(80)
    keyboard.handleInput('/')
    keyboard.render(80)
    keyboard.handleInput('\u001B[H')
    expect(plain(keyboard.render(80))).toContain('token-0')
    keyboard.handleInput('\u001B[B')
    const afterKey = plain(keyboard.render(80))
    expect(afterKey).toContain('token-1')
    expect(afterKey).not.toContain('token-39')
    keyboard.handleInput('\u001B[F')
    expect(plain(keyboard.render(80))).toContain('token-39')
    keyboard.dispose()
    transcript.dispose()
  })

  it('keeps the latest line visible when search opens and closes at the tail', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot(Array.from({ length: 30 }, (_, index) =>
      assistant(`search-tail-${String(index)}`, `search-tail-${String(index)}`))))

    expect(plain(transcript.render(80))).toContain('search-tail-29')
    transcript.handleInput('/')
    const searching = plain(transcript.render(80))
    expect(searching).toContain('search-tail-29')
    expect(searching).not.toContain('Newer content')

    expect(transcript.cancelSearch()).toBe(true)
    expect(plain(transcript.render(80))).toContain('search-tail-29')
    transcript.dispose()
  })

  it('rebuilds search navigation immediately after a streaming snapshot update', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    const nodes = Array.from({ length: 20 }, (_, index) =>
      assistant(`search-stream-${String(index)}`, `search-stream-${String(index)}`))
    transcript.update(snapshot(nodes))
    transcript.render(80)
    transcript.handleInput('/')
    for (const character of 'zzz-update-match') transcript.handleInput(character)

    transcript.update(snapshot([
      assistant('search-stream-0', 'zzz-update-match'),
      ...nodes.slice(1),
    ]))
    transcript.handleInput('\r')

    const rendered = plain(transcript.render(80))
    expect(rendered.split('\n').filter(line =>
      line.replace(/[▐│▴▾⇡]/gu, '').trim() === 'zzz-update-match')).toHaveLength(1)
    transcript.dispose()
  })

  it('keeps a searched historical viewport anchored while the tail grows', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    const nodes = Array.from({ length: 20 }, (_, index) =>
      assistant(`search-anchor-${String(index)}`, `search-anchor-${String(index)}`))
    transcript.update(snapshot(nodes))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.render(80)
    transcript.handleInput('\u001B[H')
    expect(plain(transcript.render(80))).toContain('search-anchor-0')

    transcript.update(snapshot([
      ...nodes,
      assistant('search-anchor-new', 'search-anchor-new'),
    ]))

    expect(plain(transcript.render(80))).toContain('search-anchor-0')
    transcript.dispose()
  })

  it('keeps a searched historical block anchored while its width changes', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 7)
    transcript.update(snapshot(Array.from({ length: 40 }, (_, index) => assistant(
      `search-resize-${String(index)}`,
      `search-resize-${String(index)} ${'wrapped '.repeat(12)}`,
    ))))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.render(80)
    transcript.handleInput('\u001B[H')
    transcript.handleInput('\u001B[6~')
    transcript.handleInput('\u001B[6~')
    const before = plain(transcript.render(80))
    const anchor = before.match(/search-resize-\d+/u)?.[0]
    resetRenderCounters()

    const resized = plain(transcript.render(40))

    expect(anchor).toBeDefined()
    expect(resized).toContain(anchor)
    expect(internals.lastFullLinesCopied).toBe(0)
    transcript.dispose()
  })

  it('keeps a searched historical block anchored while an earlier block grows', () => {
    vi.stubEnv('NO_COLOR', '1')
    const nodes = Array.from({ length: 40 }, (_, index) =>
      assistant(`search-shift-${String(index)}`, `search-shift-${String(index)}`))
    const transcript = new Transcript(() => 7)
    transcript.update(snapshot(nodes))
    transcript.render(80)
    transcript.handleInput('/')
    transcript.render(80)
    transcript.handleInput('\u001B[H')
    transcript.handleInput('\u001B[6~')
    transcript.handleInput('\u001B[6~')
    const before = plain(transcript.render(80))
    const anchor = before.match(/search-shift-\d+/u)?.[0]

    transcript.update(snapshot([
      assistant('search-shift-0', `search-shift-0\n${'expanded earlier line\n'.repeat(20)}`),
      ...nodes.slice(1),
    ]))
    const updated = plain(transcript.render(80))

    expect(anchor).toBeDefined()
    expect(updated).toContain(anchor)
    transcript.dispose()
  })

  it('keeps resize work local to the latest viewport blocks', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 10)
    transcript.update(snapshot(Array.from({ length: 500 }, (_, index) =>
      assistant(`resize-${String(index)}`, `resize-${String(index)} ${'x'.repeat(100)}`))))
    transcript.render(80)
    resetRenderCounters()

    const resized = plain(transcript.render(40))

    expect(resized).toContain('resize-499')
    expect(internals.blocksVisited).toBeLessThanOrEqual(6)
    expect(internals.lastFullLinesCopied).toBe(0)
    transcript.dispose()
  })

  it('keeps a historical block anchored while its width changes', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 7)
    transcript.update(snapshot(Array.from({ length: 40 }, (_, index) => assistant(
      `browse-resize-${String(index)}`,
      `browse-resize-${String(index)} ${'wrapped '.repeat(12)}`,
    ))))
    transcript.render(80)
    expect(transcript.scrollBy(12)).toBe(true)
    const before = plain(transcript.render(80))
    const anchor = before.match(/browse-resize-\d+/u)?.[0]

    const resized = plain(transcript.render(40))

    expect(anchor).toBeDefined()
    expect(resized).toContain(anchor)
    transcript.dispose()
  })

  it('navigates previous and next user turns with block coordinates', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6)
    transcript.update(snapshot([
      user('user-1', 'question-one'),
      assistant('answer-1', 'answer-one-a\nanswer-one-b'),
      user('user-2', 'question-two'),
      assistant('answer-2', 'answer-two-a\nanswer-two-b'),
      user('user-3', 'question-three'),
      assistant('answer-3', 'answer-three'),
    ]))
    transcript.render(80)

    expect(transcript.navigateTurn(-1)).toBe(true)
    const previous = transcript.render(80)
    expect(previous[0]).toContain('─'.repeat(76))
    expect(plain(previous)).toContain('question-two')
    expect(transcript.navigateTurn(1)).toBe(true)
    expect(plain(transcript.render(80))).toContain('question-three')
    transcript.dispose()
  })

  it('keeps turn navigation stable when older user turns are prepended', () => {
    vi.stubEnv('NO_COLOR', '1')
    const current = [
      user('turn-user-1', 'turn-question-one'),
      assistant('turn-answer-1', 'turn-answer-one'),
      user('turn-user-2', 'turn-question-two'),
      assistant('turn-answer-2', 'turn-answer-two'),
      user('turn-user-3', 'turn-question-three'),
      assistant('turn-answer-3', 'turn-answer-three'),
    ]
    const transcript = new Transcript(() => 5)
    transcript.update(snapshot(current))
    transcript.render(80)
    expect(transcript.navigateTurn(-1)).toBe(true)
    expect(plain(transcript.render(80))).toContain('turn-question-two')

    transcript.update(snapshot([
      user('turn-user-0', 'prepended-turn-question'),
      assistant('turn-answer-0', 'prepended-turn-answer'),
      ...current,
    ]))
    transcript.render(80)
    expect(transcript.navigateTurn(-1)).toBe(true)
    expect(plain(transcript.render(80))).toContain('turn-question-one')
    transcript.dispose()
  })

  it('redraws only the active running block on pulse frames', () => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 8)
    transcript.update(snapshot(
      Array.from({ length: 100 }, (_, index) => assistant(`pulse-${String(index)}`, `stable-${String(index)}`)),
      [{
        callId: 'running-tail',
        name: 'read',
        argsRaw: '{"file_path":"package.json"}',
        turn: 1,
        step: 1,
        time: 1,
        callView: { card: 'generic', title: 'Read package.json', kind: 'read' },
        subCalls: [],
      }],
    ))
    transcript.render(80)
    internals.componentRenders = 0
    resetRenderCounters()

    vi.advanceTimersByTime(160)
    transcript.invalidate()
    transcript.render(80)

    expect(internals.blocksVisited).toBeLessThanOrEqual(8)
    expect(internals.componentRenders).toBeLessThanOrEqual(4)
    transcript.dispose()
  })

  it('replaces only the block that owns a completed image load', async () => {
    vi.stubEnv('NO_COLOR', '1')
    let resolveImage: ((payload: TranscriptImagePayload) => void) | undefined
    const loaded = new Promise<TranscriptImagePayload>((resolve) => {
      resolveImage = resolve
    })
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 8, requestRender)
    transcript.update(snapshot([
      ...Array.from({ length: 200 }, (_, index) => assistant(`image-history-${String(index)}`, 'stable')),
      imageNode('image-tail'),
    ]), () => loaded)
    transcript.render(80)
    internals.imageBlocksUpdated = 0

    resolveImage?.({
      attachment: imageAttachment,
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    })
    await loaded
    await Promise.resolve()
    await Promise.resolve()

    expect(internals.imageBlocksUpdated).toBe(1)
    expect(requestRender).toHaveBeenCalledTimes(1)
    resetRenderCounters()
    transcript.render(80)
    expect(internals.blocksVisited).toBeLessThanOrEqual(8)
    transcript.dispose()
  })

  it('ignores an image completion after disposal or a Session switch', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const resolvers: Array<(payload: TranscriptImagePayload) => void> = []
    const requestRender = vi.fn()
    const transcript = new Transcript(() => 8, requestRender)
    const loader = (): Promise<TranscriptImagePayload> => new Promise((resolve) => {
      resolvers.push(resolve)
    })
    const payload: TranscriptImagePayload = {
      attachment: imageAttachment,
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    }

    transcript.update(snapshot([imageNode('image-old-session')], [], { sessionId: 'session-old' }), loader)
    transcript.update(snapshot([assistant('new-session', 'new session')], [], { sessionId: 'session-new' }))
    resolvers.shift()?.(payload)
    await Promise.resolve()
    await Promise.resolve()
    expect(internals.imageBlocksUpdated).toBe(0)
    expect(requestRender).not.toHaveBeenCalled()

    transcript.update(snapshot([imageNode('image-disposed')], [], { sessionId: 'session-disposed' }), loader)
    transcript.dispose()
    resolvers.shift()?.(payload)
    await Promise.resolve()
    await Promise.resolve()
    expect(internals.imageBlocksUpdated).toBe(0)
    expect(requestRender).not.toHaveBeenCalled()
  })

  it('returns pulse timers to baseline after 100 transcript lifecycles', () => {
    vi.useFakeTimers()
    vi.stubEnv('NO_COLOR', undefined)
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('COLORTERM', 'truecolor')
    const baseline = internals.activePulseTimers

    for (let index = 0; index < 100; index += 1) {
      const transcript = new Transcript(() => 8)
      transcript.update(snapshot([], [{
        callId: `lifecycle-${String(index)}`,
        name: 'read',
        argsRaw: '{}',
        turn: 1,
        step: 1,
        time: 1,
        callView: { card: 'generic', title: 'Read', kind: 'read' },
        subCalls: [],
      }]))
      transcript.dispose()
    }

    expect(internals.activePulseTimers).toBe(baseline)
  })
})
