/** Native dsh 0.1.5-rc.1 controllers behind the terminal's retained view contract. */
import { SessionStore } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionAddress, SessionFollowFrame, SessionProjectionBaseline } from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-workspace-controller'
import type {} from '@deepseek-ai/dsh-api-gateway'
import { API_REMOTE_FORWARDED_EVENTS } from '@deepseek-ai/dsh-api-remotes'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AbstractApiClient } from '../../vendor/api-contract/fetch/client.js'
import { RpcId } from '../../vendor/api-contract/api/rpc.js'
import { clientRequestSchema, clientResponseSchema } from '../../vendor/api-contract/api/rpc.schema.js'
import { sessionIdSchema, sessionHistoryRequestSchema, sessionEventSchema } from '../../vendor/api-contract/api/sessions.schema.js'
import { subagentHistoryRequestSchema } from '../../vendor/api-contract/api/subagents.schema.js'
import { hostFrameSchema, muxFrameSchema } from '../../vendor/api-contract/api/events.schema.js'
import type { RpcRequest, HostFrame, MuxFrame } from '../../vendor/api-contract/api/index.js'
import { dispatchTerminalRequest, type TerminalDomainReads } from './native-api-dispatch.ts'
import { terminalFailure } from './native-errors.ts'
import { NativeInteractions } from './native-interactions.ts'
import { presentToolEvent } from './tool-presentation.ts'
import { toolPresenterScope } from './tool-presenter-scope.ts'

/** A cancellable single-consumer queue; closing releases a pending read. */
export class TerminalStream<T> implements AsyncIterable<T> {
  private items: T[] = []
  private wake: (() => void) | undefined
  private closed = false
  private failure: unknown
  push(value: T): void { if (!this.closed) { this.items.push(value); this.wake?.() } }
  close(error?: unknown): void { this.closed = true; this.failure = error; this.wake?.() }
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      while (this.items.length > 0) yield this.items.shift()!
      if (this.closed) { if (this.failure !== undefined) throw this.failure; return }
      await new Promise<void>(resolve => { this.wake = resolve })
      this.wake = undefined
    }
  }
}

/** All mutations terminate at an official Remote descriptor, never at a local state replica. */
export class NativeTerminalApi extends AbstractApiClient implements TerminalDomainReads {
  private readonly cursors = new Map<string, number>()
  private readonly interactions = new NativeInteractions()
  private readonly followRequests = new Set<(address: SessionAddress) => void>()
  constructor(private readonly ctx: Context) {
    super()
    // api-remotes also forwards these waterfalls to Gateway clients. The local
    // terminal must answer before that generic transport waits for a browser.
    ctx.on('approval/request', (request, next) => ctx.agents.get(request.agent.id) === request.agent
      ? this.interactions.approval(request, next) : next(), { prepend: true })
    ctx.on('user-questions/request', (request, next) => request.agent !== undefined && ctx.agents.get(request.agent.id) === request.agent
      ? this.interactions.questions(request, next) : next(), { prepend: true })
    ctx.effect(() => () => this.interactions.dispose(), 'seektty: pending terminal interactions')
  }

