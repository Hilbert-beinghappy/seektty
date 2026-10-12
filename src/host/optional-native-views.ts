/** Mount adapters for optional published dsh 0.2.0-rc.2 capabilities; never installs a plugin. */
import { randomUUID } from 'node:crypto'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { TypertLocalRegistry } from '@deepseek-ai/dsh-typert-protocol'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import type { McpResourcePort, McpResourceTool } from '../client/mcp-resource-view.ts'
import type { TeamBoardPort, TeamLeadJournal } from '../client/team-view.ts'
import type { ScheduleRemote } from '../client/schedule-view.ts'
import type { SubagentDescendantPort } from '../client/subagent-catalog-view.ts'
const SCHEDULE_ENDPOINTS = ['schedule/catalog', 'schedule/list', 'schedule/history', 'schedule/update', 'schedule/delete'] as const
function method(receiver: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if ((typeof receiver !== 'object' || receiver === null) && typeof receiver !== 'function') return undefined
  const fn: unknown = Reflect.get(receiver, name)
  return typeof fn === 'function' ? (...args) => Reflect.apply(fn, receiver, args) : undefined
}
export function publishedScheduleMethods(local: Pick<TypertLocalRegistry, 'get'> | undefined, service: (key: string) => unknown): ReadonlySet<string> | undefined {
  if (local === undefined) return undefined
  const available = new Set<string>()
  for (const endpoint of SCHEDULE_ENDPOINTS) {
    const descriptor = local.get(endpoint)
    if (descriptor === undefined || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== 'direct') continue
    if (method(service(descriptor.service), descriptor.implementation ?? descriptor.method) !== undefined) available.add(endpoint)
  }
  return available
}
/** Gateway validates official descriptor args/results and cancellation; no hand-written Schedule Host API. */
export function nativeScheduleRemote(gateway: Pick<TypertGateway, 'invoke'>): ScheduleRemote {
  const call = async (method: string, request?: unknown, signal?: AbortSignal) => ({ ok: true as const, value: await gateway.invoke({ namespace: 'schedule', method, args: request === undefined ? {} : { request }, ...(signal === undefined ? {} : { signal }) }) })
  return { catalog: () => call('catalog'), list: request => call('list', request), history: request => call('history', request), update: (request, signal) => call('update', request, signal), delete: (request, signal) => call('delete', request, signal) }
}
/** Caller getter must resolve the exact currently authorized live Agent, never construct or resume one. */
export function nativeMcpResourcePort(tools: () => Pick<ToolRuntime, 'get' | 'execute'> | undefined, caller: () => Agent | undefined): McpResourcePort {
  const reason = (name: McpResourceTool): string | undefined => {
    const agent = caller(); if (agent === undefined) return 'MCP resources require an exact live Agent scope'
    const runtime = tools(); if (runtime === undefined) return 'Tool runtime is not mounted'
    return runtime.get(name, agent) === undefined ? `Shared resource tool ${name} is not visible in this Agent scope` : undefined
  }
  return {
    reason,
    execute: async (name, args, signal) => {
      signal.throwIfAborted()
      const agent = caller(); const runtime = tools()
      if (agent === undefined || runtime === undefined || runtime.get(name, agent) === undefined) throw new Error(reason(name) ?? 'MCP resource capability changed')
      // execute owns pre-policy/approval/guards/post-policy, including PTC-only direct-call denial.
      return runtime.execute({ callId: ToolCallId(`seektty-resource-${randomUUID()}`), name, arguments: args, agent, signal })
    },
  }
}
export function nativeTeamBoardPort(service: () => unknown, caller: () => Agent | undefined, readLeadJournal: (teamId: string, signal: AbortSignal) => Promise<TeamLeadJournal>): TeamBoardPort {
  const reason = (): string | undefined => {
    const value = service()
    if (!['membership', 'listMembers', 'listTasks'].every(name => method(value, name) !== undefined)) return 'Experimental agentTeams service is absent, disabled, or incomplete'
    if (caller() === undefined) return 'Team membership requires the exact live Agent; cold Session is not resumed by this view'
    return undefined
  }
  return {
    reason, readLeadJournal,
    read: async signal => {
      signal.throwIfAborted(); const missing = reason(); if (missing !== undefined) throw new Error(missing)
      const value = service(); const agent = caller()
      const membership: unknown = method(value, 'membership')!(agent)
      if (typeof membership !== 'object' || membership === null) throw new Error('Team membership was not confirmed')
      const root: unknown = Reflect.get(membership, 'root')
      if (typeof root !== 'object' || root === null) throw new Error('Team Lead identity was not confirmed')
      return { membership: { id: Reflect.get(membership, 'id'), rootSessionId: Reflect.get(root, 'id'), role: Reflect.get(membership, 'role'), name: Reflect.get(membership, 'name') }, members: method(value, 'listMembers')!(agent), tasks: method(value, 'listTasks')!(agent) }
    },
  }
}
export function nativeSubagentDescendantPort(service: () => unknown, open: SubagentDescendantPort['open']): SubagentDescendantPort {
  const reason = (): string | undefined => method(service(), 'listDescendants') === undefined ? 'Host subagents.listDescendants service is not mounted; no catalog Remote is synthesized' : undefined
  return {
    reason, open,
    listDescendants: async (rootSessionId, signal) => {
      signal.throwIfAborted(); const fn = method(service(), 'listDescendants')
      if (fn === undefined) throw new Error(reason())
      return await fn(SessionId(rootSessionId), signal)
    },
  }
}
