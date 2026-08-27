import { describe, expect, it } from 'vitest'
import {
  expandSelection,
  extractSelectedText,
  graphemeRangeAt,
  invertLineCells,
  lineRangeAt,
  mapCopyableLine,
  ownerTextFromRenderedLines,
  paintSelection,
  selectionClearedForOwner,
  stripCopyDecorations,
  wordRangeAt,
  type TextSelection,
} from '../src/client/text-selection.ts'

const owner = (key: string, text: string) => ({ key, text })

function selection(
  ownerKey: string,
  start: number,
  end: number,
  granularity: TextSelection['granularity'] = 'character',
): TextSelection {
  return {
    anchor: { surface: 'transcript', ownerKey, textOffset: start, affinity: 'before' },
    focus: { surface: 'transcript', ownerKey, textOffset: end, affinity: 'before' },
    granularity,
  }
}

describe('text selection coordinates', () => {
  it('keeps graphemes, CJK, emoji, and combining marks atomic', () => {
    expect(graphemeRangeAt('e\u0301x', 1)).toEqual({ start: 0, end: 2 })
    expect(graphemeRangeAt('你好', 1)).toEqual({ start: 1, end: 2 })
    const emoji = 'A👨‍👩‍👧‍👦B'
    const range = graphemeRangeAt(emoji, 2)
    expect(emoji.slice(range.start, range.end)).toContain('👨')
    expect(range.end - range.start).toBeGreaterThan(1)
  })

  it('selects word and logical line ranges', () => {
    const text = 'hello world\nnext'
    expect(wordRangeAt(text, 1)).toEqual({ start: 0, end: 5 })
    expect(lineRangeAt(text, 8)).toEqual({ start: 0, end: 11 })
    const expanded = expandSelection(selection('a', 1, 1), text, 'word')
    expect(extractSelectedText(expanded, [owner('a', text)])).toBe('hello')
  })

  it('copies reverse, cross-block, wrapped, and untrimmed text', () => {
    const owners = [owner('a', 'alpha  '), owner('b', '  beta')]
    const reversed = selection('b', 6, 0)
    reversed.anchor.ownerKey
    const across: TextSelection = {
      anchor: { surface: 'transcript', ownerKey: 'b', textOffset: 6, affinity: 'before' },
      focus: { surface: 'transcript', ownerKey: 'a', textOffset: 0, affinity: 'before' },
      granularity: 'character',
    }
    expect(extractSelectedText(across, owners)).toBe('alpha  \n  beta')
    const wrap = ownerTextFromRenderedLines(['hello ', 'world'], 6)
    expect(wrap.text).toBe('hello world')
    const hard = ownerTextFromRenderedLines(['hello', 'world'], 12)
    expect(hard.text).toBe('hello\nworld')
  })

  it('strips ANSI, OSC 8, and does not trim copy payload', () => {
    const painted = '\u001B[31m  keep  \u001B[0m'
    const osc = '\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007'
    expect(stripCopyDecorations(painted)).toBe('  keep  ')
    expect(stripCopyDecorations(osc)).toBe('link')
    expect(extractSelectedText(selection('a', 0, 8), [owner('a', '  keep  ')])).toBe('  keep  ')
  })

  it('maps wide characters to two cells with one logical offset', () => {
    const mapped = mapCopyableLine('你x', 0, 8)
    expect(mapped.cellOffsets[0]).toBe(0)
    expect(mapped.cellOffsets[1]).toBe(0)
    expect(mapped.cellOffsets[2]).toBe(1)
  })

  it('inverts already generated cells without changing owner text', () => {
    const line = '\u001B[32mhello\u001B[0m'
    const inverted = invertLineCells(line, 1, 4)
    expect(inverted).toContain('\u001B[7m')
    expect(stripCopyDecorations(inverted)).toBe('hello')
  })

  it('paints a viewport highlight from logical anchors', () => {
    const maps = [{
      row: 0,
      ownerKey: 'a',
      surface: 'transcript' as const,
      startOffset: 0,
      cellOffsets: [0, 1, 2, 3, 4],
      hardBreakAfter: true,
    }]
    const painted = paintSelection(['hello'], maps, selection('a', 1, 4), ['a'])
    expect(painted[0]).toContain('\u001B[7m')
    expect(stripCopyDecorations(painted[0] ?? '')).toBe('hello')
  })

  it('clears the selection when an owner is deleted', () => {
    const current = selection('gone', 0, 2)
    expect(selectionClearedForOwner(current, new Set(['kept']))).toBeUndefined()
    expect(selectionClearedForOwner(current, new Set(['gone']))).toEqual(current)
  })
})