  protected async doFetch(_input: URL, init?: RequestInit): Promise<Response> {
    const signal = init?.signal ?? new AbortController().signal
    signal.throwIfAborted()
    if (typeof init?.body !== 'string') throw new Error('Terminal RPC requires a JSON envelope')
    const envelope: unknown = JSON.parse(init.body)
    const response = clientResponseSchema.safeParse(envelope)
    if (response.success) return Response.json(this.interactions.respond(response.data))
    const request = clientRequestSchema.parse(envelope)
    try {
      const value = await dispatchTerminalRequest(this.ctx.typertGateway, this, request.method, request.payload, request.rpcId, signal)
      return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: true, value } })
    } catch (error) {
      if (signal.aborted) throw signal.reason
      return Response.json({ type: 'server-response', rpcId: request.rpcId, result: { ok: false, error: terminalFailure(error) } })
    }
  }

  async describeHost(signal: AbortSignal): Promise<unknown> {
    const entry = process.argv[1]
    if (entry === undefined) throw new Error('Cannot locate the official dsh entry')
    const manifest = z.object({ name: z.literal('@deepseek-ai/dsh'), version: z.string() }).parse(
      JSON.parse(readFileSync(resolve(dirname(realpathSync(entry)), '../package.json'), 'utf8')),
    )
    const catalog = await this.ctx.sessionController.modelCatalog()
    signal.throwIfAborted()
    return { version: manifest.version, cwd: process.cwd(), home: homedir(),
      provider: catalog.default.provider, model: catalog.default.model,
      attachedSessions: this.hostSessions().list().length,
      canOpenPath: await this.ctx.sessionController.canOpenWorkspacePath() }
  }

  private hostSessions(): SessionStore {
    const sessions: unknown = this.ctx.get('sessions')
    if (!(sessions instanceof SessionStore)) throw new Error('Official Host SessionStore is unavailable')
    return sessions
  }

  private async historyEntries(sessionId: ReturnType<typeof sessionIdSchema.parse>, records: readonly { event: unknown }[], signal: AbortSignal) {
    const events = records.map(record => sessionEventSchema.parse(record.event))
    const scope = events.some(event => event.type === 'tool/call' || event.type === 'tool/result')
      ? await toolPresenterScope(this.ctx, sessionId, signal) : undefined
    return events.map(event => {
      const view = presentToolEvent(this.ctx, event, events, scope)
      return { event, ...(view === undefined ? {} : { view }) }
    })
  }

  private async snapshot(address: SessionAddress, signal: AbortSignal, maxMessages?: number) {
    for await (const frame of this.ctx.sessionController.follow({ address, assistantStream: true, ...(maxMessages === undefined ? {} : { maxMessages }) }, signal)) {
      if (frame.type !== 'snapshot') throw new Error('Session follow did not start with its authoritative snapshot')
      this.cursors.set(address.kind === 'session' ? address.sessionId : address.childSessionId, frame.cursor)
      return frame
    }
    throw new Error('Session follow ended before its baseline')
  }

  async readHistory(payload: Readonly<Record<string, unknown>>, subagent: boolean, signal: AbortSignal): Promise<unknown> {
    const p = subagent ? subagentHistoryRequestSchema.parse(payload) : sessionHistoryRequestSchema.parse(payload)
    const address: SessionAddress = 'parentSessionId' in p
      ? { kind: 'subagent', parentSessionId: p.parentSessionId, childSessionId: p.childSessionId, mode: p.mode }
      : { kind: 'session', sessionId: p.sessionId }
    const id = address.kind === 'session' ? address.sessionId : address.childSessionId
    if (p.beforeSeq !== undefined) {
      const cursor = this.cursors.get(id) ?? (await this.snapshot(address, signal, p.maxMessages)).cursor
      const page = await this.ctx.sessionController.page({ address, throughSeq: cursor,
        beforeSeq: p.beforeSeq, ...(p.maxMessages === undefined ? {} : { maxMessages: p.maxMessages }) }, signal)
      return { events: await this.historyEntries(id, page.records, signal), hasMore: page.hasMore }
    }
    const page = await this.snapshot(address, signal, p.maxMessages)
    for (const follow of this.followRequests) follow(address)
    return { events: await this.historyEntries(id, page.records, signal), hasMore: page.hasMore, projections: page.projections, assistantStream: page.assistantStream }
  }

  async readModels(payload: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    const sessionId = sessionIdSchema.parse(payload.sessionId)
    const [catalog, page] = await Promise.all([
      this.ctx.sessionController.modelCatalog(), this.snapshot({ kind: 'session', sessionId }, signal, 1),
    ])
    const selection = z.object({ next: z.unknown() }).optional().parse(page.projections.values.modelSelection)
    const current = z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() })
      .parse(selection?.next ?? catalog.default)
    return { current, routable: catalog.routableProviders.includes(current.provider), groups: catalog.groups, failures: catalog.failures }
  }

  async readWorkspaces(signal: AbortSignal): Promise<unknown> {
    for await (const frame of this.ctx.workspaceController.follow(signal)) {
      if (frame.type !== 'baseline') throw new Error('Workspace follow did not start with a baseline')
      return frame.value
    }
    throw new Error('Workspace follow ended before its baseline')
  }

  override async *openHost(_payload: unknown, signal: AbortSignal, onOpen?: () => void): AsyncIterable<RpcRequest<HostFrame>> {
    signal.throwIfAborted()
    const queue = new TerminalStream<RpcRequest<HostFrame>>()
    const scope = new AbortController()
    const lifetime = AbortSignal.any([signal, scope.signal])
    const push = (payload: unknown) => queue.push({ rpcId: RpcId(randomUUID()), payload: hostFrameSchema.parse(payload) })
    const disposers = [
      this.ctx.on('api-session/added', summary => push({ type: 'host/session-added', ...summary })),
      this.ctx.on('api-session/removed', sessionId => push({ type: 'host/session-removed', sessionId })),
      this.ctx.on('api-session/status', (sessionId, running) => push({ type: 'host/session-status', sessionId, running })),
      this.ctx.on('api-session/error', (sessionId, message) => push({ type: 'host/agent-error', sessionId, message })),
    ]
    for (const entry of API_REMOTE_FORWARDED_EVENTS) {
      if (entry.mode !== 'emit') continue
      const event = entry.event
      disposers.push(this.ctx.on(event, (...args: unknown[]) => push({ type: 'host/remote-event', event, args })))
    }
    const pump = (async () => {
      for await (const frame of this.ctx.workspaceController.follow(lifetime)) {
        if (frame.type === 'baseline') continue // Unary list owns the ready baseline.
        if (frame.type === 'upsert') push({ type: 'host/workspace-changed', workspace: frame.workspace })
        if (frame.type === 'remove') push({ type: 'host/workspace-removed', workspaceId: frame.workspaceId })
        if (frame.type === 'order') push({ type: 'host/workspace-order-changed', workspaceIds: frame.workspaceIds })
        if (frame.type === 'archived') push({ type: 'host/archived-sessions-changed', archivedSessionIds: frame.archivedSessionIds })
      }
    })().catch(error => { if (!lifetime.aborted) queue.close(error) })
    const abort = () => queue.close()
    lifetime.addEventListener('abort', abort, { once: true })
    onOpen?.()
    try { yield* queue } finally {
      scope.abort(); for (const dispose of disposers) dispose()
      lifetime.removeEventListener('abort', abort); await pump
    }
  }

  override async *openMux(_payload: unknown, signal: AbortSignal, onOpen?: () => void): AsyncIterable<RpcRequest<MuxFrame>> {
    signal.throwIfAborted()
    const queue = new TerminalStream<RpcRequest<MuxFrame>>()
    const scope = new AbortController()
    const lifetime = AbortSignal.any([signal, scope.signal])
    const push = (payload: unknown) => queue.push({ rpcId: RpcId(randomUUID()), payload: muxFrameSchema.parse(payload) })
    const pushInteraction = (request: RpcRequest<MuxFrame>) => queue.push(request)
    const disposeInteractions = this.interactions.subscribe(pushInteraction)
    const follows = new Set<string>()
    const queueBaselines = new Map<string, Extract<MuxFrame, { type: 'session/queue' }>>()
    const jobBaselines = new Map<string, Extract<MuxFrame, { type: 'session/jobs' }>>()
    const pushJobs = (value: unknown) => {
      const frame = muxFrameSchema.parse(value)
      if (frame.type !== 'session/jobs') throw new Error('Expected a native jobs frame')
      jobBaselines.set(frame.sessionId, frame)
      push(frame)
    }
    const pushQueue = (value: unknown) => {
      const frame = muxFrameSchema.parse(value)
      if (frame.type !== 'session/queue') throw new Error('Expected a native queue frame')
      queueBaselines.set(frame.sessionId, frame)
      push(frame)
    }
    const pumps: Promise<void>[] = []
    const track = (task: Promise<void>) => { pumps.push(task.catch(error => { if (!lifetime.aborted) queue.close(error) })) }
    const project = (sessionId: string, projections: SessionProjectionBaseline) => {
      for (const [key, value] of Object.entries(projections.values)) {
        if (projections.asOfSeq >= 0) push({ type: 'session/projection', sessionId, key, value, seq: projections.asOfSeq })
      }
    }
    const follow = (address: SessionAddress) => {
      const sessionId = address.kind === 'session' ? address.sessionId : address.childSessionId
      if (follows.has(sessionId)) return
      follows.add(sessionId)
      track((async () => {
        for await (const frame of this.ctx.sessionController.follow({ address, assistantStream: true }, lifetime)) {
          if (frame.type === 'snapshot') {
            push({ type: 'session/subscribed', sessionId, lastSeq: frame.cursor })
            // Native control and follow are separate streams. Reapply an earlier
            // control baseline after the retained client's subscribed reset.
            const pendingQueue = queueBaselines.get(sessionId)
            if (pendingQueue !== undefined) push(pendingQueue)
            const pendingJobs = jobBaselines.get(sessionId)
            if (pendingJobs !== undefined) push(pendingJobs)
            this.interactions.replay(sessionId, pushInteraction)
            project(sessionId, frame.projections)
            if (frame.assistantStream !== undefined) push({ type: 'session/assistant-baseline', sessionId, baseline: frame.assistantStream })
          } else if (frame.type === 'event') {
            const event = sessionEventSchema.parse(frame.event)
            const scope = event.type === 'tool/call' || event.type === 'tool/result'
              ? await toolPresenterScope(this.ctx, sessionId, lifetime) : undefined
            const view = presentToolEvent(this.ctx, event, this.hostSessions().get(sessionId)?.snapshotEvents() ?? [], scope)
            push({ type: 'session/event', sessionId, event, ...(view === undefined ? {} : { view }) })
          }
          else if (frame.type === 'assistant-stream') push({ type: 'session/assistant-stream', sessionId, frame: frame.frame })
        }
      })().finally(() => { follows.delete(sessionId) }))
    }
    this.followRequests.add(follow)
    const disposeAdded = this.ctx.on('api-session/added', summary => {
      if (summary.origin !== 'subagent') follow({ kind: 'session', sessionId: summary.sessionId })
    })
    // Following a cold ordinary Session may activate its Agent. Do not open the
    // entire persisted list on connection; follow live roots and explicitly opened addresses.
    for (const session of this.hostSessions().list()) {
      if (session.header.origin !== 'subagent') follow({ kind: 'session', sessionId: session.id })
    }
    track((async () => {
      for await (const frame of this.ctx.sessionController.control(lifetime)) {
        if (frame.type === 'baseline') {
          for (const [sessionId, items] of Object.entries(frame.value.queues)) pushQueue({ type: 'session/queue', sessionId, items })
          for (const [sessionId, jobs] of Object.entries(frame.value.jobs)) pushJobs({ type: 'session/jobs', sessionId, jobs })
          for (const [sessionId, value] of Object.entries(frame.value.projections)) project(sessionId, value)
        } else if (frame.type === 'queue') pushQueue({ ...frame, type: 'session/queue' })
        else if (frame.type === 'jobs') pushJobs({ ...frame, type: 'session/jobs' })
        else if (frame.type === 'projection' && frame.seq >= 0) push({ ...frame, type: 'session/projection' })
      }
    })())
    const abort = () => queue.close()
    lifetime.addEventListener('abort', abort, { once: true })
    onOpen?.()
    try { yield* queue } finally {
      scope.abort(); disposeAdded(); disposeInteractions(); this.followRequests.delete(follow); lifetime.removeEventListener('abort', abort)
      await Promise.all(pumps)
    }
  }
}
