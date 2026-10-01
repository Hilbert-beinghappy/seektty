import { afterEach, describe, expect, it, vi } from 'vitest'
import { Text, visibleWidth } from '@mariozechner/pi-tui'
import { pointInRect } from '../src/client/mouse-hit-map.ts'
import { fetchTitleUrl, fetchTitleLayout, fetchTitleGestureAction, fetchTitleActionReason, runFetchTitleAction,
  type FetchTitlePresentation, type FetchTitlePorts } from '../src/client/fetch-title-target.ts'
import { fetchUrl, redirectedUrl, fetchCall, fetchResult, fetchRedirect, fixtureSafeArtifactUrl } from './fixtures/fetch-title-presenters.ts'

function call(title: string): FetchTitlePresentation { return { for: 'call', view: { card: 'generic', kind: 'fetch', title, rawInput: title } } }
function layout(overrides: Partial<Parameters<typeof fetchTitleLayout>[0]> = {}) {
  return fetchTitleLayout({ title: fetchUrl, presentations: [fetchCall], safeUrl: fixtureSafeArtifactUrl,
    renderedLine: `◆ ${fetchUrl} · 1s`, titleCells: { start: 2, width: visibleWidth(fetchUrl) },
    rect: { col: 4, row: 3, width: visibleWidth(fetchUrl) + 7, height: 1 }, expanded: false,
    targetKey: 'view-key:call-id', scopeId: 'Host:Session', generation: 7, ...overrides })
}
function ports(overrides: Partial<FetchTitlePorts> = {}): FetchTitlePorts {
  return { safeUrl: fixtureSafeArtifactUrl, capability: () => ({ available: true }), open: vi.fn(async () => {}), copy: vi.fn(), timeoutMs: 20, ...overrides }
}
afterEach(() => vi.useRealTimers())

describe('scoped published fetch title evidence', () => {
  it('accepts actual pending/settled shapes and canonicalizes only the action href', () => {
    for (const presentation of [fetchCall, fetchResult]) expect(fetchTitleUrl(fetchUrl, [presentation], fixtureSafeArtifactUrl))
      .toEqual({ label: fetchUrl, href: fetchUrl, source: presentation.for })
    const url = 'https://例子.test/资料/👩‍💻?x=1'
    expect(fetchTitleUrl(url, [call(url)], fixtureSafeArtifactUrl)).toEqual({ label: url, href: new URL(url).href, source: 'call' })
  })
  it('does not hide a redirect behind the original title or use an unrelated display label', () => {
    expect(fetchTitleUrl(fetchUrl, [fetchRedirect], fixtureSafeArtifactUrl)).toBeUndefined()
    expect(fetchTitleUrl(fetchUrl, [fetchRedirect, fetchCall], fixtureSafeArtifactUrl)?.href).toBe(fetchUrl)
    expect(fetchTitleUrl('Fetched page', [{ for: 'result', view: { card: 'web', kind: 'fetch', title: 'Fetched page', url: redirectedUrl } }], fixtureSafeArtifactUrl)).toBeUndefined()
    expect(fetchTitleUrl(redirectedUrl, [{ for: 'result', view: { card: 'web', kind: 'fetch', url: redirectedUrl, statusCode: 200, truncated: false } }], fixtureSafeArtifactUrl)?.href).toBe(redirectedUrl)
  })
  it('never infers from tool names, args, ordinary output, search cards or unknown kinds', () => {
    const invalid = [
      { for: 'call', view: { name: 'web_fetch', args: { url: fetchUrl }, title: fetchUrl } },
      { for: 'call', view: { card: 'generic', kind: 'fetch', title: fetchUrl, rawInput: { url: fetchUrl } } },
      { for: 'call', view: { card: 'generic', kind: 'other', title: fetchUrl, rawInput: fetchUrl } },
      { for: 'result', view: { card: 'generic', kind: 'fetch', title: fetchUrl, content: [{ type: 'text', text: fetchUrl }] } },
      { for: 'result', view: { card: 'web', kind: 'search', url: fetchUrl } },
      { for: 'future', view: { card: 'generic', kind: 'fetch', title: fetchUrl, rawInput: fetchUrl } },
      { for: 'call', view: null },
    ] as FetchTitlePresentation[]
    expect(fetchTitleUrl(fetchUrl, invalid, fixtureSafeArtifactUrl)).toBeUndefined()
    expect(fetchTitleUrl(fetchUrl, [], fixtureSafeArtifactUrl)).toBeUndefined()
  })
  it.each(['javascript:alert(1)', 'file:///tmp/a', 'data:text/plain,x', 'https://user:secret@example.invalid/a',
    'https://example.invalid/a b', 'https://example.invalid/a\n', 'https://example.invalid/\u001b[31mx',
    'https://example.invalid/\u009dx', 'https://example.invalid/\u202ex', 'https://example.invalid/\u200bx'])('rejects unsafe or control-bearing title %j', url => {
    expect(fetchTitleUrl(url, [call(url)], fixtureSafeArtifactUrl)).toBeUndefined()
  })
  it('does not invoke malformed presenter accessors', () => {
    const getter = vi.fn(() => fetchUrl)
    const view = { card: 'generic', kind: 'fetch', title: fetchUrl, get rawInput() { return getter() } }
    expect(fetchTitleUrl(fetchUrl, [{ for: 'call', view }], fixtureSafeArtifactUrl)).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
  })
})

