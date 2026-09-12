/** Terminal presentation plus official dsh 0.1.5-rc.1 streaming Session export. */
import type { Context } from '@deepseek-ai/cordis'
import { SessionId, isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import type { ToolCallView } from '@deepseek-ai/dsh-tools/presentation'
import type {} from '@deepseek-ai/dsh-tools'
import { sessionLogExportDeps, flushLiveSessionLog, readSessionLogText, streamSessionLogZip,
  sessionLogZipFilename, DEFAULT_SESSION_LOG_COMPRESSION_LEVEL } from '@deepseek-ai/dsh-session-log-export'
import { toAssistantBlocks } from '../../vendor/client-runtime/client/sessions/conversation.js'
import type { MarkdownConversationNode } from '../client/conversation-markdown.ts'
import { toolPresenterScope } from './tool-presenter-scope.ts'

type Inspection = Awaited<ReturnType<SessionController['inspect']>>
type CallPresenter = (name: string, args: unknown) => ToolCallView | undefined
export interface SessionExportSource {
  inspect(id: SessionId, signal: AbortSignal): Promise<Inspection>
  presenter(id: SessionId, signal: AbortSignal): Promise<CallPresenter>
}

/** Presentation reads never resume an Agent or change its credentials. */
export function sessionExportSource(ctx: Context): SessionExportSource {
  return {
    inspect: (id, signal) => ctx.sessionController.inspect(id, signal),
    presenter: async (id, signal) => {
      const scope = await toolPresenterScope(ctx, id, signal)
      return (name, args) => ctx.tools.get(name, scope)?.presentCall?.(args)
    },
  }
}

export function sessionConversation(inspection: Inspection, presentCall: CallPresenter) {
  const nodes: MarkdownConversationNode[] = []
  const calls = new Map<string, ToolCallView | undefined>()
  const produced = new Map<number, string[]>()
  const seen = new Set<string>()
  let title: string = inspection.meta.id
  for (const event of inspection.events) {
    if (event.type === 'session/title' && typeof event.data.title === 'string') title = event.data.title
    if (event.type === 'tool/call') {
      try { calls.set(String(event.data.callId), presentCall(event.data.name, JSON.parse(event.data.arguments))) }
      catch { calls.set(String(event.data.callId), undefined) } // The normal UI also falls back on malformed/unavailable presenters.
    }
    if (!isAppendSurfaceEvent(event)) continue
    if (event.type === 'user/message') {
      if (event.data.source.kind === 'user') nodes.push({ kind: 'user', content: event.data.content })
    } else if (event.type === 'assistant/message') {
      nodes.push({ kind: 'assistant', blocks: toAssistantBlocks(event.data.message.content) })
    } else if (event.type === 'tool/result') {
      const result = event.data.message.content[0]
      const call = calls.get(String(event.data.message.source.callId))
      if (result.isError === true || call === undefined) continue
      if (call.card !== 'diff' && !(call.card === 'generic' && call.kind === 'edit')) continue
      for (const location of call.locations ?? []) {
        if (seen.has(location.path)) continue
        seen.add(location.path)
        const paths = produced.get(event.data.turn) ?? []
        paths.push(location.path)
        produced.set(event.data.turn, paths)
      }
    }
  }
  return { title, nodes, producedFiles: [...produced].map(([turn, paths]) => ({ turn, paths })) }
}


/** Use Harness's own flush, canonical serializer, attachment reads and bounded ZIP producer. */
export async function exportSession(ctx: Context, rawId: string, descendants: boolean, signal: AbortSignal) {
  signal.throwIfAborted()
  const id = SessionId(rawId)
  const deps = sessionLogExportDeps(ctx)
  if (deps.sessionQuery === undefined || deps.sessionPersistence === undefined || deps.attachments === undefined) {
    throw new Error('Harness Session Export requires session-query, persistence and attachments')
  }
  const ready = { sessionQuery: deps.sessionQuery, sessionPersistence: deps.sessionPersistence,
    attachments: deps.attachments, sessions: deps.sessions }
  await flushLiveSessionLog(deps, id, signal)
  const root = await readSessionLogText(deps.sessionPersistence, id, signal)
  signal.throwIfAborted()
  if (root === undefined) throw new Error(`Session not found: ${rawId}`)
  return { suggestedFilename: sessionLogZipFilename(rawId), mediaType: 'application/zip',
    stream: streamSessionLogZip(ready, root, id, descendants, DEFAULT_SESSION_LOG_COMPRESSION_LEVEL, signal) }
}

export async function readSessionConversation(source: SessionExportSource, rawId: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const inspection = await source.inspect(SessionId(rawId), signal)
  signal.throwIfAborted()
  if (inspection.meta.id !== rawId) throw new Error('Session export identity mismatch')
  const presentCall = await source.presenter(inspection.meta.id, signal)
  signal.throwIfAborted()
  return sessionConversation(inspection, presentCall)
}
