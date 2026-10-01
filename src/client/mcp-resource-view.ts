/** Shared MCP resource tools from dsh-mcp-resources 0.2.0-rc.2; never invokes private providers. */
import { z } from 'zod'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { OverlayPrompts } from './overlays.ts'
import { OptionalViewLifetime, domainCommand, domainProgress, type OptionalViewSource } from './optional-view-lifetime.ts'
export const MCP_RESOURCE_TOOLS = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'] as const
export type McpResourceTool = typeof MCP_RESOURCE_TOOLS[number]
export interface McpResourcePort {
  /** Current Agent-scoped tool registry, including shared tools when a server has no native tools. */
  reason(name: McpResourceTool): string | undefined
  execute(name: McpResourceTool, args: Readonly<Record<string, string>>, signal: AbortSignal): Promise<ToolExecutionResult>
}
const resource = z.object({ uri: z.string().min(1), name: z.string(), title: z.string().optional(), description: z.string().optional(), mimeType: z.string().optional() }).passthrough()
const template = z.object({ uriTemplate: z.string().min(1), name: z.string(), title: z.string().optional(), description: z.string().optional(), mimeType: z.string().optional() }).passthrough()
const resourcePage = z.object({ resources: z.array(resource), nextCursor: z.string().optional() }).passthrough()
const templatePage = z.object({ resourceTemplates: z.array(template), nextCursor: z.string().optional() }).passthrough()
const content = z.object({ uri: z.string().min(1), mimeType: z.string().optional(), text: z.string().optional(), blob: z.string().optional() }).passthrough()
const readResult = z.object({ contents: z.array(content) }).passthrough()
export interface McpResourcePage {
  readonly server: string; readonly kind: 'resources' | 'templates'; readonly items: readonly (z.infer<typeof resource> | z.infer<typeof template>)[]
  readonly nextCursor?: string; readonly detail: string
}
export class McpResourceController {
  private readonly lifetime: OptionalViewLifetime
  constructor(source: OptionalViewSource, private readonly port: McpResourcePort, timeoutMs?: number) { this.lifetime = new OptionalViewLifetime(source, timeoutMs) }
  key(): string { return this.lifetime.key() }
  reason(name: McpResourceTool): string | undefined {
    try { this.lifetime.scope() } catch (error) { return String(error) }
    return this.port.reason(name)
  }
  private async call(name: McpResourceTool, args: Readonly<Record<string, string>>, signal: AbortSignal): Promise<unknown> {
    const reason = this.reason(name); if (reason !== undefined) throw new Error(reason)
    const result = await this.lifetime.run(signal, current => this.port.execute(name, args, current))
    if (result.isError !== false) throw new Error(result.error?.message ?? 'MCP tool returned an unknown failure')
    // Registry value is canonical after post-execute permissions; rendered text is not a JSON transport.
    return result.value
  }
  async page(server: string, kind: 'resources' | 'templates', signal: AbortSignal, cursor?: string): Promise<McpResourcePage> {
    if (!server.trim() || /[\x00-\x1f\x7f]/.test(server)) throw new Error('Enter the exact configured MCP serverName without control characters')
    const value = await this.call(kind === 'resources' ? 'list_mcp_resources' : 'list_mcp_resource_templates', { server, ...(cursor === undefined ? {} : { cursor }) }, signal)
    const parsed = kind === 'resources' ? resourcePage.parse(value) : templatePage.parse(value)
    const items = kind === 'resources' ? resourcePage.parse(value).resources : templatePage.parse(value).resourceTemplates
    const next = parsed.nextCursor
    if (next !== undefined && next === cursor) throw new Error('MCP returned a repeated cursor; refresh instead of looping')
    return { server, kind, items, ...(next === undefined ? {} : { nextCursor: next }), detail: JSON.stringify(parsed, null, 2) }
  }
  async read(server: string, uri: string, signal: AbortSignal): Promise<string> {
    if (!server.trim() || /[\x00-\x1f\x7f]/.test(server) || !uri || /[\x00-\x1f]/.test(uri)) throw new Error('A configured server and concrete resource URI are required')
    const result = readResult.parse(await this.call('read_mcp_resource', { server, uri }, signal))
    return result.contents.map(item => `${item.uri}${item.mimeType === undefined ? '' : ` (${item.mimeType})`}\n${item.text ?? (item.blob === undefined ? 'No text payload' : `Binary resource (${item.blob.length} base64 characters); not decoded or executed`)}`).join('\n\n')
  }
}
/** Complete terminal flow; E supplies only routing and an Agent-scoped permission-preserving port. */
async function mcpResourceCommandFlow(controller: McpResourceController, overlays: OverlayPrompts): Promise<void> {
  const scope = controller.key()
  const server = await overlays.input({ title: 'MCP resources', detail: 'Configured serverName. Resource-only servers are supported; this is not a server inventory.' })
  if (server === undefined || controller.key() !== scope) return
  const kind = await overlays.select({ title: server, choices: [
    { id: 'resources', label: 'Resources', ...(controller.reason('list_mcp_resources') === undefined ? {} : { disabledReason: controller.reason('list_mcp_resources')! }) },
    { id: 'templates', label: 'Resource templates', ...(controller.reason('list_mcp_resource_templates') === undefined ? {} : { disabledReason: controller.reason('list_mcp_resource_templates')! }) },
  ] })
  if (kind === undefined || controller.key() !== scope) return
  const mode = kind.id === 'templates' ? 'templates' : 'resources'
  let cursor: string | undefined
  let page: McpResourcePage | undefined
  const seen = new Set<string>()
  while (controller.key() === scope) {
    page ??= await domainProgress(overlays, `${server} · ${mode}`, signal => controller.page(server, mode, signal, cursor))
    if (page === undefined) return
    const selected = await overlays.select({ title: `${server} · ${mode}`, detail: `${page.items.length} rows on this page; Host permissions apply`, choices: [
      ...page.items.map((item, index) => ({ id: String(index), label: item.title ?? item.name, description: String('uri' in item ? item.uri : item.uriTemplate) })),
      { id: 'metadata', label: 'Page metadata' },
      { id: 'next', label: 'Next page', ...(page.nextCursor === undefined ? { disabledReason: 'Server returned no nextCursor' } : {}) },
      { id: 'refresh', label: 'Refresh from start' },
    ] })
    if (selected === undefined || controller.key() !== scope) return
    if (selected.id === 'metadata') { await overlays.detail({ title: server, content: page.detail }); continue }
    if (selected.id === 'refresh') { cursor = undefined; page = undefined; seen.clear(); continue }
    if (selected.id === 'next') {
      const next = page.nextCursor
      if (next === undefined) continue
      if (seen.has(next)) { await overlays.detail({ title: server, content: 'Repeated cursor; refresh required' }); continue }
      seen.add(next); cursor = next; page = undefined; continue
    }
    const item = page.items[Number(selected.id)]; if (item === undefined) continue
    await overlays.detail({ title: selected.label, content: JSON.stringify(item, null, 2) })
    const uri = mode === 'templates' ? await overlays.input({ title: 'Concrete resource URI', detail: `Fill the template using server-documented variables: ${String(item.uriTemplate)}` }) : String(item.uri)
    if (uri === undefined || controller.key() !== scope) return
    const action = await overlays.select({ title: selected.label, choices: [{ id: 'read', label: 'Read through Host tool permissions', ...(controller.reason('read_mcp_resource') === undefined ? {} : { disabledReason: controller.reason('read_mcp_resource')! }) }] })
    if (action === undefined || controller.key() !== scope) continue
    const result = await domainProgress(overlays, 'Read MCP resource', signal => controller.read(server, uri, signal))
    if (result !== undefined) await overlays.detail({ title: uri, content: result })
  }
}

export async function mcpResourceCommand(controller: McpResourceController, overlays: OverlayPrompts): Promise<void> {
  await domainCommand(overlays, 'MCP resources', () => mcpResourceCommandFlow(controller, overlays))
}