describe('only visible title cells link; toggle cells never overlap', () => {
  it('partitions the exact header including indentation/status, with half-open cell boundaries', () => {
    const result = layout()
    expect(result.link?.rect).toEqual({ col: 6, row: 3, width: visibleWidth(fetchUrl), height: 1 })
    for (let col = 4; col < 4 + visibleWidth(fetchUrl) + 7; col++) {
      const point = { col, row: 3 }
      const hits = Number(pointInRect(point, result.link!.rect)) + result.toggles.filter(rect => pointInRect(point, rect)).length
      expect(hits).toBe(1)
    }
    expect(pointInRect({ col: 6 + visibleWidth(fetchUrl), row: 3 }, result.link!.rect)).toBe(false)
  })
  it('measures CJK/emoji/combining glyphs and owned SGR in cells, not UTF-16 units', () => {
    const title = 'https://例子.test/资料/👩‍💻/é'
    const prefix = '◆ 中文🙂 é '
    const result = layout({ title, presentations: [call(title)], renderedLine: `\u001b[36m${prefix}${title}\u001b[0m`,
      titleCells: { start: visibleWidth(prefix), width: visibleWidth(title) }, rect: { col: 4, row: 3, width: visibleWidth(prefix + title), height: 1 } })
    expect(result.link?.rect.width).toBe(visibleWidth(title))
    expect(result.link?.rect.col).toBe(4 + visibleWidth(prefix))
    expect(result.link?.target.href).toBe(new URL(title).href)
    const insideWide = layout({ renderedLine: `中${fetchUrl}`, titleCells: { start: 1, width: visibleWidth(fetchUrl) } })
    expect(insideWide.link).toBeUndefined()
  })
  it('links a clipped path prefix only with fully visible authority; ellipsis stays a toggle', () => {
    const title = 'https://example.invalid/资料/👩‍💻/long-path'
    const clipped = 'https://example.invalid/资料/…'
    const result = layout({ title, presentations: [call(title)], renderedLine: `◆ ${clipped}`,
      titleCells: { start: 2, width: visibleWidth(clipped) }, rect: { col: 4, row: 3, width: visibleWidth(clipped) + 2, height: 1 } })
    expect(result.link?.rect.width).toBe(visibleWidth(clipped) - 1)
    const ellipsis = { col: 4 + 2 + visibleWidth(clipped) - 1, row: 3 }
    expect(pointInRect(ellipsis, result.link!.rect)).toBe(false)
    expect(result.toggles.some(rect => pointInRect(ellipsis, rect))).toBe(true)
    expect(layout({ renderedLine: '◆ https://exa…', titleCells: { start: 2, width: 12 }, rect: { col: 4, row: 3, width: 14, height: 1 } }).link).toBeUndefined()
  })
  it('rejects a clipped partial emoji grapheme, forged text, invisible cells and invalid geometry', () => {
    const title = 'https://example.invalid/👩‍💻/long'
    const partial = 'https://example.invalid/👩…'
    expect(layout({ title, presentations: [call(title)], renderedLine: `◆ ${partial}`,
      titleCells: { start: 2, width: visibleWidth(partial) }, rect: { col: 4, row: 3, width: visibleWidth(partial) + 2, height: 1 } }).link).toBeUndefined()
    expect(layout({ renderedLine: `◆ ${fetchUrl}evil`, titleCells: { start: 2, width: visibleWidth(fetchUrl) + 4 } }).link).toBeUndefined()
    expect(layout({ titleCells: { start: 2, width: 999 } }).link).toBeUndefined()
    expect(layout({ rect: { col: 4, row: 3, width: 0, height: 1 } })).toEqual({ toggles: [] })
    expect(layout({ rect: { col: NaN, row: 3, width: 99, height: 1 } })).toEqual({ toggles: [] })
    expect(layout({ titleCells: { start: 2.5, width: 3 } }).link).toBeUndefined()
  })
  it('links renderer-projected wrapped title slices at real narrow widths without changing Text rendering', () => {
    const title = 'https://example.invalid/long-path/资料/👩‍💻/é'
    for (const width of [12, 20, 28, 80]) {
      const rows = new Text(title, 0, 0).render(width)
      let sourceStart = 0
      for (const [row, renderedLine] of rows.entries()) {
        const slice = renderedLine.trimEnd()
        const sourceEnd = sourceStart + slice.length
        const result = layout({ title, presentations: [call(title)], renderedLine,
          titleCells: { start: 0, width: visibleWidth(slice), sourceStart, sourceEnd },
          rect: { col: 4, row, width, height: 1 } })
        expect(result.link?.rect.width).toBe(visibleWidth(slice))
        expect(result.link?.target.href).toBe(new URL(title).href)
        for (let col = 4; col < 4 + width; col++) {
          const point = { col, row }
          expect(Number(pointInRect(point, result.link!.rect)) + result.toggles.filter(rect => pointInRect(point, rect)).length).toBe(1)
        }
        sourceStart = sourceEnd
      }
      expect(sourceStart).toBe(title.length)
    }
  })
  it('requires both real grapheme-aligned source offsets for wrapped fragments', () => {
    const title = 'https://example.invalid/👩‍💻/é'
    const part = title.slice(-2)
    expect(layout({ title, presentations: [call(title)], renderedLine: part, titleCells: { start: 0, width: 1, sourceStart: title.length - 1, sourceEnd: title.length }, rect: { col: 0, row: 0, width: 1, height: 1 } }).link).toBeUndefined()
    expect(layout({ renderedLine: 'example', titleCells: { start: 0, width: 7, sourceStart: 8 } }).link).toBeUndefined()
    expect(layout({ renderedLine: 'example', titleCells: { start: 0, width: 7, sourceStart: 0, sourceEnd: 7 } }).link).toBeUndefined()
  })
  it('rejects OSC/cursor/C1/bidi sequences even when their visible label resembles the real URL', () => {
    for (const control of ['\u001b]8;;https://evil.invalid\u0007', '\u001b[2C', '\u009b31m', '\u202e']) {
      expect(layout({ renderedLine: `◆ ${control}${fetchUrl}` }).link).toBeUndefined()
    }
  })
  it('preserves whole-row toggle for expanded, unsupported and mismatched headers', () => {
    for (const options of [{ expanded: true }, { presentations: [] }, { title: 'Tool output' }, { titleCells: { start: 0, width: 0 } }]) {
      const result = layout(options)
      expect(result.link).toBeUndefined()
      expect(result.toggles).toEqual([{ col: 4, row: 3, width: visibleWidth(fetchUrl) + 7, height: 1 }])
    }
  })
})

