import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'
import {
  EMPTY_SESSION_EXAMPLES,
  emptyExampleText,
} from '../src/client/empty-examples.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { Transcript } from '../src/client/transcript.ts'

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

describe('empty session examples', () => {
  it('lists three sendable starter prompts on an empty session', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 20)
    transcript.update(snapshot())
    const rendered = stripAnsi(transcript.render(80).join('\n'))
    expect(rendered).toContain('探索未至之境')
    for (const example of EMPTY_SESSION_EXAMPLES) {
      expect(rendered).toContain(emptyExampleText(example))
    }
    transcript.focused = true
    expect(transcript.activateFocused()).toEqual({
      kind: 'example',
      text: emptyExampleText(EMPTY_SESSION_EXAMPLES[0]!),
    })
    transcript.handleInput('\u001b[B')
    expect(transcript.activateFocused()).toEqual({
      kind: 'example',
      text: emptyExampleText(EMPTY_SESSION_EXAMPLES[1]!),
    })
  })

  it('localizes starter prompts without translating a later user message', () => {
    vi.stubEnv('NO_COLOR', '1')
    setUiLocale('en')
    const transcript = new Transcript(() => 20)
    transcript.update(snapshot())
    const rendered = stripAnsi(transcript.render(80).join('\n'))
    expect(rendered).toContain('Explore beyond the known')
    expect(rendered).toContain('Review the current changes and call out risks')
    expect(rendered).not.toContain('审查当前改动并指出风险')
  })

  it('keeps the selected empty-session example inside a short viewport', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 4)
    transcript.update(snapshot())
    transcript.focused = true
    transcript.handleInput('\u001b[B')
    transcript.handleInput('\u001b[B')
    const last = emptyExampleText(EMPTY_SESSION_EXAMPLES[2]!)
    expect(transcript.activateFocused()).toEqual({ kind: 'example', text: last })
    const visible = stripAnsi(transcript.render(80).join('\n'))
    expect(visible).toContain(last)
  })
})
