import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'
import { setUiLocale, ui } from '../src/client/locale.ts'
import { Transcript, type TranscriptWelcomeRenderer } from '../src/client/transcript.ts'

function snapshot(): ConversationSnapshot {
  return {
    sessionId: 'session',
    views: { get: () => undefined },
    chat: {
      order: [],
      nodes: { get: () => undefined, values: () => [] },
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

function welcome(lines?: readonly string[]): TranscriptWelcomeRenderer {
  return {
    fingerprint: () => 0,
    render: (_width, hasSession) => lines ?? [
      ui('SeekTTY 欢迎页', 'SeekTTY welcome'),
      hasSession ? ui('空会话', 'Empty session') : ui('尚未创建会话', 'No session yet'),
      ui('/welcome 配置欢迎页', '/welcome configures this page'),
    ],
  }
}

describe('empty session welcome', () => {
  it('renders a non-interactive welcome page instead of starter prompts', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 20, undefined, undefined, welcome())
    transcript.update(snapshot())
    const rendered = stripAnsi(transcript.render(80).join('\n'))
    expect(rendered).toContain('SeekTTY 欢迎页')
    expect(rendered).toContain('空会话')
    expect(rendered).not.toContain('探索未至之境')
    transcript.focused = true
    expect(transcript.activateFocused()).toBeUndefined()
    transcript.handleInput('\u001b[B')
    expect(transcript.activateFocused()).toBeUndefined()
    expect(transcript.focusExample('review')).toBe(false)
    const hits = transcript.controlHitRegions({ col: 0, row: 0, width: 80, height: 20 })
    expect(hits).toEqual([])
  })

  it('localizes the welcome chrome', () => {
    vi.stubEnv('NO_COLOR', '1')
    setUiLocale('en')
    const transcript = new Transcript(() => 20, undefined, undefined, welcome())
    transcript.update(snapshot())
    const rendered = stripAnsi(transcript.render(80).join('\n'))
    expect(rendered).toContain('SeekTTY welcome')
    expect(rendered).toContain('Empty session')
    expect(rendered).toContain('/welcome configures this page')
    expect(rendered).not.toContain('欢迎页')
  })

  it('scrolls a tall welcome page instead of truncating it', () => {
    vi.stubEnv('NO_COLOR', '1')
    const lines = Array.from({ length: 10 }, (_, index) => `welcome-row-${String(index + 1)}`)
    const transcript = new Transcript(() => 4, undefined, undefined, welcome(lines))
    transcript.update(snapshot())
    const first = stripAnsi(transcript.render(80).join('\n'))
    expect(first).toContain('welcome-row-1')
    expect(first).not.toContain('welcome-row-10')
    expect(transcript.scrollBy(-6)).toBe(true)
    const last = stripAnsi(transcript.render(80).join('\n'))
    expect(last).toContain('welcome-row-10')
  })

  it('keeps rendered welcome text selectable without registering buttons', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 6, undefined, undefined, welcome(['selectable welcome']))
    transcript.update(snapshot())
    transcript.render(60)
    const map = transcript.viewportMaps().find(candidate => candidate.cellOffsets.some(offset => offset !== undefined))
    expect(map).toBeDefined()
    const firstCell = map!.cellOffsets.findIndex(offset => offset !== undefined)
    const lastCell = map!.cellOffsets.findLastIndex(offset => offset !== undefined)
    const anchor = transcript.hitAnchor(firstCell + 2, map!.row, 60, 'before')
    const focus = transcript.hitAnchor(lastCell + 2, map!.row, 60, 'after')
    expect(anchor).toBeDefined()
    expect(focus).toBeDefined()
    transcript.applyPointerSelection(anchor!, focus!, 'character')
    expect(transcript.copySelectionText()).toBe('selectable welcome')
    expect(transcript.controlHitRegions({ col: 0, row: 0, width: 60, height: 6 })).toEqual([])
  })
})