describe('safe UI action gates and current-frame lifetime', () => {
  it('opens/copies only the safe normalized URL through explicitly available ports', async () => {
    const target = layout().link!.target, p = ports()
    await runFetchTitleAction(target, 'open', p, () => target)
    expect(p.open).toHaveBeenCalledWith(fetchUrl, expect.any(AbortSignal))
    await runFetchTitleAction(target, 'copy', p, () => target)
    expect(p.copy).toHaveBeenCalledExactlyOnceWith(fetchUrl)
  })
  it('gates open and copy separately and never dispatches absent, disabled or unknown capabilities', async () => {
    const target = layout().link!.target
    for (const capability of [undefined, { available: false, reason: 'Opener denied by policy' }]) {
      const p = ports({ capability: () => capability })
      await expect(runFetchTitleAction(target, 'open', p, () => target)).rejects.toThrow()
      expect(p.open).not.toHaveBeenCalled()
    }
    const { open: _open, ...p } = ports({ capability: action => ({ available: action === 'copy' }) })
    expect(fetchTitleActionReason(target, 'open', p, target)).toContain('not confirmed')
    await runFetchTitleAction(target, 'copy', p, () => target)
    expect(p.copy).toHaveBeenCalledOnce()
    const { copy: _copy, ...noCopy } = ports()
    expect(fetchTitleActionReason(target, 'copy', noCopy, target)).toContain('No safe')
  })
  it('rejects stale Session, target, generation, presenter and URL tampering before dispatch', async () => {
    const target = layout().link!.target
    for (const current of [undefined, { ...target, scopeId: 'Other' }, { ...target, targetKey: 'Other' },
      { ...target, generation: 8 }, { ...target, source: 'result' as const }, { ...target, href: 'https://evil.invalid/' }]) {
      const p = ports()
      await expect(runFetchTitleAction(target, 'open', p, () => current)).rejects.toThrow('refresh')
      expect(p.open).not.toHaveBeenCalled()
    }
    const tampered = { ...target, href: 'javascript:alert(1)' }, p = ports()
    await expect(runFetchTitleAction(tampered, 'copy', p, () => tampered)).rejects.toThrow('changed')
    expect(p.copy).not.toHaveBeenCalled()
  })
  it('propagates port refusal and pre-abort without a fallback fetch or opener retry', async () => {
    const target = layout().link!.target, p = ports({ open: vi.fn(async () => { throw new Error('opener rejected') }) })
    await expect(runFetchTitleAction(target, 'open', p, () => target)).rejects.toThrow('opener rejected')
    expect(p.open).toHaveBeenCalledOnce()
    const abort = new AbortController(); abort.abort(new Error('gesture cancelled'))
    await expect(runFetchTitleAction(target, 'copy', p, () => target, abort.signal)).rejects.toThrow('gesture cancelled')
    expect(p.copy).not.toHaveBeenCalled()
  })
  it('awaits clipboard completion and reports asynchronous writer failure without retry', async () => {
    const target = layout().link!.target
    const copy = vi.fn(async () => { throw new Error('clipboard writer failed') })
    const p = ports({ copy })
    await expect(runFetchTitleAction(target, 'copy', p, () => target)).rejects.toThrow('clipboard writer failed')
    expect(copy).toHaveBeenCalledOnce()
  })
  it('bounds unresponsive opener and safely observes a late rejection without retry', async () => {
    vi.useFakeTimers()
    const target = layout().link!.target
    let fail!: (error: Error) => void
    const p = ports({ open: vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject })) })
    const pending = runFetchTitleAction(target, 'open', p, () => target)
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(21); await rejected
    fail(new Error('late opener failure')); await Promise.resolve()
    expect(p.open).toHaveBeenCalledOnce()
  })
  it('cancels in-flight observation on the supplied surface lifetime and never confirms a late success', async () => {
    const target = layout().link!.target, abort = new AbortController()
    let finish!: () => void, inner!: AbortSignal
    const p = ports({ open: vi.fn((_url, signal) => new Promise<void>(resolve => { finish = resolve; inner = signal })) })
    const pending = runFetchTitleAction(target, 'open', p, () => target, abort.signal)
    const rejected = expect(pending).rejects.toThrow('surface closed')
    await Promise.resolve(); await Promise.resolve()
    abort.abort(new Error('surface closed')); await rejected
    expect(inner.aborted).toBe(true)
    finish(); await Promise.resolve(); await Promise.resolve()
    expect(p.open).toHaveBeenCalledOnce()
    expect(p.copy).not.toHaveBeenCalled()
  })
  it('does not confirm an in-flight action after frame/Session change', async () => {
    const target = layout().link!.target
    let current = target, finish!: () => void
    const p = ports({ open: vi.fn(() => new Promise<void>(resolve => { finish = resolve })) })
    const pending = runFetchTitleAction(target, 'open', p, () => current)
    const rejected = expect(pending).rejects.toThrow('result not confirmed')
    await Promise.resolve(); await Promise.resolve()
    current = { ...target, scopeId: 'reconnected' }; finish(); await rejected
    expect(p.open).toHaveBeenCalledOnce()
  })
})

