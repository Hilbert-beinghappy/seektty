import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { ArtifactViewController, artifactViewCommand, artifactHostPath, type ArtifactSnapshot, type ArtifactViewOptions, type ArtifactFileText } from '../src/client/artifact-view.ts'
import { persistedPlanDetail, sessionArtifacts, type ArtifactEvent } from '../src/client/session-artifacts.ts'
import { artifactEvents, reviewSummary, reviewDiffs } from './fixtures/session-artifacts.ts'
import type { OverlayPrompts, DetailOverlayRequest, SelectOverlayRequest } from '../src/client/overlays.ts'
const signal = (): AbortSignal => new AbortController().signal
async function tick(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function fixture() {
  let state: ArtifactSnapshot = { sessionId: SessionId('synthetic-session'), generation: 1, ready: true, events: artifactEvents, projections: { plan: { active: true, pending: false }, todos: [{ content: '待办任务', status: 'pending' }] }, hasMoreHistory: false, hostWorkspacePath: '/synthetic-host/workspace' }
  const listeners = new Set<() => void>()
  const source = { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const change = (patch: Partial<ArtifactSnapshot>): void => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }
  let capability: ReturnType<ArtifactViewOptions['capability']> = { available: true }
  const read = vi.fn<NonNullable<ArtifactViewOptions['files']>['read']>(async (_session, path, range) => ({ ok: true, value: { text: '中文正文 😀', version: 'v1', offset: range.offset ?? 1, lines: 1, eof: true, absolutePath: path } }))
  const summary = vi.fn(() => reviewSummary as unknown)
  const diff = vi.fn<NonNullable<ArtifactViewOptions['review']>['diff']>(async (_session, _seq, index) => reviewDiffs[index])
  const controller = new ArtifactViewController({ source, files: { read }, review: { summary, diff }, capability: () => capability, timeoutMs: 100 })
  return { controller, source, change, read, summary, diff, listeners, setCapability: (value: typeof capability) => { capability = value } }
}
afterEach(() => vi.useRealTimers())

describe('Plan/attachment/result durable references', () => {
  it('indexes cold/live replay equally without changing the journal and retains full plan prose', () => {
    const before = JSON.stringify(artifactEvents)
    const cold = sessionArtifacts(artifactEvents)
    const live = sessionArtifacts([...artifactEvents.slice(0, 3), ...artifactEvents.slice(3)])
    expect(cold).toEqual(live)
    expect(cold.find(row => row.kind === 'plan')?.detail).toContain('# 计划 😀\n\n完整正文\n- 第一步\n- 第二步')
    expect(cold.find(row => row.id === 'plan:1')).toMatchObject({ isError: true })
    expect(cold.find(row => row.id === 'plan:1')?.title).toContain('error/cancelled')
    expect(cold.find(row => row.id === 'result:2')).toMatchObject({ isError: true, callId: 'plan-call' })
    expect(cold.find(row => row.id === 'result:2')?.detail).toContain('Cancelled plan review')
    expect(JSON.stringify(artifactEvents)).toBe(before)
  })
  it('indexes official flat user image/file content and nested assistant content', () => {
    const content = [
      { type: 'image' as const, attachment: { attachmentId: AttachmentId('synthetic-user-image'), name: 'input.png', mediaType: 'image/png' as const, bytes: 8, width: 1, height: 1 } },
      { type: 'file' as const, attachment: { attachmentId: AttachmentId('synthetic-user-file'), name: 'input.txt', bytes: 3 } },
    ]
    const data = createUserMessage({ source: { kind: 'user' }, content })
    const events = [{ seq: 10, type: 'user/message', data }, { seq: 11, type: 'assistant/message', data: { message: { content } } }]
    const rows = sessionArtifacts(events)
    expect(rows.map(row => row.attachmentId)).toEqual(['synthetic-user-image', 'synthetic-user-file', 'synthetic-user-image', 'synthetic-user-file'])
    expect(rows.every(row => row.kind === 'attachment')).toBe(true)
    expect(sessionArtifacts(events)).toEqual(rows)
  })
  it('keeps spill locators and opaque image references without reconstructing truncated content', () => {
    const rows = sessionArtifacts(artifactEvents)
    expect(rows.find(row => row.id === 'result:5')?.detail).toContain('Full output: /synthetic-host/spill.txt')
    expect(rows.find(row => row.id === 'result-attachment:5:1')).toMatchObject({ kind: 'attachment', attachmentId: 'synthetic-attachment' })
    expect(rows.find(row => row.id === 'unknown:6')?.detail).toContain('unknown-scheme:abc')
  })
  it('unknown result outcome never displays success or unwraps the obsolete nested tool-result block', () => {
    const rows = sessionArtifacts([{ seq: 8, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', isError: false, content: [] }] } } }])
    expect(rows[0]?.title).toContain('status unknown')
    expect(rows[0]?.isError).toBeUndefined()
    expect(rows[0]?.detail).toContain('tool-result')
  })
  it('malformed references remain visible as unknown and duplicate seqs do not create duplicate actions', () => {
    const malformed: ArtifactEvent[] = [{ seq: 7, type: 'deliverables/presented', data: { files: [{ description: 'no path' }] } }, { seq: 8, type: 'workspace/changes', data: {} }, { seq: 9, type: 'tool/call', data: { name: 'exit_plan_mode', arguments: 'not-json' } }]
    const rows = sessionArtifacts([...malformed, ...malformed])
    expect(rows).toHaveLength(3)
    expect(rows.every(row => row.kind === 'unknown')).toBe(true)
  })
  it('mode/todos use the supplied Host projection and preserve absent/null/pending states', () => {
    expect(persistedPlanDetail({})).toContain('projection absent')
    expect(persistedPlanDetail({ plan: { active: false, pending: true }, todos: null })).toContain('selection pending')
    expect(persistedPlanDetail({ todos: null })).toContain('No todo snapshot')
    expect(persistedPlanDetail({ plan: { active: 'unknown' } })).toContain('Invalid Plan')
  })
})

describe('Host file and Review read gates/lifetimes', () => {
  it('an explicit strict requirement also gates the legacy artifact read path', async () => {
    const f = fixture()
    const controller = new ArtifactViewController({ source: f.source, files: { read: f.read }, capability: () => ({ available: true }), strictConfined: true })
    await expect(controller.readFile('delivery:3:0', signal())).rejects.toThrow('Strict workspace confinement is unavailable')
    expect(f.read).not.toHaveBeenCalled()
    controller.dispose(); f.controller.dispose()
  })
  it('never reads file bytes or diff to enumerate references', () => {
    const f = fixture()
    expect(f.controller.rows('files')).toHaveLength(4)
    expect(f.controller.rows('plan').some(row => row.kind === 'plan')).toBe(true)
    expect(f.controller.rows('review').some(row => row.kind === 'changes')).toBe(true)
    expect(f.read).not.toHaveBeenCalled(); expect(f.diff).not.toHaveBeenCalled(); expect(f.summary).not.toHaveBeenCalled()
    f.controller.dispose(); expect(f.listeners.size).toBe(0)
  })
  it.each([undefined, { available: false, reason: 'Plugin is disabled' }])('rejects absent/disabled/unknown capability %s before reads', async capability => {
    const f = fixture(); f.setCapability(capability)
    await expect(f.controller.readFile('delivery:3:0', signal())).rejects.toThrow()
    await expect(f.controller.reviewSummary('changes:4', signal())).rejects.toThrow()
    expect(f.read).not.toHaveBeenCalled(); expect(f.summary).not.toHaveBeenCalled()
    f.controller.dispose()
  })
  it('passes Host paths including Chinese/spaces exactly and returns a paged versioned read', async () => {
    const f = fixture()
    const page = await f.controller.readFile('delivery:3:0', signal())
    expect(page.content).toBe('中文正文 😀')
    expect(f.read).toHaveBeenCalledWith(SessionId('synthetic-session'), '/synthetic-host/项目/结果 A.md', { offset: 1, limit: 200 }, expect.any(AbortSignal))
    await f.controller.readFile('delivery:3:1', signal())
    expect(f.read.mock.calls[1]?.[1]).toBe('/synthetic-host/workspace/relative/report.md')
    f.controller.dispose()
  })
  it('resolves relative paths only against explicit Host coordinates, including Windows on macOS', () => {
    expect(artifactHostPath('file A.txt', 'C:\\Host\\Workspace')).toBe('C:\\Host\\Workspace\\file A.txt')
    expect(() => artifactHostPath('file.txt')).toThrow('authoritative Host')
    expect(() => artifactHostPath('/host/a\u001b[31m')).toThrow('control')
  })
  it('does not treat attachmentId as a path or read client cwd for a missing Host cwd', async () => {
    const f = fixture()
    await expect(f.controller.readFile('result-attachment:5:1', signal())).rejects.toThrow('opaque')
    const { hostWorkspacePath: _removed, ...snapshot } = f.source.getSnapshot()
    f.change({ ...snapshot, hostWorkspacePath: undefined } as unknown as Partial<ArtifactSnapshot>)
    await expect(f.controller.readFile('delivery:3:1', signal())).rejects.toThrow('authoritative Host')
    expect(f.read).not.toHaveBeenCalled(); f.controller.dispose()
  })
  it('propagates permission/not-found/binary/size errors from the Host rather than falling back to local reads', async () => {
    const f = fixture()
    for (const message of ['permission denied', 'workspace-file/not-found', 'workspace-file/not-text', 'workspace-file/too-large']) {
      f.read.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', message, {}) })
      await expect(f.controller.readFile('delivery:3:0', signal())).rejects.toThrow(message)
    }
    f.controller.dispose()
  })
  it('retains next-page position and refuses a changed version or invalid page rather than mixing content', async () => {
    const f = fixture()
    f.read.mockResolvedValueOnce({ ok: true, value: { text: 'page one', offset: 1, lines: 200, eof: false, version: 'v1', absolutePath: '/host/file' } })
    expect(await f.controller.readFile('delivery:3:0', signal())).toMatchObject({ nextOffset: 201, version: 'v1' })
    f.read.mockResolvedValueOnce({ ok: true, value: { text: 'page two', offset: 201, lines: 1, eof: true, version: 'v2', absolutePath: '/host/file' } })
    await expect(f.controller.readFile('delivery:3:0', signal(), 201, 'v1')).rejects.toThrow('changed between pages')
    f.read.mockResolvedValueOnce({ ok: true, value: { text: '', offset: 1, lines: 0, eof: false, version: 'v2', absolutePath: '/host/file' } })
    await expect(f.controller.readFile('delivery:3:0', signal())).rejects.toThrow('Invalid')
    f.controller.dispose()
  })
  it('reads turn Review from its recorded seq and formats actual text/binary/oversized comparisons', async () => {
    const f = fixture()
    expect((await f.controller.reviewSummary('changes:4', signal())).content).toContain('结果 A.md')
    expect(f.summary).toHaveBeenCalledWith(SessionId('synthetic-session'), 4)
    expect((await f.controller.reviewDiff('changes:4', 0, signal())).content).toContain('@@ -1,1 +1,2 @@\n-old\n+新 😀')
    expect((await f.controller.reviewDiff('changes:4', 1, signal())).content).toContain('binary; Host provides no text')
    expect((await f.controller.reviewDiff('changes:4', 2, signal())).content).toContain('oversized; Host provides no text')
    f.controller.dispose()
  })
  it('reports cold/disposed Review unavailable and malformed/unknown comparisons faithfully', async () => {
    const f = fixture()
    f.summary.mockReturnValueOnce(undefined)
    await expect(f.controller.reviewSummary('changes:4', signal())).rejects.toThrow('no longer retained')
    await expect(f.controller.reviewDiff('changes:4', 99, signal())).rejects.toThrow('unavailable')
    f.diff.mockResolvedValueOnce({ kind: 'new-format', path: 'x', display: 'x' })
    await expect(f.controller.reviewDiff('changes:4', 0, signal())).rejects.toThrow('Invalid Review')
    f.controller.dispose()
  })
  it.each(['abort', 'reconnect', 'session', 'disconnect', 'dispose'] as const)('discards late reads after %s, releases observer on exit', async change => {
    const f = fixture()
    let finish!: (value: RemoteResult<ArtifactFileText>) => void
    f.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const parent = new AbortController()
    const rejected = expect(f.controller.readFile('delivery:3:0', parent.signal)).rejects.toThrow()
    await tick()
    if (change === 'abort') parent.abort()
    if (change === 'reconnect') f.change({ generation: 2 })
    if (change === 'session') f.change({ sessionId: SessionId('replacement') })
    if (change === 'disconnect') f.change({ ready: false })
    if (change === 'dispose') f.controller.dispose()
    await rejected
    expect(f.read.mock.calls[0]?.[3]?.aborted).toBe(true)
    finish({ ok: true, value: { text: 'stale', version: 'old', offset: 1, lines: 1, eof: true, absolutePath: '/host/file' } })
    await tick(); f.controller.dispose(); expect(f.listeners.size).toBe(0)
  })
  it('preserves viewer selection per Session through overlays, with explicit window coverage', () => {
    const f = fixture()
    f.controller.select('plan', 'plan:1')
    f.change({ hasMoreHistory: true })
    expect(f.controller.selection('plan')).toBe('plan:1')
    expect(f.controller.stateDetail()).toContain('loaded history window')
    f.change({ sessionId: SessionId('other') })
    expect(f.controller.selection('plan')).toBeUndefined()
    f.change({ sessionId: SessionId('synthetic-session') })
    expect(f.controller.selection('plan')).toBe('plan:1')
    f.controller.dispose()
  })
  it('times out bounded file reads and propagates abort without starting another read', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.read.mockImplementationOnce(() => new Promise(() => {}))
    const rejected = expect(f.controller.readFile('delivery:3:0', signal())).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(101); await rejected
    expect(f.read).toHaveBeenCalledTimes(1)
    expect(f.read.mock.calls[0]?.[3]?.aborted).toBe(true)
    f.controller.dispose()
  })
})

describe('terminal artifact dispatcher via existing overlays', () => {
  it('reaches persisted Plan plus recorded plan, refreshes and leaves on Escape without answering review', async () => {
    const f = fixture()
    const detail: DetailOverlayRequest[] = []
    let invocation = 0
    const select = vi.fn(async (request: SelectOverlayRequest) => {
      invocation++
      return request.choices.find(row => row.id === ['__plan_state__', '__refresh__', 'plan:1'][invocation - 1])
    })
    const overlays = { select, detail: vi.fn(async (request: DetailOverlayRequest) => { detail.push(request) }) } as unknown as OverlayPrompts
    await artifactViewCommand(f.controller, 'plan', overlays)
    expect(detail[0]?.content).toContain('Plan mode: active')
    expect(detail[1]?.content).toContain('完整正文')
    expect(select.mock.calls[3]?.[0].initialChoiceId).toBe('plan:1')
    expect(f.read).not.toHaveBeenCalled(); f.controller.dispose()
  })
  it('reaches Review summary then selected comparison through explicit gestures', async () => {
    const f = fixture()
    let invocation = 0
    const content: string[] = []
    const overlays = {
      select: vi.fn(async (request: SelectOverlayRequest) => { invocation++; return request.choices.find(row => row.id === ['changes:4', 'read', '0'][invocation - 1]) }),
      detail: vi.fn(async (request: DetailOverlayRequest) => { content.push(request.content) }),
      progress: vi.fn(async (request: { work(report: (chunk: string) => void, signal: AbortSignal): Promise<unknown> }) => request.work(() => {}, signal())),
    } as unknown as OverlayPrompts
    await artifactViewCommand(f.controller, 'review', overlays)
    expect(content).toHaveLength(2)
    expect(content[1]).toContain('+新 😀')
    f.controller.dispose()
  })
})

describe('official web presenter references', () => {
  it('uses only the existing result presenter URL/source vocabulary, not strings found in output', () => {
    const rows = sessionArtifacts([
      { seq: 1, type: 'tool/result', data: {}, view: { for: 'result', view: { card: 'web', kind: 'fetch', url: 'https://example.invalid/a', statusCode: 200, truncated: false } } },
      { seq: 2, type: 'tool/result', data: {}, view: { for: 'result', view: { card: 'web', kind: 'search', sources: [{ url: 'https://example.invalid/b', title: 'Source' }], truncated: false } } },
      { seq: 3, type: 'artifact/other', data: { text: 'https://example.invalid/not-a-link-action' } },
    ])
    expect(rows.filter(row => row.kind === 'link').map(row => row.url)).toEqual(['https://example.invalid/a', 'https://example.invalid/b'])
  })
  it('terminal explicit copy/open actions use validated presenter URLs and do not execute tools', async () => {
    const f = fixture()
    f.change({ events: [{ seq: 9, type: 'tool/result', data: {}, view: { for: 'result', view: { card: 'web', kind: 'fetch', url: 'https://example.invalid/a' } } }] })
    const copy = vi.fn()
    const open = vi.fn(async () => {})
    const controller = new ArtifactViewController({ source: f.source, capability: () => undefined, links: { copy, open } })
    expect(copy).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled()
    await controller.link('copy', 'link:9:0', signal())
    await controller.link('open', 'link:9:0', signal())
    expect(copy).toHaveBeenCalledWith('https://example.invalid/a')
    expect(open).toHaveBeenCalledWith('https://example.invalid/a', expect.any(AbortSignal))
    expect(f.read).not.toHaveBeenCalled(); controller.dispose(); f.controller.dispose()
  })
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.invalid', 'https://example.invalid/\u001b[31m', 'not-a-url'])('blocks unsafe or unknown URL %s', async url => {
    const f = fixture()
    f.change({ events: [{ seq: 9, type: 'tool/result', data: {}, view: { for: 'result', view: { card: 'web', kind: 'fetch', url } } }] })
    const open = vi.fn(async () => {})
    const controller = new ArtifactViewController({ source: f.source, capability: () => undefined, links: { open } })
    await expect(controller.link('open', 'link:9:0', signal())).rejects.toThrow()
    expect(open).not.toHaveBeenCalled(); controller.dispose(); f.controller.dispose()
  })
  it('an absent terminal opener or a failed opener is not success', async () => {
    const f = fixture()
    f.change({ events: [{ seq: 9, type: 'tool/result', data: {}, view: { for: 'result', view: { card: 'web', kind: 'fetch', url: 'https://example.invalid/a' } } }] })
    expect(f.controller.linkReason('open', 'link:9:0')).toContain('No open')
    const controller = new ArtifactViewController({ source: f.source, capability: () => undefined, links: { open: async () => { throw new Error('opener failed') } } })
    await expect(controller.link('open', 'link:9:0', signal())).rejects.toThrow('opener failed')
    controller.dispose(); f.controller.dispose()
  })
})

it('a Session change while a selector is open cannot read a same-seq reference from the new Session', async () => {
  const f = fixture()
  const overlays = { select: vi.fn(async () => { f.change({ sessionId: SessionId('other-session') }); return { id: 'delivery:3:0', label: 'old card' } }) } as unknown as OverlayPrompts
  await expect(artifactViewCommand(f.controller, 'files', overlays)).rejects.toThrow('changed while')
  expect(f.read).not.toHaveBeenCalled(); f.controller.dispose()
})
