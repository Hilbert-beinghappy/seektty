import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { McpResourceController, mcpResourceCommand, type McpResourcePort } from '../src/client/mcp-resource-view.ts'
import { scopedSource, freshSignal, deferred, scriptedOverlays, tick } from './fixtures/optional-native-views.ts'
function fixture(timeoutMs = 1000) {
  const scope = scopedSource(); let unavailable: string | undefined
  const execute = vi.fn<McpResourcePort['execute']>(async () => ({ isError: false, value: { resources: [{ uri: 'synthetic://doc', name: '资源 😀', description: 'Server description' }], nextCursor: 'cursor-1' }, content: [] }))
  const controller = new McpResourceController(scope.source, { reason: () => unavailable, execute }, timeoutMs)
  return { ...scope, controller, execute, unavailable: (reason?: string) => { unavailable = reason } }
}
afterEach(() => vi.useRealTimers())
describe('shared resource tool browser', () => {
  it('uses the shared resource name for a resource-only server and preserves opaque cursors/metadata', async () => {
    const f = fixture(); const page = await f.controller.page('no-tools-server', 'resources', freshSignal())
    expect(f.execute).toHaveBeenCalledWith('list_mcp_resources', { server: 'no-tools-server' }, expect.any(AbortSignal))
    expect(page.items[0]?.name).toBe('资源 😀'); expect(page.nextCursor).toBe('cursor-1'); expect(page.detail).toContain('Server description')
    f.execute.mockResolvedValueOnce({ isError: false, value: { resources: [] }, content: [] })
    const next = await f.controller.page('no-tools-server', 'resources', freshSignal(), page.nextCursor)
    expect(next.items).toEqual([]); expect(next.nextCursor).toBeUndefined()
    expect(f.execute.mock.calls[1]?.[1]).toEqual({ server: 'no-tools-server', cursor: 'cursor-1' }); expect(f.listeners.size).toBe(0)
  })
  it.each(['resource.only', 'resource.only.' + 'long'.repeat(12), '资源提供者'])('delegates exact native registration name without invented grammar: %s', async server => {
    const f = fixture(); await f.controller.page(server, 'resources', freshSignal())
    f.execute.mockResolvedValueOnce({ isError: false, value: { contents: [{ uri: 'synthetic://doc', text: 'Synthetic text' }] }, content: [] })
    await f.controller.read(server, 'synthetic://doc', freshSignal())
    expect(f.execute.mock.calls.map(call => call[1].server)).toEqual([server, server])
  })
  it.each(['', '   ', 'bad\u0000name', 'bad\u007fname'])('empty/control-character server input is rejected: %s', async server => {
    const f = fixture(); await expect(f.controller.page(server, 'resources', freshSignal())).rejects.toThrow()
    await expect(f.controller.read(server, 'synthetic://doc', freshSignal())).rejects.toThrow(); expect(f.execute).not.toHaveBeenCalled()
  })
  it('templates use their real protocol property and concrete URIs must be provided explicitly', async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce({ isError: false, value: { resourceTemplates: [{ uriTemplate: 'synthetic://{id}', name: 'Template', annotations: { priority: 0.8 } }] }, content: [] })
    expect((await f.controller.page('synthetic', 'templates', freshSignal())).detail).toContain('annotations')
    expect(f.execute.mock.calls[0]?.[0]).toBe('list_mcp_resource_templates')
    f.execute.mockResolvedValueOnce({ isError: false, value: { contents: [{ uri: 'synthetic://42', text: 'Full text', mimeType: 'text/plain' }, { uri: 'synthetic://binary', blob: 'AAAA' }] }, content: [] })
    const read = await f.controller.read('synthetic', 'synthetic://42', freshSignal())
    expect(read).toContain('Full text'); expect(read).toContain('not decoded or executed'); expect(read).not.toContain('AAAA')
    expect(f.execute.mock.calls[1]?.[1]).toEqual({ server: 'synthetic', uri: 'synthetic://42' })
  })
  it.each(['Plugin disabled', 'Tool unavailable in scope', 'Capabilities unknown'])('does not dispatch missing/disabled capability: %s', async reason => {
    const f = fixture(); f.unavailable(reason)
    await expect(f.controller.page('synthetic', 'resources', freshSignal())).rejects.toThrow(reason); expect(f.execute).not.toHaveBeenCalled()
  })
  it.each(['Permission denied', 'MCP disconnected', 'PTC-only direct invocation denied'])('never treats tool failure as success: %s', async message => {
    const f = fixture(); f.execute.mockResolvedValueOnce({ isError: true, error: { message }, content: [] })
    await expect(f.controller.page('synthetic', 'resources', freshSignal())).rejects.toThrow(message)
  })
  it('refuses malformed protocol results and repeated cursor without parsing rendered tool text', async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce({ isError: false, value: {}, content: [{ type: 'text', text: '{"resources":[]}' }] })
    await expect(f.controller.page('synthetic', 'resources', freshSignal())).rejects.toThrow()
    await expect(f.controller.page('synthetic', 'resources', freshSignal(), 'cursor-1')).rejects.toThrow('repeated cursor')
  })
  it.each([{ ready: false }, { generation: 2 }, { sessionId: 'synthetic-new' }])('fences and propagates scope reset %s', async patch => {
    const f = fixture(); const pending = deferred<ToolExecutionResult>(); f.execute.mockReturnValueOnce(pending.promise)
    const work = f.controller.page('synthetic', 'resources', freshSignal()); f.set(patch)
    await expect(work).rejects.toThrow(); expect(f.execute.mock.calls[0]?.[2].aborted).toBe(true)
    pending.resolve({ isError: false, value: { resources: [] }, content: [] }); await tick(); expect(f.listeners.size).toBe(0)
  })
  it('Escape cancellation releases observation and does not retry a request', async () => {
    const f = fixture(); const pending = deferred<ToolExecutionResult>(); f.execute.mockReturnValueOnce(pending.promise)
    const abort = new AbortController(); const work = f.controller.page('synthetic', 'resources', abort.signal); abort.abort()
    await expect(work).rejects.toThrow(); pending.reject(new Error('Late MCP error')); await tick()
    expect(f.execute).toHaveBeenCalledTimes(1); expect(f.listeners.size).toBe(0)
  })
  it('times out noncooperative provider observation', async () => {
    vi.useFakeTimers(); const f = fixture(25); f.execute.mockReturnValueOnce(new Promise(() => {}))
    const work = f.controller.page('synthetic', 'resources', freshSignal()); const check = expect(work).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(26); await check; expect(f.listeners.size).toBe(0)
  })
  it('terminal flow reaches paging, metadata and read actions; refresh restarts at no cursor', async () => {
    const f = fixture()
    f.execute.mockResolvedValueOnce({ isError: false, value: { resources: [{ uri: 'synthetic://one', name: 'One' }], nextCursor: 'c1' }, content: [] })
    f.execute.mockResolvedValueOnce({ isError: false, value: { contents: [{ uri: 'synthetic://one', text: 'Displayed text' }] }, content: [] })
    f.execute.mockResolvedValueOnce({ isError: false, value: { resources: [] }, content: [] })
    f.execute.mockResolvedValueOnce({ isError: false, value: { resources: [] }, content: [] })
    const view = scriptedOverlays(['resources', '0', 'read', 'next', 'refresh', undefined], ['synthetic'])
    await mcpResourceCommand(f.controller, view.overlays)
    expect(view.details.some(row => row.content.includes('Displayed text'))).toBe(true)
    expect(f.execute.mock.calls.map(call => call[1])).toEqual([{ server: 'synthetic' }, { server: 'synthetic', uri: 'synthetic://one' }, { server: 'synthetic', cursor: 'c1' }, { server: 'synthetic' }])
  })
  it('terminal permission failure is shown as an actionable error', async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce({ isError: true, error: { message: 'Permission denied' }, content: [] })
    const view = scriptedOverlays(['resources'], ['synthetic']); await mcpResourceCommand(f.controller, view.overlays)
    expect(view.details[0]?.content).toContain('Permission denied')
  })
})
