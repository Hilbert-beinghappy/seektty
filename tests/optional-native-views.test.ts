import { expect, it, vi } from 'vitest'
import { ToolRuntime, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import { nativeMcpResourcePort, nativeTeamBoardPort, nativeSubagentDescendantPort, nativeScheduleRemote, publishedScheduleMethods } from '../src/host/optional-native-views.ts'
import { freshSignal, syntheticTeamBoard, syntheticLeadJournal } from './fixtures/optional-native-views.ts'
// Opaque identity sent only to stubbed Host services. No Agent creation or model execution.
const agent = { id: SessionId('synthetic-member') } as Agent
const definition: ToolDefinition = { name: 'list_mcp_resources', description: 'Synthetic shared tool', parameters: { type: 'object', properties: {} }, output: { schema: {}, render: () => [] }, execute: async () => ({ resources: [] }) }
it('shared tool adapter uses exact scoped runtime execute with caller signal and minted correlation id', async () => {
  const get = vi.fn(() => definition); const execute = vi.fn<ToolRuntime['execute']>(async () => ({ isError: false, value: { resources: [] }, content: [] }))
  const port = nativeMcpResourcePort(() => ({ get, execute }), () => agent); const signal = freshSignal()
  expect(port.reason('list_mcp_resources')).toBeUndefined(); await port.execute('list_mcp_resources', { server: 'synthetic' }, signal)
  expect(get).toHaveBeenCalledWith('list_mcp_resources', agent)
  expect(execute.mock.calls[0]?.[0]).toMatchObject({ name: 'list_mcp_resources', agent, signal, arguments: { server: 'synthetic' } })
  expect(execute.mock.calls[0]?.[0].callId).toMatch(/^seektty-resource-/)
})
it('missing tools/caller/visibility fail before dispatch and aborted signal cannot execute', async () => {
  expect(nativeMcpResourcePort(() => undefined, () => agent).reason('read_mcp_resource')).toContain('not mounted')
  const execute = vi.fn<ToolRuntime['execute']>(); const tools = { get: () => undefined, execute }
  const invisible = nativeMcpResourcePort(() => tools, () => agent)
  await expect(invisible.execute('read_mcp_resource', { server: 'synthetic', uri: 'synthetic://a' }, freshSignal())).rejects.toThrow('not visible')
  expect(nativeMcpResourcePort(() => tools, () => undefined).reason('read_mcp_resource')).toContain('exact live Agent')
  const abort = new AbortController(); abort.abort(); await expect(invisible.execute('read_mcp_resource', {}, abort.signal)).rejects.toThrow(); expect(execute).not.toHaveBeenCalled()
})
it('Team service methods keep receiver this and exact live Agent; board never accesses mutators', async () => {
  const mutator = vi.fn()
  const service = { marker: 'synthetic', membership(caller: Agent) { expect(this.marker).toBe('synthetic'); expect(caller).toBe(agent); return { ...syntheticTeamBoard.membership, root: { id: 'synthetic-lead' } } }, listMembers(caller: Agent) { expect(caller).toBe(agent); return syntheticTeamBoard.members }, listTasks(caller: Agent) { expect(caller).toBe(agent); return syntheticTeamBoard.tasks }, sendMessage: mutator, updateTask: mutator }
  const journal = vi.fn(async () => syntheticLeadJournal)
  const port = nativeTeamBoardPort(() => service, () => agent, journal)
  expect(await port.read(freshSignal())).toEqual(syntheticTeamBoard); expect(mutator).not.toHaveBeenCalled()
  expect(nativeTeamBoardPort(() => undefined, () => agent, journal).reason()).toContain('absent')
  expect(nativeTeamBoardPort(() => service, () => undefined, journal).reason()).toContain('cold Session')
})
it('subagent service keeps receiver identity and does not invoke provider registry list as child discovery', async () => {
  const list = vi.fn(); const service = { marker: 'synthetic', list, listDescendants(root: string, signal: AbortSignal) { expect(this.marker).toBe('synthetic'); expect(root).toBe('synthetic-root'); expect(signal.aborted).toBe(false); return [] } }
  const port = nativeSubagentDescendantPort(() => service, () => true)
  await expect(port.listDescendants('synthetic-root', freshSignal())).resolves.toEqual([]); expect(list).not.toHaveBeenCalled()
  expect(nativeSubagentDescendantPort(() => ({ list }), () => true).reason()).toContain('no catalog Remote')
})
it('Schedule adapter invokes only published namespaces/args and forwards cancellation for writes', async () => {
  const invoke = vi.fn<TypertGateway['invoke']>(async () => [])
  const port = nativeScheduleRemote({ invoke }); const signal = freshSignal()
  await port.catalog(); await port.list({ sessionId: 'synthetic' }); await port.history({ sessionId: 'synthetic', id: 'schedule', limit: 20 }); await port.delete({ sessionId: 'synthetic', id: 'schedule' }, signal)
  expect(invoke.mock.calls.map(([request]) => ({ namespace: request.namespace, method: request.method, args: request.args }))).toEqual([
    { namespace: 'schedule', method: 'catalog', args: {} }, { namespace: 'schedule', method: 'list', args: { request: { sessionId: 'synthetic' } } },
    { namespace: 'schedule', method: 'history', args: { request: { sessionId: 'synthetic', id: 'schedule', limit: 20 } } }, { namespace: 'schedule', method: 'delete', args: { request: { sessionId: 'synthetic', id: 'schedule' } } },
  ]); expect(invoke.mock.calls[3]?.[0].signal).toBe(signal)
})
it('Schedule mount discovery preserves unknown directory and cannot infer mount from an arbitrary service object', () => {
  expect(publishedScheduleMethods(undefined, () => ({}))).toBeUndefined()
  expect([...publishedScheduleMethods({ get: () => undefined }, () => ({ catalog() {} }))!]).toEqual([])
})
