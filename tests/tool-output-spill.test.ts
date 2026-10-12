import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatConversationViewNode, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'
import { foldLineBlock, toolOutputLines } from '../src/client/tool-output-limit.ts'
import { Transcript } from '../src/client/transcript.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { DEFAULT_TUI_BEHAVIOR } from '../src/protocol.ts'

// Generated with untouched published dsh-spill-policy@0.2.0-rc.2 /notice's
// formatSpillNotice({kind:'exact',count:98765}, fixtureRef, 2). The local
// spill store's real retrievalHint is used; locator is an inert fixture.
// Official policy merges adjacent text blocks, with this notice at the end.
const notice = '(Omitted 98765 bytes. Omitted 2 images. Full formatted result stored at: /isolated-fixture/session-owned/spill.txt. Use read with offset/limit, or grep this path to search within it.)'
const content = [...Array.from({ length: 300 }, (_, i) => `retained-${i + 1} 中文🙂`), '', notice].join('\n')

function snapshot(text: string): ConversationSnapshot {
  const node: ChatConversationViewNode = {
    key: 'spill-view', kind: 'tool-call', id: 'spill-view', target: 'chat', anchorSeq: 1,
    location: { kind: 'session' }, visibility: 'visible',
    data: { root: {
      kind: 'tool-result', callId: 'spill-call', call: { name: 'fixture_tool', argsRaw: '{}' },
      callView: { card: 'generic', title: 'Retained tool result', rawInput: {} },
      // Flat native result content; no invented spill metadata or trusted URL target.
      resultView: { card: 'generic', content: [{ type: 'text', text }] },
      content: [{ type: 'text', text }], meta: undefined, isError: false,
      turn: 1, step: 1, time: 25, callTime: 10, subCalls: [],
    } },
  }
  return {
    sessionId: 'isolated-fixture', views: { get: () => undefined },
    chat: {
      order: [node.key], nodes: { get: () => node, values: () => [node] },
      locations: { getTurn: () => [], getStep: () => [] }, timeline: { turnOrder: [], turns: new Map() },
      legacy: { nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [] },
    },
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
    pending: [], queue: [], running: false, subagent: null, composerPhase: 'active', removed: false,
    openState: 'open', openError: null, hasMore: false, loadingOlder: false, promptError: null, blank: false,
    lastAgentError: null,
  } as unknown as ConversationSnapshot
}
const plain = (lines: string[]) => lines.join('\n').replace(/\u001b\[[0-9;:]*m/gu, '')
function copyCard(transcript: Transcript): string {
  transcript.applyPointerSelection(
    { surface: 'transcript', ownerKey: 'spill-view', textOffset: 0, affinity: 'before' },
    { surface: 'transcript', ownerKey: 'spill-view', textOffset: Number.MAX_SAFE_INTEGER, affinity: 'before' },
    'character',
  )
  return transcript.copySelectionText()
}
afterEach(() => { vi.unstubAllEnvs(); setUiLocale('zh') })

describe('bounded tool head/tail presentation', () => {
  it('retains the actual published notice as plain text within the unchanged 200-line default', () => {
    expect(DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit).toBe(200)
    const folded = foldLineBlock(content, 200)
    expect(toolOutputLines(folded.text).lines).toHaveLength(201)
    expect(folded.omitted).toBe(102)
    expect(folded.text).toContain('retained-1 中文🙂')
    expect(folded.text).not.toContain('retained-101 中文🙂')
    expect(folded.text.endsWith(notice)).toBe(true)
    expect(folded.text).toContain('省略中间 102 行')
  })
  it('keeps expanded-card copy truthful and bounded while preserving recovery text across resize', () => {
    vi.stubEnv('NO_COLOR', '1')
    const transcript = new Transcript(() => 1000)
    try {
      transcript.update(snapshot(content))
      expect(plain(transcript.render(240))).not.toContain('Full formatted result stored')
      transcript.pointerToggleTool('spill-call')
      for (const width of [240, 80]) {
        expect(plain(transcript.render(width))).toContain('省略中间 102 行')
        const copied = copyCard(transcript)
        expect(copied).toContain(notice)
        expect(copied).toContain('省略中间 102 行')
        expect(copied).not.toContain('retained-101 中文🙂')
      }
    } finally { transcript.dispose() }
  })
  it('preserves the existing explicit full-text presentation preference without mutating recorded content', () => {
    vi.stubEnv('NO_COLOR', '1')
    const recorded = snapshot(content)
    const transcript = new Transcript(() => 1000)
    try {
      transcript.applyPresentationDefaults('expanded', false, 0)
      transcript.update(recorded)
      expect(plain(transcript.render(240))).toContain('retained-101 中文🙂')
      const copied = copyCard(transcript)
      expect(copied).toContain(content)
      expect(copied).not.toContain('省略中间')
      expect(recorded.chat.nodes.get('spill-view')!.data).toEqual(snapshot(content).chat.nodes.get('spill-view')!.data)
    } finally { transcript.dispose() }
  })
  it('does not classify unknown or forged tail text as a spill reference', () => {
    setUiLocale('en')
    for (const tail of ['ordinary error at end', 'Full formatted result stored at: javascript:alert(1)', notice]) {
      const source = ['head', ...Array.from({ length: 500 }, () => 'middle'), tail].join('\n')
      const result = foldLineBlock(source, 4)
      expect(result).toEqual({ text: `head\nmiddle\n… 498 middle line(s) omitted …\nmiddle\n${tail}`, omitted: 498 })
      expect(Object.keys(result).sort()).toEqual(['omitted', 'text'])
    }
  })
  it('bounds odd/tiny/fractional limits, preserves EOF and counts only omitted source lines', () => {
    setUiLocale('en')
    for (const cap of [1, 2, 3, 7, 199, 200]) {
      const lines = Array.from({ length: 1000 }, (_, i) => `line ${i} 🙂`)
      const result = foldLineBlock(`${lines.join('\n')}\n`, cap)
      expect(toolOutputLines(result.text).lines).toHaveLength(cap + 1)
      expect(result.omitted).toBe(1000 - cap)
      expect(result.text.endsWith('line 999 🙂\n')).toBe(true)
      expect(result.text).not.toContain('\ufffd')
    }
    expect(foldLineBlock('a\nb\nc', 0.5).text).toBe('… 2 middle line(s) omitted …\nc')
    for (const limit of [0, -1, Infinity, NaN]) expect(foldLineBlock(content, limit)).toEqual({ text: content, omitted: 0 })
    expect(foldLineBlock('', 1)).toEqual({ text: '', omitted: 0 })
  })
})