describe('focused key and completed click intents', () => {
  it('keeps tool Enter as toggle, gives URL focus Enter/open/copy, and leaves global shortcuts alone', () => {
    for (const data of ['\r', '\n', '\u001b[13u']) {
      expect(fetchTitleGestureAction('toggle', { kind: 'key', data })).toBe('toggle')
      expect(fetchTitleGestureAction('url', { kind: 'key', data })).toBe('open')
    }
    expect(fetchTitleGestureAction('url', { kind: 'key', data: 'o' })).toBe('open')
    expect(fetchTitleGestureAction('url', { kind: 'key', data: 'c' })).toBe('copy')
    for (const data of ['o', 'c', ' ', '\u0003', '\u001b', '\u001b[A']) expect(fetchTitleGestureAction('toggle', { kind: 'key', data })).toBeUndefined()
  })
  it('distinguishes plain left URL/toggle and right context; excludes drag and modified gestures', () => {
    const click = { kind: 'click' as const, button: 'left' as const, modifiers: { shift: false, alt: false, ctrl: false }, dragged: false }
    expect(fetchTitleGestureAction('url', click)).toBe('open')
    expect(fetchTitleGestureAction('toggle', click)).toBe('toggle')
    expect(fetchTitleGestureAction('url', { ...click, button: 'right' })).toBe('context')
    expect(fetchTitleGestureAction('url', { ...click, dragged: true })).toBeUndefined()
    for (const button of ['middle', 'none'] as const) expect(fetchTitleGestureAction('url', { ...click, button })).toBeUndefined()
    for (const modifier of ['shift', 'alt', 'ctrl']) expect(fetchTitleGestureAction('url', { ...click, modifiers: { ...click.modifiers, [modifier]: true } })).toBeUndefined()
  })
})
