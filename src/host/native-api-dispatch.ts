/** Terminal unary protocol adapter. Exact target: official dsh 0.1.5-rc.1. */

import type { InvokeRemoteRequest, TypertGateway } from '@deepseek-ai/dsh-api-gateway/types'
import { z } from 'zod'

const record = z.record(z.string(), z.unknown())
const goalRef = z.object({ id: z.string(), revision: z.number() })

/** Additional read projections assembled from the official domain streams. */
export interface TerminalDomainReads {
  describeHost(signal: AbortSignal): Promise<unknown>
  readHistory(payload: Readonly<Record<string, unknown>>, subagent: boolean, signal: AbortSignal): Promise<unknown>
  readModels(payload: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown>
  readWorkspaces(signal: AbortSignal): Promise<unknown>
}

/**
 * Translate the retained terminal view protocol into generated Remote calls.
 * The Gateway validates named arguments; the terminal client validates result
 * schemas. No Agent, model-selection, credential, or persistence state lives here.
 */
export async function dispatchTerminalRequest(
  gateway: Pick<TypertGateway, 'invoke'>,
  reads: TerminalDomainReads,
  method: string,
  payload: unknown,
  rpcId: string,
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted()
  const p = record.parse(payload)
  const call = (namespace: string, name: string, args: Readonly<Record<string, unknown>> = {}) => {
    const request: InvokeRemoteRequest = { namespace, method: name, args, signal }
    return gateway.invoke(request)
  }
  if (method === 'host.describe') return reads.describeHost(signal)
  if (method === 'session.history' || method === 'subagent.history') return reads.readHistory(p, method.startsWith('subagent'), signal)
  if (method === 'session.models') return reads.readModels(p, signal)
  if (method === 'workspace.list') return reads.readWorkspaces(signal)
  if (method.startsWith('session.')) {
    const name = method.slice('session.'.length)
    const request = name === 'prompt' ? { ...p, requestId: rpcId } : p
    return call('session', name, { [name === 'list' ? '_request' : 'request']: request })
  }
  if (method.startsWith('workspace.')) return call('workspace', method.slice('workspace.'.length), { request: p })
  if (method === 'skill.list') return call('skills', 'list', { request: p })
  if (method === 'host.pickDirectory') return { path: await call('directoryPicker', 'pick') }
  if (method === 'host.listDirectory') return call('directoryPicker', 'list', { path: p.path })
  if (method === 'host.createDirectory') return { path: await call('directoryPicker', 'createDirectory', p) }
  if (method === 'host.openPath') return call('session', 'openWorkspacePath', { request: p })
  if (method === 'settings.describe') return call('settings', 'describe')
  if (method === 'settings.openDocument') return call('settings', 'openSettingsDocument')
  if (['settings.mutate', 'settings.update', 'settings.replace'].includes(method)) {
    return call('settings', method.slice('settings.'.length), { ...p, expectedRevision: p.expectedRevision })
  }
  if (method === 'credentials.describe') return { credentials: await call('credentials', 'describe', p) }
  if (method === 'credentials.set' || method === 'credentials.unset') {
    await call('credentials', method.slice('credentials.'.length), p)
    return {}
  }
  if (method === 'llm.providers') {
    // Configurable entries no longer carry `active` in rc.1. Resolve it from
    // Harness's actual loaded routes so the terminal can distinguish both.
    const [configured, routes] = await Promise.all([
      call('llm', 'listConfigurableProviders'), call('llm', 'listProviders'),
    ])
    const active = new Set(z.array(z.object({ id: z.string() })).parse(routes).map(route => route.id))
    return { providers: z.array(record).parse(configured).map(entry => ({
      ...entry, active: active.has(z.string().parse(entry.provider)),
    })) }
  }
  if (method === 'llm.models') return call('session', 'modelCatalog')
  if (method === 'llm.discoverModels') {
    const { settingsNs, ...request } = p
    return { models: await call('llm', 'discoverModels', { settingsNs, request }) }
  }
  if (method === 'agentPreset.list') {
    const roster = record.parse(await call('agentPresets', 'list'))
    return { ...roster, hasDocument: await call('settings', 'canOpenAgentPresetDirectory') }
  }
  if (method === 'agentPreset.select') {
    return { agentPreset: await call('agentPresets', 'select', { agentId: p.sessionId, agentPreset: p.agentPreset }) }
  }
  if (method === 'agentPreset.read') return call('agentPresets', 'read', p)
  if (method === 'agentPreset.copy') {
    await call('agentPresets', 'copy', { from: p.from, id: p.agentPreset, name: p.name })
    return { agentPreset: p.agentPreset }
  }
  if (method === 'agentPreset.remove') {
    await call('agentPresets', 'deletePreset', { id: p.agentPreset })
    return {}
  }
  if (method === 'agentPreset.openDocument') return call('settings', 'openAgentPresetDirectory', p)
  if (method === 'subagent.list') return call('subagents', 'list', p)
  if (method === 'subagent.prompt') return call('subagents', 'prompt', { request: p })
  if (method === 'subagent.interrupt') return call('subagents', 'interruptByParent', p)
  if (method.startsWith('goal.')) {
    const name = method.slice('goal.'.length)
    const { sessionId: agentId, ref, ...request } = p
    const args = name === 'create' ? { agentId, request }
      : name === 'edit' ? { agentId, ref, request } : { agentId, ref }
    const value = await call('goals', name, args)
    if (name === 'clear') return { cleared: true }
    // Create returns its own result; other mutations return the flattened GoalView.
    if (name === 'create') return value
    return { ref: goalRef.parse(value) }
  }
  throw new Error(`Unsupported terminal API method: ${method}`)
}
